'use client'
import { useState, useCallback, useRef } from 'react'
import useSWR from 'swr'

// ── 定数 ──────────────────────────────────────────────────────────────────────

const STATUS_CYCLE  = ['', 'present', 'late', 'absent']
const STATUS_LABELS = { '': '−', present: '出', late: '遅', absent: '欠' }
const STATUS_COLORS = {
  '':       'bg-gray-100 dark:bg-white/[0.08] text-gray-300 dark:text-slate-600',
  present:  'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400',
  late:     'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
  absent:   'bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400',
}
const MEMO_MAX = 200

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

  // 出席率
  const present = records.filter(r => r.status === 'present').length
  const late    = records.filter(r => r.status === 'late').length
  const absent  = records.filter(r => r.status === 'absent').length
  const total   = present + late + absent
  const rate    = total > 0 ? Math.round((present + late * 0.5) / total * 100) : null

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
      {total > 0 && (
        <div className="flex gap-3 mt-2 text-[10px] text-gray-400 dark:text-slate-500">
          <span>出席 {present}</span>
          <span>遅刻 {late}</span>
          <span>欠席 {absent}</span>
          <span className="ml-auto">記録済 {total}/{sessionCount}</span>
        </div>
      )}

      {/* 操作ヒント */}
      {total === 0 && !isLoading && (
        <p className="mt-2 text-[10px] text-gray-300 dark:text-slate-600 text-center">
          タップで出席状況を記録 · 長押しでコメント
        </p>
      )}

      {/* インライン詳細コメント（長押しで開く） */}
      {openSn !== null && (
        <InlineComment
          key={openSn}
          sessionNumber={openSn}
          record={recordMap.get(String(openSn))}
          enrollmentId={enrollmentId}
          onClose={() => setOpenSn(null)}
          onSave={(memo) => {
            const sn     = openSn
            const status = recordMap.get(String(sn))?.status || ''
            mutate(prev => {
              const exists = prev.find(r => String(r.session_number) === String(sn))
              if (exists) return prev.map(r => String(r.session_number) === String(sn) ? { ...r, memo } : r)
              return prev
            }, { revalidate: false })
            if (status) {
              fetch('/api/attendance', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ enrollment_id: enrollmentId, session_number: sn, status, memo }),
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
