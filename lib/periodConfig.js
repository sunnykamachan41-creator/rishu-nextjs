/**
 * periodConfig.js
 *
 * 学期・年度ごとのコマ時間設定を管理します。
 *
 * 優先順（読み取り）:
 *   localStorage `rishu_periods_${year}_${sem}`
 *     → ハードコード CONFIGS[`${year}-${sem}`]
 *     → ハードコード CONFIGS[sem]
 *     → ハードコード CONFIGS.default
 *
 * 将来 Firebase 等に移行する場合:
 *   loadPeriodConfig を async 関数にして Firestore からフェッチするだけ。
 */

// ── 定数 ──────────────────────────────────────────────────────────────────────

/** 選択可能な年度一覧 */
export const ACADEMIC_YEARS = [2024, 2025, 2026, 2027, 2028]

/** 学期キー → 表示ラベル */
export const SEMESTER_LABELS = {
  spring: '春学期',
  fall:   '秋学期',
}

// ── ハードコードデフォルト ────────────────────────────────────────────────────

/**
 * キー形式:
 *   "default"          … 共通デフォルト
 *   "spring"           … 春学期デフォルト
 *   "fall"             … 秋学期デフォルト
 *   "2026-spring"      … 2026年度春学期（個別上書き）
 *
 * @type {Record<string, Array<{period:number, start:string, end:string}>>}
 */
const CONFIGS = {
  default: [
    { period: 1, start: '08:30', end: '10:10' },
    { period: 2, start: '10:20', end: '12:00' },
    { period: 3, start: '12:50', end: '14:30' },
    { period: 4, start: '14:40', end: '16:20' },
    { period: 5, start: '16:30', end: '18:10' },
  ],
  spring: null,   // null → default にフォールバック
  fall:   null,
  // 年度 + 学期の個別上書き例:
  // '2027-spring': [ { period:1, start:'09:00', end:'10:40' }, ... ],
}

// ── localStorage キー ─────────────────────────────────────────────────────────

const PERIODS_KEY = (year, sem) => `rishu_periods_${year}_${sem}`

// ── ハードコードデフォルト取得（SSR-safe） ────────────────────────────────────

/**
 * ハードコードのデフォルト設定を返す（localStorage は参照しない）。
 * SSR やリセット時に使用する。
 */
export function getDefaultPeriodConfig(year, sem) {
  return (
    CONFIGS[`${year}-${sem}`] ??
    CONFIGS[sem]              ??
    CONFIGS.default
  )
}

// ── localStorage 読み書き ─────────────────────────────────────────────────────

/**
 * 指定年度・学期のコマ時間設定を返す。
 * localStorage → ハードコードデフォルトの優先順。
 * SSR 時はデフォルトを返す（window なし）。
 *
 * @param {number} year
 * @param {'spring'|'fall'} sem
 * @returns {Array<{period:number, start:string, end:string}>}
 */
export function loadPeriodConfig(year, sem) {
  if (typeof window === 'undefined') return getDefaultPeriodConfig(year, sem)
  try {
    const raw = localStorage.getItem(PERIODS_KEY(year, sem))
    if (raw) return JSON.parse(raw)
  } catch {}
  return getDefaultPeriodConfig(year, sem)
}

/**
 * 指定年度・学期のコマ時間設定を localStorage に保存する。
 *
 * @param {number} year
 * @param {'spring'|'fall'} sem
 * @param {Array<{period:number, start:string, end:string}>} config
 */
export function savePeriodConfig(year, sem, config) {
  try {
    localStorage.setItem(PERIODS_KEY(year, sem), JSON.stringify(config))
  } catch {}
}

/**
 * @deprecated loadPeriodConfig を使用してください（localStorage 非対応）
 * 後方互換のためのエイリアス。
 */
export function getPeriodConfig(year, sem) {
  return getDefaultPeriodConfig(year, sem)
}

// ── 学年管理 ──────────────────────────────────────────────────────────────────

const ENROLLMENT_YEAR_KEY = 'rishu_enrollment_year'
const MAX_GRADE_KEY        = 'rishu_max_grade'

/** 現在の学年度（4月始まり） */
function currentAcademicYear() {
  const d = new Date()
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
}

/** 入学年度を localStorage から読む（なければ今年度） */
export function loadEnrollmentYear() {
  if (typeof window === 'undefined') return currentAcademicYear()
  try {
    const v = localStorage.getItem(ENROLLMENT_YEAR_KEY)
    if (v) return Number(v)
  } catch {}
  return currentAcademicYear()
}

/** 入学年度を localStorage に保存 */
export function saveEnrollmentYear(year) {
  try { localStorage.setItem(ENROLLMENT_YEAR_KEY, String(year)) } catch {}
}

/** 最大学年を localStorage から読む（なければ 4） */
export function loadMaxGrade() {
  if (typeof window === 'undefined') return 4
  try {
    const v = localStorage.getItem(MAX_GRADE_KEY)
    if (v) return Number(v)
  } catch {}
  return 4
}

/** 最大学年を localStorage に保存 */
export function saveMaxGrade(grade) {
  try { localStorage.setItem(MAX_GRADE_KEY, String(grade)) } catch {}
}

/** 学年 → 年度 */
export function gradeToYear(grade, enrollmentYear) {
  return enrollmentYear + grade - 1
}

/** 年度 → 学年 */
export function yearToGrade(year, enrollmentYear) {
  return year - enrollmentYear + 1
}

// ── 学年・学期フィルタ永続化 ──────────────────────────────────────────────────

const SELECTED_GRADE_KEY   = 'rishu_selected_grade'
const TIMETABLE_TERM_KEY   = 'rishu_timetable_term'

/** 最後に選択していた学年を localStorage から読む（なければ 1） */
export function loadSelectedGrade() {
  if (typeof window === 'undefined') return 1
  try {
    const v = localStorage.getItem(SELECTED_GRADE_KEY)
    if (v) return Math.max(1, Number(v))
  } catch {}
  return 1
}

/** 選択学年を localStorage に保存 */
export function saveSelectedGrade(grade) {
  try { localStorage.setItem(SELECTED_GRADE_KEY, String(grade)) } catch {}
}

/** 最後に選択していた学期フィルタを localStorage から読む（なければ '春学期'） */
export function loadTimetableTermFilter() {
  if (typeof window === 'undefined') return '春学期'
  try {
    const v = localStorage.getItem(TIMETABLE_TERM_KEY)
    if (v === '春学期' || v === '秋学期') return v
  } catch {}
  return '春学期'
}

/** 学期フィルタを localStorage に保存 */
export function saveTimetableTermFilter(term) {
  try { localStorage.setItem(TIMETABLE_TERM_KEY, term) } catch {}
}
