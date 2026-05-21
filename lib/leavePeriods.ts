/**
 * leavePeriods.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilities for the 休学 (leave of absence) system.
 *
 * leave_periods sheet columns: student_id | leave_start | leave_end
 * Format: "{grade}_{semester}" e.g. "3_fall", "4_spring"
 *
 * Semantics:
 *   leave_start = first semester on leave (inclusive)
 *   leave_end   = first semester after return (exclusive / return date)
 *
 * Example: leave_start="3_fall", leave_end="4_spring"
 *   → leave semesters: [{ grade: 3, semester: 'fall' }]
 *     (3年秋は休学、4年春から復学)
 *
 * Example: leave_start="2_spring", leave_end="3_fall"
 *   → leave semesters: [{ grade:2, semester:'spring' }, { grade:2, semester:'fall' }, { grade:3, semester:'spring' }]
 */

// normalizeId の簡易実装（transform.ts への循環依存を避けるため）
function normId(s: string | null | undefined): string {
  if (s == null || s === '') return ''
  return String(s).normalize('NFKC').trim()
}

export type GradeSemKey = 'spring' | 'fall'

export interface GradeSemester {
  grade:    number
  semester: GradeSemKey
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/** Parse "{grade}_{semester}" → GradeSemester | null */
export function parseGradeSemester(s: string | null | undefined): GradeSemester | null {
  if (!s) return null
  const m = String(s).trim().match(/^(\d+)_(spring|fall)$/)
  if (!m) return null
  return { grade: parseInt(m[1], 10), semester: m[2] as GradeSemKey }
}

/**
 * Enumerate all leave semesters from start (inclusive) to end (exclusive).
 * Returns an empty array if start ≥ end (invalid data).
 */
export function enumerateLeaveSemesters(
  start: GradeSemester,
  end:   GradeSemester,
): GradeSemester[] {
  const result: GradeSemester[] = []
  let { grade, semester } = start
  for (let guard = 0; guard < 30; guard++) {
    if (grade === end.grade && semester === end.semester) break
    if (grade > end.grade) break   // invalid: start is after end — bail out
    result.push({ grade, semester })
    if (semester === 'spring') {
      semester = 'fall'
    } else {
      semester = 'spring'
      grade++
    }
  }
  return result
}

/**
 * Parse leave_periods sheet rows and return all leave semesters for a student.
 * Multiple leave periods per student are merged into a single flat array.
 */
export function parseLeavePeriodRows(
  rows:      Array<Record<string, string>>,
  studentId: string,
): GradeSemester[] {
  const normalizedTarget = normId(studentId)
  const result: GradeSemester[] = []
  for (const row of rows) {
    // header キーが大文字小文字混在でも対応できるよう、オブジェクトから case-insensitive に取得
    const sid = normId(row['student_id'] ?? row['Student_ID'] ?? row['Student_Id'] ?? '')
    if (!sid || sid !== normalizedTarget) continue
    const start = parseGradeSemester(row['leave_start'] ?? row['Leave_Start'] ?? '')
    const end   = parseGradeSemester(row['leave_end']   ?? row['Leave_End']   ?? '')
    if (!start || !end) continue
    result.push(...enumerateLeaveSemesters(start, end))
  }
  return result
}

// ── Checks ────────────────────────────────────────────────────────────────────

/** Return true if the given grade+semester is a leave period for this student. */
export function isLeaveSemester(
  leaveSemesters: GradeSemester[],
  grade:          number,
  semester:       GradeSemKey,
): boolean {
  return leaveSemesters.some(ls => ls.grade === grade && ls.semester === semester)
}

// ── Display grade ─────────────────────────────────────────────────────────────

/**
 * Compute displayGrade for sort recommendations.
 *
 * Each 2 leave semesters (= 1 full academic year of leave) subtracts 1 grade level.
 * This compensates the sort priority so that, e.g., a student who took 1 year off
 * and is now in 3年生 sees 2年 courses recommended first (matching their curriculum pos).
 *
 * Used ONLY for AddCourseModal / AddExtraModal sort ordering.
 * Real grade data (enrollment.year) is never changed.
 */
export function calculateDisplayGrade(
  realGrade:      number,
  leaveSemesters: GradeSemester[],
): number {
  return Math.max(1, realGrade - Math.floor(leaveSemesters.length / 2))
}
