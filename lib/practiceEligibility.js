/**
 * practiceEligibility.js
 *
 * 教育実習の履修可否を判定するルールエンジン。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 入力 state の型（useCreditSummary の返り値）
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @typedef {import('./useCreditSummary').CompletedCourse} CompletedCourse
 *
 * @typedef {object} CreditState
 * @property {CompletedCourse[]}         completedCourses
 * @property {number}                    totalCredits
 * @property {Record<string,number>}     creditsByGrade     - キーは学年番号の文字列 + 'unknown'
 * @property {Record<string,number>}     creditsByCategory
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 出力型
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @typedef {object} EligibilityResult
 * @property {boolean}  eligible - 全条件を満たしているか
 * @property {string[]} missing  - 不足条件の説明（eligible=false 時に内容あり）
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COURSEID 定数
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * COURSEID は class_id のセクション番号（-01 等）を除いた恒久 ID。
 * スプレッドシートに course_id 列が存在する場合はそちらが優先される
 * （useCreditSummary.js 参照）。
 */

// ── EB必修科目 COURSEID 定数 ──────────────────────────────────────────────────

/**
 * 教育実習Ⅰの EB 必修科目。
 * 科目名と COURSEID を対応させて管理する。
 *
 * TODO: 教職入門の COURSEID が確定次第 KYOSHOKU_NYUMON_ID を更新すること。
 */
const EB_REQUIRED = [
  { id: 'KYOSHOKU_NYUMON',  name: '教職入門' },         // ← 仮実装: 確定後に正式IDに変更
  { id: '70200200',         name: '教育の理念と歴史' },
  { id: '70200300',         name: '教育組織論' },
]

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ関数（内部使用）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 学年 1〜maxGrade の累積単位を合算する。
 * 'unknown' バケットは年度が特定できないため除外（conservative）。
 * 時間割に登録していない科目は 'unknown' になるため、学年制限チェックが
 * 正確に動くよう timetable への登録を推奨すること。
 *
 * @param {Record<string,number>} creditsByGrade
 * @param {number} maxGrade
 * @returns {number}
 */
function creditsUpToGrade(creditsByGrade, maxGrade) {
  let total = 0
  for (let g = 1; g <= maxGrade; g++) {
    total += creditsByGrade[String(g)] || 0
  }
  return total
}

/**
 * completedCourses の中から指定タグを持つ科目を courseId で重複排除して返す。
 * 同一 courseId の科目が複数 classId（セクション違い）で登録されていても 1 件扱い。
 *
 * @param {CompletedCourse[]} completedCourses
 * @param {string} tag
 * @returns {{ courseId: string, name: string, credits: number }[]}
 */
function uniqueCoursesByTag(completedCourses, tag) {
  const seen = new Map()   // courseId → { name, credits }
  for (const c of completedCourses) {
    if (!c.tags.includes(tag)) continue
    if (!seen.has(c.courseId)) {
      seen.set(c.courseId, { courseId: c.courseId, name: c.name, credits: c.credits })
    }
  }
  return [...seen.values()]
}

/**
 * completedCourses に指定 courseId が含まれるかを確認する。
 * セクション違いの同一科目（courseId 一致）も "履修済み" とみなす。
 *
 * @param {CompletedCourse[]} completedCourses
 * @param {string} courseId
 * @returns {boolean}
 */
function hasCourseId(completedCourses, courseId) {
  return completedCourses.some(c => c.courseId === courseId)
}

// ─────────────────────────────────────────────────────────────────────────────
// 条件チェック関数（単一責務）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [共通] EB 必修科目の充足チェック。
 * EB カテゴリの全必修 COURSEID が揃っており、かつ EB 合計が targetCredits 以上か。
 *
 * @param {CreditState} state
 * @param {number} targetCredits
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function checkEbRequired(state, targetCredits) {
  const reasons = []

  // ① 必修 COURSEID がすべて揃っているか
  for (const req of EB_REQUIRED) {
    if (!hasCourseId(state.completedCourses, req.id)) {
      reasons.push(`EB必修「${req.name}」が未履修です`)
    }
  }

  // ② EB 単位合計
  const ebCredits = state.creditsByCategory['EB'] || 0
  if (ebCredits < targetCredits) {
    reasons.push(`EB単位が不足しています（${ebCredits}/${targetCredits}単位）`)
  }

  return { ok: reasons.length === 0, reasons }
}

/**
 * [共通] ST カテゴリの充足チェック。
 * courseId 重複排除後に「科目数 ≥ minCount かつ 合計単位 ≥ minCredits」を確認。
 *
 * @param {CreditState} state
 * @param {number} minCount   - 必要な科目数（重複排除後）
 * @param {number} minCredits - 必要な合計単位数
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function checkSt(state, minCount, minCredits) {
  const stCourses = uniqueCoursesByTag(state.completedCourses, 'ST')
  const reasons = []

  if (stCourses.length < minCount) {
    reasons.push(`ST科目数が不足しています（${stCourses.length}/${minCount}科目）`)
  }

  const stTotal = stCourses.reduce((s, c) => s + c.credits, 0)
  if (stTotal < minCredits) {
    reasons.push(`ST単位が不足しています（${stTotal}/${minCredits}単位）`)
  }

  return { ok: reasons.length === 0, reasons }
}

/**
 * [共通] 指定学年までの累積単位チェック。
 *
 * @param {CreditState} state
 * @param {number} maxGrade     - 何年生までを対象とするか
 * @param {number} minCredits   - 必要な累積単位数
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function checkCreditsUpToGrade(state, maxGrade, minCredits) {
  const earned = creditsUpToGrade(state.creditsByGrade, maxGrade)
  if (earned < minCredits) {
    return {
      ok: false,
      reasons: [`${maxGrade}年生までの取得単位が不足しています（${earned}/${minCredits}単位）`],
    }
  }
  return { ok: true, reasons: [] }
}

/**
 * [共通] CL_ENG_OP カテゴリの単位チェック。
 *
 * @param {CreditState} state
 * @param {number} minCredits
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function checkClEngOp(state, minCredits) {
  const earned = state.creditsByCategory['CL_ENG_OP'] || 0
  if (earned < minCredits) {
    return {
      ok: false,
      reasons: [`CL_ENG_OP単位が不足しています（${earned}/${minCredits}単位）`],
    }
  }
  return { ok: true, reasons: [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開 API：履修可否判定関数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 教育実習Ⅰ（class_id: 70300420-01）の履修可否を判定する。
 *
 * 条件:
 *  1. 2年生までで 62 単位以上
 *  2. EB必修3科目（教職入門・70200200・70200300）を含み EB 合計 6 単位以上
 *  3. ST科目 2科目以上かつ合計 4 単位以上
 *
 * @param {CreditState} state
 * @returns {EligibilityResult}
 */
export function canTakePractice1(state) {
  const missing = []

  const c1 = checkCreditsUpToGrade(state, 2, 62)
  const c2 = checkEbRequired(state, 6)
  const c3 = checkSt(state, 2, 4)

  if (!c1.ok) missing.push(...c1.reasons)
  if (!c2.ok) missing.push(...c2.reasons)
  if (!c3.ok) missing.push(...c3.reasons)

  return { eligible: missing.length === 0, missing }
}

/**
 * 教育実習Ⅱ（class_id: 70301300-01）の履修可否を判定する。
 *
 * 条件:
 *  1. 教育実習Ⅰ の条件をすべて満たしていること
 *  2. 3年生までで 78 単位以上
 *  3. ST科目 4科目以上かつ合計 8 単位以上
 *
 * @param {CreditState} state
 * @returns {EligibilityResult}
 */
export function canTakePractice2(state) {
  const missing = []

  // 教育実習Ⅰ の条件を包含チェック（再計算・重複 missing は独自メッセージで上書き）
  const p1 = canTakePractice1(state)
  if (!p1.eligible) {
    missing.push('教育実習Ⅰの要件を満たしていません', ...p1.missing.map(m => `  └ ${m}`))
  }

  const c2 = checkCreditsUpToGrade(state, 3, 78)
  const c3 = checkSt(state, 4, 8)

  if (!c2.ok) missing.push(...c2.reasons)
  if (!c3.ok) missing.push(...c3.reasons)

  return { eligible: missing.length === 0, missing }
}

/**
 * 副免教育実習（class_id: 70301000-01）の履修可否を判定する。
 *
 * 条件:
 *  1. 教育実習Ⅰ の条件をすべて満たしていること
 *  2. CL_ENG_OP カテゴリで 4 単位以上
 *
 * @param {CreditState} state
 * @returns {EligibilityResult}
 */
export function canTakeSubPractice(state) {
  const missing = []

  const p1 = canTakePractice1(state)
  if (!p1.eligible) {
    missing.push('教育実習Ⅰの要件を満たしていません', ...p1.missing.map(m => `  └ ${m}`))
  }

  const c2 = checkClEngOp(state, 4)
  if (!c2.ok) missing.push(...c2.reasons)

  return { eligible: missing.length === 0, missing }
}

// ─────────────────────────────────────────────────────────────────────────────
// 便利関数：全実習を一括評価する
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 3つの実習すべての判定結果をまとめて返す。
 *
 * @param {CreditState} state
 * @returns {{
 *   practice1:    EligibilityResult,
 *   practice2:    EligibilityResult,
 *   subPractice:  EligibilityResult,
 * }}
 */
export function evaluateAllPractices(state) {
  // practice1 を先に計算し、2・副免は内部で参照する
  const practice1   = canTakePractice1(state)
  const practice2   = canTakePractice2(state)
  const subPractice = canTakeSubPractice(state)
  return { practice1, practice2, subPractice }
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部ユーティリティの公開エクスポート（テスト・デバッグ用）
// ─────────────────────────────────────────────────────────────────────────────

export { creditsUpToGrade, uniqueCoursesByTag, hasCourseId }
export { EB_REQUIRED }
