import { google } from 'googleapis'
import {
  detectEnrollmentVersion,
  normalizeEnrollment,
  normalizeStudentsSummary,
  normalizeCourse,
  normalizeId,
  deriveCourseId,
} from './transform'
import { computeGraduationResults } from './graduation'

// ── Auth ──────────────────────────────────────────────────────────────────────

function makeAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: makeAuth() })
}

const SPREADSHEET_ID = () => {
  const id = process.env.SPREADSHEET_ID
  if (!id) throw new Error('SPREADSHEET_ID is not set')
  return id
}

// バッチ処理専用のデフォルト学生ID（env.STUDENT_IDで上書き可能）
// 通常の API ルートではセッションから取得するため使用しない
const STUDENT_ID = () => normalizeId(process.env.STUDENT_ID || '')

// ── Low-level helpers ─────────────────────────────────────────────────────────

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return []
  const [headers, ...body] = rows
  return body.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  )
}

export async function getRange(sheetName, range = 'A:Z') {
  
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheetName}!${range}`,
  })
  return res.data.values ?? []
}

export async function updateCell(sheetName, cellA1, value) {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheetName}!${cellA1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
}

async function appendRow(sheetName, values) {
  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  })
}

// ── Simple in-process cache (TTL = 15 s) ─────────────────────────────────────

const _caches = new Map()   // studentId → { ts: number, data: object|null }
const CACHE_TTL_MS = 15_000

function _getEntry(sid) {
  if (!_caches.has(sid)) _caches.set(sid, { ts: 0, data: null })
  return _caches.get(sid)
}
function isFresh(sid) { return Date.now() - _getEntry(sid).ts < CACHE_TTL_MS }
export function invalidateCache(sid) {
  if (sid) { _getEntry(sid).ts = 0 }
  else { _caches.clear() }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all relevant sheets and return normalised data.
 *
 * Returns:
 *   courses           - raw course rows (normalisation done in API route)
 *   enrollment        - raw enrollment rows (unnormalised — caller normalises)
 *   enrollmentVersion - 'new' | 'legacy'
 *   studentsSummary   - StudentsSummary | null  (null if sheet missing/empty)
 *   wantLicenses      - string[] of license type values per student (new schema)
 *   _enrollmentRows   - raw rows including header for legacy toggle
 */
export async function fetchAllSheets(studentId = STUDENT_ID()) {
  const entry = _getEntry(studentId)
  if (isFresh(studentId) && entry.data) return entry.data

  // Always fetch core sheets
  const fetches = [
    getRange('course'),
    getRange('enrollment'),
  ]

  // Attempt to fetch optional sheets — missing sheets return [] via .catch
  const fetchStudentsSummary   = getRange('students_summary',  'A:ZZ').catch(() => [])
  const fetchCurriculumMapping = getRange('curriculum_mapping').catch(() => [])
  const fetchDepartments       = getRange('departments').catch(() => [])
  const fetchUsers             = getRange('users').catch(() => [])
  const fetchLeavePeriods      = getRange('leave_periods').catch(() => [])
  fetches.push(fetchStudentsSummary, fetchCurriculumMapping, fetchDepartments, fetchUsers, fetchLeavePeriods)

const [
  courseRows,
  enrollRows,
  summaryRows,
  curriculumRows,
  departmentRows,
  userRows,
  leavePeriodRows,
] = await Promise.all(fetches)

  // Detect enrollment format from headers
  const enrollHeaders = enrollRows[0] ?? []
  const enrollmentVersion = detectEnrollmentVersion(enrollHeaders)

  // Normalise enrollment
  const enrollObjects = rowsToObjects(enrollRows)
  const normalizedEnrollmentData =
    normalizeEnrollment(enrollObjects, enrollmentVersion, studentId)

  // Normalise students_summary (find this student's row)
let studentsSummary = null

if (summaryRows.length >= 2) {
  const summaryObjects = rowsToObjects(summaryRows)

  const myRow =
    summaryObjects.find(r => normalizeId(r.student_id) === studentId) ??
    summaryObjects[0] ??
    null

  if (myRow) {
    studentsSummary = normalizeStudentsSummary(myRow)
  }
}
  // Read user's department_id and curriculum_year from users sheet
  // users シートのスキーマ: email | student_id | department_id | curriculum_year
  let userDepartment    = ''
  let userCurriculumYear = null   // number | null
  if (userRows.length >= 2) {
    const userObjects = rowsToObjects(userRows)
    const myRow = userObjects.find(r => normalizeId(r.student_id) === studentId)
    if (myRow) {
      userDepartment = normalizeId(myRow.department_id)
      const cyRaw = String(myRow.curriculum_year || '').trim()
      if (cyRaw) {
        const cyNum = parseInt(cyRaw, 10)
        if (Number.isFinite(cyNum)) userCurriculumYear = cyNum
      }
    }
  }

  entry.data = {
    courses:               rowsToObjects(courseRows),
    enrollment:            rowsToObjects(enrollRows),   // raw objects (for legacy toggle)
    enrollmentVersion,
    normalizedEnrollment:  normalizedEnrollmentData,
    studentsSummary,
    curriculumMappingRows: rowsToObjects(curriculumRows), // curriculum_mapping for final_category
    departmentRows:        rowsToObjects(departmentRows), // departments master (department_id, label)
    userDepartment,
    userCurriculumYear,    // number | null — the curriculum year from users sheet
    users:                 rowsToObjects(userRows),
    leavePeriodRows:       rowsToObjects(leavePeriodRows), // 休学期間（student_id | leave_start | leave_end）
    _enrollmentRows:       enrollRows,                    // raw rows for row-number lookup
  }
  entry.ts = Date.now()
  return entry.data
}

// ── Enrollment mutations ──────────────────────────────────────────────────────

/**
 * Legacy: Toggle the `selected` column for a given classId.
 * Returns the new boolean selected state.
 */
export async function toggleEnrollment(classId) {
  const { _enrollmentRows } = await fetchAllSheets()

  const [headers, ...rows] = _enrollmentRows
  const classIdCol  = headers.indexOf('class_id')
  const selectedCol = headers.indexOf('selected')

  if (classIdCol === -1 || selectedCol === -1) {
    throw new Error('enrollment sheet is missing class_id or selected column')
  }

  const normalizedClassId = normalizeId(classId)
  const rowIndex = rows.findIndex(r => normalizeId(r[classIdCol]) === normalizedClassId)
  if (rowIndex === -1) throw new Error(`classId not found: ${classId}`)

  const currentVal = rows[rowIndex][selectedCol]
  const isCurrentlySelected =
    currentVal === '1' || currentVal === 'TRUE' ||
    currentVal === true || currentVal === 1
  const newVal = isCurrentlySelected ? '' : '1'

  const sheetRow    = rowIndex + 2
  const colLetter   = colToLetter(selectedCol)
  await updateCell('enrollment', `${colLetter}${sheetRow}`, newVal)

  invalidateCache(STUDENT_ID())
  return !isCurrentlySelected
}

/**
 * New schema: Upsert an enrollment record.
 *
 * Uses class_id as the primary key (student_id + class_id uniqueness).
 * If a matching row exists → updates status/year/semester in-place.
 * Otherwise → appends a new row.
 *
 * record: { classId, courseId?, year?, semester?, status }
 * Returns the final status string.
 */
export async function upsertEnrollment({ classId, courseId, year, semester, status, academic_year, is_temporary = false, memo = null, studentId = STUDENT_ID() }) {
  const { _enrollmentRows } = await fetchAllSheets(studentId)

  // 新スキーマのヘッダー定義
  const NEW_SCHEMA = ['student_id', 'class_id', 'course_id', 'status', 'year', 'semester', 'academic_year', 'is_temporary', 'memo', 'id']

  let headers, rows
  if (!_enrollmentRows || _enrollmentRows.length === 0 || !_enrollmentRows[0] || _enrollmentRows[0].length === 0) {
    // シートが空 → ヘッダー行を書き込む
    console.warn('[upsertEnrollment] enrollment sheet is empty, initializing headers')
    await appendRow('enrollment', NEW_SCHEMA)
    invalidateCache(studentId)
    headers = NEW_SCHEMA
    rows = []
  } else {
    const [rawHeaders, ...rawRows] = _enrollmentRows
    // NFKC 正規化でスペースや全角文字の混入を吸収
    headers = rawHeaders.map(h => normalizeId(String(h)))
    rows    = rawRows
  }

  const studentIdCol    = headers.indexOf('student_id')
  const classIdCol      = headers.indexOf('class_id')
  const courseIdCol     = headers.indexOf('course_id')
  const statusCol       = headers.indexOf('status')
  const yearCol         = headers.indexOf('year')
  const semesterCol     = headers.indexOf('semester')
  const academicYearCol = headers.indexOf('academic_year')
  const isTempCol       = headers.indexOf('is_temporary')
  const memoCol         = headers.indexOf('memo')
  const idCol           = headers.indexOf('id')

  if (studentIdCol === -1 || classIdCol === -1 || statusCol === -1) {
    throw new Error(`enrollment sheet is missing required columns (student_id, class_id, status). Found: ${headers.join(', ')}`)
  }

  // Normalize incoming IDs so full-width chars never create phantom duplicates
  const normalizedClassId = normalizeId(classId)

  // Derive course_id from class_id if not supplied (strip section suffix)
  const resolvedCourseId = normalizeId(
    courseId || (normalizedClassId.match(/^(.+?)-\d{2,}$/) ? normalizedClassId.replace(/-\d{2,}$/, '') : normalizedClassId)
  )

  // Find existing row for this student + class_id (normalize sheet values at compare time)
  const rowIndex = rows.findIndex(
    r => normalizeId(r[studentIdCol]) === studentId && normalizeId(r[classIdCol]) === normalizedClassId
  )

  if (rowIndex !== -1) {
    // Update existing row — write all changed cells in ONE request (not 4 sequential ones)
    const sheetRow    = rowIndex + 2
    const updatedRow  = [...rows[rowIndex]]            // copy current row values

    updatedRow[statusCol] = status
    if (yearCol           !== -1 && year != null)           updatedRow[yearCol]         = String(year)
    if (semesterCol       !== -1 && semester)               updatedRow[semesterCol]     = semester
    if (courseIdCol       !== -1 && resolvedCourseId)       updatedRow[courseIdCol]     = resolvedCourseId
    if (academicYearCol   !== -1 && academic_year != null)  updatedRow[academicYearCol] = String(academic_year)
    if (isTempCol         !== -1)                           updatedRow[isTempCol]       = is_temporary ? 'TRUE' : 'FALSE'
    if (memoCol           !== -1 && memo !== undefined)     updatedRow[memoCol]         = memo ?? ''
    // Preserve existing id; generate one if the column exists but row has no id yet
    if (idCol !== -1 && !updatedRow[idCol]) updatedRow[idCol] = crypto.randomUUID()

    const sheets = getSheetsClient()
    await sheets.spreadsheets.values.update({
      spreadsheetId:   SPREADSHEET_ID(),
      range:           `enrollment!A${sheetRow}:${colToLetter(updatedRow.length - 1)}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:     { values: [updatedRow] },
    })
  } else {
    // Append new row — build values array matching header order
    const newUUID = idCol !== -1 ? crypto.randomUUID() : null
    const newRow = headers.map((h, i) => {
      if (i === studentIdCol)                               return studentId
      if (i === classIdCol)                                 return normalizedClassId
      if (courseIdCol     !== -1 && i === courseIdCol)      return resolvedCourseId
      if (i === statusCol)                                  return status
      if (yearCol         !== -1 && i === yearCol)          return year != null ? String(year) : ''
      if (semesterCol     !== -1 && i === semesterCol)      return semester ?? ''
      if (academicYearCol !== -1 && i === academicYearCol)  return academic_year != null ? String(academic_year) : ''
      if (isTempCol       !== -1 && i === isTempCol)        return is_temporary ? 'TRUE' : 'FALSE'
      if (memoCol         !== -1 && i === memoCol)          return memo ?? ''
      if (idCol           !== -1 && i === idCol)            return newUUID ?? ''
      return ''
    })
    await appendRow('enrollment', newRow)
  }

  invalidateCache(studentId)
  return status
}

/**
 * メモのみを更新する軽量関数。
 * 既存の enrollment 行を見つけて memo セルだけ書き換える。
 * 行が存在しない（未登録）場合は何もしない。
 * Returns true if updated, false if row not found.
 */
export async function updateEnrollmentMemo({ classId, memo, studentId = STUDENT_ID() }) {
  const { _enrollmentRows } = await fetchAllSheets(studentId)

  if (!_enrollmentRows || _enrollmentRows.length < 2) return false

  const [rawHeaders, ...rows] = _enrollmentRows
  const headers = rawHeaders.map(h => normalizeId(String(h)))

  const studentIdCol = headers.indexOf('student_id')
  const classIdCol   = headers.indexOf('class_id')
  const memoCol      = headers.indexOf('memo')

  if (studentIdCol === -1 || classIdCol === -1 || memoCol === -1) return false

  const normalizedClassId = normalizeId(classId)
  const rowIndex = rows.findIndex(
    r => normalizeId(r[studentIdCol]) === studentId && normalizeId(r[classIdCol]) === normalizedClassId
  )

  if (rowIndex === -1) return false

  const sheetRow   = rowIndex + 2   // 1-indexed + header row
  const updatedRow = [...rows[rowIndex]]
  updatedRow[memoCol] = memo ?? ''

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId:    SPREADSHEET_ID(),
    range:            `enrollment!A${sheetRow}:${colToLetter(updatedRow.length - 1)}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody:      { values: [updatedRow] },
  })

  invalidateCache(studentId)
  return true
}

/**
 * New schema: Remove an enrollment record by class_id.
 * Clears the entire row for (student_id + class_id) if found.
 * No-op if the row does not exist.
 */
export async function removeEnrollment({ classId, studentId = STUDENT_ID() }) {
  const { _enrollmentRows } = await fetchAllSheets(studentId)

  if (!_enrollmentRows || _enrollmentRows.length < 2) return // nothing to remove

  const [headers, ...rows] = _enrollmentRows

  const studentIdCol = headers.indexOf('student_id')
  const classIdCol   = headers.indexOf('class_id')
  const idCol        = headers.indexOf('id')

  if (studentIdCol === -1 || classIdCol === -1) return // legacy schema — no row to remove

  // Normalize incoming classId so full-width variants match sheet values at compare time
  const normalizedClassId = normalizeId(classId)

  const rowIndex = rows.findIndex(
    r => normalizeId(r[studentIdCol]) === studentId && normalizeId(r[classIdCol]) === normalizedClassId
  )

  if (rowIndex === -1) return // nothing to remove

  // Read enrollment_id for cascade delete before clearing the row
  const enrollmentId = idCol !== -1 ? (rows[rowIndex][idCol] || '').trim() : null

  // Clear the entire row by writing empty values
  const sheetRow  = rowIndex + 2
  const emptyRow  = headers.map(() => '')
  const sheets    = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID(),
    range: `enrollment!A${sheetRow}:${colToLetter(headers.length - 1)}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [emptyRow] },
  })

  // Cascade: delete all attendance_records for this enrollment
  if (enrollmentId) {
    await deleteAttendanceRecordsByEnrollmentId(enrollmentId).catch(() => {})
  }

  invalidateCache(studentId)
}

/**
 * Batch write enrollment changes in a single API round-trip (max 2 calls).
 *
 * changes: Array<{
 *   op:            'upsert' | 'remove',
 *   classId:       string,
 *   courseId?:     string | null,
 *   year?:         number,
 *   semester?:     string,
 *   status?:       string,
 *   academic_year?: number | null,
 *   is_temporary?: boolean,
 * }>
 *
 * Existing rows → updated in one batchUpdate call.
 * New rows      → appended in one append call.
 * Removed rows  → cleared (empty values) in the same batchUpdate call.
 * Total Sheets API calls: fetchAllSheets (1 read) + batchUpdate + append = 3 max.
 */
export async function batchWriteEnrollments(changes, studentId = STUDENT_ID()) {
  if (!changes?.length) return

  const { _enrollmentRows } = await fetchAllSheets(studentId)

  const NEW_SCHEMA = ['student_id', 'class_id', 'course_id', 'status', 'year', 'semester', 'academic_year', 'is_temporary']

  let headers, rows
  if (!_enrollmentRows?.length || !_enrollmentRows[0]?.length) {
    await appendRow('enrollment', NEW_SCHEMA)
    invalidateCache(studentId)
    headers = NEW_SCHEMA
    rows    = []
  } else {
    const [rawHeaders, ...rawRows] = _enrollmentRows
    headers = rawHeaders.map(h => normalizeId(String(h)))
    rows    = rawRows
  }

  const C = {
    id:           headers.indexOf('id'),
    studentId:    headers.indexOf('student_id'),
    classId:      headers.indexOf('class_id'),
    courseId:     headers.indexOf('course_id'),
    status:       headers.indexOf('status'),
    year:         headers.indexOf('year'),
    semester:     headers.indexOf('semester'),
    academicYear: headers.indexOf('academic_year'),
    isTemp:       headers.indexOf('is_temporary'),
    memo:         headers.indexOf('memo'),
  }

  if (C.studentId === -1 || C.classId === -1 || C.status === -1) {
    throw new Error(`enrollment sheet missing required columns. Found: ${headers.join(', ')}`)
  }

  const normSid  = normalizeId(studentId)
  const lastCol  = colToLetter(headers.length - 1)
  const batchData = []
  const toAppend  = []
  const processedRows = new Set()

  for (const change of changes) {
    const normClassId = normalizeId(change.classId)

    const rowIdx = rows.findIndex(
      (r, i) => !processedRows.has(i)
        && normalizeId(String(r[C.studentId] ?? '')) === normSid
        && normalizeId(String(r[C.classId]   ?? '')) === normClassId,
    )

    if (change.op === 'remove') {
      if (rowIdx !== -1) {
        processedRows.add(rowIdx)
        batchData.push({
          range:  `enrollment!A${rowIdx + 2}:${lastCol}${rowIdx + 2}`,
          values: [headers.map(() => '')],
        })
      }
    } else {
      // upsert
      const resolvedCourseId = normalizeId(
        change.courseId
          || (normClassId.match(/^(.+?)-\d{2,}$/) ? normClassId.replace(/-\d{2,}$/, '') : normClassId),
      )

      if (rowIdx !== -1) {
        processedRows.add(rowIdx)
        const sheetRow   = rowIdx + 2
        const updatedRow = [...rows[rowIdx]]
        while (updatedRow.length < headers.length) updatedRow.push('')
        updatedRow[C.status] = change.status
        if (C.id           !== -1 && !updatedRow[C.id])            updatedRow[C.id]           = crypto.randomUUID()
        if (C.year         !== -1 && change.year         != null)  updatedRow[C.year]         = String(change.year)
        if (C.semester     !== -1 && change.semester)              updatedRow[C.semester]     = change.semester
        if (C.courseId     !== -1 && resolvedCourseId)             updatedRow[C.courseId]     = resolvedCourseId
        if (C.academicYear !== -1 && change.academic_year != null) updatedRow[C.academicYear] = String(change.academic_year)
        if (C.isTemp       !== -1)                                 updatedRow[C.isTemp]       = change.is_temporary ? 'TRUE' : 'FALSE'
        if (C.memo         !== -1 && change.memo !== undefined)    updatedRow[C.memo]         = change.memo ?? ''
        batchData.push({
          range:  `enrollment!A${sheetRow}:${colToLetter(updatedRow.length - 1)}${sheetRow}`,
          values: [updatedRow],
        })
      } else {
        const newId  = C.id !== -1 ? crypto.randomUUID() : null
        const newRow = headers.map((_, i) => {
          if (C.id           !== -1 && i === C.id)           return newId ?? ''
          if (i === C.studentId)                             return normSid
          if (i === C.classId)                               return normClassId
          if (C.courseId     !== -1 && i === C.courseId)     return resolvedCourseId
          if (i === C.status)                                return change.status
          if (C.year         !== -1 && i === C.year)         return change.year         != null ? String(change.year)         : ''
          if (C.semester     !== -1 && i === C.semester)     return change.semester     ?? ''
          if (C.academicYear !== -1 && i === C.academicYear) return change.academic_year != null ? String(change.academic_year) : ''
          if (C.isTemp       !== -1 && i === C.isTemp)       return change.is_temporary ? 'TRUE' : 'FALSE'
          if (C.memo         !== -1 && i === C.memo)         return change.memo         ?? ''
          return ''
        })
        toAppend.push(newRow)
      }
    }
  }

  const sheets = getSheetsClient()

  // Update / clear existing rows (one batchUpdate call)
  if (batchData.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody:   { valueInputOption: 'RAW', data: batchData },
    })
  }

  // Append brand-new rows (one append call)
  if (toAppend.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId:   SPREADSHEET_ID(),
      range:           'enrollment!A:Z',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody:     { values: toAppend },
    })
  }

  invalidateCache(studentId)
}

/**
 * 仮登録（is_temporary=TRUE）を新年度の本登録に一括移行する。
 *
 * 対象: studentId の enrollment 行のうち is_temporary=TRUE かつ
 *       classId が migrateClassIds に含まれるもの。
 * 更新: is_temporary = FALSE, academic_year = newLatestYear
 *
 * Sheets API 呼び出し:
 *   fetchAllSheets (1 read) + batchUpdate (1 write) = 最大 2 calls。
 *
 * @param {string[]} migrateClassIds  移行対象の class_id 配列
 * @param {number}   newLatestYear    移行先の academic_year（新年度）
 * @param {string}   studentId
 * @returns {Promise<number>}  実際に更新した行数
 */
export async function migrateTempEnrollments(migrateClassIds, newLatestYear, studentId = STUDENT_ID()) {
  if (!migrateClassIds?.length) return 0

  const { _enrollmentRows } = await fetchAllSheets(studentId)
  if (!_enrollmentRows?.length || !_enrollmentRows[0]?.length) return 0

  const [rawHeaders, ...rows] = _enrollmentRows
  const headers = rawHeaders.map(h => normalizeId(String(h)))

  const C = {
    studentId:    headers.indexOf('student_id'),
    classId:      headers.indexOf('class_id'),
    academicYear: headers.indexOf('academic_year'),
    isTemp:       headers.indexOf('is_temporary'),
  }
  if (C.studentId === -1 || C.classId === -1) return 0

  const normSid    = normalizeId(String(studentId))
  const migrateSet = new Set(migrateClassIds.map(id => normalizeId(id)))
  const lastCol    = colToLetter(headers.length - 1)
  const batchData  = []

  rows.forEach((row, i) => {
    if (normalizeId(String(row[C.studentId] ?? '')) !== normSid) return
    const cid = normalizeId(String(row[C.classId] ?? ''))
    if (!migrateSet.has(cid)) return
    const isTempVal = String(row[C.isTemp] ?? '').trim().toUpperCase()
    if (isTempVal !== 'TRUE' && isTempVal !== '1') return

    const updatedRow = [...row]
    while (updatedRow.length < headers.length) updatedRow.push('')
    if (C.academicYear !== -1) updatedRow[C.academicYear] = String(newLatestYear)
    if (C.isTemp       !== -1) updatedRow[C.isTemp]       = 'FALSE'

    batchData.push({
      range:  `enrollment!A${i + 2}:${lastCol}${i + 2}`,
      values: [updatedRow],
    })
  })

  if (batchData.length === 0) return 0

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody:   { valueInputOption: 'RAW', data: batchData },
  })

  invalidateCache(studentId)
  console.log('[migrateTempEnrollments] migrated', batchData.length, 'rows for', studentId, '→', newLatestYear)
  return batchData.length
}

/**
 * New schema: Remove ALL enrollment records for a student.
 * Clears (writes empty values) every row where student_id matches.
 * Used by the curriculum_year change safety flow to wipe stale data.
 *
 * Returns the number of rows cleared.
 */
export async function clearAllEnrollmentForStudent(studentId = STUDENT_ID()) {
  const rows = await getRange('enrollment', 'A:ZZ').catch(() => [])
  if (!rows || rows.length < 2) return 0

  const [headerRow, ...bodyRows] = rows
  const studentIdCol = headerRow.indexOf('student_id')

  if (studentIdCol === -1) return 0  // legacy schema without student_id — skip

  const normalizedSid = normalizeId(studentId)
  const lastCol       = colToLetter(headerRow.length - 1)
  const emptyRow      = headerRow.map(() => '')

  // Collect indices of body rows that belong to this student and are non-empty
  const matchIndices = bodyRows
    .map((row, i) => ({ row, i }))
    .filter(({ row }) =>
      row.some(c => String(c).trim()) &&
      normalizeId(String(row[studentIdCol] ?? '')) === normalizedSid
    )
    .map(({ i }) => i)

  if (matchIndices.length === 0) return 0

  const sheets = getSheetsClient()
  const data   = matchIndices.map(i => ({
    range:  `enrollment!A${i + 2}:${lastCol}${i + 2}`,
    values: [emptyRow],
  }))

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody:   { valueInputOption: 'RAW', data },
  })

  invalidateCache(studentId)
  console.log('[clearAllEnrollmentForStudent] cleared', matchIndices.length, 'rows for', studentId)
  return matchIndices.length
}

// ── clearCurriculumDependentData ──────────────────────────────────────────────

/**
 * curriculum_year 変更時の完全リセット。
 *
 * curriculum_year に依存する派生データをすべて削除する。
 * users / leave_periods / recognized_courses などのユーザー属性は保持する。
 *
 * 削除対象:
 *   enrollment              — 行を空白化（行構造保持）
 *   progress_auto           — 該当行を物理削除
 *   students_summary        — 該当行を物理削除
 *   GRADUATION_RESULT       — 該当行を物理削除
 *   additional_license_result — 該当行を物理削除
 *
 * @param {string} studentId  生の（正規化前）student_id
 * @returns {Promise<{enrollment:number, auto:number, summary:number, graduation_result:number, additional_license:number}>}
 */
export async function clearCurriculumDependentData(studentId = STUDENT_ID()) {
  const normalizedId = normalizeId(String(studentId ?? ''))
  if (!normalizedId) throw new Error('[clearCurriculumDependentData] student_id is required')

  const results = {
    enrollment:         0,
    auto:               0,
    summary:            0,
    graduation_result:  0,
    additional_license: 0,
  }

  // ── Step 1: enrollment — blank rows (行削除せず空白化して行番号を保持) ──────
  try {
    results.enrollment = await clearAllEnrollmentForStudent(studentId)
  } catch (err) {
    console.error('[clearCurriculumDependentData] enrollment blanking failed:', err)
  }

  // ── Step 2: 物理削除対象シート ──────────────────────────────────────────────
  const deleteTargets = [
    { name: 'progress_auto',             key: 'auto'               },
    { name: 'students_summary',          key: 'summary'            },
    { name: 'GRADUATION_RESULT',         key: 'graduation_result'  },
    { name: 'additional_license_result', key: 'additional_license' },
  ]

  const sheetsClient  = getSheetsClient()
  const spreadsheetId = SPREADSHEET_ID()

  // シートのメタデータを一度取得して数値 sheetId を解決する
  const meta      = await sheetsClient.spreadsheets.get({ spreadsheetId })
  const sheetIdOf = new Map(
    meta.data.sheets.map(s => [s.properties.title, s.properties.sheetId])
  )

  for (const { name, key } of deleteTargets) {
    const sheetId = sheetIdOf.get(name)
    if (sheetId == null) {
      console.warn(`[clearCurriculumDependentData] sheet not found in spreadsheet: "${name}"`)
      continue
    }
    try {
      results[key] = await deleteRowsByStudentId(
        sheetsClient, spreadsheetId, sheetId, name, normalizedId
      )
    } catch (err) {
      console.error(`[clearCurriculumDependentData] error deleting from "${name}":`, err)
    }
  }

  // in-process キャッシュを無効化（clearAllEnrollmentForStudent 内でも呼ばれるが念のため）
  invalidateCache(normalizedId)

  console.log('[clearCurriculumDependentData] complete:', { studentId: normalizedId, results })
  return results
}

// ── recognized_courses CRUD ───────────────────────────────────────────────────
// recognized_courses シートは「授業認定情報」専用。class_id は持たない。
// スキーマ: student_id | course_id | academic_year | recognized_type | recognized_note | created_at

const RC_HEADER = ['student_id', 'course_id', 'academic_year', 'recognized_type', 'recognized_note', 'created_at']
const RC_LAST_COL = colToLetter(RC_HEADER.length - 1)

// ── Sheet numeric-ID cache ────────────────────────────────────────────────────
// Google Sheets batchUpdate (deleteDimension) requires the sheet's numeric sheetId,
// not its title.  Fetch once and cache for the process lifetime.

const _sheetIdCache = new Map()  // sheetTitle → numericSheetId (number)

async function getSheetNumericId(sheetTitle) {
  if (_sheetIdCache.has(sheetTitle)) return _sheetIdCache.get(sheetTitle)
  const sheets = getSheetsClient()
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID(),
    fields: 'sheets.properties(sheetId,title)',
  })
  for (const s of meta.data.sheets ?? []) {
    _sheetIdCache.set(s.properties.title, s.properties.sheetId)
  }
  return _sheetIdCache.get(sheetTitle) ?? null
}

/**
 * 学生の recognized_courses 行を全件取得する。
 */
export async function fetchRecognizedCoursesForStudent(studentId = STUDENT_ID()) {
  const rows = await getRange('recognized_courses', `A:${RC_LAST_COL}`).catch(() => [])
  if (rows.length < 2) return []
  const [rawHeader, ...body] = rows
  const header = rawHeader.map(h => normalizeId(String(h)))
  const sidIdx = header.indexOf('student_id')
  if (sidIdx === -1) return []
  return body
    .filter(row => row.some(c => String(c).trim()))                         // skip blank rows
    .filter(row => normalizeId(String(row[sidIdx] ?? '')) === studentId)
    .map(row => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])))
}

/**
 * recognized_courses に1件追加または更新する（course_id 単位でupsert）。
 */
export async function upsertRecognizedCourse({ studentId = STUDENT_ID(), courseId, academicYear, recognizedType, recognizedNote }) {
  const normalizedSid = normalizeId(studentId)
  const normalizedCid = normalizeId(courseId)
  const now = new Date().toISOString()

  const rows   = await getRange('recognized_courses', `A:${RC_LAST_COL}`).catch(() => [])
  const sheets = getSheetsClient()

  // Case A: シートが空 → ヘッダー + 最初のデータ行を初期化
  if (!rows || rows.length === 0) {
    const dataRow = [
      normalizedSid,
      normalizedCid,
      academicYear != null ? String(academicYear) : '',
      recognizedType   ?? '',
      recognizedNote   ?? '',
      now,
    ]
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'recognized_courses!A1', values: [RC_HEADER] },
          { range: 'recognized_courses!A2', values: [dataRow]   },
        ],
      },
    })
    return
  }

  const [rawHeader, ...body] = rows
  const header = rawHeader.map(h => normalizeId(String(h)))
  const sidIdx = header.indexOf('student_id')
  const cidIdx = header.indexOf('course_id')

  if (sidIdx === -1 || cidIdx === -1) {
    // ヘッダー不正 → 末尾に追加
    await appendRow('recognized_courses', [normalizedSid, normalizedCid,
      academicYear != null ? String(academicYear) : '',
      recognizedType ?? '', recognizedNote ?? '', now,
    ])
    return
  }

  // 既存行を探す（student_id + course_id で一意。空行はスキップ）
  const rowIndex = body.findIndex(
    r => r.some(c => String(c).trim()) &&
         normalizeId(String(r[sidIdx] ?? '')) === normalizedSid &&
         normalizeId(String(r[cidIdx] ?? '')) === normalizedCid
  )

  if (rowIndex !== -1) {
    // 更新（created_at は保持、その他は上書き）
    const sheetRow  = rowIndex + 2
    const existing  = body[rowIndex]
    const updated   = header.map((h, i) => {
      if (h === 'student_id')      return normalizedSid
      if (h === 'course_id')       return normalizedCid
      if (h === 'academic_year')   return academicYear != null ? String(academicYear) : (existing[i] ?? '')
      if (h === 'recognized_type') return recognizedType ?? ''
      if (h === 'recognized_note') return recognizedNote ?? ''
      if (h === 'created_at')      return existing[i] ?? now   // 初回登録日時を保持
      return existing[i] ?? ''
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID(),
      range:            `recognized_courses!A${sheetRow}:${RC_LAST_COL}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [updated] },
    })
  } else {
    // 追加（空きスロットを再利用して幽霊行の蓄積を防ぐ）
    const newRow = header.map(h => {
      if (h === 'student_id')      return normalizedSid
      if (h === 'course_id')       return normalizedCid
      if (h === 'academic_year')   return academicYear != null ? String(academicYear) : ''
      if (h === 'recognized_type') return recognizedType ?? ''
      if (h === 'recognized_note') return recognizedNote ?? ''
      if (h === 'created_at')      return now
      return ''
    })

    // クリアされた空き行があれば再利用する（前回の remove で残った幽霊行対策）
    const emptySlotIndex = body.findIndex(r => !r.some(c => String(c).trim()))
    if (emptySlotIndex !== -1) {
      const sheetRow = emptySlotIndex + 2   // +1 header, +1 for 1-based
      await sheets.spreadsheets.values.update({
        spreadsheetId:    SPREADSHEET_ID(),
        range:            `recognized_courses!A${sheetRow}:${RC_LAST_COL}${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody:      { values: [newRow] },
      })
    } else {
      await appendRow('recognized_courses', newRow)
    }
  }
}

/**
 * recognized_courses から複数コースを一括削除する（student_id + course_id で特定）。
 *
 * ★ シートを1回読んで対象行を全て特定し、1回の batchUpdate で削除する。
 *   複数回読み書きすると Google Sheets の書き込み伝播遅延（結果整合性）により
 *   「再読み込み時に削除済み行がまだ見える」「誤った行番号で別行を削除する」
 *   バグが発生するため、読み1回・書き1回に集約する。
 */
export async function removeRecognizedCoursesBatch({ studentId = STUDENT_ID(), courseIds }) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) return

  const rows = await getRange('recognized_courses', `A:${RC_LAST_COL}`).catch(() => [])
  if (!rows || rows.length < 2) return

  const [rawHeader, ...body] = rows
  const header = rawHeader.map(h => normalizeId(String(h)))
  const sidIdx = header.indexOf('student_id')
  const cidIdx = header.indexOf('course_id')
  if (sidIdx === -1 || cidIdx === -1) return

  const normalizedSid  = normalizeId(studentId)
  const normalizedCids = new Set(courseIds.map(id => normalizeId(String(id))))

  // 削除対象の body インデックスをすべて収集（空行はスキップ）
  const targetBodyIndices = body
    .map((r, i) => ({ r, i }))
    .filter(({ r }) =>
      r.some(c => String(c).trim()) &&
      normalizeId(String(r[sidIdx] ?? '')) === normalizedSid &&
      normalizedCids.has(normalizeId(String(r[cidIdx] ?? '')))
    )
    .map(({ i }) => i)

  if (targetBodyIndices.length === 0) return

  const sheets         = getSheetsClient()
  const sheetNumericId = await getSheetNumericId('recognized_courses')

  if (sheetNumericId != null) {
    // 下から順に削除することでインデックスのズレを防ぐ
    const requests = [...targetBodyIndices]
      .sort((a, b) => b - a)   // 降順
      .map(i => ({
        deleteDimension: {
          range: {
            sheetId:    sheetNumericId,
            dimension:  'ROWS',
            startIndex: i + 1,   // 0-based: header=0, body[0]=1, body[i]=i+1
            endIndex:   i + 2,
          },
        },
      }))
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody:   { requests },
    })
  } else {
    // フォールバック: sheetId が取得できない場合は一括クリア
    const batchData = targetBodyIndices.map(i => ({
      range:  `recognized_courses!A${i + 2}:${RC_LAST_COL}${i + 2}`,
      values: [header.map(() => '')],
    }))
    if (batchData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID(),
        requestBody:   { valueInputOption: 'RAW', data: batchData },
      })
    }
  }
}

/**
 * recognized_courses から1件削除する（後方互換・単一削除用）。
 * バッチ削除には removeRecognizedCoursesBatch を使うこと。
 */
export async function removeRecognizedCourse({ studentId = STUDENT_ID(), courseId }) {
  await removeRecognizedCoursesBatch({ studentId, courseIds: [courseId] })
}

/**
 * Bulk-update the status column for a specific set of class_ids.
 *
 * Only the status cell is changed — all other columns are left untouched.
 * All matching rows (student_id + class_id) are updated in a single batchUpdate.
 *
 * @param {string[]} classIds  class_ids to update (NFKC-normalised internally)
 * @param {string}   newStatus target status string
 * @returns {Promise<number>}  number of rows updated
 */
export async function bulkUpdateEnrollmentStatus(classIds, newStatus, studentId = STUDENT_ID()) {
  if (!Array.isArray(classIds) || classIds.length === 0) {
    throw new Error('classIds must be a non-empty array')
  }

  const VALID = ['COMPLETED', 'IN_PROGRESS', 'PLANNED', 'FAILED', 'AUDIT', 'RE_ENROLL']
  if (!VALID.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Must be one of ${VALID.join(', ')}`)
  }

  const normalizedIds = new Set(classIds.map(id => normalizeId(String(id ?? ''))))

  const rows = await getRange('enrollment', 'A:ZZ').catch(() => [])
  if (rows.length < 2) return 0

  const [headerRow, ...bodyRows] = rows

  const classIdCol   = headerRow.indexOf('class_id')
  const statusCol    = headerRow.indexOf('status')
  const studentIdCol = headerRow.indexOf('student_id')

  if (classIdCol === -1 || statusCol === -1) {
    throw new Error('enrollment sheet missing class_id or status column')
  }

  const normalizedStudentId = normalizeId(String(studentId ?? ''))

  // Collect body-row indices where class_id matches any requested id (and student_id matches)
  const matchIndices = []
  for (let i = 0; i < bodyRows.length; i++) {
    const cid = normalizeId(String(bodyRows[i][classIdCol] ?? ''))
    if (!normalizedIds.has(cid)) continue
    // If student_id column exists, filter to only this student's rows
    if (studentIdCol !== -1) {
      const sid = normalizeId(String(bodyRows[i][studentIdCol] ?? ''))
      if (sid !== normalizedStudentId) continue
    }
    matchIndices.push(i)
  }

  if (matchIndices.length === 0) {
    console.warn('[bulkUpdateEnrollmentStatus] no matching rows for classIds:', [...normalizedIds])
    return 0
  }

  // One range entry per row — status column only
  const statusColLetter = colToLetter(statusCol)
  const data = matchIndices.map(i => ({
    range:  `enrollment!${statusColLetter}${i + 2}`,  // +1 header, +1 for 1-index
    values: [[newStatus]],
  }))

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody:   { valueInputOption: 'RAW', data },
  })

  invalidateCache(studentId)

  console.log('[BULK_STATUS_UPDATE]', {
    class_ids:     [...normalizedIds],
    updated_count: matchIndices.length,
    new_status:    newStatus,
  })

  return matchIndices.length
}

// ── final_category helpers ────────────────────────────────────────────────────

/**
 * Build an O(1) lookup map from curriculum_mapping rows.
 *
 * Sheet structure (new): id | course_id | department_id | course_name | category | start_year | end_year
 * Sheet structure (legacy): id | course_id | department_id | course_name | category | curriculum_year
 *
 * Composite key : normalizeId(course_id) + '\x00' + normalizeId(department_id)
 * Value         : category string
 *
 * Year filtering (new schema):
 *   Only rows where start_year <= curriculumYear <= end_year are included.
 *   If a row has no start_year/end_year (legacy), it is always included.
 *   If curriculumYear is null, all rows are included (backward compat).
 *
 * @param {object[]} rows           curriculum_mapping rows from Sheets
 * @param {number|null} curriculumYear  student's curriculum year for range filtering
 */
function buildCurriculumMap(rows, curriculumYear = null) {
  const map = new Map()
  for (const row of rows) {
    const courseId = normalizeId(row.course_id    || '')
    const dept     = normalizeId(row.department_id || '')
    const category = (row.category || '').trim()
    if (!courseId || !dept || !category) continue

    // ── Year range filter ─────────────────────────────────────────────────────
    if (curriculumYear != null) {
      const startYear = row.start_year ? parseInt(String(row.start_year).trim(), 10) : null
      const endYear   = row.end_year   ? parseInt(String(row.end_year).trim(),   10) : null

      if (startYear != null && endYear != null) {
        // New schema: start_year / end_year range
        if (curriculumYear < startYear || curriculumYear > endYear) continue
      } else {
        // Legacy single curriculum_year column (backward compat)
        const rowCY = row.curriculum_year ? parseInt(String(row.curriculum_year).trim(), 10) : null
        if (rowCY != null && rowCY !== curriculumYear) continue
        // No year columns at all → include for all years (backward compat)
      }
    }

    const key = courseId + '\x00' + dept
    // Later rows override earlier rows for the same key (last-write-wins within year range)
    map.set(key, category)

    console.log('[buildCurriculumMap] registered:', { course_id: courseId, department_id: dept, category, curriculumYear })
  }
  console.log('[buildCurriculumMap] total entries:', map.size, '(curriculumYear:', curriculumYear, ')')
  return map
}

/**
 * Resolve final_category for a single enrollment row.
 *
 * Rules:
 *   tags !== 'SPECIAL'  → return tags as-is  (e.g. 'S_MAN', 'SA_ELE', 'CA_MAN')
 *   tags === 'SPECIAL'  → look up curriculum_mapping by (course_id, department_id)
 *                         → return matched category, or 'UNKNOWN' if not found
 *
 * A [FINAL_CATEGORY] log line is emitted for every row.
 * A [SPECIAL_LOOKUP]  log line is emitted for every SPECIAL resolution attempt.
 *
 * @param {string} tags          - raw tags value from course sheet
 * @param {string} department    - user's department_id
 * @param {string} courseId      - already-normalized course_id
 * @param {Map}    curriculumMap - built by buildCurriculumMap()
 * @returns {string}
 */
function getFinalCategory(tags, department, courseId, curriculumMap) {
  const t       = (tags || '').trim().toUpperCase()
  const dept_id = normalizeId(String(department || ''))
  const cid     = normalizeId(String(courseId   || ''))

  let result

  if (t === 'SPECIAL') {
    const lookupKey = cid + '\x00' + dept_id
    const found     = curriculumMap.get(lookupKey)

    console.log('[SPECIAL_LOOKUP]', {
      course_id:     cid,
      department_id: dept_id,
      lookupKey,
      found: found ?? null,
    })

    result = found ?? 'FREE'
  } else {
    result = (tags || '').trim() || 'UNKNOWN'
  }

  console.log('[FINAL_CATEGORY]', {
    course_id:     cid,
    tags,
    department_id: dept_id,
    result,
  })

  return result
}

// ── Students summary rebuild ──────────────────────────────────────────────────

/**
 * Rebuild students_summary from progress_auto.
 *
 * MUST be called after updateProgressAuto() — it reads the already-resolved
 * final_category values from progress_auto rather than re-deriving them.
 * The enrollment API chains these sequentially:
 *   updateProgressAuto(dept) → updateStudentsSummary(dept)
 *
 * Aggregation rules:
 *   • status === 'COMPLETED' rows only (FAILED / IN_PROGRESS / PLANNED / AUDIT skipped)
 *   • Group by student_id
 *   • Sum credits per final_category
 *   • department_id taken from progress_auto column (first non-empty value per student)
 *
 * Output structure (students_summary):
 *   Row 1 : header  — student_id | department_id | <category>…
 *   Row 2+: data    — one row per student
 *
 * Defensive rules:
 *   • Empty rows         → skipped
 *   • Empty final_category → skipped + warn
 *   • Non-numeric credits  → skipped + warn
 *   • Missing columns      → warn then abort
 *   • Stale excess rows    → overwritten with empty strings (no values.clear)
 *
 * All column resolution uses header names — no fixed integer indices.
 */
export async function updateStudentsSummary(_userDepartment = '', studentIdFilter = null) {
  // ══════════════════════════════════════════════════════════════════════════
  // Design contract
  // ──────────────────────────────────────────────────────────────────────────
  //  • NEW ROWS are NEVER appended here — that is createOrInitStudentSummary's job.
  //  • This function only UPDATES rows that already exist in students_summary.
  //  • Duplicate student rows (same normalised student_id) are detected, warned,
  //    and compacted: the first occurrence is kept, extras are blanked.
  //  • The stale-row blank range covers ALL trailing rows (including sparse empty
  //    ones) so no orphan data survives at an arbitrary row number.
  //  • All student_id comparisons use normalizeId() on both sides.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Step 1: Aggregate COMPLETED credits from progress_auto ─────────────────
  const paRows = await getRange('progress_auto', 'A:ZZ').catch(() => [])

  if (paRows.length < 2) {
    console.warn('[updateStudentsSummary] progress_auto is empty or missing — skipping')
    return
  }

  const [paHeader, ...paBody] = paRows
  // normalizeId on header keys so full/half-width header names never cause misses
  const paHeaderMap = new Map(paHeader.map((h, i) => [normalizeId(String(h)), i]))

  // 'department' in progress_auto (written by updateProgressAuto COLS[5])
  // Output column in students_summary is still named 'department_id'
  const required = ['student_id', 'department', 'final_category', 'credits', 'status']
  const missing  = required.filter(c => !paHeaderMap.has(c))
  if (missing.length > 0) {
    console.warn('[updateStudentsSummary] progress_auto missing columns:', missing,
      '\n  actual header:', paHeader, '\n  — aborting')
    return
  }

  const PA = {
    studentId:     paHeaderMap.get('student_id'),
    departmentId:  paHeaderMap.get('department'),    // progress_auto uses 'department'
    finalCategory: paHeaderMap.get('final_category'),
    credits:       paHeaderMap.get('credits'),
    status:        paHeaderMap.get('status'),
  }

  console.log('[updateStudentsSummary] progress_auto column indices:', {
    student_id:     PA.studentId,
    department:     PA.departmentId,
    final_category: PA.finalCategory,
    credits:        PA.credits,
    status:         PA.status,
    total_cols:     paHeader.length,
    total_rows:     paBody.length,
  })

  // creditMap: normalised student_id → { departmentId, categories: Map<cat, number> }
  const creditMap = new Map()

  const normFilter = studentIdFilter ? normalizeId(studentIdFilter) : null

  for (const row of paBody) {
    if (!row.length || row.every(c => !String(c).trim())) continue

    const studentId = normalizeId(String(row[PA.studentId] ?? ''))
    if (!studentId) continue
    // student_id フィルタが指定された場合は対象学生のみ集計
    if (normFilter && studentId !== normFilter) continue

    // status: trim + toUpperCase — COMPLETED / Completed / completed all match
    const status = String(row[PA.status] ?? '').trim().toUpperCase()
    if (status !== 'COMPLETED') continue

    // final_category: NFKC-normalised to eliminate full/half-width drift
    const cat = normalizeId(String(row[PA.finalCategory] ?? ''))
    if (!cat) {
      console.warn('[updateStudentsSummary] row skipped — empty final_category:', {
        studentId, rawCell: row[PA.finalCategory],
      })
      continue
    }

    const creditsRaw = String(row[PA.credits] ?? '').trim()
    const credits    = Number(creditsRaw)
    if (!creditsRaw || !Number.isFinite(credits)) {
      console.warn('[updateStudentsSummary] row skipped — non-numeric credits:', {
        studentId, cat, creditsRaw,
      })
      continue
    }

    const dept = String(row[PA.departmentId] ?? '').trim()

    if (!creditMap.has(studentId)) {
      creditMap.set(studentId, { departmentId: '', categories: new Map() })
    }
    const entry = creditMap.get(studentId)
    if (!entry.departmentId && dept) entry.departmentId = dept

    const prev = entry.categories.get(cat) ?? 0
    entry.categories.set(cat, prev + credits)
    console.log('[summary:add]', studentId, cat, `+${credits}`, '→', prev + credits)
  }

  // ── Step 2: Read students_summary → build studentRowMap ────────────────────
  // studentRowMap: normalised student_id → { sheetRow (1-based), dept }
  // • Only first occurrence is kept (duplicate rows are detected and warned)
  // • This map drives the write — new rows are NEVER added here
  const ssRows   = await getRange('students_summary', 'A:ZZ').catch(() => [])
  const ssHeader = ssRows[0] ?? []
  const ssBody   = ssRows.slice(1)   // may include empty trailing rows

  const ssHeaderMap = new Map(ssHeader.map((h, i) => [normalizeId(String(h)), i]))
  const ssStudentIdx = ssHeaderMap.get('student_id')
  const ssDeptIdx    = ssHeaderMap.get('department_id')

  if (ssStudentIdx == null) {
    console.warn('[updateStudentsSummary] students_summary has no student_id column — skipping')
    return
  }

  // Build studentRowMap; detect duplicates
  // sheetRow = body index (0-based) + 2  (1-based row + header offset)
  const studentRowMap = new Map()  // normalised studentId → { sheetRow, dept }

  for (let i = 0; i < ssBody.length; i++) {
    const row = ssBody[i]
    if (!row.length || row.every(c => !String(c).trim())) continue

    const sid = normalizeId(String(row[ssStudentIdx] ?? ''))
    if (!sid) continue
    // フィルタが指定された場合は対象学生の行のみ studentRowMap に登録
    if (normFilter && sid !== normFilter) continue

    if (studentRowMap.has(sid)) {
      const first = studentRowMap.get(sid).sheetRow
      console.warn('[students_summary] duplicate student rows detected:', sid, {
        firstRow:     first,
        duplicateRow: i + 2,
      })
      continue   // keep first occurrence; duplicate will be blanked in Step 4
    }

    const dept = ssDeptIdx != null ? String(row[ssDeptIdx] ?? '').trim() : ''
    studentRowMap.set(sid, { sheetRow: i + 2, dept })
  }

  if (studentRowMap.size === 0) {
    console.warn('[updateStudentsSummary] students_summary has no student rows — nothing to update')
    console.warn('[updateStudentsSummary] hint: call createOrInitStudentSummary() first')
    return
  }

  // ── Step 3: Map header columns → index (read-only; header is NEVER rewritten) ─
  // ─────────────────────────────────────────────────────────────────────────────
  // Design contract:
  //   • The header row is read once and used as the authoritative column layout.
  //   • We NEVER write the header back — manually added columns are preserved.
  //   • We NEVER add or remove rows — manually added rows are preserved.
  //   • We ONLY update the credit value for each column whose normalised name
  //     matches a category in creditMap.
  //   • student_id and department_id cells are NOT overwritten.
  //   • Cells for columns not in creditMap (manual/unknown columns) are carried
  //     forward verbatim from the existing row data (no-op).
  // ─────────────────────────────────────────────────────────────────────────────

  // headerCols: array of { normalized, idx } for every category column
  // (excludes student_id, department_id, and blank headers)
  const headerCols = ssHeader.map((h, i) => ({
    normalized: normalizeId(String(h)),
    idx:        i,
  })).filter(({ normalized: n }) => n && n !== 'student_id' && n !== 'department_id')

  const existingCatSet = new Set(headerCols.map(c => c.normalized))

  // Warn about new categories in creditMap that have no column in the sheet yet
  for (const entry of creditMap.values()) {
    for (const cat of entry.categories.keys()) {
      if (!existingCatSet.has(cat)) {
        console.warn('[updateStudentsSummary] category in progress_auto has no column in students_summary (skipped — add column manually if needed):', cat)
      }
    }
  }

  const lastHeaderCol = colToLetter(ssHeader.length - 1)

  console.log('[summary:categories]', {
    sheet_columns: [...existingCatSet],
    header_length: ssHeader.length,
  })

  // ── Step 4: Build batchUpdate — only credit cells, never header or extra rows ─
  const updates = []

  for (const [sid, { sheetRow, dept }] of studentRowMap) {
    const entry = creditMap.get(sid)

    // Base: start from the EXISTING row data so unknown/manual columns are untouched
    const existingRow = ssBody[sheetRow - 2] ?? []  // 0-based body index
    const outputRow   = [...existingRow]

    // Pad to header length so every column has a slot
    while (outputRow.length < ssHeader.length) outputRow.push('')

    if (!entry) {
      // Student exists in sheet but has no COMPLETED credits — zero all category cols
      for (const { idx } of headerCols) {
        outputRow[idx] = 0
      }
      console.log('[summary:no-credits]', sid, '— zeroing all category columns')
    } else {
      // Write computed credit value for each existing category column
      for (const { normalized: cat, idx } of headerCols) {
        const val = entry.categories.get(cat) ?? 0
        outputRow[idx] = val
        console.log('[summary:cell]', { sid, cat, col: colToLetter(idx), val })
      }
    }

    console.log('[summary:final-row]', { sheetRow, row: outputRow })

    updates.push({
      range:  `students_summary!A${sheetRow}:${lastHeaderCol}${sheetRow}`,
      values: [outputRow],
    })
  }

  // Warn about students in progress_auto not yet in students_summary
  for (const sid of creditMap.keys()) {
    if (!studentRowMap.has(sid)) {
      console.warn('[updateStudentsSummary] student in progress_auto but not in students_summary (skipped — call createOrInitStudentSummary first):', sid)
    }
  }

  if (updates.length === 0) {
    console.warn('[updateStudentsSummary] no rows to update — students_summary unchanged')
    return
  }

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody:   { valueInputOption: 'RAW', data: updates },
  })

  invalidateCache()

  console.log('[updateStudentsSummary] done:', {
    students_updated: studentRowMap.size,
    categories_written: [...existingCatSet],
  })
}

// ── Students summary — initial row creation ───────────────────────────────────

/**
 * Ensure the current student has a row in students_summary.
 *
 * Called fire-and-forget from POST /api/users after the department is confirmed.
 * Its only job is to guarantee the student's row exists with the correct
 * department_id.  Credit aggregation is handled separately by updateStudentsSummary().
 *
 * Behaviour matrix:
 *   Sheet empty / no header        → write minimal header + first data row (all cats 0)
 *   Student row exists, dept OK    → no-op
 *   Student row exists, dept drift → warn + update department_id in-place
 *   Student row missing            → append row (0 for every existing category column)
 *
 * All column resolution uses header names — no fixed indices.
 * Never throws — errors are logged and swallowed so the users API is not blocked.
 */
export async function createOrInitStudentSummary(departmentId, studentId = STUDENT_ID()) {
  const normalizedDept = normalizeId(departmentId)

  if (!normalizedDept) {
    console.warn('[createOrInitStudentSummary] empty department_id — skipping')
    return
  }

  // 'A:ZZ' covers 702 columns — handles any number of category columns
  const rows   = await getRange('students_summary', 'A:ZZ').catch(() => [])
  const sheets = getSheetsClient()

  // ── Case A: sheet is completely empty ─────────────────────────────────────
  if (rows.length === 0) {
    const header  = ['student_id', 'department_id']
    const dataRow = [studentId, normalizedDept]
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'students_summary!A1', values: [header]   },
          { range: 'students_summary!A2', values: [dataRow]  },
        ],
      },
    })
    invalidateCache(studentId)
    console.log('[createOrInitStudentSummary] created sheet + initial row:', { studentId, departmentId: normalizedDept })
    return
  }

  const [headerRow, ...bodyRows] = rows
  const headerMap = new Map(headerRow.map((h, i) => [String(h).trim(), i]))

  const studentIdIdx = headerMap.get('student_id')
  const deptIdIdx    = headerMap.get('department_id')

  if (studentIdIdx == null || deptIdIdx == null) {
    console.warn('[createOrInitStudentSummary] students_summary header missing student_id or department_id — skipping')
    return
  }

  // ── Case B: find existing row for this student ────────────────────────────
  const rowIndex = bodyRows.findIndex(
    r => normalizeId(String(r[studentIdIdx] ?? '')) === studentId
  )

  if (rowIndex !== -1) {
    const existingRow  = bodyRows[rowIndex]
    const existingDept = normalizeId(String(existingRow[deptIdIdx] ?? ''))

    if (existingDept === normalizedDept) return  // ← no-op: already correct

    // users sheet is source of truth — sync department_id into students_summary
    console.warn('[createOrInitStudentSummary] department_id mismatch — syncing from users sheet:', {
      studentId,
      users_sheet:     normalizedDept,
      summary_sheet:   existingDept,
    })
    const sheetRow   = rowIndex + 2   // 1-based row number (header offset)
    const updatedRow = [...existingRow]
    updatedRow[deptIdIdx] = normalizedDept
    await sheets.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID(),
      range:            `students_summary!A${sheetRow}:${colToLetter(updatedRow.length - 1)}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [updatedRow] },
    })
    invalidateCache(studentId)
    return
  }

  // ── Case C: student row missing — append with 0 for all category columns ──
  // Category columns are identified by position (anything after department_id).
  // Using the current header order keeps the new row aligned with existing columns.
  const newRow = headerRow.map((h, i) => {
    if (i === studentIdIdx) return studentId
    if (i === deptIdIdx)    return normalizedDept
    return 0   // category columns: 0-initialized (no COMPLETED enrollments yet)
  })
  await appendRow('students_summary', newRow)
  invalidateCache(studentId)
  console.log('[createOrInitStudentSummary] appended initial row:', {
    studentId,
    departmentId: normalizedDept,
    zeroCols: headerRow.length - 2,
  })
}

// ── leave_periods CRUD ────────────────────────────────────────────────────────

const LP_HEADERS = ['student_id', 'leave_start', 'leave_end']

/**
 * leave_periods シートに休学期間を追加または更新する。
 * student_id + leave_start の組み合わせで一意に管理する。
 */
export async function upsertLeavePeriod({ studentId = STUDENT_ID(), leaveStart, leaveEnd }) {
  const normalizedSid = normalizeId(studentId)
  const rows          = await getRange('leave_periods').catch(() => [])
  const sheets        = getSheetsClient()

  // ── Case A: シートが空 → ヘッダー + データ行を初期化 ─────────────────────
  if (!rows || rows.length === 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'leave_periods!A1', values: [LP_HEADERS] },
          { range: 'leave_periods!A2', values: [[normalizedSid, leaveStart, leaveEnd]] },
        ],
      },
    })
    invalidateCache(studentId)
    return
  }

  const [headerRow, ...bodyRows] = rows
  const headers  = headerRow.map(h => normalizeId(String(h)))
  const sidIdx   = headers.indexOf('student_id')
  const startIdx = headers.indexOf('leave_start')
  const endIdx   = headers.indexOf('leave_end')

  if (sidIdx === -1 || startIdx === -1 || endIdx === -1) {
    // ヘッダー不整合 → 末尾に追加
    await appendRow('leave_periods', [normalizedSid, leaveStart, leaveEnd])
    invalidateCache(studentId)
    return
  }

  // 既存行を探す（student_id + leave_start で一意）
  const rowIndex = bodyRows.findIndex(r =>
    normalizeId(String(r[sidIdx] ?? '')) === normalizedSid &&
    String(r[startIdx] ?? '').trim() === leaveStart
  )

  if (rowIndex !== -1) {
    // Case B: 既存行あり → leave_end を更新
    const sheetRow  = rowIndex + 2
    const updated   = [...bodyRows[rowIndex]]
    while (updated.length < headers.length) updated.push('')
    updated[sidIdx]   = normalizedSid
    updated[startIdx] = leaveStart
    updated[endIdx]   = leaveEnd
    await sheets.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID(),
      range:            `leave_periods!A${sheetRow}:${colToLetter(updated.length - 1)}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [updated] },
    })
  } else {
    // Case C: 新規行を追加
    await appendRow('leave_periods', [normalizedSid, leaveStart, leaveEnd])
  }

  invalidateCache(studentId)
}

/**
 * leave_periods から1件削除する（student_id + leave_start で特定）。
 * 行をクリアして幽霊行として残す（行番号ズレを防ぐため）。
 * Returns true if found and cleared, false if not found.
 */
export async function removeLeavePeriod({ studentId = STUDENT_ID(), leaveStart }) {
  const normalizedSid = normalizeId(studentId)
  const rows          = await getRange('leave_periods').catch(() => [])
  if (!rows || rows.length < 2) return false

  const [headerRow, ...bodyRows] = rows
  const headers  = headerRow.map(h => normalizeId(String(h)))
  const sidIdx   = headers.indexOf('student_id')
  const startIdx = headers.indexOf('leave_start')
  if (sidIdx === -1 || startIdx === -1) return false

  const rowIndex = bodyRows.findIndex(r =>
    normalizeId(String(r[sidIdx] ?? '')) === normalizedSid &&
    String(r[startIdx] ?? '').trim() === leaveStart
  )
  if (rowIndex === -1) return false

  const sheetRow = rowIndex + 2
  const emptyRow = headerRow.map(() => '')
  const sheets   = getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId:    SPREADSHEET_ID(),
    range:            `leave_periods!A${sheetRow}:${colToLetter(headerRow.length - 1)}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody:      { values: [emptyRow] },
  })

  invalidateCache(studentId)
  return true
}

// ── User settings ─────────────────────────────────────────────────────────────

/**
 * Upsert the current user's department_id in the `users` sheet.
 *
 * Sheet structure (header row must exist):
 *   user_id | department_id
 *
 * Behaviour:
 *   • Existing row for this user_id → update department_id in-place (single-row update)
 *   • No row found → append a new row
 *   • Header missing / sheet empty → write header first, then append data row
 *
 * department_id is stored as a normalized (NFKC + trim) ID string.
 * Display labels are NEVER stored here — they live in the departments master sheet.
 */
/**
 * Upsert the current user's department_id (and optionally curriculum_year) in the `users` sheet.
 *
 * Sheet structure: email | student_id | department_id | curriculum_year
 *
 * curriculum_year is optional: pass null/undefined to leave it unchanged.
 */
export async function upsertUserDepartment(departmentId, curriculumYear, studentId = STUDENT_ID()) {
  const normalizedDept = normalizeId(departmentId)
  const normalizedSid  = normalizeId(studentId)

  if (!normalizedDept) throw new Error('department_id must not be empty')
  if (!normalizedSid)  throw new Error('student_id must not be empty')

  const rows   = await getRange('users').catch(() => [])
  const sheets = getSheetsClient()

  // ── ヘッダー解析 (normalizeId で全角・スペース混入を吸収) ─────────────────
  const headers      = rows[0] ?? []
  const studentIdCol = headers.findIndex(h => normalizeId(String(h)) === 'student_id')
  const deptIdCol    = headers.findIndex(h => normalizeId(String(h)) === 'department_id')

  if (studentIdCol === -1 || deptIdCol === -1) {
    console.error('[upsertUserDepartment] users シートのヘッダーが不正です:', headers)
    invalidateCache(studentId)
    return
  }

  // curriculum_year 列を探す（存在しない場合は -1 → 書き込まない）
  const cyCol = headers.findIndex(h => normalizeId(String(h)) === 'curriculum_year')

  // ── 空行を除いたデータ行と元のシート行番号の対応を構築 ────────────────────
  const rawRows    = rows.slice(1)
  const rawRowNums = rawRows.map((_, i) => i + 2)

  const matchIndices = rawRows.reduce((acc, row, i) => {
    if (normalizeId(String(row[studentIdCol] ?? '')) === normalizedSid) acc.push(i)
    return acc
  }, [])

  if (matchIndices.length === 0) {
    // ── Case A: 行なし → 新規追加 ────────────────────────────────────────
    const newRow = headers.map((_, i) => {
      if (i === studentIdCol) return normalizedSid
      if (i === deptIdCol)    return normalizedDept
      if (cyCol !== -1 && i === cyCol && curriculumYear != null) return String(curriculumYear)
      return ''
    })
    await appendRow('users', newRow)
    console.log('[upsertUserDepartment] appended new row:', { studentId: normalizedSid, departmentId: normalizedDept, curriculumYear })

  } else {
    // ── Case B: 既存行あり → 先頭の1行だけ更新、残りは重複として消去 ───────
    const keepIdx    = matchIndices[0]
    const keepRow    = rawRowNums[keepIdx]
    const updatedRow = [...rawRows[keepIdx]]
    while (updatedRow.length < headers.length) updatedRow.push('')
    updatedRow[studentIdCol] = normalizedSid
    updatedRow[deptIdCol]    = normalizedDept
    if (cyCol !== -1 && curriculumYear != null) updatedRow[cyCol] = String(curriculumYear)

    await sheets.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID(),
      range:            `users!A${keepRow}:${colToLetter(updatedRow.length - 1)}${keepRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [updatedRow] },
    })
    console.log('[upsertUserDepartment] updated row:', { studentId: normalizedSid, departmentId: normalizedDept, curriculumYear, sheetRow: keepRow })

    // 重複行を空にする（Google Sheets API で行を直接削除するにはシートIDが必要なため
    // ここでは内容をクリアして実質的に無効化する。filter(r => r.some(...)) で無視される）
    if (matchIndices.length > 1) {
      console.warn('[upsertUserDepartment] duplicate student_id rows detected — clearing:', {
        studentId: normalizedSid,
        duplicateSheetRows: matchIndices.slice(1).map(i => rawRowNums[i]),
      })
      for (const dupIdx of matchIndices.slice(1)) {
        const dupRow = rawRowNums[dupIdx]
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID(),
          range: `users!A${dupRow}:Z${dupRow}`,
        })
      }
    }
  }

  invalidateCache(studentId)
}

// ── User bootstrap ────────────────────────────────────────────────────────────

// NextAuth の jwt callback は初回ログイン時に並列で複数回呼ばれることがある。
// 同一 email に対する同時呼び出しをひとつの Promise に束ねることで、
// users シートへの二重書き込み（重複行）を防ぐ。
const _bootstrapLock = new Map()   // normalizedEmail → Promise

/**
 * Google ログイン時に呼ばれる。
 * users シートのスキーマ: email | student_id | department_id
 *
 * Behaviour:
 *   • シートが空 / ヘッダー不足 → ヘッダー + 最初のユーザー行を初期化
 *   • email が既存          → 既存の student_id を返す (no-op)
 *   • email が未登録        → student_NNN を採番して行を追加
 *
 * 同一 email の並列呼び出しは最初の Promise が完了するまで待機する（レースコンディション防止）。
 *
 * @param  {string} email Google アカウントのメールアドレス
 * @returns {Promise<{ student_id: string, existed: boolean }>}
 */
export async function bootstrapUserIfNeeded(email) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase()
  if (!normalizedEmail) return { student_id: '', existed: false }

  // 同一 email の並列実行を dedup（JWT callback の複数同時呼び出し対策）
  if (_bootstrapLock.has(normalizedEmail)) {
    console.log('[bootstrapUserIfNeeded] waiting for in-progress bootstrap:', normalizedEmail)
    return _bootstrapLock.get(normalizedEmail)
  }

  const promise = _doBootstrapUser(normalizedEmail)
  _bootstrapLock.set(normalizedEmail, promise)
  promise.finally(() => _bootstrapLock.delete(normalizedEmail))
  return promise
}

async function _doBootstrapUser(normalizedEmail) {
  try {

    // キャッシュを使わず常に最新を取得（登録競合防止）
    const rows = await getRange('users')
    if (!rows || rows.length === 0) {
      // APIは成功したがシートが完全に空の場合のみ初期化を許可
      const COLS = ['email', 'student_id', 'department_id', 'curriculum_year']
      const firstStudentId = 'student_001'
      const sheets = getSheetsClient()
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID(),
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: 'users!A1', values: [COLS] },
            { range: 'users!A2', values: [[normalizedEmail, firstStudentId, '', '']] },
          ],
        },
      })
      invalidateCache(firstStudentId)
      console.log('[bootstrapUserIfNeeded] initialized users sheet (truly empty):', { email: normalizedEmail, student_id: firstStudentId })
      return { student_id: firstStudentId, existed: false }
    }

    const headers = rows[0] ?? []

    const emailIdx     = headers.findIndex(h => String(h).trim().toLowerCase() === 'email')
    const studentIdIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'student_id')
    const deptIdx      = headers.findIndex(h => String(h).trim().toLowerCase() === 'department_id')

    // ── Case A: ヘッダーが壊れている → データ保護のため例外を投げて中断 ─────────
    // getRange が成功しているにもかかわらずヘッダーが見つからない場合は
    // シートが壊れているか想定外のフォーマット。上書きは絶対に行わない。
    if (emailIdx === -1 || studentIdIdx === -1 || deptIdx === -1) {
      throw new Error(`[bootstrapUserIfNeeded] users sheet has unexpected headers: ${headers.join(', ')} — aborting to prevent data overwrite`)
    }

    // ── Case B: email が既存 → student_id を返す ─────────────────────────────
    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''))
    const existingRow = dataRows.find(
      r => String(r[emailIdx] ?? '').trim().toLowerCase() === normalizedEmail
    )
    if (existingRow) {
      const studentId = normalizeId(String(existingRow[studentIdIdx] ?? ''))
      console.log('[bootstrapUserIfNeeded] existing user:', { email: normalizedEmail, student_id: studentId })
      return { student_id: studentId, existed: true }
    }

    // ── Case C: email が未登録 → student_NNN を採番して追加 ────────────────────
    // 採番は「書き込み直前の最新データ」から行う（二段階確認）
    const existingNums = dataRows.map(r => {
      const id = String(r[studentIdIdx] ?? '')
      const m  = id.match(/(\d+)$/)
      return m ? parseInt(m[1], 10) : 0
    })
    const maxNum       = Math.max(0, ...existingNums)
    const newStudentId = `student_${String(maxNum + 1).padStart(3, '0')}`

    // ── 書き込み直前に再読み込みして二重チェック ────────────────────────────────
    // 別のサーバーインスタンスが同時にユーザーを追加した可能性があるため、
    // appendRow の直前にシートを再取得して email / student_id の衝突がないことを確認する。
    const freshRows     = await getRange('users')
    const freshDataRows = (freshRows ?? []).slice(1).filter(r => r.some(c => c !== ''))

    // email 重複チェック
    const alreadyExists = freshDataRows.find(
      r => String(r[emailIdx] ?? '').trim().toLowerCase() === normalizedEmail
    )
    if (alreadyExists) {
      const sid = normalizeId(String(alreadyExists[studentIdIdx] ?? ''))
      console.log('[bootstrapUserIfNeeded] double-check: already exists — skipping append:', { email: normalizedEmail, student_id: sid })
      return { student_id: sid, existed: true }
    }

    // student_id 重複チェック（レースコンディション対策）
    const idTaken = freshDataRows.some(
      r => normalizeId(String(r[studentIdIdx] ?? '')) === normalizeId(newStudentId)
    )
    if (idTaken) {
      // 別プロセスが同じIDを先に取った → 最新の max から再採番
      const freshNums = freshDataRows.map(r => {
        const id = String(r[studentIdIdx] ?? '')
        const m  = id.match(/(\d+)$/)
        return m ? parseInt(m[1], 10) : 0
      })
      const freshMax    = Math.max(0, ...freshNums)
      const safeId      = `student_${String(freshMax + 1).padStart(3, '0')}`
      console.warn('[bootstrapUserIfNeeded] student_id collision detected — reassigned:', { attempted: newStudentId, assigned: safeId })
      const newRow = (freshRows[0] ?? headers).map((h, i) => {
        if (i === emailIdx)     return normalizedEmail
        if (i === studentIdIdx) return safeId
        if (i === deptIdx)      return ''
        return ''
      })
      await appendRow('users', newRow)
      invalidateCache(safeId)
      return { student_id: safeId, existed: false }
    }

    const newRow = headers.map((h, i) => {
      if (i === emailIdx)     return normalizedEmail
      if (i === studentIdIdx) return newStudentId
      if (i === deptIdx)      return ''
      return ''
    })
    await appendRow('users', newRow)
    invalidateCache(newStudentId)
    console.log('[bootstrapUserIfNeeded] created new user:', { email: normalizedEmail, student_id: newStudentId })
    return { student_id: newStudentId, existed: false }
  } catch (err) {
    console.error('[bootstrapUserIfNeeded] failed:', err)
    return { student_id: '', existed: false }
  }
}

// ── progress_auto rebuild ─────────────────────────────────────────────────────

/**
 * Student-scoped update for the `progress_auto` sheet.
 *
 * Design contract (multi-student aware):
 *   • Header row (A1) is written only when absent or COLS have drifted.
 *   • Only rows belonging to `studentId` are replaced.  Every other student's
 *     rows are read first and preserved verbatim — other students' data is
 *     never lost by a single-student recalculation.
 *   • Stale rows (body shrank) are overwritten with empty strings so the sheet
 *     stays compact.  No values.clear() is used.
 *   • userDepartment is read from the users sheet via fetchAllSheets (not passed
 *     as a parameter) so each student uses their own registered department.
 *
 * API round-trips: 1 read (full body) + 1 batchUpdate.
 *
 * Never throws — errors are caught so callers are never blocked.
 *
 * Canonical columns (A–N, stable — downstream VLOOKUP column-index must match):
 *   A student_id | B class_id | C course_id | D course_name | E credits |
 *   F department | G term | H raw_category | I sub_category | J tags |
 *   K final_category | L year | M semester | N status
 */
export async function updateProgressAuto(studentId = STUDENT_ID()) {
  const {
    courses: rawCourses,
    normalizedEnrollment,
    curriculumMappingRows,
    userDepartment,          // 各学生の学科を users シートから取得
    userCurriculumYear,      // 学生の制度年度（curriculum_year）
  } = await fetchAllSheets(studentId)

  const courses = rawCourses.map(normalizeCourse)

  // Build curriculum lookup filtered to this student's curriculum_year
  // Tags === 'SPECIAL' → look up (course_id, department_id) in curriculum_mapping
  const curriculumMap = buildCurriculumMap(curriculumMappingRows ?? [], userCurriculumYear)

  // ── Course lookup maps ────────────────────────────────────────────────────
  // Primary (new schema): keyed on "class_id|academic_year" and "course_id|academic_year"
  // Fallback (legacy / missing academic_year): keyed on class_id or course_id alone
  const courseByClassIdYear = new Map()
  const courseByIdYear      = new Map()
  const courseByClassId     = new Map()
  const courseMap           = new Map()

  for (const c of courses) {
    const ayKey = c.academic_year != null ? String(c.academic_year) : ''
    if (ayKey) {
      courseByClassIdYear.set(`${c.class_id}|${ayKey}`, c)
      courseByIdYear.set(`${c.course_id}|${ayKey}`, c)
    }
    // Fallback (first occurrence wins for bare ID lookups)
    if (!courseByClassId.has(c.class_id)) courseByClassId.set(c.class_id, c)
    if (!courseMap.has(c.course_id))      courseMap.set(c.course_id,  c)
  }

  // ── Canonical column order (A–O).  Never reorder existing columns. ────────
  const COLS = [
    'student_id', 'class_id', 'course_id', 'course_name',
    'credits', 'department', 'term', 'raw_category', 'sub_category', 'tags',
    'final_category', 'year', 'semester', 'status', 'academic_year',
  ]
  const lastCol = colToLetter(COLS.length - 1)   // 'O'

  // ── Route A: enrollment × course → new rows for this student ────────────────
  const enrolledCourseIds = new Set(normalizedEnrollment.map(e => e.course_id))

  const newStudentRows = normalizedEnrollment.map(e => {
    // 1. Try year-specific lookup (new schema: course_id + academic_year)
    const ayKey = e.academic_year != null ? String(e.academic_year) : ''
    const course =
      (ayKey ? courseByClassIdYear.get(`${e.class_id}|${ayKey}`)  : null) ??
      (ayKey ? courseByIdYear.get(`${e.course_id}|${ayKey}`)       : null) ??
      // 2. Fallback to bare ID lookup (legacy data without academic_year)
      courseByClassId.get(e.class_id) ??
      courseMap.get(e.course_id)      ??
      courseMap.get(deriveCourseId(e.class_id)) ??
      null

    console.log('[COURSE JOIN]', {
      student_id:    studentId,
      class_id:      e.class_id,
      academic_year: e.academic_year,
      course_found:  course !== null,
      tags:          course?.tags,
      department_id: userDepartment,
    })

    const tags          = course?.tags ?? ''
    const finalCategory = getFinalCategory(tags, userDepartment, e.course_id, curriculumMap)

    console.log('[FINAL_CATEGORY_RESULT]', { student_id: studentId, course_id: e.course_id, final_category: finalCategory })

    return [
      studentId,
      e.class_id,
      e.course_id,
      course?.course_name             ?? '',
      course ? String(course.credits) : '',
      userDepartment,
      course?.term                    ?? '',
      course?.raw_category            ?? '',
      course?.sub_category            ?? '',
      tags,
      finalCategory,
      e.year != null ? String(e.year) : '',
      e.semester                      ?? '',
      e.status,
      e.academic_year != null ? String(e.academic_year) : '',
    ]
  })

  // ── Route B: recognized_courses → course_id → category ────────────────────
  // 単位認定データ（class_id なし）を COMPLETED 行として追加する。
  // enrollment に既に存在する course_id はスキップして二重計上を防ぐ。

  const recognizedRawRows = await getRange('recognized_courses', `A:${RC_LAST_COL}`).catch(() => [])
  const recognizedObjects = rowsToObjects(recognizedRawRows)
  const studentRecognized = recognizedObjects.filter(
    r => normalizeId(r.student_id || '') === studentId && r.course_id
  )

  const recognizedProgressRows = studentRecognized
    .filter(r => {
      const cid = normalizeId(r.course_id)
      // enrollment に同一 course_id がある場合はスキップ（二重計上防止）
      return !enrolledCourseIds.has(cid)
    })
    .map(r => {
      const courseId = normalizeId(r.course_id)
      const rawAY    = r.academic_year ? parseInt(String(r.academic_year), 10) : NaN
      const ayKey    = Number.isFinite(rawAY) ? String(rawAY) : ''

      const course =
        (ayKey ? courseByIdYear.get(`${courseId}|${ayKey}`) : null) ??
        courseMap.get(courseId)                                      ??
        null

      const tags          = course?.tags ?? ''
      const finalCategory = getFinalCategory(tags, userDepartment, courseId, curriculumMap)

      console.log('[ROUTE_B recognized]', {
        student_id:     studentId,
        course_id:      courseId,
        academic_year:  ayKey,
        course_found:   course !== null,
        final_category: finalCategory,
      })

      return [
        studentId,
        '',                                                    // class_id (空 — 認定は class 不要)
        courseId,
        course?.course_name             ?? '',
        course ? String(course.credits) : '',
        userDepartment,
        course?.term                    ?? '',
        course?.raw_category            ?? '',
        course?.sub_category            ?? '',
        tags,
        finalCategory,
        '',                                                    // year (認定は学年不明)
        '',                                                    // semester
        'COMPLETED',                                           // 認定 = 常に取得済み
        ayKey,
      ]
    })

  // Route A + Route B を結合
  const newStudentAllRows = [...newStudentRows, ...recognizedProgressRows]

  // ── Step 1: Read full progress_auto to preserve other students' rows ───────
  let allRows      = []
  let headerCurrent = false
  let sheetExists   = true

  try {
    allRows = await getRange('progress_auto', `A:${lastCol}`)
  } catch (readErr) {
    // シートが存在しない場合はスキップ（書き込もうとするとエラーになるため）
    console.warn('[updateProgressAuto] cannot read progress_auto (sheet may not exist):', readErr.message)
    sheetExists = false
  }

  if (!sheetExists) return

  if (allRows.length >= 1) {
    headerCurrent = allRows[0].join('\t') === COLS.join('\t')
  }

  // Keep rows that belong to OTHER students (this student's old rows are discarded)
  let otherStudentRows = []
  if (allRows.length >= 2) {
    const existingHeader = allRows[0]
    const sidCol = existingHeader.indexOf('student_id')
    if (sidCol !== -1) {
      otherStudentRows = allRows.slice(1).filter(row => {
        const sid = normalizeId(String(row[sidCol] ?? ''))
        return sid && sid !== studentId   // keep non-empty rows from other students
      })
    }
  }

  console.log('[updateProgressAuto]', {
    student_id:          studentId,
    route_a_rows:        newStudentRows.length,
    route_b_rows:        recognizedProgressRows.length,
    other_student_rows:  otherStudentRows.length,
    old_total_body:      Math.max(0, allRows.length - 1),
  })

  // ── Step 2: Build merged body ──────────────────────────────────────────────
  // Layout: other students first, then this student's fresh rows (Route A + B).
  // Blank rows at the end overwrite any stale rows from a previously larger dataset.
  const newBody     = [...otherStudentRows, ...newStudentAllRows]
  const oldBodySize = Math.max(0, allRows.length - 1)
  const staleCount  = Math.max(0, oldBodySize - newBody.length)
  const bodyValues  = [
    ...newBody,
    ...Array.from({ length: staleCount }, () => Array(COLS.length).fill('')),
  ]

  // ── Step 3: Write ──────────────────────────────────────────────────────────
  const updates = []

  if (!headerCurrent) {
    updates.push({ range: `progress_auto!A1:${lastCol}1`, values: [COLS] })
  }
  if (bodyValues.length > 0) {
    updates.push({
      range:  `progress_auto!A2:${lastCol}${bodyValues.length + 1}`,
      values: bodyValues,
    })
  }

  if (updates.length === 0) return

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody:   { valueInputOption: 'RAW', data: updates },
  })

  // No cache invalidation — progress_auto is a write-only output table
}

// ── All-student ID lookup ─────────────────────────────────────────────────────

/**
 * Return all student_id values registered in the users sheet.
 * Used by /api/recalculate to iterate over every student.
 *
 * Returns [] when the sheet is empty, missing, or has no user_id column.
 */
export async function fetchAllStudentIds() {
  const rows = await getRange('users').catch(() => [])
  if (rows.length < 2) return []
  const [headers, ...body] = rows
  // 新スキーマ: email | student_id | department_id
  const studentIdIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'student_id')
  if (studentIdIdx === -1) return []
  return body
    .map(r => normalizeId(String(r[studentIdIdx] ?? '')))
    .filter(Boolean)
}

/**
 * Return all users rows as plain objects.
 * Schema: email | student_id | department_id | curriculum_year
 *
 * Used by graduation / additional_license recalculation to resolve
 * each student's curriculum_year for year-range rule filtering.
 */
export async function fetchUsersAll() {
  const rows = await getRange('users').catch(() => [])
  return rowsToObjects(rows)
}

// ── Additional License — Sheets I/O ──────────────────────────────────────────

/**
 * Return the raw 2-D array (header row included) for any sheet.
 * The first row is the header; subsequent rows are data.
 * Returns [] when the sheet is missing or empty.
 *
 * Used by diagnostic endpoints that need actual column names and raw cell
 * values without the object-mapping step that rowsToObjects() applies.
 *
 * @param {string} sheetName  exact sheet tab name (case-sensitive)
 * @returns {Promise<string[][]>}  2-D array of strings; row 0 = header
 */
export async function fetchRawRows(sheetName) {
  return getRange(sheetName, 'A:ZZ').catch(() => [])
}

/**
 * Read all rows from license_display sheet.
 * Columns: license_id | label
 */
export async function fetchLicenseDisplayAll() {
  const rows = await getRange('license_display').catch(() => [])
  return rowsToObjects(rows)
}

/**
 * Read all rows from additional_license_rule sheet.
 * Columns: license_id | category | required_credits | condition | note
 */
export async function fetchAdditionalLicenseRulesAll() {
  const rows = await getRange('additional_license_rule').catch(() => [])
  return rowsToObjects(rows)
}

/**
 * Read all rows from additional_license_ui sheet.
 * Columns: license_id | category | display_name | ui_group | display_order
 */
export async function fetchAdditionalLicenseUIAll() {
  const rows = await getRange('additional_license_ui').catch(() => [])
  return rowsToObjects(rows)
}

/**
 * Read all rows from additional_license_availability sheet.
 * Columns: department_id | blocked_license_id
 * Meaning: licenses that are BLOCKED (already required) for a given department.
 */
export async function fetchAdditionalLicenseAvailabilityAll() {
  const rows = await getRange('additional_license_availability').catch(() => [])
  return rowsToObjects(rows)
}

/**
 * Read additional_license_result rows for one student.
 * Columns: student_id | license_id | earned_credits | required_credits | status | updated_at
 */
export async function fetchAdditionalLicenseResults(studentId) {
  const rows = await getRange('additional_license_result', 'A:ZZ').catch(() => [])
  if (rows.length < 2) return []
  const [rawHeader, ...body] = rows
  const header = rawHeader.map(h => normalizeId(String(h)))
  const sidIdx = header.indexOf('student_id')
  if (sidIdx === -1) return []
  return body
    .filter(row => normalizeId(String(row[sidIdx] ?? '')) === studentId)
    .map(row => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])))
}

/**
 * Upsert a row in additional_license_result.
 *
 * Key: (student_id, license_id)
 * If the row already exists → update in place.
 * If missing               → append.
 * If sheet is empty        → write header first.
 *
 * @param {string} studentId
 * @param {string} licenseId
 * @param {number} earnedCredits
 * @param {number} requiredCredits
 * @param {string} status   'pass' | 'in_progress' | 'not_started'
 */
export async function upsertLicenseResult(studentId, licenseId, earnedCredits, requiredCredits, status) {
  const HEADER  = ['student_id', 'license_id', 'earned_credits', 'required_credits', 'status', 'updated_at']
  const now     = new Date().toISOString()
  const dataRow = [studentId, licenseId, earnedCredits, requiredCredits, status, now]
  const sheets  = getSheetsClient()

  const rows       = await getRange('additional_license_result', 'A:F').catch(() => [])
  const existingH  = rows[0] ?? []
  const body       = rows.slice(1)

  // ── Case A: sheet empty / no header ──────────────────────────────────────
  if (existingH.length === 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'additional_license_result!A1', values: [HEADER] },
          { range: 'additional_license_result!A2', values: [dataRow] },
        ],
      },
    })
    return
  }

  // Resolve column indices from existing header
  const hMap    = new Map(existingH.map((h, i) => [normalizeId(String(h)), i]))
  const sidCol  = hMap.get('student_id')  ?? 0
  const lidCol  = hMap.get('license_id')  ?? 1
  const lastCol = colToLetter(existingH.length - 1)

  // ── Case B: find existing row ──────────────────────────────────────────
  const rowIndex = body.findIndex(
    r => normalizeId(String(r[sidCol] ?? '')) === studentId &&
         normalizeId(String(r[lidCol] ?? '')) === normalizeId(licenseId)
  )

  if (rowIndex !== -1) {
    // Update in place — rebuild the full row from header order
    const sheetRow = rowIndex + 2
    const updated  = existingH.map((h, i) => {
      const key = normalizeId(String(h))
      if (key === 'student_id')       return studentId
      if (key === 'license_id')       return licenseId
      if (key === 'earned_credits')   return earnedCredits
      if (key === 'required_credits') return requiredCredits
      if (key === 'status')           return status
      if (key === 'updated_at')       return now
      return body[rowIndex][i] ?? ''  // preserve unknown columns
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID(),
      range:            `additional_license_result!A${sheetRow}:${lastCol}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [updated] },
    })
  } else {
    // ── Case C: append new row ─────────────────────────────────────────
    const newRow = existingH.map((h) => {
      const key = normalizeId(String(h))
      if (key === 'student_id')       return studentId
      if (key === 'license_id')       return licenseId
      if (key === 'earned_credits')   return earnedCredits
      if (key === 'required_credits') return requiredCredits
      if (key === 'status')           return status
      if (key === 'updated_at')       return now
      return ''
    })
    await appendRow('additional_license_result', newRow)
  }
}

// ── User Profiles — specialty / minor / enrollment_year ───────────────────────

const PROFILE_HEADERS = ['student_id', 'specialty', 'minor', 'enrollment_year', 'updated_at']

function colLetter(idx) {
  // 0→'A', 1→'B' ... (26列以内で十分)
  return String.fromCharCode(65 + idx)
}

function defaultProfileData() {
  return { specialty: '', minor: '', enrollment_year: null, synced_at: '' }
}

/**
 * user_profiles シートから該当学生のプロフィールを取得する。
 * シートが存在しない・行が見つからない場合は空のデフォルトを返す（例外なし）。
 */
export async function getUserProfile(studentId) {
  try {
    const rows = await getRange(
      'user_profiles',
      `A:${colLetter(PROFILE_HEADERS.length - 1)}`
    )
    if (!rows || rows.length < 2) return defaultProfileData()

    const [rawHeaders, ...rawRows] = rows
    const headers = rawHeaders.map(h => normalizeId(String(h)))
    const hIdx    = Object.fromEntries(headers.map((h, i) => [h, i]))

    const row = rawRows.find(
      r => normalizeId(String(r[hIdx.student_id] ?? '')) === normalizeId(studentId)
    )
    if (!row) return defaultProfileData()

    return {
      specialty:       row[hIdx.specialty]       ?? '',
      minor:           row[hIdx.minor]           ?? '',
      enrollment_year: row[hIdx.enrollment_year]
        ? parseInt(row[hIdx.enrollment_year], 10)
        : null,
      synced_at: row[hIdx.updated_at] ?? '',
    }
  } catch (err) {
    console.warn('[getUserProfile] failed (returning default):', err.message)
    return defaultProfileData()
  }
}

/**
 * user_profiles シートの該当学生行を更新する。
 * 行が存在しなければ新規追加、シートが空ならヘッダーも初期化する。
 *
 * @param {string} studentId
 * @param {{ specialty?: string, minor?: string, enrollment_year?: number }} updates
 */
export async function updateUserProfile(studentId, updates) {
  let rows
  try {
    rows = await getRange(
      'user_profiles',
      `A:${colLetter(PROFILE_HEADERS.length - 1)}`
    )
  } catch {
    rows = []
  }

  const now = new Date().toISOString()

  // シートが空 → ヘッダーを書き込む
  if (!rows || rows.length === 0) {
    await appendRow('user_profiles', PROFILE_HEADERS)
    rows = [PROFILE_HEADERS]
  }

  const [rawHeaders, ...rawRows] = rows
  const headers = rawHeaders.map(h => normalizeId(String(h)))
  const hIdx    = Object.fromEntries(headers.map((h, i) => [h, i]))

  const rowIdx = rawRows.findIndex(
    r => normalizeId(String(r[hIdx.student_id] ?? '')) === normalizeId(studentId)
  )

  if (rowIdx === -1) {
    // 行が存在しない → 新規追加
    const newRow = PROFILE_HEADERS.map(h => {
      if (h === 'student_id') return studentId
      if (h === 'updated_at') return now
      return updates[h] !== undefined ? String(updates[h]) : ''
    })
    await appendRow('user_profiles', newRow)
  } else {
    // 既存行を部分更新
    const excelRow = rowIdx + 2 // +1 for header, +1 for 1-indexing
    const sheets   = getSheetsClient()
    const data     = []

    for (const [key, val] of Object.entries(updates)) {
      const col = hIdx[key]
      if (col !== undefined) {
        data.push({
          range:  `user_profiles!${colLetter(col)}${excelRow}`,
          values: [[String(val)]],
        })
      }
    }
    // updated_at を常に更新
    if (hIdx.updated_at !== undefined) {
      data.push({
        range:  `user_profiles!${colLetter(hIdx.updated_at)}${excelRow}`,
        values: [[now]],
      })
    }

    if (data.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID(),
        requestBody:   { valueInputOption: 'RAW', data },
      })
    }
  }
}

/**
 * Upsert a row in additional_license_result.
 *
 * Schema (preferred): student_id | department_id | license_id | status | earned_credits | required_credits | updated_at
 * Old schema (also supported): student_id | license_id | earned_credits | required_credits | status | updated_at
 *
 * Writes all known fields; unknown columns in existing schemas are preserved.
 *
 * @param {string}      studentId
 * @param {string}      departmentId   normKey'd department (e.g. 'A_ENG')
 * @param {string}      licenseId      normalizeId'd license (e.g. 'ele')
 * @param {string}      status         'TRUE' | 'FALSE'
 * @param {number|null} earnedCredits  total earned credits across all rules (null = omit)
 * @param {number|null} requiredCredits total required credits across all rules (null = omit)
 */
export async function upsertSimpleLicenseResult(studentId, departmentId, licenseId, status, earnedCredits = null, requiredCredits = null) {
  const HEADER  = ['student_id', 'department_id', 'license_id', 'status', 'earned_credits', 'required_credits', 'updated_at']
  const sheets  = getSheetsClient()
  const rows    = await getRange('additional_license_result', 'A:ZZ').catch(() => [])
  const existH  = rows[0] ?? []
  const body    = rows.slice(1)

  const now = new Date().toISOString()

  // Helper: resolve a cell value for a given header key
  function cellVal(key) {
    if (key === 'student_id')       return studentId
    if (key === 'department_id')    return departmentId
    if (key === 'license_id')       return licenseId
    if (key === 'status')           return status
    if (key === 'earned_credits')   return earnedCredits  !== null ? earnedCredits   : ''
    if (key === 'required_credits') return requiredCredits !== null ? requiredCredits : ''
    if (key === 'updated_at')       return now
    return null  // signal "keep existing value"
  }

  // ── Case A: sheet empty → write header + first data row ───────────────────
  if (existH.length === 0) {
    const firstRow = HEADER.map(h => cellVal(normalizeId(h)) ?? '')
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'additional_license_result!A1', values: [HEADER] },
          { range: 'additional_license_result!A2', values: [firstRow] },
        ],
      },
    })
    console.log('[upsertSimpleLicenseResult] created sheet + row:', { studentId, departmentId, licenseId, status })
    return
  }

  // Resolve column indices from existing header (handles old and new schema)
  const hMap    = new Map(existH.map((h, i) => [normalizeId(String(h)), i]))
  const sidCol  = hMap.get('student_id') ?? 0
  const lidCol  = hMap.get('license_id') ?? (hMap.get('license_id') ?? 2)
  const lastCol = colToLetter(existH.length - 1)

  // ── Case B: find existing row ──────────────────────────────────────────────
  const rowIndex = body.findIndex(
    r => normalizeId(String(r[sidCol] ?? '')) === studentId &&
         normalizeId(String(r[lidCol] ?? '')) === normalizeId(licenseId)
  )

  if (rowIndex !== -1) {
    const sheetRow = rowIndex + 2
    const updated  = existH.map((h, i) => {
      const v = cellVal(normalizeId(String(h)))
      return v !== null ? v : (body[rowIndex][i] ?? '')  // null = keep existing
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID(),
      range:            `additional_license_result!A${sheetRow}:${lastCol}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [updated] },
    })
  } else {
    // ── Case C: append new row ─────────────────────────────────────────────
    const newRow = existH.map(h => {
      const v = cellVal(normalizeId(String(h)))
      return v !== null ? v : ''
    })
    await appendRow('additional_license_result', newRow)
  }

  console.log('[upsertSimpleLicenseResult] upserted:', { studentId, departmentId, licenseId, status, earnedCredits, requiredCredits })
}

/**
 * Physically delete the row for (studentId, licenseId) from additional_license_result.
 * Uses DeleteDimensionRequest so the row is truly removed (not blanked).
 * Returns true if a row was deleted, false if not found.
 */
export async function removeLicenseResult(studentId, licenseId) {
  const sheets        = getSheetsClient()
  const spreadsheetId = SPREADSHEET_ID()

  // Get numeric sheetId for DeleteDimensionRequest
  const meta    = await sheets.spreadsheets.get({ spreadsheetId })
  const sheetId = meta.data.sheets.find(s => s.properties.title === 'additional_license_result')
    ?.properties.sheetId

  if (sheetId == null) {
    console.warn('[removeLicenseResult] sheet not found: additional_license_result')
    return false
  }

  const rows = await getRange('additional_license_result', 'A:ZZ').catch(() => [])
  if (rows.length < 2) return false

  const [rawHeader, ...body] = rows
  const hMap   = new Map(rawHeader.map((h, i) => [normalizeId(String(h)), i]))
  const sidCol = hMap.get('student_id')
  const lidCol = hMap.get('license_id')
  if (sidCol == null || lidCol == null) return false

  // Find matching body row indices (0-based in body → +1 for sheet 0-based row index incl header)
  const matchIndices = []
  for (let i = 0; i < body.length; i++) {
    const sid = normalizeId(String(body[i][sidCol] ?? ''))
    const lid = normalizeId(String(body[i][lidCol] ?? ''))
    if (sid === studentId && lid === normalizeId(licenseId)) matchIndices.push(i + 1)
  }

  if (matchIndices.length === 0) return false

  // Delete bottom-to-top to avoid index shifting
  const requests = matchIndices
    .sort((a, b) => b - a)
    .map(rowIdx => ({
      deleteDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1 },
      },
    }))

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
  console.log('[removeLicenseResult] deleted row:', { studentId, licenseId })
  return true
}

// ── Graduation — Sheets I/O ───────────────────────────────────────────────────

/**
 * Return all rows from students_summary as plain objects.
 * Used by the graduation API route — bypasses the 15s cache so it always
 * reflects the latest aggregation.
 *
 * 'A:ZZ' covers 702 columns (handles any number of category columns).
 */
export async function fetchStudentsSummaryAll() {
  const rows = await getRange('students_summary', 'A:ZZ').catch(() => [])

  if (!rows || rows.length < 2) {
    console.warn('[fetchStudentsSummaryAll] students_summary is empty or missing — raw row count:', rows?.length ?? 0)
    return []
  }

  const [rawHeaders, ...bodyRows] = rows

  // Normalize header keys: NFKC + trim — eliminates full/half-width column name drift.
  // rowsToObjects() uses raw headers; we cannot use it here without this step.
  const headers = rawHeaders.map(h => normalizeId(String(h)))

  console.log('[fetchStudentsSummaryAll] normalized headers:', headers)
  console.log('[fetchStudentsSummaryAll] total body rows (including empty):', bodyRows.length)

  const studentIdIdx    = headers.indexOf('student_id')
  const departmentIdIdx = headers.indexOf('department_id')

  if (studentIdIdx === -1) {
    console.warn('[fetchStudentsSummaryAll] student_id column NOT found in header — raw headers were:', rawHeaders)
  }
  if (departmentIdIdx === -1) {
    console.warn('[fetchStudentsSummaryAll] department_id column NOT found in header — raw headers were:', rawHeaders)
  }

  const objects = bodyRows.map((row, bodyIdx) => {
    const obj = Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))

    // Always apply normalizeId to the identity keys so downstream comparisons are safe
    if (studentIdIdx    !== -1) obj.student_id    = normalizeId(String(obj.student_id    ?? ''))
    if (departmentIdIdx !== -1) obj.department_id = normalizeId(String(obj.department_id ?? ''))

    console.log('[fetchStudentsSummaryAll] row', bodyIdx + 2, '→',
      { student_id: obj.student_id, department_id: obj.department_id })

    return obj
  })

  // Report any rows where student_id resolved to empty (so the caller can trace the gap)
  const emptyIdRows = objects.filter(o => !o.student_id)
  if (emptyIdRows.length > 0) {
    console.warn('[fetchStudentsSummaryAll] rows with empty student_id after normalizeId:', emptyIdRows.length,
      '— these rows will still be returned (not filtered here)')
  }

  return objects
}

/**
 * Return all rows from GRADUATION_RULE as plain objects.
 * Rows with blank cells return '' (rowsToObjects default).
 */
export async function fetchGraduationRuleAll() {
  const rows = await getRange('GRADUATION_RULE').catch(() => [])
  return rowsToObjects(rows)
}

/**
 * Return all rows from category_formula as plain objects.
 *
 * Sheet structure:
 *   department_id | derived_category | source_categories | operation
 *
 * source_categories is pipe-delimited (e.g. "S_MAN|S_HIENG").
 * operation is currently always "SUM".
 */
export async function fetchCategoryFormulaAll() {
  const rows = await getRange('category_formula').catch(() => [])
  return rowsToObjects(rows)
}

/**
 * Return all rows from graduation_ui as plain objects.
 *
 * Sheet structure:
 *   rule_type | target | category | display_name | ui_group | display_order
 *
 * Returns [] if the sheet does not exist yet (so callers can gracefully degrade).
 */
export async function fetchGraduationUIAll() {
  const rows = await getRange('graduation_ui').catch(() => [])
  return rowsToObjects(rows)
}

/**
 * Return all rows from graduation_total_req as plain objects.
 *
 * Sheet structure:
 *   department_id | year_from | year_to | required_credits | label
 *
 * year_from / year_to are curriculum_year range (BETWEEN).
 * label is optional — defaults to '総取得単位' if blank.
 * Returns [] if the sheet does not exist.
 */
export async function fetchGraduationTotalReqAll() {
  const rows = await getRange('graduation_total_req').catch(() => [])
  return rowsToObjects(rows)
}

/**
 * Return progress_auto rows for one student as plain objects.
 * Columns: student_id | class_id | course_id | course_name | credits |
 *          department | term | raw_category | sub_category | tags |
 *          final_category | year | semester | status
 *
 * Only returns rows whose student_id matches the given normalised studentId.
 * Returns [] on any error (sheet missing, etc.).
 */
export async function fetchProgressAutoForStudent(studentId) {
  const rows = await getRange('progress_auto', 'A:ZZ').catch(() => [])
  if (!rows || rows.length < 2) return []

  const [rawHeader, ...body] = rows
  const header    = rawHeader.map(h => normalizeId(String(h)))
  const sidIdx    = header.indexOf('student_id')
  if (sidIdx === -1) return []

  return body
    .filter(row => normalizeId(String(row[sidIdx] ?? '')) === studentId)
    .map(row => Object.fromEntries(header.map((h, i) => [h, row[i] ?? ''])))
}

/**
 * Write graduation results to GRADUATION_RESULT.
 *
 * Output columns (fixed, stable):
 *   student_id | department_id | global_ok | class_ok | special_ok | result | failing_rules | updated_at
 *
 * Behaviour:
 *   • Header row (A1) is always written (idempotent)
 *   • Data rows replace existing body from A2 onwards
 *   • Stale rows beyond the new dataset are blanked (no values.clear)
 *   • global_ok / class_ok / special_ok / result are written as 'TRUE' / 'FALSE'
 *     so they are readable as booleans in downstream Sheets formulas
 *
 * @param {Array<{
 *   student_id:    string,
 *   department_id: string,
 *   global_ok:     boolean,
 *   class_ok:      boolean,
 *   special_ok:    boolean,
 *   result:        boolean,
 *   failing_rules: string,
 * }>} results
 */
export async function writeGraduationResult(results) {
  // 空 student_id の行を書き込まない（graduation.js 側でも除外済みだが二重防御）
  const safeResults = results.filter(r => r.student_id && r.student_id.trim() !== '')
  if (safeResults.length !== results.length) {
    console.warn('[writeGraduationResult] filtered out empty student_id rows:',
      results.length - safeResults.length)
  }
  results = safeResults

  if (results.length === 0) {
    console.warn('[writeGraduationResult] no results to write — computeGraduationResults returned []')
    return
  }

  const HEADER = [
    'student_id', 'department_id',
    'global_status', 'class_status', 'special_status', 'result',
    'failing_rules', 'updated_at',
  ]
  const lastCol = colToLetter(HEADER.length - 1)
  const now     = new Date().toISOString()

  // Build data rows and validate length consistency before any Sheets call
  const dataRows = results.map((r, i) => {
    // Coerce every boolean field — undefined / null → false, never written as-is
    const global_status  = r.global_status  === true
    const class_status   = r.class_status   === true
    const special_status = r.special_status === true
    const result         = r.result         === true

    // Pre-write trace required by spec
    console.log('[GRAD_ROW]', [
      r.student_id    ?? '',
      r.department_id ?? '',
      global_status,
      class_status,
      special_status,
      result,
    ])

    const row = [
      r.student_id    ?? '',
      r.department_id ?? '',
      global_status  ? 'TRUE' : 'FALSE',
      class_status   ? 'TRUE' : 'FALSE',
      special_status ? 'TRUE' : 'FALSE',
      result         ? 'TRUE' : 'FALSE',
      r.failing_rules ?? '',
      now,
    ]

    // Legacy trace kept for cross-reference
    console.log('[GRAD_RESULT_ROW]', row)

    // Hard guard: header/row length mismatch would corrupt the sheet
    if (row.length !== HEADER.length) {
      throw new Error(
        `[writeGraduationResult] row ${i + 2} length ${row.length} !== header length ${HEADER.length}. ` +
        `row=${JSON.stringify(row)}`
      )
    }

    return row
  })

  console.log('[writeGraduationResult] pre-write summary:', {
    header:   HEADER,
    students: dataRows.length,
    firstRow: dataRows[0] ?? null,
  })

  // Read existing body row count for stale-row blanking
  // GRADUATION_RESULT タブが存在しない場合は .catch で [] が返る。
  // その場合も同じ updates を使うが、batchUpdate が失敗する可能性があるため try/catch で保護。
  const existingColA = await getRange('GRADUATION_RESULT', 'A:A').catch(() => [])
  const existingBody = Math.max(0, existingColA.length - 1)
  const staleCount   = Math.max(0, existingBody - dataRows.length)

  const updates = [
    { range: `GRADUATION_RESULT!A1:${lastCol}1`,                       values: [HEADER]  },
    { range: `GRADUATION_RESULT!A2:${lastCol}${dataRows.length + 1}`,  values: dataRows  },
    ...(staleCount > 0
      ? [{
          range:  `GRADUATION_RESULT!A${dataRows.length + 2}:${lastCol}${dataRows.length + 1 + staleCount}`,
          values: Array.from({ length: staleCount }, () => Array(HEADER.length).fill('')),
        }]
      : []),
  ]

  const sheets = getSheetsClient()
  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody:   { valueInputOption: 'RAW', data: updates },
    })
  } catch (writeErr) {
    // GRADUATION_RESULT シートタブが存在しない場合などに発生。
    // スタック全体を投げると再計算全体が失敗するため、警告に留める。
    console.error('[writeGraduationResult] batchUpdate failed (sheet tab may not exist):', writeErr.message)
    return
  }

  invalidateCache()
  console.log('[writeGraduationResult] done:', {
    students: results.length,
    passed:   results.filter(r => r.result).length,
    failed:   results.filter(r => !r.result).length,
  })
}

// ── Graduation result initialisation ─────────────────────────────────────────

/**
 * Build an initial GRADUATION_RESULT row following the given header row.
 * Boolean columns default to 'FALSE'; timestamps default to now.
 *
 * @param {string}   studentId
 * @param {string}   departmentId  (already normalised)
 * @param {string[]} headerRow     raw header cells (normalizeId applied inside)
 * @returns {string[]}
 */
function buildInitialGraduationRow(studentId, departmentId, headerRow) {
  const now = new Date().toISOString()
  return headerRow.map(h => {
    const col = normalizeId(String(h))
    switch (col) {
      case 'student_id':     return studentId
      case 'department_id':  return departmentId
      case 'global_status':  return 'FALSE'
      case 'class_status':   return 'FALSE'
      case 'special_status': return 'FALSE'
      case 'result':         return 'FALSE'
      case 'failing_rules':  return ''
      case 'updated_at':     return now
      default:               return ''
    }
  })
}

/**
 * Create or initialise the current student's row in GRADUATION_RESULT.
 *
 * Three cases:
 *   A. Sheet is empty          → write fixed header + initial data row
 *   B. Student row exists      → no-op (or sync department_id if mismatched)
 *   C. Student row is missing  → append row following existing header columns
 *
 * Never throws — errors are logged and swallowed so the users API is not blocked.
 *
 * @param {string} departmentId
 */
export async function createOrInitGraduationResult(departmentId, studentId = STUDENT_ID()) {
  const normalizedDept = normalizeId(departmentId)

  if (!normalizedDept) {
    console.warn('[createOrInitGraduationResult] empty department_id — skipping')
    return
  }

  const FIXED_HEADER = [
    'student_id', 'department_id',
    'global_status', 'class_status', 'special_status', 'result',
    'failing_rules', 'updated_at',
  ]

  const rows = await getRange('GRADUATION_RESULT', 'A:ZZ').catch(() => [])

  // ── Case A: sheet empty ────────────────────────────────────────────────────
  if (rows.length === 0) {
    const dataRow = buildInitialGraduationRow(studentId, normalizedDept, FIXED_HEADER)
    const lastCol = colToLetter(FIXED_HEADER.length - 1)
    const sheets  = getSheetsClient()
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `GRADUATION_RESULT!A1:${lastCol}1`, values: [FIXED_HEADER] },
          { range: `GRADUATION_RESULT!A2:${lastCol}2`, values: [dataRow]      },
        ],
      },
    })
    invalidateCache(studentId)
    console.log('[createOrInitGraduationResult] created sheet + initial row:', { studentId, departmentId: normalizedDept })
    return
  }

  // ── Parse header ───────────────────────────────────────────────────────────
  const [headerRow, ...bodyRows] = rows
  const headerMap    = new Map(headerRow.map((h, i) => [normalizeId(String(h)), i]))
  const studentIdIdx = headerMap.get('student_id')
  const deptIdIdx    = headerMap.get('department_id')

  if (studentIdIdx == null || deptIdIdx == null) {
    console.warn('[createOrInitGraduationResult] GRADUATION_RESULT header missing student_id or department_id — skipping')
    return
  }

  // ── Case B: student row already exists ────────────────────────────────────
  const existingIdx = bodyRows.findIndex(
    r => normalizeId(String(r[studentIdIdx] ?? '')) === studentId
  )

  if (existingIdx !== -1) {
    const existingDept = normalizeId(String(bodyRows[existingIdx][deptIdIdx] ?? ''))
    if (existingDept !== normalizedDept) {
      // Sync department_id — users sheet is source of truth
      console.warn('[createOrInitGraduationResult] department_id mismatch — syncing:', {
        studentId,
        existing: existingDept,
        new:      normalizedDept,
      })
      const sheetRow = existingIdx + 2  // 1-indexed, +1 for header row
      const deptCol  = colToLetter(deptIdIdx)
      const sheets   = getSheetsClient()
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID(),
        requestBody: {
          valueInputOption: 'RAW',
          data: [{ range: `GRADUATION_RESULT!${deptCol}${sheetRow}`, values: [[normalizedDept]] }],
        },
      })
      invalidateCache(studentId)
    } else {
      console.log('[createOrInitGraduationResult] row already exists — no-op:', { studentId, departmentId: normalizedDept })
    }
    return
  }

  // ── Case C: student not found — append row following existing header ───────
  const newRow = buildInitialGraduationRow(studentId, normalizedDept, headerRow)
  await appendRow('GRADUATION_RESULT', newRow)
  invalidateCache(studentId)
  console.log('[createOrInitGraduationResult] appended initial row:', {
    studentId,
    departmentId: normalizedDept,
    columns: headerRow.length,
  })
}

// ── Student data deletion ─────────────────────────────────────────────────────

/**
 * Physically remove all rows matching targetId in one sheet.
 *
 * Uses spreadsheets.batchUpdate (DeleteDimensionRequest) so rows are truly
 * removed — not blanked.  Deletions are issued bottom-to-top in a single
 * request to avoid row-index shifting.
 *
 * @param {object} sheets          google-sheets client
 * @param {string} spreadsheetId
 * @param {number} sheetId         numeric sheet id (from spreadsheets.get)
 * @param {string} sheetName       human-readable name used for getRange
 * @param {string} targetId        already-normalised student_id to match
 * @returns {Promise<number>}      number of rows deleted
 */
async function deleteRowsByStudentId(sheets, spreadsheetId, sheetId, sheetName, targetId) {
  console.log('[SHEET]', sheetName)
  console.log('[TARGET ID]', targetId)

  const rows = await getRange(sheetName, 'A:ZZ').catch((err) => {
    console.error(`[deleteRowsByStudentId] getRange failed for "${sheetName}":`, err)
    return []
  })

  if (rows.length === 0) {
    console.log(`[deleteRowsByStudentId] ${sheetName}: no rows returned (empty sheet or getRange error)`)
    return 0
  }

  console.log(`[deleteRowsByStudentId] ${sheetName}: total rows read (incl header) = ${rows.length}`)

  const [headerRow, ...bodyRows] = rows
  const headerMap = new Map(headerRow.map((h, i) => [normalizeId(String(h)), i]))
  const sidIdx    = headerMap.get('student_id')

  console.log(`[deleteRowsByStudentId] ${sheetName}: header =`, headerRow)
  console.log(`[deleteRowsByStudentId] ${sheetName}: student_id column index =`, sidIdx ?? '(NOT FOUND)')

  if (sidIdx == null) {
    console.warn(`[deleteStudentAllData] ${sheetName}: no student_id column — skipping`)
    return 0
  }

  // Log every row's raw and normalised student_id for comparison
  const allRowIds = bodyRows.map((row, i) => {
    const raw        = String(row[sidIdx] ?? '')
    const normalized = normalizeId(raw)
    console.log('[COMPARE]', { sheet: sheetName, bodyRowIndex: i, raw, normalized })
    return normalized
  })

  console.log('[ROW IDS]', allRowIds)

  // Collect 0-based body indices where student_id matches (after normalisation)
  const matchBodyIndices = []
  for (let i = 0; i < bodyRows.length; i++) {
    if (allRowIds[i] === targetId) matchBodyIndices.push(i)
  }

  console.log('[MATCHED ROWS]', { sheet: sheetName, matchBodyIndices, count: matchBodyIndices.length })

  if (matchBodyIndices.length === 0) {
    console.log(`[deleteRowsByStudentId] ${sheetName}: no matching rows — nothing to delete`)
    return 0
  }

  // Convert to sheet row indices (0-based): header occupies index 0, body starts at 1
  // Sort descending so each deletion doesn't shift subsequent indices
  const sheetRowIndices = matchBodyIndices
    .map(i => i + 1)
    .sort((a, b) => b - a)

  console.log(`[deleteRowsByStudentId] ${sheetName}: sheetRowIndices (0-based, desc) =`, sheetRowIndices)

  const requests = sheetRowIndices.map(rowIndex => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS',
        startIndex: rowIndex,
        endIndex:   rowIndex + 1,
      },
    },
  }))

  console.log(`[deleteRowsByStudentId] ${sheetName}: sending ${requests.length} DeleteDimensionRequest(s) to Sheets API`)

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  })

  console.log('[DELETED ROWS]', { sheet: sheetName, deletedCount: matchBodyIndices.length })
  return matchBodyIndices.length
}

/**
 * Delete all rows for a given student_id across every data sheet.
 *
 * Each sheet is attempted independently — a failure in one sheet is logged
 * but does not abort the others.  The returned object always contains a
 * count for every target sheet (0 on skip or error).
 *
 * Target sheets (internal name → response key):
 *   users             → users
 *   enrollment        → enrollment
 *   students_summary  → summary
 *   progress_auto     → progress
 *   GRADUATION_RESULT → graduation
 *
 * @param {string} studentId  raw (un-normalised) student_id from caller
 * @returns {Promise<{ users, enrollment, summary, progress, graduation }>}
 */
export async function deleteStudentAllData(studentId) {
  const normalizedId = normalizeId(String(studentId ?? ''))
  if (!normalizedId) throw new Error('student_id is required and must not be empty')

  const sheetsClient  = getSheetsClient()
  const spreadsheetId = SPREADSHEET_ID()

  console.log('[SPREADSHEET ID]', spreadsheetId)
  console.log('[deleteStudentAllData] raw input:', studentId, '→ normalizedId:', normalizedId)

  // Fetch sheet metadata once to resolve numeric sheetId for each sheet name
  const meta      = await sheetsClient.spreadsheets.get({ spreadsheetId })
  const sheetIdOf = new Map(
    meta.data.sheets.map(s => [s.properties.title, s.properties.sheetId])
  )

  // ① SHEET ID MAP — confirm every target sheet resolves to a numeric id
  console.log('[SHEET ID MAP]', Object.fromEntries(sheetIdOf))

  const targets = [
    { name: 'users',             key: 'users'       },
    { name: 'enrollment',        key: 'enrollment'  },
    { name: 'students_summary',  key: 'summary'     },
    { name: 'progress_auto',     key: 'progress'    },
    { name: 'GRADUATION_RESULT', key: 'graduation'  },
  ]

  const deleted      = {}
  const sheetsHit    = []
  let   totalMatched = 0
  let   totalDeleted = 0

  for (const { name, key } of targets) {
    const sheetId = sheetIdOf.get(name)
    if (sheetId == null) {
      console.warn(`[deleteStudentAllData] sheet not found in spreadsheet: "${name}"`)
      deleted[key] = 0
      continue
    }

    console.log(`[deleteStudentAllData] processing sheet "${name}" (sheetId=${sheetId})`)

    try {
      const count = await deleteRowsByStudentId(
        sheetsClient, spreadsheetId, sheetId, name, normalizedId
      )
      deleted[key] = count
      if (count > 0) {
        sheetsHit.push(name)
        totalDeleted += count
      }
      totalMatched += count
    } catch (err) {
      console.error(`[deleteStudentAllData] error in sheet "${name}":`, err)
      deleted[key] = 0
    }
  }

  invalidateCache(normalizedId)

  const total = Object.values(deleted).reduce((s, n) => s + n, 0)
  console.log('[deleteStudentAllData] complete:', { studentId: normalizedId, deleted, total })

  // Surface debug summary for the API response
  return {
    _counts:  deleted,
    _debug: {
      hit:            true,
      normalizedId,
      matchedRows:    totalMatched,
      deletedRows:    totalDeleted,
      sheetsAffected: sheetsHit,
    },
  }
}

// ── Graduation pipeline helper ────────────────────────────────────────────────

/**
 * Full graduation recalculation pipeline (pure sequential):
 *   1. fetchStudentsSummaryAll   — read latest students_summary
 *   2. fetchGraduationRuleAll    — read rules
 *   3. fetchCategoryFormulaAll   — read derived-category formulas
 *   4. computeGraduationResults  — evaluate rules (pure, in-memory)
 *   5. writeGraduationResult     — persist to GRADUATION_RESULT sheet
 *
 * Intended for use as the final step of any enrollment mutation pipeline.
 * Safe to call fire-and-forget (wraps its own try/catch for logging).
 *
 * @returns {{ total, passed, failed } | null}  null when skipped
 */
export async function recalculateGraduation() {
  try {
    const [studentRows, ruleRows, categoryFormulaRows, userRows] = await Promise.all([
      fetchStudentsSummaryAll(),
      fetchGraduationRuleAll(),
      fetchCategoryFormulaAll(),
      fetchUsersAll(),
    ])

    if (studentRows.length === 0 || ruleRows.length === 0) {
      console.warn('[recalculateGraduation] skipping — students_summary or rules empty:', {
        students: studentRows.length,
        rules:    ruleRows.length,
      })
      return null
    }

    // Build curriculum_year map for per-student year-range rule filtering
    const curriculumYearMap = new Map()
    for (const row of userRows) {
      const sid = normalizeId(String(row.student_id || ''))
      if (!sid) continue
      const cyRaw = String(row.curriculum_year || '').trim()
      if (!cyRaw) continue
      const cy = parseInt(cyRaw, 10)
      if (Number.isFinite(cy)) curriculumYearMap.set(sid, cy)
    }

    const results = computeGraduationResults(studentRows, ruleRows, categoryFormulaRows, curriculumYearMap)
    await writeGraduationResult(results)

    const summary = {
      total:  results.length,
      passed: results.filter(r => r.result === true).length,
      failed: results.filter(r => r.result !== true).length,
    }
    console.log('[recalculateGraduation] done:', summary)
    return summary
  } catch (err) {
    console.error('[recalculateGraduation] error:', err)
    throw err
  }
}

// ── Enrollment ID backfill ────────────────────────────────────────────────────

/**
 * enrollment シートの id 列が空白の行に UUID を一括発行する。
 * 実装前に登録済みの既存行の救済用。
 * Returns the number of rows updated.
 */
export async function backfillEnrollmentIds(studentId = STUDENT_ID()) {
  const { _enrollmentRows } = await fetchAllSheets(studentId)
  if (!_enrollmentRows || _enrollmentRows.length < 2) return 0

  const [rawHeaders, ...rows] = _enrollmentRows
  const headers = rawHeaders.map(h => normalizeId(String(h)))

  const studentIdCol = headers.indexOf('student_id')
  const classIdCol   = headers.indexOf('class_id')
  const idCol        = headers.indexOf('id')

  if (idCol === -1) return 0  // id 列が存在しない場合はスキップ
  if (studentIdCol === -1) return 0

  const normSid  = normalizeId(String(studentId))
  const lastCol  = colToLetter(headers.length - 1)
  const batchData = []

  rows.forEach((row, i) => {
    // この学生の行のみ対象
    if (normalizeId(String(row[studentIdCol] ?? '')) !== normSid) return
    // class_id が空 = 空白行はスキップ
    if (!String(row[classIdCol] ?? '').trim()) return
    // id がすでに入っている行はスキップ
    if (String(row[idCol] ?? '').trim()) return

    const updatedRow = [...row]
    while (updatedRow.length < headers.length) updatedRow.push('')
    updatedRow[idCol] = crypto.randomUUID()

    batchData.push({
      range:  `enrollment!A${i + 2}:${lastCol}${i + 2}`,
      values: [updatedRow],
    })
  })

  if (batchData.length === 0) return 0

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody:   { valueInputOption: 'RAW', data: batchData },
  })

  invalidateCache(studentId)
  return batchData.length
}

// ── Attendance CRUD ───────────────────────────────────────────────────────────

const ATTENDANCE_SHEET = 'attendance_records'
const ATTENDANCE_SCHEMA = ['id', 'enrollment_id', 'session_number', 'status', 'memo', 'updated_at']

/**
 * Fetch all attendance_records for a given enrollment_id.
 * Returns array of { id, enrollment_id, session_number, status, memo, updated_at }
 */
export async function getAttendanceRecords(enrollmentId) {
  if (!enrollmentId) return []
  const rows = await getRange(ATTENDANCE_SHEET).catch(() => [])
  if (!rows || rows.length < 2) return []

  const [headers, ...body] = rows
  const eidCol = headers.indexOf('enrollment_id')
  if (eidCol === -1) return []

  const normEid = normalizeId(enrollmentId)
  return body
    .filter(r => normalizeId(r[eidCol] ?? '') === normEid && r.some(c => String(c).trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
}

/**
 * Upsert a single attendance record.
 * If status is null or '' → delete the record (cycle back to unrecorded).
 * Matches on (enrollment_id + session_number).
 */
export async function upsertAttendanceRecord({ enrollmentId, sessionNumber, status, memo = '' }) {
  if (!enrollmentId) throw new Error('enrollmentId is required')

  const rows = await getRange(ATTENDANCE_SHEET).catch(() => [])

  let headers, body
  if (!rows || rows.length === 0 || !rows[0]?.length) {
    const sheets = getSheetsClient()
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID(),
      range: `${ATTENDANCE_SHEET}!A1:${colToLetter(ATTENDANCE_SCHEMA.length - 1)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [ATTENDANCE_SCHEMA] },
    })
    headers = ATTENDANCE_SCHEMA
    body    = []
  } else {
    const [rawHeaders, ...rawBody] = rows
    headers = rawHeaders.map(h => normalizeId(String(h)))
    body    = rawBody
  }

  const C = {
    id:            headers.indexOf('id'),
    enrollment_id: headers.indexOf('enrollment_id'),
    session_number: headers.indexOf('session_number'),
    status:        headers.indexOf('status'),
    memo:          headers.indexOf('memo'),
    updated_at:    headers.indexOf('updated_at'),
  }

  if (C.enrollment_id === -1 || C.session_number === -1) {
    throw new Error(`attendance_records sheet missing required columns. Found: ${headers.join(', ')}`)
  }

  const normEid = normalizeId(enrollmentId)
  const sessStr = String(sessionNumber)
  const rowIdx  = body.findIndex(
    r => normalizeId(r[C.enrollment_id] ?? '') === normEid &&
         String(r[C.session_number] ?? '').trim() === sessStr &&
         r.some(c => String(c).trim())
  )

  const now = new Date().toISOString()
  const statusValue = status || ''  // null → '' に統一

  // Delete: ステータスもメモも両方空の場合のみ削除
  if (!statusValue && !memo) {
    if (rowIdx === -1) return  // already gone
    const sheetRow = rowIdx + 2
    const emptyRow = headers.map(() => '')
    const sheets   = getSheetsClient()
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID(),
      range: `${ATTENDANCE_SHEET}!A${sheetRow}:${colToLetter(headers.length - 1)}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [emptyRow] },
    })
    return
  }

  if (rowIdx !== -1) {
    // Update existing
    const sheetRow   = rowIdx + 2
    const updatedRow = [...body[rowIdx]]
    while (updatedRow.length < headers.length) updatedRow.push('')
    if (C.status     !== -1) updatedRow[C.status]     = statusValue
    if (C.memo       !== -1) updatedRow[C.memo]        = memo ?? ''
    if (C.updated_at !== -1) updatedRow[C.updated_at]  = now
    const sheets = getSheetsClient()
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID(),
      range: `${ATTENDANCE_SHEET}!A${sheetRow}:${colToLetter(updatedRow.length - 1)}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedRow] },
    })
  } else {
    // Append new
    const newRow = headers.map((_, i) => {
      if (i === C.id)             return crypto.randomUUID()
      if (i === C.enrollment_id)  return normEid
      if (i === C.session_number) return sessStr
      if (i === C.status)         return statusValue
      if (i === C.memo)           return memo ?? ''
      if (i === C.updated_at)     return now
      return ''
    })
    await appendRow(ATTENDANCE_SHEET, newRow)
  }
}

/**
 * Delete all attendance_records for a given enrollment_id.
 * Called when an enrollment is removed (cascade delete).
 */
export async function deleteAttendanceRecordsByEnrollmentId(enrollmentId) {
  if (!enrollmentId) return
  const rows = await getRange(ATTENDANCE_SHEET).catch(() => [])
  if (!rows || rows.length < 2) return

  const [headers, ...body] = rows
  const eidCol = headers.indexOf('enrollment_id')
  if (eidCol === -1) return

  const normEid  = normalizeId(enrollmentId)
  const lastCol  = colToLetter(headers.length - 1)
  const emptyRow = headers.map(() => '')

  const batchData = body
    .map((r, i) => ({ r, i }))
    .filter(({ r }) =>
      normalizeId(r[eidCol] ?? '') === normEid && r.some(c => String(c).trim())
    )
    .map(({ i }) => ({
      range:  `${ATTENDANCE_SHEET}!A${i + 2}:${lastCol}${i + 2}`,
      values: [emptyRow],
    }))

  if (batchData.length === 0) return

  const sheets = getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody:   { valueInputOption: 'RAW', data: batchData },
  })
}

// ── support_tickets ───────────────────────────────────────────────────────────

const SUPPORT_SHEET = 'support_tickets'
// シート列順と一致させること（P列=classroom, Q列=class_number）
const SUPPORT_COLS  = [
  'id', 'created_at', 'user_id', 'inquiry_category', 'title', 'message',
  'status', 'admin_reply', 'updated_at', 'notification_sent',
  'course_name', 'term', 'day_period', 'teacher_name', 'academic_year',
  'classroom',    // P列
  'class_number', // Q列
]

/**
 * 新しい問い合わせを support_tickets シートに追記する。
 * notification_sent は false で初期化。
 * course_request カテゴリの場合は授業情報フィールドも保存する。
 */
export async function appendSupportTicket({
  id, user_id, inquiry_category, title, message,
  course_name = '', term = '', day_period = '', teacher_name = '',
  academic_year = '', classroom = '', class_number = '',
}) {
  const now = new Date().toISOString()
  const row = SUPPORT_COLS.map(col => {
    switch (col) {
      case 'id':                return id
      case 'created_at':        return now
      case 'user_id':           return user_id
      case 'inquiry_category':  return inquiry_category
      case 'title':             return title
      case 'message':           return message
      case 'status':            return 'open'
      case 'admin_reply':       return ''
      case 'updated_at':        return now
      case 'notification_sent': return 'false'
      case 'course_name':       return course_name
      case 'term':              return term
      case 'day_period':        return day_period
      case 'teacher_name':      return teacher_name
      case 'academic_year':     return String(academic_year)
      case 'classroom':         return classroom
      case 'class_number':      return class_number
      default:                  return ''
    }
  })
  await appendRow(SUPPORT_SHEET, row)
}

/**
 * 指定ユーザーの問い合わせ一覧を新しい順で返す。
 * シートが存在しない場合は空配列を返す。
 * notification_sent 列を含むため A:K まで読む。
 */
export async function getSupportTickets(userId) {
  const rows = await getRange(SUPPORT_SHEET, 'A:Q').catch(() => [])
  if (!rows || rows.length < 2) return []
  const [headers, ...body] = rows
  return body
    .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])))
    .filter(t => t.user_id === userId)
    .reverse() // 新しい順
}

/**
 * support_tickets の notification_sent 列を 'true' に更新する。
 * notification_sent 列がシートに存在しない場合はスキップ。
 */
async function markSupportNotificationSent(ticketId) {
  const rows = await getRange(SUPPORT_SHEET, 'A:K').catch(() => [])
  if (!rows || rows.length < 2) return
  const [headers, ...body] = rows
  const idCol      = headers.indexOf('id')
  const notifCol   = headers.indexOf('notification_sent')
  if (idCol === -1 || notifCol === -1) return

  const rowIndex = body.findIndex(row => (row[idCol] ?? '') === ticketId)
  if (rowIndex === -1) return

  const sheetRow  = rowIndex + 2  // 1-indexed + header row
  const colLetter = colToLetter(notifCol)
  await updateCell(SUPPORT_SHEET, `${colLetter}${sheetRow}`, 'true')
}

/**
 * 指定ユーザーの support_tickets を検査し、
 *   status === 'resolved' かつ admin_reply あり かつ notification_sent !== 'true'
 * のものに対して通知を生成し、notification_sent を 'true' に更新する。
 *
 * /api/notifications/list から呼ばれ、ユーザーが一覧を開くたびにチェックされる。
 * 重複生成は notification_sent フラグで防止。
 *
 * @returns {number} 今回新たに生成した通知数
 */
export async function checkAndCreateSupportNotifications(userId) {
  const rows = await getRange(SUPPORT_SHEET, 'A:K').catch(() => [])
  if (!rows || rows.length < 2) return 0

  const [headers, ...body] = rows
  const tickets = body
    .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])))
    .filter(t => t.user_id === userId)

  let created = 0
  for (const ticket of tickets) {
    const isResolved  = ticket.status === 'resolved'
    const hasReply    = (ticket.admin_reply ?? '').trim().length > 0
    // Sheets からは文字列 'true'/'false' で返る
    const alreadySent = ticket.notification_sent === 'true'

    if (!isResolved || !hasReply || alreadySent) continue

    // 通知生成（逐次処理で重複を確実に防ぐ）
    const notifId = crypto.randomUUID()
    await createNotification({
      id:      notifId,
      user_id: userId,
      title:   'お問い合わせに対応しました',
      message: ticket.admin_reply.trim(),
      link:    '/support',
      type:    'support',
    })

    // 送信済みフラグを立てる（二重生成防止）
    await markSupportNotificationSent(ticket.id)
    created++
  }

  return created
}

// ── notifications ─────────────────────────────────────────────────────────────

const NOTIF_SHEET = 'notifications'
const NOTIF_COLS  = ['id', 'created_at', 'user_id', 'title', 'message', 'link', 'is_read', 'type']

/**
 * 新しい通知を notifications シートに追記する。
 * link, type は省略可。
 */
export async function createNotification({ id, user_id, title, message, link = '', type = 'system' }) {
  const now = new Date().toISOString()
  const row = NOTIF_COLS.map(col => {
    switch (col) {
      case 'id':         return id
      case 'created_at': return now
      case 'user_id':    return user_id
      case 'title':      return title
      case 'message':    return message
      case 'link':       return link
      case 'is_read':    return 'false'
      case 'type':       return type
      default:           return ''
    }
  })
  await appendRow(NOTIF_SHEET, row)
}

/**
 * 指定ユーザーの通知を新しい順で返す。
 * シートが存在しない場合は空配列。
 */
export async function getNotificationsByUserId(userId) {
  const rows = await getRange(NOTIF_SHEET, 'A:H').catch(() => [])
  if (!rows || rows.length < 2) return []
  const [headers, ...body] = rows
  return body
    .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])))
    .filter(n => n.user_id === userId)
    .map(n => ({ ...n, is_read: n.is_read === 'true' }))
    .reverse()
}

/**
 * 指定の通知を既読にする（is_read = true）。
 */
export async function markNotificationAsRead(notifId) {
  const rows = await getRange(NOTIF_SHEET, 'A:H').catch(() => [])
  if (!rows || rows.length < 2) return
  const [headers, ...body] = rows
  const idCol     = headers.indexOf('id')
  const isReadCol = headers.indexOf('is_read')
  if (idCol === -1 || isReadCol === -1) return

  const rowIndex = body.findIndex(row => (row[idCol] ?? '') === notifId)
  if (rowIndex === -1) return

  const sheetRow = rowIndex + 2  // 1-indexed + header row
  const colLetter = colToLetter(isReadCol)
  await updateCell(NOTIF_SHEET, `${colLetter}${sheetRow}`, 'true')
}

/**
 * support_tickets が resolved になった際に通知を作成するユーティリティ。
 * 管理側から手動で呼ぶことを想定。
 *
 * @param {{ userId: string, ticketTitle: string, adminReply: string }} opts
 */
export async function createSupportResolvedNotification({ userId, ticketTitle, adminReply }) {
  const id = crypto.randomUUID()
  await createNotification({
    id,
    user_id: userId,
    title:   `お問い合わせへの返信`,
    message: adminReply || `「${ticketTitle}」のお問い合わせに返信しました。`,
    link:    '/support',
    type:    'support',
  })
  return id
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function colToLetter(index) {
  let s = ''
  let n = index
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
