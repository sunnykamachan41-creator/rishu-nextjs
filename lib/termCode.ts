/**
 * termCode.ts
 * -----------
 * Canonical term/status constants and utility functions for the new data layer.
 *
 * TermCode is the internal representation stored in the new enrollment schema.
 * The legacy enrollment sheet stores Japanese term strings directly in courses
 * ("春学期", "第1ターム", etc.) — use LEGACY_TERM_TO_CODE to normalise those.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TermCode =
  | 'SPRING'      // 春学期
  | 'FALL'        // 秋学期
  | 'T1'          // 第1ターム
  | 'T2'          // 第2ターム
  | 'T3'          // 第3ターム
  | 'T4'          // 第4ターム
  | 'FULL_YEAR'   // 通年

export type EnrollmentStatus = 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED' | 'FAILED' | 'AUDIT' | 'RE_ENROLL'

export type Semester = 'spring' | 'fall' | 'both'

// ── Display labels ────────────────────────────────────────────────────────────

export const TERM_LABEL: Record<TermCode, string> = {
  SPRING:    '春学期',
  FALL:      '秋学期',
  T1:        '第1ターム',
  T2:        '第2ターム',
  T3:        '第3ターム',
  T4:        '第4ターム',
  FULL_YEAR: '通年',
}

/** Which semester each term belongs to (for filtering). */
export const TERM_SEMESTER: Record<TermCode, Semester> = {
  SPRING:    'spring',
  FALL:      'fall',
  T1:        'spring',
  T2:        'spring',
  T3:        'fall',
  T4:        'fall',
  FULL_YEAR: 'both',
}

/** Compatible (non-conflicting) term pairs within the same semester. */
export const COMPATIBLE_TERM_CODES = new Set<string>([
  'T1|T2', 'T2|T1',
  'T3|T4', 'T4|T3',
])

// ── Enrollment status ─────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  COMPLETED:   '取得済み',
  IN_PROGRESS: '履修中',
  PLANNED:     '履修予定',
  FAILED:      '落単（笑）',
  AUDIT:       '聴講',
  RE_ENROLL:   '再履修（笑）',
}

export const STATUS_STYLE: Record<EnrollmentStatus, string> = {
  COMPLETED:   'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  PLANNED:     'bg-gray-100 text-gray-600',
  FAILED:      'bg-red-100 text-red-600',
  AUDIT:       'bg-amber-100 text-amber-700',
  RE_ENROLL:   'bg-purple-100 text-purple-700',
}

// ── Legacy → TermCode mapping ─────────────────────────────────────────────────

/** Maps the Japanese term strings stored in legacy course/enrollment rows. */
export const LEGACY_TERM_TO_CODE: Record<string, TermCode> = {
  '春学期':    'SPRING',
  '秋学期':    'FALL',
  '第1ターム': 'T1',
  '第2ターム': 'T2',
  '第3ターム': 'T3',
  '第4ターム': 'T4',
  '通年':      'FULL_YEAR',
}

/**
 * Aliases for English / shorthand raw strings that spreadsheets may contain.
 * These are absorbed at the application layer so the spreadsheet never needs
 * to be manually corrected just to fix term format issues.
 *
 * Handled variants:
 *   English full words : spring / Spring / SPRING / fall / Fall / FALL
 *   Short T-codes      : 1T / 2T / 3T / 4T
 *   Year-round aliases : 年間
 */
export const TERM_CODE_ALIASES: Record<string, TermCode> = {
  spring:   'SPRING',
  Spring:   'SPRING',
  fall:     'FALL',
  Fall:     'FALL',
  '1T':     'T1',
  '2T':     'T2',
  '3T':     'T3',
  '4T':     'T4',
  '年間':   'FULL_YEAR',
}

/** Maps the term_code strings that may come from the new enrollment sheet. */
export const TERM_CODE_VALUES = new Set<string>(Object.keys(TERM_LABEL))

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Japanese term string or TermCode → display label. */
export function termCodeToLabel(term: string | null | undefined): string {
  if (!term) return ''
  if (term in TERM_LABEL) return TERM_LABEL[term as TermCode]
  return term // already a Japanese label, pass through
}

/** Returns which semester a term belongs to, from either TermCode or Japanese string. */
export function termToSemester(term: string | null | undefined): Semester | null {
  if (!term) return null
  if (term in TERM_SEMESTER) return TERM_SEMESTER[term as TermCode]
  const code = LEGACY_TERM_TO_CODE[term] ?? TERM_CODE_ALIASES[term]
  return code ? TERM_SEMESTER[code] : null
}

/**
 * Convert a raw term value to a TermCode.
 *
 * Recognises (in priority order):
 *   1. Already a valid TermCode string (e.g. 'T1', 'SPRING')
 *   2. Legacy Japanese strings via LEGACY_TERM_TO_CODE
 *   3. English/shorthand aliases via TERM_CODE_ALIASES
 *
 * Returns null for unrecognised values.
 */
export function toTermCode(raw: string | null | undefined): TermCode | null {
  if (!raw) return null
  const t = raw.trim()
  if (isValidTermCode(t)) return t as TermCode
  return LEGACY_TERM_TO_CODE[t] ?? TERM_CODE_ALIASES[t] ?? null
}

export function isValidTermCode(value: string): value is TermCode {
  return TERM_CODE_VALUES.has(value)
}

/**
 * Returns true when two term values (TermCode or Japanese) can share a time
 * slot without conflicting — i.e. T1+T2 or T3+T4 pairs within same semester.
 */
export function termsAreCompatible(
  termA: string | null | undefined,
  termB: string | null | undefined,
): boolean {
  if (!termA || !termB) return false
  if (termA === termB) return false // same term always conflicts

  const a = toTermCode(termA) ?? termA
  const b = toTermCode(termB) ?? termB
  return COMPATIBLE_TERM_CODES.has(`${a}|${b}`)
}
