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
 * Enumerate all leave semesters from start (inclusive) to end (inclusive).
 *
 * 例: start=(3,fall), end=(4,spring) → [(3,fall), (4,spring)]
 *   3年秋・4年春がともに休学学期。復学は 4年秋。
 */
export function enumerateLeaveSemesters(
  start: GradeSemester,
  end:   GradeSemester,
): GradeSemester[] {
  const toNum = (g: number, s: GradeSemKey) => g * 2 + (s === 'spring' ? 0 : 1)
  const endNum = toNum(end.grade, end.semester)

  const result: GradeSemester[] = []
  let { grade, semester } = start
  for (let guard = 0; guard < 30; guard++) {
    const curNum = toNum(grade, semester)
    if (curNum > endNum) break          // end を超えたら終了
    result.push({ grade, semester })
    if (curNum === endNum) break        // end に達したら終了（inclusive）
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
 * The offset is only applied AFTER the student has returned from leave.
 * Semesters before or during the leave period use the real grade (no shift),
 * because the student was on the normal curriculum track up to that point.
 *
 * Example: leave 3_fall → 4_spring (2 sems, offset = 1)
 *   - 1年春, 2年春, 3年春: displayGrade = realGrade   (before leave)
 *   - 3年秋, 4年春:        displayGrade = realGrade   (during leave — locked anyway)
 *   - 4年秋+:              displayGrade = realGrade - 1 (after return — shift applies)
 *
 * Used ONLY for AddCourseModal / AddExtraModal sort ordering.
 * Real grade data (enrollment.year) is never changed.
 */
export function calculateDisplayGrade(
  realGrade:       number,
  currentSemester: GradeSemKey,
  leaveSemesters:  GradeSemester[],
): number {
  if (leaveSemesters.length === 0) return realGrade
  const toNum = (g: number, s: GradeSemKey) => g * 2 + (s === 'spring' ? 0 : 1)
  const currentNum   = toNum(realGrade, currentSemester)
  const lastLeave    = leaveSemesters[leaveSemesters.length - 1]
  const lastLeaveNum = toNum(lastLeave.grade, lastLeave.semester)
  // Before or during leave → no shift
  if (currentNum <= lastLeaveNum) return realGrade
  // After return → apply offset
  return Math.max(1, realGrade - Math.floor(leaveSemesters.length / 2))
}
