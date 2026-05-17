/**
 * practiceEligibility.ts
 *
 * 教育実習の履修可否を判定するルールエンジン（TypeScript 版）。
 *
 * 設計方針:
 *  - COURSEID ベースで判定（classId は使用しない）
 *  - 同一 COURSEID の重複カウントなし
 *  - 条件を小さな純粋関数に分解し、テスト・追加が容易な構造
 *  - state 構造は変更しない（useCreditSummary の返り値をそのまま受け取る）
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 型定義
// ═══════════════════════════════════════════════════════════════════════════════

/** useCreditSummary の CompletedCourse と同一構造 */
export interface CompletedCourse {
  courseId:  string
  classId:   string
  name:      string
  credits:   number
  term:      string | null
  tags:      string[]
  grade:     number | null
  semester:  'spring' | 'fall' | null
}

/** useCreditSummary の返り値と同一構造 */
export interface CreditState {
  completedCourses:   CompletedCourse[]
  totalCredits:       number
  /** キーは学年番号の文字列 ('1', '2', ...) + 'unknown' */
  creditsByGrade:     Record<string, number>
  creditsByCategory:  Record<string, number>
}

/** 各判定関数の返り値 */
export interface EligibilityResult {
  eligible: boolean
  missing:  string[]
}

/** 一括評価の返り値 */
export interface AllPracticeResults {
  practice1:   EligibilityResult
  practice2:   EligibilityResult
  subPractice: EligibilityResult
}

// ═══════════════════════════════════════════════════════════════════════════════
// COURSEID 定数
// ═══════════════════════════════════════════════════════════════════════════════

interface RequiredCourse {
  id:   string
  name: string
}

/**
 * 教育実習Ⅰ の EB 必修科目。
 * 教職入門の COURSEID が確定次第 KYOSHOKU_NYUMON の id を更新すること。
 */
export const EB_REQUIRED: readonly RequiredCourse[] = [
  { id: 'KYOSHOKU_NYUMON', name: '教職入門' },      // TODO: 正式 COURSEID に差し替え
  { id: '70200200',         name: '教育の理念と歴史' },
  { id: '70200300',         name: '教育組織論' },
] as const

// ═══════════════════════════════════════════════════════════════════════════════
// 低レベルユーティリティ
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 1 年生〜maxGrade 年生の累積単位を合算する。
 *
 * 'unknown' バケット（時間割未登録）は年度不明のため除外する。
 * 正確な学年判定には timetable へのコース登録が前提となる。
 */
export function creditsUpToGrade(
  creditsByGrade: Record<string, number>,
  maxGrade: number,
): number {
  let total = 0
  for (let g = 1; g <= maxGrade; g++) {
    total += creditsByGrade[String(g)] ?? 0
  }
  return total
}

/**
 * completedCourses の中から指定タグを持つ科目を courseId で重複排除して返す。
 * セクション違いの同一科目（courseId 一致）は 1 件とみなす。
 */
export function uniqueCoursesByTag(
  completedCourses: CompletedCourse[],
  tag: string,
): CompletedCourse[] {
  const seen = new Map<string, CompletedCourse>()
  for (const c of completedCourses) {
    if (c.tags.includes(tag) && !seen.has(c.courseId)) {
      seen.set(c.courseId, c)
    }
  }
  return [...seen.values()]
}

/**
 * 指定 courseId が completedCourses に含まれるか確認する。
 */
export function hasCourseId(
  completedCourses: CompletedCourse[],
  courseId: string,
): boolean {
  return completedCourses.some(c => c.courseId === courseId)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 条件チェック関数（単一責務・再利用可能）
// ═══════════════════════════════════════════════════════════════════════════════

interface CheckResult {
  ok:      boolean
  reasons: string[]
}

/**
 * 指定学年までの累積単位が minCredits 以上かを確認する。
 */
function checkCreditsUpToGrade(
  state:      CreditState,
  maxGrade:   number,
  minCredits: number,
): CheckResult {
  const earned = creditsUpToGrade(state.creditsByGrade, maxGrade)
  if (earned >= minCredits) return { ok: true, reasons: [] }
  return {
    ok:      false,
    reasons: [`${maxGrade}年生までの取得単位が不足（${earned} / ${minCredits}単位）`],
  }
}

/**
 * EB 必須科目がすべて揃っており、かつ EB 合計が targetCredits 以上かを確認する。
 */
function checkEbRequired(
  state:         CreditState,
  targetCredits: number,
): CheckResult {
  const reasons: string[] = []

  for (const req of EB_REQUIRED) {
    if (!hasCourseId(state.completedCourses, req.id)) {
      reasons.push(`EB必修「${req.name}」が未履修`)
    }
  }

  const ebTotal = state.creditsByCategory['EB'] ?? 0
  if (ebTotal < targetCredits) {
    reasons.push(`EB単位不足（${ebTotal} / ${targetCredits}単位）`)
  }

  return { ok: reasons.length === 0, reasons }
}

/**
 * ST カテゴリが minCount 科目以上 かつ minCredits 単位以上かを確認する。
 * 科目数は courseId 重複排除後の件数で判定する。
 */
function checkSt(
  state:      CreditState,
  minCount:   number,
  minCredits: number,
): CheckResult {
  const stCourses = uniqueCoursesByTag(state.completedCourses, 'ST')
  const stTotal   = stCourses.reduce((s, c) => s + c.credits, 0)
  const reasons: string[] = []

  if (stCourses.length < minCount) {
    reasons.push(`ST科目数が不足（${stCourses.length} / ${minCount}科目）`)
  }
  if (stTotal < minCredits) {
    reasons.push(`ST単位が不足（${stTotal} / ${minCredits}単位）`)
  }

  return { ok: reasons.length === 0, reasons }
}

/**
 * CL_ENG_OP カテゴリが minCredits 単位以上かを確認する。
 */
function checkClEngOp(
  state:      CreditState,
  minCredits: number,
): CheckResult {
  const earned = state.creditsByCategory['CL_ENG_OP'] ?? 0
  if (earned >= minCredits) return { ok: true, reasons: [] }
  return {
    ok:      false,
    reasons: [`CL_ENG_OP単位不足（${earned} / ${minCredits}単位）`],
  }
}

/** 複数の CheckResult をまとめる内部ヘルパー */
function mergeChecks(...checks: CheckResult[]): EligibilityResult {
  const missing = checks.flatMap(c => c.reasons)
  return { eligible: missing.length === 0, missing }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 公開 API：履修可否判定関数
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 教育実習Ⅰ（class_id: 70300420-01）の履修可否を判定する。
 *
 * 条件:
 *  1. 2 年生までで 62 単位以上
 *  2. EB 必修 3 科目（教職入門 / 70200200 / 70200300）を含み EB 合計 6 単位以上
 *  3. ST 科目 2 科目以上かつ合計 4 単位以上
 */
export function canTakePractice1(state: CreditState): EligibilityResult {
  return mergeChecks(
    checkCreditsUpToGrade(state, 2, 62),
    checkEbRequired(state, 6),
    checkSt(state, 2, 4),
  )
}

/**
 * 教育実習Ⅱ（class_id: 70301300-01）の履修可否を判定する。
 *
 * 条件:
 *  1. 教育実習Ⅰ の全条件を満たしていること
 *  2. 3 年生までで 78 単位以上
 *  3. ST 科目 4 科目以上かつ合計 8 単位以上
 */
export function canTakePractice2(state: CreditState): EligibilityResult {
  const p1 = canTakePractice1(state)

  // 教育実習Ⅰ の不足がある場合はインデント付きで入れ子表示
  const p1Check: CheckResult = p1.eligible
    ? { ok: true, reasons: [] }
    : {
        ok:      false,
        reasons: [
          '教育実習Ⅰの要件未達',
          ...p1.missing.map(m => `  └ ${m}`),
        ],
      }

  return mergeChecks(
    p1Check,
    checkCreditsUpToGrade(state, 3, 78),
    checkSt(state, 4, 8),
  )
}

/**
 * 副免教育実習（class_id: 70301000-01）の履修可否を判定する。
 *
 * 条件:
 *  1. 教育実習Ⅰ の全条件を満たしていること
 *  2. CL_ENG_OP カテゴリで 4 単位以上
 */
export function canTakeSubPractice(state: CreditState): EligibilityResult {
  const p1 = canTakePractice1(state)

  const p1Check: CheckResult = p1.eligible
    ? { ok: true, reasons: [] }
    : {
        ok:      false,
        reasons: [
          '教育実習Ⅰの要件未達',
          ...p1.missing.map(m => `  └ ${m}`),
        ],
      }

  return mergeChecks(
    p1Check,
    checkClEngOp(state, 4),
  )
}

/**
 * 3 つの実習すべての判定結果をまとめて返す。
 *
 * @example
 * const results = evaluateAllPractices(creditSummary)
 * if (!results.practice1.eligible) {
 *   console.log(results.practice1.missing)
 * }
 */
export function evaluateAllPractices(state: CreditState): AllPracticeResults {
  return {
    practice1:   canTakePractice1(state),
    practice2:   canTakePractice2(state),
    subPractice: canTakeSubPractice(state),
  }
}
