/**
 * exemptionStore.ts
 *
 * 単位認定（Exemption）の型定義・localStorage 管理・定数。
 *
 * ─── enrollment との分離原則 ───────────────────────────────────────────────────
 *  - 履修データ（selectedIds / entries）とは完全に別ストレージ ('rishu_exemptions')
 *  - useCreditSummary の集計ステップでのみ統合する
 *  - 時間割 UI には一切表示しない
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 型定義
// ═══════════════════════════════════════════════════════════════════════════════

export type ExemptionType =
  | 'CL_SECOND_LANG_SKIP'   // 第二外国語 外部試験
  | 'CL_ENGLISH_730'        // TOEIC 730 / 英検 準一級
  | 'CL_ENGLISH_600'        // TOEIC 600 / 英検 二級

export interface Exemption {
  id:               string
  exemptionType:    ExemptionType
  language?:        string                    // CL_SECOND_LANG_SKIP のみ（言語キー）
  appliedCourseIds: string[]                  // 認定対象の courseId 一覧（recognized_courses 削除時に使用）
  /** カテゴリ → 認定単位数。表示専用（単位計算はサーバー側 recognized_courses 経由） */
  categoryCredits:  Record<string, number>
  label:            string                    // 表示用ラベル
  addedAt:          string                    // ISO 日時文字列
}

export interface ExemptionDef {
  label:       string
  description: string
  /** カテゴリ → 上限単位 */
  caps:        Record<string, number>
}

// ═══════════════════════════════════════════════════════════════════════════════
// 認定タイプ定義
// ═══════════════════════════════════════════════════════════════════════════════

export const EXEMPTION_DEFS: Record<ExemptionType, ExemptionDef> = {
  CL_SECOND_LANG_SKIP: {
    label:       '第二外国語 外部試験',
    description: '第二外国語科目（CL_SEC）を4単位認定',
    caps:        { CL_SEC: 4 },
  },
  CL_ENGLISH_730: {
    label:       'TOEIC 730点 / 英検 準一級',
    description: '英語必修2単位・英語選択4単位を認定',
    caps:        { CL_ENG_MAN: 2, CL_ENG_OP: 4 },
  },
  CL_ENGLISH_600: {
    label:       'TOEIC 600点 / 英検 二級',
    description: '英語必修1単位を認定',
    caps:        { CL_ENG_MAN: 1 },
  },
}

export const EXEMPTION_TYPE_ORDER: ExemptionType[] = [
  'CL_SECOND_LANG_SKIP',
  'CL_ENGLISH_730',
  'CL_ENGLISH_600',
]

// ═══════════════════════════════════════════════════════════════════════════════
// 認定対象 course_id マッピング
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 英語認定（CL_ENGLISH_730 / CL_ENGLISH_600）対象のコース ID（カテゴリ別）。
 * 存在するカテゴリのみ定義すればよい。フォールバックは raw_category / tags 判定。
 */
export const EXEMPTION_COURSE_IDS: Partial<Record<string, string[]>> = {
  CL_ENG_MAN: ['70020100', '70020200'],
  CL_ENG_OP: [
    '70022700', '70022800', '70022900', '70023000', '70023100',
    '70023200', '70023300', '70023400', '70023500', '70023600',
    '70023700', '70023800', '70023900',
  ],
}

/**
 * 第二外国語 認定対象 course_id（言語キー別・完全定義）。
 *
 * ルール
 *  - course_id ベースで管理（class_id の section 番号は除去済み）
 *  - tags に 'CL_SEC' を持つ科目のみ対象
 *  - 名前検索フォールバックは使用しない
 *  - 同一 course_id の複数クラスは 1 科目として扱う
 */
export const SECOND_LANG_COURSE_IDS: Record<string, string[]> = {
  de: ['70020300', '70020400', '70020500', '70020600'], // ドイツ語基礎Ⅰ〜Ⅳ
  fr: ['70020700', '70020800', '70020900', '70021000'], // フランス語基礎Ⅰ〜Ⅳ
  zh: ['70021100', '70021200', '70021300', '70021400'], // 中国語基礎Ⅰ〜Ⅳ
  ko: ['70021500', '70021600', '70021700', '70021800'], // コリア語基礎Ⅰ〜Ⅳ
  it: ['70021900', '70022000', '70022100', '70022200'], // イタリア語基礎Ⅰ〜Ⅳ
  es: ['70022300', '70022400', '70022500', '70022600'], // スペイン語基礎Ⅰ〜Ⅳ
}

// ═══════════════════════════════════════════════════════════════════════════════
// 第二外国語 言語オプション
// ═══════════════════════════════════════════════════════════════════════════════

export interface LangOption {
  key:   string
  label: string
}

export const SECOND_LANG_OPTIONS: LangOption[] = [
  { key: 'de', label: 'ドイツ語'    },
  { key: 'fr', label: 'フランス語'  },
  { key: 'zh', label: '中国語'      },
  { key: 'es', label: 'スペイン語'  },
  { key: 'ko', label: 'コリア語'    },
  { key: 'it', label: 'イタリア語'  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// localStorage CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'rishu_exemptions'

export function loadExemptions(): Exemption[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as Exemption[]) : []
  } catch {
    return []
  }
}

export function saveExemptions(list: Exemption[]): Exemption[] {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch {}
  return list
}

export function addExemption(data: Omit<Exemption, 'id' | 'addedAt'>): Exemption[] {
  const all = loadExemptions()
  const item: Exemption = {
    ...data,
    id:      Date.now().toString(),
    addedAt: new Date().toISOString(),
  }
  return saveExemptions([...all, item])
}

export function removeExemption(id: string): Exemption[] {
  return saveExemptions(loadExemptions().filter(e => e.id !== id))
}
