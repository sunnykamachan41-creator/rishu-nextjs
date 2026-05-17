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

// Always normalize so full-width env var values don't cause matching failures
const STUDENT_ID = () => normalizeId(process.env.STUDENT_ID || 'student_001')

// ── Low-level helpers ─────────────────────────────────────────────────────────

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return []
  const [headers, ...body] = rows
  return body.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  )
}

async function getRange(sheetName, range = 'A:Z') {
  const sheets = getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID(),
    range: `${sheetName}!${range}`,
  })
  return res.data.values ?? []
}

async function updateCell(sheetName, cellA1, value) {
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
 *   requirements      - raw requirement rows
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
    getRange('requirements'),
    getRange('enrollment'),
  ]

  // Attempt to fetch optional sheets — missing sheets return [] via .catch
  const fetchStudentsSummary   = getRange('students_summary',  'A:ZZ').catch(() => [])
  const fetchCurriculumMapping = getRange('curriculum_mapping').catch(() => [])
  const fetchDepartments       = getRange('departments').catch(() => [])
  const fetchUsers             = getRange('users').catch(() => [])
  fetches.push(fetchStudentsSummary, fetchCurriculumMapping, fetchDepartments, fetchUsers)

  const [courseRows, reqRows, enrollRows, summaryRows, curriculumRows, departmentRows, userRows] =
    await Promise.all(fetches)

  // Detect enrollment format from headers
  const enrollHeaders = enrollRows[0] ?? []
  const enrollmentVersion = detectEnrollmentVersion(enrollHeaders)

  // Normalise enrollment
  const enrollObjects = rowsToObjects(enrollRows)
  const normalizedEnrollmentData = normalizeEnrollment(enrollObjects, enrollmentVersion, studentId)

  // Normalise students_summary (find this student's row)
  let studentsSummary = null
  if (summaryRows.length >= 2) {
    const summaryObjects = rowsToObjects(summaryRows)
    const myRow = summaryObjects.find(r => normalizeId(r.student_id) === studentId) ?? summaryObjects[0] ?? null
    if (myRow) studentsSummary = normalizeStudentsSummary(myRow)
  }

  // Read user's department_id from users sheet (source of truth for department selection)
  let userDepartment = ''
  if (userRows.length >= 2) {
    const userObjects = rowsToObjects(userRows)
    const myRow = userObjects.find(r => normalizeId(r.user_id) === studentId)
    if (myRow) userDepartment = normalizeId(myRow.department_id)
  }

  entry.data = {
    courses:              rowsToObjects(courseRows),
    requirements:         rowsToObjects(reqRows),
    enrollment:           rowsToObjects(enrollRows),   // raw objects (for legacy toggle)
    enrollmentVersion,
    normalizedEnrollment: normalizedEnrollmentData,
    studentsSummary,
    curriculumMappingRows: rowsToObjects(curriculumRows), // curriculum_mapping for final_category
    departmentRows:        rowsToObjects(departmentRows), // departments master (department_id, label)
    userDepartment,                                       // current user's department_id from users sheet
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
export async function upsertEnrollment({ classId, courseId, year, semester, status, studentId = STUDENT_ID() }) {
  const { _enrollmentRows } = await fetchAllSheets(studentId)

  const [headers, ...rows] = _enrollmentRows

  const studentIdCol = headers.indexOf('student_id')
  const classIdCol   = headers.indexOf('class_id')
  const courseIdCol  = headers.indexOf('course_id')
  const statusCol    = headers.indexOf('status')
  const yearCol      = headers.indexOf('year')
  const semesterCol  = headers.indexOf('semester')

  if (studentIdCol === -1 || classIdCol === -1 || statusCol === -1) {
    throw new Error('enrollment sheet is missing required columns: student_id, class_id, status')
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
    if (yearCol     !== -1 && year != null)      updatedRow[yearCol]     = String(year)
    if (semesterCol !== -1 && semester)          updatedRow[semesterCol] = semester
    if (courseIdCol !== -1 && resolvedCourseId)  updatedRow[courseIdCol] = resolvedCourseId

    const sheets = getSheetsClient()
    await sheets.spreadsheets.values.update({
      spreadsheetId:   SPREADSHEET_ID(),
      range:           `enrollment!A${sheetRow}:${colToLetter(updatedRow.length - 1)}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:     { values: [updatedRow] },
    })
  } else {
    // Append new row — build values array matching header order
    const newRow = headers.map((h, i) => {
      if (i === studentIdCol)                      return studentId
      if (i === classIdCol)                        return normalizedClassId
      if (courseIdCol !== -1 && i === courseIdCol) return resolvedCourseId
      if (i === statusCol)                         return status
      if (yearCol     !== -1 && i === yearCol)     return year != null ? String(year) : ''
      if (semesterCol !== -1 && i === semesterCol) return semester ?? ''
      return ''
    })
    await appendRow('enrollment', newRow)
  }

  invalidateCache(studentId)
  return status
}

/**
 * New schema: Remove an enrollment record by class_id.
 * Clears the entire row for (student_id + class_id) if found.
 * No-op if the row does not exist.
 */
export async function removeEnrollment({ classId, studentId = STUDENT_ID() }) {
  const { _enrollmentRows } = await fetchAllSheets(studentId)

  const [headers, ...rows] = _enrollmentRows

  const studentIdCol = headers.indexOf('student_id')
  const classIdCol   = headers.indexOf('class_id')

  if (studentIdCol === -1 || classIdCol === -1) {
    throw new Error('enrollment sheet missing new-schema columns (student_id, class_id)')
  }

  // Normalize incoming classId so full-width variants match sheet values at compare time
  const normalizedClassId = normalizeId(classId)

  const rowIndex = rows.findIndex(
    r => normalizeId(r[studentIdCol]) === studentId && normalizeId(r[classIdCol]) === normalizedClassId
  )

  if (rowIndex === -1) return // nothing to remove

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

  invalidateCache(studentId)
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
 * Sheet structure:
 *   id | course_id | department_id | course_name | category
 *
 * Composite key : normalizeId(course_id) + '\x00' + normalizeId(department_id)
 * Value         : category string
 *
 * One row per (course_id, department_id) pair.
 * normalizeId() collapses full-width characters so half/full-width mismatches
 * at the spreadsheet level never cause lookup failures.
 */
function buildCurriculumMap(rows) {
  const map = new Map()
  for (const row of rows) {
    const courseId = normalizeId(row.course_id    || '')
    const dept     = normalizeId(row.department_id || '')
    const category = (row.category || '').trim()
    if (!courseId || !dept || !category) continue

    const key = courseId + '\x00' + dept
    map.set(key, category)

    console.log('[buildCurriculumMap] registered:', { course_id: courseId, department_id: dept, category, key })
  }
  console.log('[buildCurriculumMap] total entries:', map.size)
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

    result = found ?? 'UNKNOWN'
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
export async function updateStudentsSummary(_userDepartment = '') {
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

  for (const row of paBody) {
    if (!row.length || row.every(c => !String(c).trim())) continue

    const studentId = normalizeId(String(row[PA.studentId] ?? ''))
    if (!studentId) continue

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
export async function upsertUserDepartment(departmentId, studentId = STUDENT_ID()) {
  const normalizedDept = normalizeId(departmentId)

  if (!normalizedDept) throw new Error('department_id must not be empty')

  const rows = await getRange('users').catch(() => [])
  const sheets = getSheetsClient()

  // ── Case 1: Sheet is empty or has no usable header ────────────────────────
  const headers     = rows[0] ?? []
  const userIdCol   = headers.indexOf('user_id')
  const deptIdCol   = headers.indexOf('department_id')

  if (userIdCol === -1 || deptIdCol === -1) {
    // Write canonical header + first data row in one batchUpdate
    const COLS = ['user_id', 'department_id']
    const dataRow = [studentId, normalizedDept]
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'users!A1', values: [COLS] },
          { range: 'users!A2', values: [dataRow] },
        ],
      },
    })
    invalidateCache(studentId)
    return
  }

  // ── Case 2: Header exists — find existing row for this user ───────────────
  const dataRows = rows.slice(1)
  const rowIndex = dataRows.findIndex(r => normalizeId(r[userIdCol]) === studentId)

  if (rowIndex !== -1) {
    // Update existing row (only the department_id cell changes)
    const sheetRow   = rowIndex + 2            // 1-based + header offset
    const updatedRow = [...dataRows[rowIndex]]
    updatedRow[deptIdCol] = normalizedDept
    await sheets.spreadsheets.values.update({
      spreadsheetId:    SPREADSHEET_ID(),
      range:            `users!A${sheetRow}:${colToLetter(updatedRow.length - 1)}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [updatedRow] },
    })
  } else {
    // Append new row aligned to the existing header order
    const newRow = headers.map((h, i) => {
      if (i === userIdCol)  return studentId
      if (i === deptIdCol)  return normalizedDept
      return ''
    })
    await appendRow('users', newRow)
  }

  invalidateCache(studentId)
}

// ── User bootstrap ────────────────────────────────────────────────────────────

/**
 * Ensure a row exists for studentId in the users sheet.
 *
 * Called on every GET /api/data so that any new student_id is automatically
 * registered without requiring an explicit sign-up step.
 *
 * Behaviour:
 *   • Sheet empty / no header → creates header [user_id, department_id, created_at] + first row
 *   • Student already exists  → no-op (returns { existed: true })
 *   • Student missing         → appends row with empty department_id + created_at timestamp
 *                               then invalidates the per-student cache so the next
 *                               fetchAllSheets call reads fresh data
 *
 * Never throws — errors are caught and logged so the API is not blocked.
 *
 * @param   {string} studentId  NFKC-normalised student identifier
 * @returns {Promise<{ existed: boolean }>}
 */
export async function bootstrapUserIfNeeded(studentId) {
  try {
    const rows    = await getRange('users').catch(() => [])
    const headers = rows[0] ?? []
    const userIdCol = headers.indexOf('user_id')
    const deptIdCol = headers.indexOf('department_id')

    const now = new Date().toISOString()

    // ── Case A: sheet is empty or missing required columns ────────────────────
    if (userIdCol === -1 || deptIdCol === -1) {
      const COLS = ['user_id', 'department_id', 'created_at']
      const sheets = getSheetsClient()
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID(),
        requestBody: {
          valueInputOption: 'RAW',
          data: [
            { range: 'users!A1', values: [COLS] },
            { range: 'users!A2', values: [[studentId, '', now]] },
          ],
        },
      })
      invalidateCache(studentId)
      console.log('[bootstrapUserIfNeeded] initialized users sheet + created user:', studentId)
      return { existed: false }
    }

    // ── Case B: student already exists ────────────────────────────────────────
    const dataRows = rows.slice(1)
    const exists   = dataRows.some(
      r => normalizeId(String(r[userIdCol] ?? '')) === studentId
    )
    if (exists) return { existed: true }

    // ── Case C: append new row aligned to existing header ────────────────────
    const createdAtCol = headers.indexOf('created_at')
    const newRow = headers.map((h, i) => {
      if (i === userIdCol)    return studentId
      if (i === deptIdCol)    return ''
      if (i === createdAtCol) return now
      return ''
    })
    await appendRow('users', newRow)
    invalidateCache(studentId)
    console.log('[bootstrapUserIfNeeded] created new user row:', studentId)
    return { existed: false }
  } catch (err) {
    console.error('[bootstrapUserIfNeeded] failed:', err)
    return { existed: false }
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
    userDepartment,          // 各学生の学科を users シートから取得（param ではなくサーバー値を使用）
  } = await fetchAllSheets(studentId)

  const courses   = rawCourses.map(normalizeCourse)

  // Build curriculum lookup: department_id → category (from curriculum_mapping sheet)
  // Used by getFinalCategory() when tags === 'SPECIAL' (case-insensitive)
  const curriculumMap = buildCurriculumMap(curriculumMappingRows ?? [])

  // ── Course lookup maps (both keyed on normalized IDs) ─────────────────────
  const courseMap       = new Map(courses.map(c => [c.course_id, c]))
  const courseByClassId = new Map(courses.map(c => [c.class_id,  c]))

  // ── Canonical column order (A–N).  Never reorder. ─────────────────────────
  const COLS = [
    'student_id', 'class_id', 'course_id', 'course_name',
    'credits', 'department', 'term', 'raw_category', 'sub_category', 'tags',
    'final_category', 'year', 'semester', 'status',
  ]
  const lastCol = colToLetter(COLS.length - 1)   // 'N'

  // ── JOIN: enrollment × course → new rows for this student ─────────────────
  const newStudentRows = normalizedEnrollment.map(e => {
    const course =
      courseByClassId.get(e.class_id) ??
      courseMap.get(e.course_id) ??
      courseMap.get(deriveCourseId(e.class_id)) ??
      null

    console.log('[COURSE JOIN]', {
      student_id:    studentId,
      class_id:      e.class_id,
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
    ]
  })

  // ── Step 1: Read full progress_auto to preserve other students' rows ───────
  let allRows      = []
  let headerCurrent = false

  try {
    allRows = await getRange('progress_auto', `A:${lastCol}`)
  } catch (readErr) {
    console.warn('[updateProgressAuto] cannot read progress_auto:', readErr.message)
    return
  }

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
    student_id:        studentId,
    new_rows:          newStudentRows.length,
    other_student_rows: otherStudentRows.length,
    old_total_body:    Math.max(0, allRows.length - 1),
  })

  // ── Step 2: Build merged body ──────────────────────────────────────────────
  // Layout: other students first, then this student's fresh rows.
  // Blank rows at the end overwrite any stale rows from a previously larger dataset.
  const newBody     = [...otherStudentRows, ...newStudentRows]
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
  const userIdIdx = headers.indexOf('user_id')
  if (userIdIdx === -1) return []
  return body
    .map(r => normalizeId(String(r[userIdIdx] ?? '')))
    .filter(Boolean)
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

/**
 * Upsert a simplified row in additional_license_result.
 *
 * New schema (v2): student_id | department_id | license_id | status
 *
 * Only writes the four key fields. Works gracefully if the sheet still has the
 * old schema (extra columns are preserved for existing rows, ignored for new ones).
 *
 * @param {string} studentId
 * @param {string} departmentId  normKey'd department (e.g. 'A_ENG')
 * @param {string} licenseId     normalizeId'd license (e.g. 'ele')
 * @param {string} status        'TRUE' | 'FALSE'
 */
export async function upsertSimpleLicenseResult(studentId, departmentId, licenseId, status) {
  const HEADER  = ['student_id', 'department_id', 'license_id', 'status']
  const sheets  = getSheetsClient()
  const rows    = await getRange('additional_license_result', 'A:ZZ').catch(() => [])
  const existH  = rows[0] ?? []
  const body    = rows.slice(1)

  // ── Case A: sheet empty → write header + first data row ───────────────────
  if (existH.length === 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID(),
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'additional_license_result!A1', values: [HEADER] },
          { range: 'additional_license_result!A2', values: [[studentId, departmentId, licenseId, status]] },
        ],
      },
    })
    console.log('[upsertSimpleLicenseResult] created sheet + row:', { studentId, departmentId, licenseId, status })
    return
  }

  // Resolve column indices from existing header (handles old and new schema)
  const hMap    = new Map(existH.map((h, i) => [normalizeId(String(h)), i]))
  const sidCol  = hMap.get('student_id') ?? 0
  const lidCol  = hMap.get('license_id') ?? 2
  const lastCol = colToLetter(existH.length - 1)

  // ── Case B: find existing row ──────────────────────────────────────────────
  const rowIndex = body.findIndex(
    r => normalizeId(String(r[sidCol] ?? '')) === studentId &&
         normalizeId(String(r[lidCol] ?? '')) === normalizeId(licenseId)
  )

  if (rowIndex !== -1) {
    const sheetRow = rowIndex + 2
    const updated  = existH.map((h, i) => {
      const key = normalizeId(String(h))
      if (key === 'student_id')    return studentId
      if (key === 'department_id') return departmentId
      if (key === 'license_id')    return licenseId
      if (key === 'status')        return status
      return body[rowIndex][i] ?? ''  // preserve unknown columns
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
      const key = normalizeId(String(h))
      if (key === 'student_id')    return studentId
      if (key === 'department_id') return departmentId
      if (key === 'license_id')    return licenseId
      if (key === 'status')        return status
      return ''
    })
    await appendRow('additional_license_result', newRow)
  }

  console.log('[upsertSimpleLicenseResult] upserted:', { studentId, departmentId, licenseId, status })
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
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID(),
    requestBody:   { valueInputOption: 'RAW', data: updates },
  })

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
    const [studentRows, ruleRows, categoryFormulaRows] = await Promise.all([
      fetchStudentsSummaryAll(),
      fetchGraduationRuleAll(),
      fetchCategoryFormulaAll(),
    ])

    if (studentRows.length === 0 || ruleRows.length === 0) {
      console.warn('[recalculateGraduation] skipping — students_summary or rules empty:', {
        students: studentRows.length,
        rules:    ruleRows.length,
      })
      return null
    }

    const results = computeGraduationResults(studentRows, ruleRows, categoryFormulaRows)
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
