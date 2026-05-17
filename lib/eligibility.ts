/**
 * eligibility.ts
 * --------------
 * Enrollment eligibility JUDGMENTS — no data transformation.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Responsibility contract                                                │
 * │                                                                         │
 * │  transform.ts   →  normalise raw Sheets data to canonical form          │
 * │  eligibility.ts →  compare canonical values, return boolean             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Pre-conditions (guaranteed by normalizeCourse in transform.ts):
 *   course.year = clean numeric string ("2") or ""   (never "2年次" etc.)
 *   course.term = canonical Japanese string           (never "spring"/"1T" etc.)
 *               one of: '春学期' | '秋学期' | '第1ターム' | '第2ターム' |
 *                        '第3ターム' | '第4ターム' | '通年' | ''
 *
 * Eligibility rule (both must hold):
 *   ① selectedGrade >= course.year   (grade constraint)
 *   ② semesterAllowed(course.term, selectedSemester)   (semester constraint)
 *
 * Semester mapping (canonical Japanese only — no aliases here):
 *   春学期 / 第1ターム / 第2ターム  →  spring
 *   秋学期 / 第3ターム / 第4ターム  →  fall
 *   通年 / ''                        →  null (allowed in both semesters)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** The two values used as the active-semester selector in the UI */
export type Semester = 'spring' | 'fall'

// ── Internal term sets (canonical Japanese strings only) ──────────────────────
// These must stay in sync with the output guarantees of normalizeTermDisplay
// in transform.ts. No aliases, no English, no TermCode strings here.

const FALL_TERMS   = new Set(['秋学期', '第3ターム', '第4ターム'])
const SPRING_TERMS = new Set(['春学期', '第1ターム', '第2ターム'])
// '通年' is intentionally absent — it maps to null = no restriction

// ── Term → Semester key ───────────────────────────────────────────────────────

/**
 * Returns 'spring', 'fall', or null for the given canonical term string.
 *
 * Expects pre-normalised input from normalizeCourse (transform.ts).
 * Does NOT perform any conversion — this is a pure Set membership check.
 *
 * null means "no semester restriction" (通年, empty, or unrecognised).
 */
export function termToSemKey(term: string | null | undefined): Semester | null {
  if (!term) return null
  if (FALL_TERMS.has(term))   return 'fall'
  if (SPRING_TERMS.has(term)) return 'spring'
  return null   // '通年' or anything else → no restriction
}

// ── Semester constraint ───────────────────────────────────────────────────────

/**
 * Whether a course's canonical term is allowed in the given semester mode.
 * 通年 (termToSemKey = null) passes unconditionally.
 */
export function isSemesterAllowed(
  courseTerm: string | null | undefined,
  selectedSemester: Semester,
): boolean {
  const semKey = termToSemKey(courseTerm)
  return semKey === null || semKey === selectedSemester
}

// ── Grade constraint ──────────────────────────────────────────────────────────

/**
 * Whether the student's grade meets the course's minimum grade requirement.
 *
 * Expects courseYear to already be a clean numeric string ("2") or "" —
 * normalizeYearString in transform.ts guarantees this.
 * The Number() conversion here is comparison arithmetic only, not normalisation.
 *
 * "" or non-numeric → minGrade = NaN / 0 → no restriction (returns true).
 */
export function isGradeAllowed(
  courseYear: string | null | undefined,
  studentGrade: number,
): boolean {
  const minGrade = Number(courseYear)
  if (!minGrade || !Number.isFinite(minGrade)) return true   // no restriction
  return studentGrade >= minGrade
}

// ── Master eligibility check ──────────────────────────────────────────────────

/**
 * The single authoritative eligibility gate for enrollment.
 *
 * Called identically in all three enforcement points:
 *   • app/api/enrollment/route.js   (API guard — cannot be bypassed)
 *   • app/page.jsx handleToggle     (UI timetable toggle guard)
 *   • app/page.jsx handleStatusChange (UI status-change guard)
 *
 * Also used for display filtering:
 *   • components/CourseList.jsx     (eligibility filter chip)
 *   • components/AddCourseModal.jsx (semester filter in add modal)
 *
 * course must have been processed by normalizeCourse (transform.ts) first.
 */
export function isCourseEligible(
  course: { year?: string | null; term?: string | null },
  studentGrade: number,
  selectedSemester: Semester,
): boolean {
  return (
    isGradeAllowed(course.year, studentGrade) &&
    isSemesterAllowed(course.term, selectedSemester)
  )
}

// ── Debug logging ─────────────────────────────────────────────────────────────

const _isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

/**
 * Log the eligibility decision for a single course to the browser/server console.
 * Development-only (no-op in production). Call at enrollment-attempt time only —
 * not inside render loops.
 *
 *   import { logEligibilityCheck } from '@/lib/eligibility'
 *   logEligibilityCheck(course, selectedGrade, currentSemKey)
 */
export function logEligibilityCheck(
  course: {
    class_id?: string
    course_name?: string
    year?: string | null
    term?: string | null
  },
  studentGrade: number,
  selectedSemester: Semester,
): void {
  if (!_isDev) return

  const gradeOk = isGradeAllowed(course.year, studentGrade)
  const semOk   = isSemesterAllowed(course.term, selectedSemester)
  const result  = gradeOk && semOk
  const semKey  = termToSemKey(course.term)
  const minGrade = Number(course.year)

  console.group(
    `%c[eligibility] ${course.class_id ?? '?'} "${course.course_name ?? ''}" → ${result ? '✅ OK' : '🚫 BLOCKED'}`,
    result ? 'color: green' : 'color: red',
  )
  console.log(
    `year : "${course.year}"`,
    `| studentGrade=${studentGrade}`,
    !minGrade ? '(no restriction)' : gradeOk ? `✅ ${studentGrade} >= ${minGrade}` : `🚫 need >= ${minGrade}`,
  )
  console.log(
    `term : "${course.term}"`,
    `→ ${semKey ?? 'all/通年'}`,
    `| selectedSemester=${selectedSemester}`,
    semOk ? '✅' : `🚫 (${semKey} ≠ ${selectedSemester})`,
  )
  console.groupEnd()
}
