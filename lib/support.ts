// ── Types ─────────────────────────────────────────────────────────────────────

export type InquiryCategory =
  | 'course_request'
  | 'bug_report'
  | 'feature_request'
  | 'other'

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface SupportTicket {
  id:               string
  created_at:       string
  user_id:          string
  inquiry_category: InquiryCategory
  title:            string
  message:          string
  status:           TicketStatus
  admin_reply:      string
  updated_at:       string
  notification_sent?: string
  // 授業追加依頼の構造化フィールド（シートの列順: K〜Q）
  course_name?:     string
  term?:            string
  day_period?:      string
  teacher_name?:    string
  academic_year?:   string
  classroom?:       string   // P列
  class_number?:    string   // Q列
}

// ── Category helpers ──────────────────────────────────────────────────────────

export const CATEGORY_OPTIONS: { value: InquiryCategory; label: string }[] = [
  { value: 'course_request',  label: '授業追加依頼' },
  { value: 'bug_report',      label: '不具合報告'   },
  { value: 'feature_request', label: '改善提案'     },
  { value: 'other',           label: 'その他'       },
]

export function categoryLabel(cat: InquiryCategory | string): string {
  return CATEGORY_OPTIONS.find(o => o.value === cat)?.label ?? cat
}

// ── Status helpers ────────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; bg: string; text: string }
> = {
  open:        { label: '受付中',   bg: 'bg-blue-100 dark:bg-blue-500/20',   text: 'text-blue-700 dark:text-blue-300'   },
  in_progress: { label: '対応中',   bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-700 dark:text-amber-300' },
  resolved:    { label: '解決済み', bg: 'bg-green-100 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-400' },
  closed:      { label: 'クローズ', bg: 'bg-gray-100 dark:bg-white/[0.08]',  text: 'text-gray-500 dark:text-slate-400'  },
}

export function statusConfig(status: TicketStatus | string) {
  return STATUS_CONFIG[status as TicketStatus] ?? STATUS_CONFIG.open
}

// ── Date formatting ───────────────────────────────────────────────────────────

export function formatTicketDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Course request helpers ────────────────────────────────────────────────────

/** シートの term フィールドと同じ表記（第1ターム形式） */
export const TERM_OPTIONS = [
  '春学期', '秋学期',
  '第1ターム', '第2ターム', '第3ターム', '第4ターム',
  '通年',
] as const

export const DAY_OPTIONS    = ['月', '火', '水', '木', '金'] as const
export const PERIOD_OPTIONS = [1, 2, 3, 4, 5] as const

/** 開講年度の選択肢（2023〜当年） */
export function getAcademicYearOptions(): number[] {
  const end = new Date().getFullYear()
  return Array.from({ length: end - 2023 + 1 }, (_, i) => 2023 + i)
}

// ── 教室データ（EmptyRooms.jsx と同じ定義）────────────────────────────────────

export const CLASSROOM_GROUPS: Record<string, string[]> = {
  'N棟': [
    'N101','N102','N103','N104','N105','N106','N107',
    'N201','N202','N203','N204','N205','N206','N207',
    'N301','N302','N303','N304','N305','N306','N307',
    'N401','N402','N403','N404','N405','N406','N407','N410','N411',
  ],
  'C棟': [
    'C102','C103',
    'C201','C202','C203','C204',
    'C301','C302','C303',
    'C401','C402',
  ],
  'S棟': [
    'S101','S102','S103','S104','S105','S106','S107',
    'S201','S202','S203','S204','S205','S206','S207',
    'S301','S302','S303','S304','S305','S306','S307','S310',
    'S401','S402','S403','S404','S405','S406','S407','S410',
  ],
  'W棟': [
    'W110','W201','W301','W302',
  ],
}
