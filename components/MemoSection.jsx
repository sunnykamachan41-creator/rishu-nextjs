'use client'
import { useState } from 'react'
import useSWR from 'swr'

const fetcher = url => fetch(url).then(r => r.json()).then(d => d.records ?? [])

// デフォルトで見せるセッションメモ数
const SESSION_PREVIEW = 2

// ── 1科目分のメモカード ──────────────────────────────────────────────────────────

function CourseMemoCard({ enrollment, courseName }) {
  const [expanded, setExpanded] = useState(false)

  // 出席セッションメモを取得（enrollment_id がある場合のみ）
  const { data: attendance = [] } = useSWR(
    enrollment.enrollment_id
      ? `/api/attendance?enrollment_id=${encodeURIComponent(enrollment.enrollment_id)}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  const courseMemo   = enrollment.memo?.trim() || ''
  const sessionMemos = attendance
    .filter(r => r.memo?.trim())
    .sort((a, b) => Number(b.session_number) - Number(a.session_number))

  // 両方ともなければ非表示
  if (!courseMemo && sessionMemos.length === 0) return null

  const visibleMemos  = expanded ? sessionMemos : sessionMemos.slice(0, SESSION_PREVIEW)
  const hiddenCount   = sessionMemos.length - SESSION_PREVIEW
  const hasMore       = !expanded && hiddenCount > 0

  return (
    <div className="bg-white dark:bg-[#1a1d27] rounded-2xl px-3 py-3 shadow-sm dark:shadow-none space-y-2">

      {/* 科目名 */}
      <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-100 leading-tight">
        {courseName}
      </div>

      {/* 全体メモ */}
      {courseMemo && (
        <div className="flex gap-2 items-start">
          <span className="flex-shrink-0 mt-0.5 text-[10px] font-bold text-gray-400 dark:text-slate-500
                           bg-gray-100 dark:bg-white/[0.08] px-1.5 py-0.5 rounded-full leading-none">
            全体
          </span>
          <span className="text-[12px] text-gray-600 dark:text-slate-400 leading-relaxed line-clamp-3">
            {courseMemo}
          </span>
        </div>
      )}

      {/* セッションメモ一覧 */}
      {visibleMemos.map(r => (
        <div key={r.session_number} className="flex gap-2 items-start">
          <span className="flex-shrink-0 mt-0.5 text-[10px] font-bold text-indigo-500 dark:text-indigo-400
                           bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap">
            第{r.session_number}回
          </span>
          <span className="flex-1 min-w-0 text-[12px] text-gray-600 dark:text-slate-400 leading-relaxed line-clamp-2">
            {r.memo.trim()}
          </span>
        </div>
      ))}

      {/* 展開 / 折りたたみボタン */}
      {(hasMore || expanded) && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-center gap-1 pt-0.5
                     text-[11px] font-semibold text-indigo-400 dark:text-indigo-500
                     hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
        >
          {expanded ? (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
              折りたたむ
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              他{hiddenCount}件を表示
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ── メインセクション ─────────────────────────────────────────────────────────────

/**
 * ダッシュボードの授業メモセクション。
 * 時間割タブで選択中の学年・学期に絞って表示。
 * メモが1件もない学期は表示しない。
 *
 * Props:
 *   enrollment         — data.enrollment 配列
 *   courses            — data.courses 配列
 *   selectedGrade      — 時間割で選択中の学年 (1–4+)
 *   timetableTermFilter — '春学期' | '秋学期'
 *   academicYear       — 表示用西暦年度 (0 なら非表示)
 */
export default function MemoSection({
  enrollment,
  courses,
  selectedGrade,
  timetableTermFilter,
  academicYear,
}) {
  const semKey   = timetableTermFilter === '秋学期' ? 'fall'   : 'spring'
  const semLabel = timetableTermFilter === '秋学期' ? '後期' : '前期'

  // 現在の学年・学期の履修のみ
  const currentEnrollments = (enrollment ?? []).filter(e =>
    e.year     === selectedGrade &&
    e.semester === semKey
  )

  // コースレベルのメモが最低1件あるか確認（即時チェック）
  const hasAnyCourseMemo = currentEnrollments.some(e => e.memo?.trim())

  // 何も履修していない or コースメモが皆無 → セクション非表示
  // （出席メモは非同期なので、コースメモ基準で表示判定する）
  if (currentEnrollments.length === 0 || !hasAnyCourseMemo) return null

  // class_id → course_name
  const courseMap = new Map((courses ?? []).map(c => [c.class_id, c.course_name]))

  return (
    <div className="px-3 mt-3">

      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-gray-400 dark:text-slate-500">
          授業メモ
        </span>
        {academicYear > 0 && (
          <span className="text-[10px] text-gray-300 dark:text-slate-600">
            {academicYear}年度 {semLabel}
          </span>
        )}
      </div>

      {/* カード一覧 */}
      <div className="space-y-2">
        {currentEnrollments.map(e => (
          <CourseMemoCard
            key={e.enrollment_id ?? e.class_id}
            enrollment={e}
            courseName={courseMap.get(e.class_id) ?? e.class_id}
          />
        ))}
      </div>
    </div>
  )
}
