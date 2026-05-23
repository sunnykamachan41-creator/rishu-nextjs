'use client'
import { useState, useCallback, useRef } from 'react'
import useSWR from 'swr'

// ── 定数 ──────────────────────────────────────────────────────────────────────

const STATUS_CYCLE  = ['', 'present', 'late', 'absent', 'cancelled']
const STATUS_LABELS = { '': '−', present: '出', late: '遅', absent: '欠', cancelled: '休' }
const STATUS_COLORS = {
  '':         'bg-gray-100 dark:bg-white/[0.08] text-gray-300 dark:text-slate-600',
  present:    'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400',
  late:       'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
  absent:     'bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400',
  cancelled:  'bg-sky-100 dark:bg-sky-500/20 text-sky-400 dark:text-sky-500',
}
const MEMO_MAX = 50

// ── SWR fetcher ───────────────────────────────────────────────────────────────

const fetcher = url => fetch(url).then(r => r.json()).then(d => d.records ?? [])

// ── AttendanceSection ─────────────────────────────────────────────────────────

export default function AttendanceSection({ enrollmentId, sessionCount }) {
  if (!enrollmentId || !sessionCount) return null

  const swrKey = `/api/attendance?enrollment_id=${encodeURIComponent(enrollmentId)}`
  const { data: records = [], mutate, isLoading } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
  })

  // session_number(string) → record
  const recordMap = new Map(records.map(r => [String(r.session_number), r]))

  // インライン詳細: 長押しで開いたセッション番号
  const [openSn, setOpenSn] = useState(null)

  // 長押し検出
  const pressTimer    = useRef(null)
  const didLongPress  = useRef(false)

  const handlePressStart = useCallback((sn) => {
    didLongPress.current = false
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true
      setOpenSn(prev => prev === sn ? null : sn) // トグル
    }, 450)
  }, [])

  const handlePressEnd = useCallback(() => {
    clearTimeout(pressTimer.current)
  }, [])

  // タップ: ステータスをサイクルして即時保存
  const handleTap = useCallback(async (sn) => {
    if (didLongPress.current) return
    const current = recordMap.get(String(sn))?.status || ''
    const idx  = STATUS_CYCLE.indexOf(current)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]

    mutate(prev => {
      if (next === '') return prev.filter(r => String(r.session_number) !== String(sn))
      const exists = prev.find(r => String(r.session_number) === String(sn))
      if (exists) return prev.map(r => String(r.session_number) === String(sn) ? { ...r, status: next } : r)
      return [...prev, { session_number: sn, status: next, memo: recordMap.get(String(sn))?.memo || '' }]
    }, { revalidate: false })

    await fetch('/api/attendance', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        enrollment_id:  enrollmentId,
        session_number: sn,
        status:         next || null,
        memo:           recordMap.get(String(sn))?.memo || '',
      }),
    })
  }, [enrollmentId, recordMap, mutate])

  // 出席率（休講は母数から除外）
  const present   = records.filter(r => r.status === 'present').length
  const late      = records.filter(r => r.status === 'late').length
  const absent    = records.filter(r => r.status === 'absent').length
  const cancelled = records.filter(r => r.status === 'cancelled').length
  const total     = present + late + absent          // 休講除く有効コマ数
  const rate      = total > 0 ? Math.round((present + late * 0.5) / total * 100) : null

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-gray-900 dark:text-slate-100">📋 出席管理</span>
        {rate !== null ? (
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
            rate >= 80
              ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
              : rate >= 60
                ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                : 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'
          }`}>
            出席率 {rate}%
          </span>
        ) : isLoading ? (
          <span className="text-xs text-gray-300 dark:text-slate-600">読み込み中…</span>
        ) : null}
      </div>

      {/* セッションバブルグリッド */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: sessionCount }, (_, i) => {
          const sn     = i + 1
          const status = recordMap.get(String(sn))?.status || ''
          const isOpen = openSn === sn
          return (
            <button
              key={sn}
              onTouchStart={() => handlePressStart(sn)}
              onTouchEnd={handlePressEnd}
              onClick={() => handleTap(sn)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center
                          transition-all active:scale-90 select-none
                          ${STATUS_COLORS[status]}
                          ${isOpen ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}
            >
              <span className="text-[9px] text-gray-300 dark:text-slate-600 leading-none">{sn}</span>
              <span className="text-xs font-bold leading-none mt-0.5">{STATUS_LABELS[status]}</span>
            </button>
          )
        })}
      </div>

      {/* 集計行 */}
      {(total > 0 || cancelled > 0) && (
        <div className="flex gap-3 mt-2 text-[10px] text-gray-400 dark:text-slate-500 flex-wrap">
          <span>出席 {present}</span>
          <span>遅刻 {late}</span>
          <span>欠席 {absent}</span>
          {cancelled > 0 && <span className="text-slate-400 dark:text-slate-500">休講 {cancelled}</span>}
          <span className="ml-auto">記録済 {total + cancelled}/{sessionCount}</span>
        </div>
      )}

      {/* 操作ヒント */}
      {total === 0 && !isLoading && (
        <p className="mt-2 text-[10px] text-gray-300 dark:text-slate-600 text-center">
          タップで記録 · 長押しでコメント追加
        </p>
      )}

      {/* メモ一覧 */}
      {(() => {
        const memoList = Array.from({ length: sessionCount }, (_, i) => i + 1)
          .map(sn => ({ sn, memo: (recordMap.get(String(sn))?.memo || '').trim() }))
          .filter(({ memo }) => memo.length > 0)
        if (memoList.length === 0) return null
        return (
          <div className="mt-3 max-h-36 overflow-y-auto rounded-2xl border border-gray-100 dark:border-white/[0.07]">
            {memoList.map(({ sn, memo }, idx) => (
              <button
                key={sn}
                onClick={() => setOpenSn(prev => prev === sn ? null : sn)}
                className={`w-full flex items-baseline gap-2 px-3 py-2 text-left
                            transition-colors active:bg-blue-50 dark:active:bg-blue-500/10
                            ${idx < memoList.length - 1 ? 'border-b border-gray-100 dark:border-white/[0.06]' : ''}
                            ${openSn === sn ? 'bg-blue-50 dark:bg-blue-500/10' : 'bg-white dark:bg-[#1f2235]'}`}
              >
                <span className="flex-shrink-0 text-[10px] font-bold text-gray-400 dark:text-slate-500 w-10">
                  第{sn}回
                </span>
                <span className="text-xs text-gray-700 dark:text-slate-300 leading-snug truncate">
                  {memo}
                </span>
              </button>
            ))}
          </div>
        )
      })()}

      {/* インライン詳細コメント（長押し or メモ行タップで開く） */}
      {openSn !== null && (
        <InlineComment
          key={openSn}
          sessionNumber={openSn}
          record={recordMap.get(String(openSn))}
          enrollmentId={enrollmentId}
          onClose={() => setOpenSn(null)}
          onSave={(memo) => {
            const sn       = openSn
            const status   = recordMap.get(String(sn))?.status || ''
            const hasRecord = !!recordMap.get(String(sn))
            // メモだけでも楽観更新・保存（未記録回の先行メモを許容）
            mutate(prev => {
              const exists = prev.find(r => String(r.session_number) === String(sn))
              if (exists) {
                // メモ・ステータス両方空 → レコード削除
                if (!memo && !status) return prev.filter(r => String(r.session_number) !== String(sn))
                return prev.map(r => String(r.session_number) === String(sn) ? { ...r, memo } : r)
              }
              if (memo) return [...prev, { session_number: sn, status: '', memo }]
              return prev
            }, { revalidate: false })
            // 既存レコードがある場合は空メモでも API を呼んで削除させる
            if (memo || status || hasRecord) {
              fetch('/api/attendance', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ enrollment_id: enrollmentId, session_number: sn, status: status || null, memo }),
              })
            }
          }}
        />
      )}
    </div>
  )
}

// ── インライン詳細コメント ─────────────────────────────────────────────────────

function InlineComment({ sessionNumber, record, onClose, onSave }) {
  const [text, setText] = useState(record?.memo || '')
  const [saved, setSaved] = useState(false)

  const handleBlur = useCallback(() => {
    const trimmed = text.slice(0, MEMO_MAX)
    onSave(trimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [text, onSave])

  return (
    <div className="mt-3 rounded-2xl bg-gray-50 dark:bg-[#252839] border border-gray-200 dark:border-white/[0.08] p-3 animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400">
          第 {sessionNumber} 回のコメント
        </span>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[10px] text-emerald-500">✓ 保存</span>}
          <button
            onClick={onClose}
            className="text-[10px] text-gray-400 dark:text-slate-500 px-2 py-0.5 rounded-full
                       bg-gray-200 dark:bg-white/[0.08] active:scale-95 transition-all"
          >
            閉じる
          </button>
        </div>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={e => { setText(e.target.value.slice(0, MEMO_MAX)); setSaved(false) }}
        onBlur={handleBlur}
        placeholder="このコマのメモ…"
        rows={3}
        className="w-full bg-transparent text-sm text-gray-800 dark:text-slate-200
                   placeholder-gray-300 dark:placeholder-slate-600
                   resize-none leading-relaxed outline-none"
      />
      <div className="flex justify-end">
        <span className={`text-[10px] ${
          text.length >= MEMO_MAX ? 'text-red-400' : 'text-gray-300 dark:text-slate-600'
        }`}>{text.length} / {MEMO_MAX}</span>
      </div>
    </div>
  )
}
