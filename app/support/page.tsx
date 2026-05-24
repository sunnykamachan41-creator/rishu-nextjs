'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter }  from 'next/navigation'
import StatusBadge    from '@/components/support/StatusBadge'
import {
  CATEGORY_OPTIONS,
  TERM_OPTIONS,
  DAY_OPTIONS,
  PERIOD_OPTIONS,
  CLASSROOM_GROUPS,
  getAcademicYearOptions,
  categoryLabel,
  formatTicketDate,
  type InquiryCategory,
  type SupportTicket,
} from '@/lib/support'

// ── 共通 select スタイル ──────────────────────────────────────────────────────

const SELECT_CLASS = [
  'w-full bg-white dark:bg-slate-800',
  'border border-gray-200 dark:border-slate-700',
  'rounded-2xl px-4 py-3',
  'text-[14px] text-gray-900 dark:text-slate-100',
  'focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600',
  'transition-shadow appearance-none cursor-pointer',
].join(' ')

// ── 曜日時限セレクター ────────────────────────────────────────────────────────

function DayPeriodPicker({
  value,
  onChange,
}: {
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div className="overflow-x-auto -mx-0.5 px-0.5">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns: `auto repeat(${DAY_OPTIONS.length}, minmax(0,1fr))` }}
      >
        {/* ヘッダー行 */}
        <div />
        {DAY_OPTIONS.map(d => (
          <div key={d} className="text-center text-[11px] font-bold text-gray-400 dark:text-slate-500 pb-1.5">
            {d}
          </div>
        ))}

        {/* データ行：flatMap でフラグメント不要 */}
        {PERIOD_OPTIONS.flatMap(p => [
          <div key={`lbl-${p}`} className="flex items-center justify-center text-[11px] font-bold
                                            text-gray-400 dark:text-slate-500 pr-1">
            {p}限
          </div>,
          ...DAY_OPTIONS.map(d => {
            const v   = `${d}${p}`
            const sel = value === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => onChange(sel ? '' : v)}
                className={`m-0.5 h-8 rounded-xl text-[12px] font-semibold transition-all
                  ${sel
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                  }`}
              >
                {v}
              </button>
            )
          }),
        ])}
      </div>
    </div>
  )
}

// ── 授業追加依頼フィールド ────────────────────────────────────────────────────

interface CourseInfo {
  course_name:   string
  term:          string
  day_period:    string
  teacher_name:  string
  academic_year: string
  classroom:     string
  class_number:  string
}

function CourseRequestFields({
  value,
  onChange,
}: {
  value:    CourseInfo
  onChange: (patch: Partial<CourseInfo>) => void
}) {
  const yearOptions = getAcademicYearOptions()

  return (
    <div className="space-y-4">
      {/* 注意書き */}
      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30
                      rounded-2xl px-4 py-3.5">
        <p className="text-[12px] text-amber-800 dark:text-amber-300 leading-relaxed font-medium whitespace-pre-line">
          {`※大学で正式に開講されている、単位を伴う授業のみ登録可能です。\nアルバイト・私用予定・ゼミ・サークル等は登録できません。`}
        </p>
      </div>

      {/* 授業名 */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          授業名 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={value.course_name}
          onChange={e => onChange({ course_name: e.target.value })}
          placeholder="例：教育心理学特論"
          className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700
                     rounded-2xl px-4 py-3 text-[14px] text-gray-900 dark:text-slate-100
                     placeholder-gray-300 dark:placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600
                     transition-shadow"
        />
      </div>

      {/* 教員名 */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          教員名 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={value.teacher_name}
          onChange={e => onChange({ teacher_name: e.target.value })}
          placeholder="例：山田 太郎"
          className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700
                     rounded-2xl px-4 py-3 text-[14px] text-gray-900 dark:text-slate-100
                     placeholder-gray-300 dark:placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600
                     transition-shadow"
        />
      </div>

      {/* 開講年度 ② → select */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          開講年度 <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <select
            value={value.academic_year}
            onChange={e => onChange({ academic_year: e.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">選択してください</option>
            {yearOptions.map(y => (
              <option key={y} value={String(y)}>{y}年度</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 開講時期 ② → select */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          開講時期 <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <select
            value={value.term}
            onChange={e => onChange({ term: e.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">選択してください</option>
            {TERM_OPTIONS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 曜日時限 */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-2">
          曜日時限 <span className="text-red-400">*</span>
          {value.day_period && (
            <span className="ml-2 text-indigo-500 dark:text-indigo-400 font-bold">
              {value.day_period}
            </span>
          )}
        </label>
        <DayPeriodPicker
          value={value.day_period}
          onChange={dp => onChange({ day_period: dp })}
        />
      </div>

      {/* 教室 ③ → select（必須） */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          教室 <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <select
            value={value.classroom}
            onChange={e => onChange({ classroom: e.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">選択してください</option>
            {Object.entries(CLASSROOM_GROUPS).map(([building, rooms]) => (
              <optgroup key={building} label={building}>
                {rooms.map(r => <option key={r} value={r}>{r}</option>)}
              </optgroup>
            ))}
            <option value="その他">その他</option>
          </select>
          <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* クラス（わかれば） */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          クラス・対象学科
          <span className="ml-1.5 text-[11px] font-normal text-gray-300 dark:text-slate-600">任意</span>
        </label>
        <input
          type="text"
          value={value.class_number}
          onChange={e => onChange({ class_number: e.target.value })}
          placeholder="例：1、A類数学/A類英語"
          className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700
                     rounded-2xl px-4 py-3 text-[14px] text-gray-900 dark:text-slate-100
                     placeholder-gray-300 dark:placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600
                     transition-shadow"
        />
      </div>
    </div>
  )
}

// ── 送信フォーム ──────────────────────────────────────────────────────────────

const EMPTY_COURSE: CourseInfo = {
  course_name: '', term: '', day_period: '',
  teacher_name: '', academic_year: '', classroom: '', class_number: '',
}

function SubmitForm() {
  const [category,   setCategory]   = useState<InquiryCategory>('course_request')
  const [courseInfo, setCourseInfo] = useState<CourseInfo>(EMPTY_COURSE)
  const [title,      setTitle]      = useState('')
  const [message,    setMessage]    = useState('')
  const [busy,       setBusy]       = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [toast,      setToast]      = useState(false)

  const isCourseRequest = category === 'course_request'

  const isCourseValid = !isCourseRequest || (
    courseInfo.course_name.trim()  !== '' &&
    courseInfo.term                !== '' &&
    courseInfo.day_period          !== '' &&
    courseInfo.teacher_name.trim() !== '' &&
    courseInfo.academic_year       !== '' &&
    courseInfo.classroom           !== ''
  )

  const canSubmit =
    title.trim() !== '' &&
    (isCourseRequest || message.trim() !== '') &&
    isCourseValid &&
    !busy

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, string> = {
        inquiry_category: category,
        title:            title.trim(),
        message:          message.trim(),
      }
      if (isCourseRequest) {
        body.course_name   = courseInfo.course_name.trim()
        body.term          = courseInfo.term
        body.day_period    = courseInfo.day_period
        body.teacher_name  = courseInfo.teacher_name.trim()
        body.academic_year = courseInfo.academic_year
        body.classroom     = courseInfo.classroom
        body.class_number  = courseInfo.class_number.trim()
      }

      const res  = await fetch('/api/support/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '送信に失敗しました')

      setTitle('')
      setMessage('')
      setCourseInfo(EMPTY_COURSE)
      setCategory('course_request')
      setToast(true)
      setTimeout(() => setToast(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setBusy(false)
    }
  }, [canSubmit, category, isCourseRequest, title, message, courseInfo])

  return (
    <div className="space-y-4 px-4 py-5">

      {/* カテゴリ */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          カテゴリ
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategory(opt.value)}
              className={`py-2.5 px-3 rounded-2xl text-[13px] font-semibold border-2 transition-all text-left
                ${category === opt.value
                  ? 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300'
                  : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-gray-600 dark:text-slate-300'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 授業追加依頼：構造化フィールド */}
      {isCourseRequest && (
        <CourseRequestFields
          value={courseInfo}
          onChange={patch => setCourseInfo(prev => ({ ...prev, ...patch }))}
        />
      )}

      {/* タイトル */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          タイトル <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, 100))}
          placeholder={isCourseRequest ? '例：教育心理学特論の追加をお願いします' : '例：カレンダーの表示がおかしい'}
          className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700
                     rounded-2xl px-4 py-3 text-[14px] text-gray-900 dark:text-slate-100
                     placeholder-gray-300 dark:placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600
                     transition-shadow"
        />
        <div className="flex justify-end mt-1">
          <span className={`text-[11px] ${title.length >= 90 ? 'text-red-400' : 'text-gray-300 dark:text-slate-600'}`}>
            {title.length} / 100
          </span>
        </div>
      </div>

      {/* 内容 */}
      <div>
        <label className="block text-[12px] font-semibold text-gray-500 dark:text-slate-400 mb-1.5">
          {isCourseRequest ? '備考' : '内容'}
          {isCourseRequest
            ? <span className="ml-1.5 text-[11px] font-normal text-gray-300 dark:text-slate-600">任意</span>
            : <span className="text-red-400 ml-0.5">*</span>
          }
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value.slice(0, 2000))}
          placeholder={isCourseRequest
            ? '担当学科や時間割コードなど、補足があれば…'
            : '詳しく教えてください…'
          }
          rows={isCourseRequest ? 3 : 6}
          className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700
                     rounded-2xl px-4 py-3 text-[14px] text-gray-900 dark:text-slate-100
                     placeholder-gray-300 dark:placeholder-slate-500 resize-none leading-relaxed
                     focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600
                     transition-shadow"
        />
        <div className="flex justify-end mt-1">
          <span className={`text-[11px] ${message.length >= 1800 ? 'text-red-400' : 'text-gray-300 dark:text-slate-600'}`}>
            {message.length} / 2000
          </span>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <p className="text-[13px] text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10
                      rounded-2xl px-4 py-3">
          {error}
        </p>
      )}

      {/* 送信ボタン */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3.5 rounded-2xl text-[15px] font-bold transition-all
          ${!canSubmit
            ? 'bg-gray-100 dark:bg-slate-800 text-gray-300 dark:text-slate-600 cursor-not-allowed'
            : 'bg-indigo-500 hover:bg-indigo-600 active:scale-[0.99] text-white shadow-sm'
          }`}
      >
        {busy ? '送信中…' : '送信する'}
      </button>

      {/* 注記 */}
      <p className="text-[11px] text-gray-300 dark:text-slate-600 text-center leading-relaxed">
        送信内容はスタッフが確認します。返信はアプリ内の送信履歴に表示されます。
      </p>

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3
                        bg-gray-900 dark:bg-white text-white dark:text-gray-900
                        rounded-2xl text-[14px] font-semibold shadow-xl
                        animate-slide-up pointer-events-none whitespace-nowrap">
          ✓ 送信しました！
        </div>
      )}
    </div>
  )
}

// ── 授業情報テーブル（履歴カード用） ─────────────────────────────────────────

function CourseInfoTable({ ticket }: { ticket: SupportTicket }) {
  if (!ticket.course_name) return null

  const rows: [string, string | undefined][] = [
    ['授業名',   ticket.course_name],
    ['教員名',   ticket.teacher_name],
    ['開講年度', ticket.academic_year ? `${ticket.academic_year}年度` : undefined],
    ['開講時期', ticket.term],
    ['曜日時限', ticket.day_period],
    ['教室',     ticket.classroom],
    ['クラス',   ticket.class_number || undefined],
  ]

  return (
    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl overflow-hidden">
      {rows.filter(([, v]) => v).map(([label, val]) => (
        <div key={label} className="flex items-baseline gap-2 px-3 py-2
                                     border-b border-gray-100 dark:border-slate-700 last:border-0">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 w-14 flex-shrink-0">
            {label}
          </span>
          <span className="text-[13px] text-gray-700 dark:text-slate-300">
            {val}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── 送信履歴カード ────────────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm">
      <button
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 active:bg-gray-50 dark:active:bg-slate-700 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge status={ticket.status} />
            <span className="text-[11px] text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-700
                             px-2 py-0.5 rounded-full">
              {categoryLabel(ticket.inquiry_category)}
            </span>
          </div>
          <p className="text-[14px] font-semibold text-gray-900 dark:text-slate-100 truncate">
            {ticket.title}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
            {formatTicketDate(ticket.created_at)}
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-300 dark:text-slate-600 flex-shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50 dark:border-slate-700 pt-3">

          {/* 授業情報（course_request のみ） */}
          {ticket.inquiry_category === 'course_request' && (
            <CourseInfoTable ticket={ticket} />
          )}

          {/* 送信内容 */}
          {ticket.message && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 mb-1">
                {ticket.inquiry_category === 'course_request' ? '備考' : '送信内容'}
              </p>
              <p className="text-[13px] text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {ticket.message}
              </p>
            </div>
          )}

          {/* 管理者返信 */}
          {ticket.admin_reply && (
            <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl px-3 py-2.5">
              <p className="text-[11px] font-semibold text-indigo-500 dark:text-indigo-400 mb-1">返信</p>
              <p className="text-[13px] text-gray-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {ticket.admin_reply}
              </p>
              {ticket.updated_at && ticket.updated_at !== ticket.created_at && (
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                  {formatTicketDate(ticket.updated_at)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 送信履歴タブ ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/support/list')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setTickets(d.tickets ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-center text-[13px] text-red-400 py-10 px-4">{error}</p>
    )
  }

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 gap-3">
        <span className="text-4xl">📭</span>
        <p className="text-[14px] text-gray-400 dark:text-slate-500 text-center">
          送信履歴はありません
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-2.5">
      {tickets.map(t => (
        <TicketCard key={t.id} ticket={t} />
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'submit' | 'history'

export default function SupportPage() {
  const router  = useRouter()
  const [tab, setTab] = useState<Tab>('submit')

  return (
    <div
      className="h-full bg-gray-50 dark:bg-[#12141e] flex flex-col"
      style={{ maxWidth: 430, margin: '0 auto' }}
    >
      {/* ヘッダー */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.06]
                      px-4 pt-safe-top safe-top">
        <div className="flex items-center gap-3 h-14">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl text-gray-400 dark:text-slate-400
                       active:bg-gray-100 dark:active:bg-white/[0.08] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-[16px] font-bold text-gray-900 dark:text-slate-100">
            お問い合わせ / 改善提案
          </h1>
        </div>

        {/* タブ */}
        <div className="flex gap-0 pb-0 -mb-px">
          {([['submit', '送信する'], ['history', '送信履歴']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[13px] font-semibold border-b-2 transition-colors
                ${tab === t
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-400 dark:text-slate-500'
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {tab === 'submit'  && <SubmitForm />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  )
}
