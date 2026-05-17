/**
 * transform.ts
 * ------------
 * Pure normalisation functions for raw Google Sheets rows.
 *
 * Enrollment schema (new):
 *   student_id | class_id | course_id | year | semester | status | credits | department
 *
 * Enrollment schema (legacy):
 *   class_id | selected
 *
 * Key design:
 *   NormalizedEnrollment is class_id-centric (not course_id-centric).
 *   course_id is still carried for graduation-requirement lookups.
 */

import { TermCode, EnrollmentStatus, toTermCode, LEGACY_TERM_TO_CODE } from './termCode'

// ── Interfaces ────────────────────────────────────────────────────────────────

/** A course row after normalisation. Compatible with existing UI expectations. */
export interface NormalizedCourse {
  class_id: string          // with section suffix (e.g. "70020100-01")
  course_id: string         // without suffix (e.g. "70020100")
  course_name: string
  credits: number
  term: string              // Japanese display string
  term_code: TermCode | null
  normalized_time: string
  day_time: string
  room: string
  raw_category: string
  sub_category: string
  tags:         string
  year: string
  class: string
  intructor: string
  note: string
  [key: string]: unknown
}

/**
 * A normalised enrollment record.
 * class_id is the primary key — it identifies the specific section/class.
 * course_id is carried for dedup and graduation-requirement lookups.
 */
export interface NormalizedEnrollment {
  /** Specific class (section) — primary key for timetable display */
  class_id: string
  /** Parent course — used for credit dedup and graduation requirements */
  course_id: string
  year: number | null
  semester: 'spring' | 'fall' | null
  status: EnrollmentStatus
}

/** Result of buildEnrollmentMaps */
export interface EnrollmentMaps {
  /** Set of class_ids — used by all UI components to check enrollment */
  selectedIds: Set<string>
  /** class_id → EnrollmentStatus */
  statusMap: Map<string, EnrollmentStatus>
  /** "year:semester" → class_id[] — used by TimetableV2 for grade-specific views */
  enrolledByGradeSem: Map<string, string[]>
}

/** Normalised students_summary row */
export interface StudentsSummary {
  studentId: string
  passGlobal: boolean
  licenseType: string | null
  lackLicense: boolean
  categoryCredits: Record<string, number>
  passFlags: Record<string, boolean>
}

// ── Version detection ─────────────────────────────────────────────────────────

export type EnrollmentVersion = 'new' | 'legacy'

export function detectEnrollmentVersion(headers: string[]): EnrollmentVersion {
  const h = new Set(headers)
  return h.has('student_id') && h.has('status') ? 'new' : 'legacy'
}

// ── Course normalisation ──────────────────────────────────────────────────────

/**
 * Normalise a raw term value (from any spreadsheet column) to the canonical
 * Japanese display string used throughout the application.
 *
 * Input: any of the known raw representations found in Google Sheets:
 *   Canonical Japanese : '春学期', '第1ターム', '通年', ...
 *   TermCode strings   : 'SPRING', 'T1', 'FULL_YEAR', ...
 *   English words      : 'spring', 'fall', 'Spring', 'Fall'
 *   Short codes        : '1T', '2T', '3T', '4T'
 *   Empty / null       : '' / undefined
 *
 * Output guarantees (what eligibility.ts can rely on):
 *   '春学期' | '秋学期' | '第1ターム' | '第2ターム' |
 *   '第3ターム' | '第4ターム' | '通年' | '' (unrecognised / missing)
 *
 * This is the ONLY place in the codebase that converts raw term strings.
 * eligibility.ts must NOT do its own term conversion — it receives pre-normalised values.
 */
/**
 * Normalize an ID string for reliable cross-sheet key matching.
 *
 * Two-step process:
 *   1. NFKC normalization — converts full-width ASCII digits/letters/symbols
 *      (０-９, Ａ-Ｚ, ａ-ｚ, －, etc.) to their standard half-width equivalents.
 *   2. trim() — removes surrounding whitespace (including IDEOGRAPHIC SPACE U+3000).
 *
 * Applied to every class_id, course_id, and student_id at read time so that
 * downstream comparisons and Sheets writes always use canonical half-width keys.
 * Spreadsheet data is never modified; normalization is absorbed by the app.
 */
export function normalizeId(raw: string | null | undefined): string {
  if (raw == null || raw === '') return ''
  return String(raw).normalize('NFKC').trim()
}

export function normalizeTermDisplay(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const code = toTermCode(trimmed)
  if (!code) return trimmed   // truly unrecognised → pass through as-is
  // Reverse-map TermCode → canonical Japanese display string
  return Object.entries(LEGACY_TERM_TO_CODE).find(([, v]) => v === code)?.[0] ?? trimmed
}

export function normalizeCourse(row: Record<string, string>): NormalizedCourse {
  const classId  = normalizeId(row.class_id || row.course_id)
  const courseId = deriveCourseId(classId)   // deriveCourseId receives already-normalized input

  const rawTerm  = (row.term_code || row.term || '').trim()
  const termCode = toTermCode(rawTerm)
  const termJp   = normalizeTermDisplay(rawTerm)   // canonical Japanese for all downstream use

  return {
    class_id:        classId,
    course_id:       courseId,
    course_name:     (row.course_name || '').trim(),
    credits:         Number(row.credits) || 0,
    term:            termJp,
    term_code:       termCode,
    normalized_time: (row.normalized_time || '').trim(),
    day_time:        (row.day_time || '').trim(),
    room:            (row.room || '').trim(),
    raw_category:    (row.raw_category || row.category || '').trim(),
    sub_category:    (row.sub_category || '').trim(),
    tags:            (row.tags || '').trim(),
    year:            normalizeYearString(row.year),
    class:           (row.class || '').trim(),
    intructor:       (row.intructor || row.instructor || '').trim(),
    note:            (row.note || '').trim(),
    ...Object.fromEntries(
      Object.entries(row).filter(([k]) =>
        !['class_id','course_id','course_name','credits','term','term_code',
          'normalized_time','day_time','room','raw_category','category',
          'sub_category','tags','year','class','intructor','instructor',
          'note'].includes(k)
      )
    ),
  }
}

// ── Enrollment normalisation ──────────────────────────────────────────────────

export function normalizeEnrollmentRow(
  row: Record<string, string>,
  version: EnrollmentVersion,
  studentId: string,
): NormalizedEnrollment | null {
  if (version === 'new') {
    // Normalize the sheet's student_id before comparing with the app's studentId
    // (which is also normalized via STUDENT_ID() in sheets.js)
    if (row.student_id && normalizeId(row.student_id) !== studentId) return null

    const rawClassId  = normalizeId(row.class_id)
    const rawCourseId = normalizeId(row.course_id)

    // Need at least class_id or course_id
    const classId  = rawClassId || rawCourseId
    const courseId = rawCourseId || deriveCourseId(rawClassId)
    if (!classId) return null

    const rawStatus = (row.status || '').toUpperCase()
    const status: EnrollmentStatus =
      rawStatus === 'COMPLETED'   ? 'COMPLETED'   :
      rawStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' :
      rawStatus === 'PLANNED'     ? 'PLANNED'     :
      rawStatus === 'FAILED'      ? 'FAILED'      :
      rawStatus === 'AUDIT'       ? 'AUDIT'       :
      rawStatus === 'RE_ENROLL'   ? 'RE_ENROLL'   :
      'COMPLETED'

    return {
      class_id:  classId,
      course_id: courseId,
      year:      row.year ? Number(row.year) : null,
      semester:  normalizeSemester(row.semester),
      status,
    }
  } else {
    // Legacy: class_id + selected
    const selected = row.selected
    if (selected !== '1' && selected !== 'TRUE' && selected !== 'true') return null

    const classId  = normalizeId(row.class_id)
    const courseId = deriveCourseId(classId)
    if (!classId) return null

    return {
      class_id:  classId,
      course_id: courseId,
      year:      null,
      semester:  null,
      status:    'COMPLETED',
    }
  }
}

/**
 * Normalise all enrollment rows.
 * Deduplicates by class_id (one row per class per student).
 */
export function normalizeEnrollment(
  rows: Record<string, string>[],
  version: EnrollmentVersion,
  studentId: string,
): NormalizedEnrollment[] {
  const seen   = new Set<string>()
  const result: NormalizedEnrollment[] = []

  for (const row of rows) {
    const e = normalizeEnrollmentRow(row, version, studentId)
    if (!e) continue
    if (seen.has(e.class_id)) continue
    seen.add(e.class_id)
    result.push(e)
  }

  return result
}

/**
 * Build enrollment maps from a normalised enrollment array.
 *
 * selectedIds — Set of class_ids for all UI components.
 *   Also includes course_ids so that components checking c.course_id still work.
 *
 * statusMap — class_id → status (and course_id → status as fallback).
 *
 * enrolledByGradeSem — "year:semester" → class_id[] for TimetableV2 grade filtering.
 */
export function buildEnrollmentMaps(enrollment: NormalizedEnrollment[]): EnrollmentMaps {
  const selectedIds        = new Set<string>()
  const statusMap          = new Map<string, EnrollmentStatus>()
  const enrolledByGradeSem = new Map<string, string[]>()

  for (const e of enrollment) {
    // class_id is the sole primary key for UI selection checks.
    // course_id is intentionally NOT added here — adding it would cause
    // every section sharing the same course_id to appear selected.
    selectedIds.add(e.class_id)
    statusMap.set(e.class_id, e.status)

    if (e.year != null && e.semester) {
      const key = `${e.year}:${e.semester}`
      if (!enrolledByGradeSem.has(key)) enrolledByGradeSem.set(key, [])
      enrolledByGradeSem.get(key)!.push(e.class_id)
    }
  }

  return { selectedIds, statusMap, enrolledByGradeSem }
}

/**
 * Build enrollment maps, augmenting selectedIds with class_ids from the course catalog
 * for any enrollment rows that only have course_id (legacy compatibility).
 *
 * IMPORTANT: only adds the catalog class_id when it is genuinely distinct from the
 * course_id (i.e. it carries a section suffix like "-01").  If the catalog also lacks
 * section suffixes (class_id === course_id), adding the same value would make *every*
 * catalog row sharing that class_id appear selected — the root cause of the
 * "全クラス一括登録" display bug.
 */
export function buildEnrollmentMapsWithCourses(
  enrollment: NormalizedEnrollment[],
  courses: NormalizedCourse[],
): EnrollmentMaps {
  const maps = buildEnrollmentMaps(enrollment)

  // Map course_id → first class_id that has a real section suffix
  // (class_id !== course_id means the suffix is present)
  const courseIdToSectionClassId = new Map<string, string>()
  for (const c of courses) {
    if (c.class_id !== c.course_id && !courseIdToSectionClassId.has(c.course_id)) {
      courseIdToSectionClassId.set(c.course_id, c.class_id)
    }
  }

  for (const e of enrollment) {
    if (e.class_id === e.course_id) {
      // Legacy entry: class_id has no section suffix.
      // Resolve to the catalog's first *sectioned* class_id only if one exists.
      // Never add the bare course_id itself — that would match every section in the catalog.
      const sectionClassId = courseIdToSectionClassId.get(e.course_id)
      if (sectionClassId) maps.selectedIds.add(sectionClassId)
    }
  }

  return maps
}

// ── students_summary normalisation ────────────────────────────────────────────

export function normalizeStudentsSummary(row: Record<string, string>): StudentsSummary {
  const categoryCredits: Record<string, number>  = {}
  const passFlags:        Record<string, boolean> = {}

  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('CREDIT_')) {
      categoryCredits[k.slice(7)] = Number(v) || 0
    } else if (k.startsWith('PASS_') && k !== 'PASS_GLOBAL') {
      passFlags[k.slice(5)] = v === '1' || v === 'TRUE' || v === 'true'
    }
  }

  return {
    studentId:   (row.student_id || '').trim(),
    passGlobal:  row.PASS_GLOBAL === '1' || row.PASS_GLOBAL === 'TRUE',
    licenseType: (row.WANT_LICENSE || '').trim() || null,
    lackLicense: row.LACK_LICENSE === '1' || row.LACK_LICENSE === 'TRUE',
    categoryCredits,
    passFlags,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a raw year value from a spreadsheet cell to a clean numeric string.
 *
 * Handles all known spreadsheet format variations:
 *   "2"     → "2"
 *   "2年次" → "2"   (parseInt extracts the leading integer)
 *   "2年"   → "2"
 *   2       → "2"   (numeric cell)
 *   ""      → ""    (no grade restriction)
 *   "未定"  → ""    (no grade restriction)
 *
 * Returns an empty string when no parseable integer ≥ 1 is found,
 * which isGradeAllowed in eligibility.ts interprets as "no restriction".
 */
export function normalizeYearString(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return ''
  const n = parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n <= 0) return ''
  return String(n)
}

/**
 * Strip the section suffix from a class_id to get the course_id.
 * "70020100-01" → "70020100"
 * "70020100"    → "70020100"  (no-op)
 *
 * NOTE: This is a fallback for legacy data. With the new schema,
 * enrollment rows carry both class_id and course_id explicitly —
 * this function is only needed when course_id is missing.
 */
export function deriveCourseId(classId: string): string {
  if (!classId) return ''
  const m = classId.match(/^(.+?)-\d{2,}$/)
  return m ? m[1] : classId
}

function normalizeSemester(raw: string | undefined): 'spring' | 'fall' | null {
  if (!raw) return null
  const v = raw.toLowerCase().trim()
  if (v === 'spring') return 'spring'
  if (v === 'fall')   return 'fall'
  return null
}
