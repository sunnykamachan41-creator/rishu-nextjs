'use client'
import { useState, useEffect } from 'react'
import { parseGradeSemester, enumerateLeaveSemesters } from '@/lib/leavePeriods'

// ── 定数 ──────────────────────────────────────────────────────────────────────

const GRADE_OPTIONS = [1, 2, 3, 4, 5, 6]
const SEM_OPTIONS = [
  { value: 'spring', label: '春学期' },
  { value: 'fall',   label: '秋学期' },
]

// ── ユーティリティ ─────────────────────────────────────────────────────────────

/** "{grade}_{semester}" → 表示用ラベル ("3年秋") */
function formatGS(s) {
  const gs = parseGradeSemester(s)
  if (!gs) return s
  return `${gs.grade}年${gs.semester === 'spring' ? '春' : '秋'}`
}

/** leave_start / leave_end → 表示文字列 */
function formatPeriod(leave_start, leave_end) {
  return `${formatGS(leave_start)} 〜 ${formatGS(leave_end)}（復学）`
}

/** 開始 < 終了 かどうか（同一学期は NG） */
function isValidRange(sg, ss, eg, es) {
  const startNum = sg * 2 + (ss === 'spring' ? 0 : 1)
  const endNum   = eg * 2 + (es === 'spring' ? 0 : 1)
  return endNum > startNum
}

/** 休学学期数を算出 */
function countLeaveSems(sg, ss, eg, es) {
  try {
    return enumerateLeaveSemesters(
      { grade: sg, semester: ss },
      { grade: eg, semester: es },
    ).length
  } catch {
    return 0
  }
}

// ── セレクト ──────────────────────────────────────────────────────────────────

function Sel({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex-1 text-sm rounded-xl border border-gray-200 dark:border-white/[0.07]
                 bg-white dark:bg-[#1a1d27] text-gray-800 dark:text-slate-200
                 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ── LeavePeriodModal ──────────────────────────────────────────────────────────

/**
 * 休学期間管理モーダル（ボトムシート）
 *
 * Props:
 *   rawLeavePeriods  - { leave_start, leave_end }[] — 現在の休学期間（SWR から）
 *   onSaved          - 保存/削除後に呼ぶコールバック（SWR mutate をトリガー）
 *   onClose          - 閉じるコールバック
 */
export default function LeavePeriodModal({ rawLeavePeriods = [], onSaved, onClose }) {
  // ローカル state（API 操作後に楽観的更新）
  const [periods, setPeriods] = useState(rawLeavePeriods)
  const [addMode, setAddMode]   = useState(false)

  // 追加フォームの選択値（デフォルト: 3年秋 〜 4年春）
  const [startGrade, setStartGrade] = useState(3)
  const [startSem,   setStartSem]   = useState('fall')
  const [endGrade,   setEndGrade]   = useState(4)
  const [endSem,     setEndSem]     = useState('spring')

  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState(null)

  // SWR の再検証で rawLeavePeriods prop が更新されたとき（追加・削除直後）に
  // ローカル state を同期する。addMode 中は上書きしない（フォーム入力を保護）。
  useEffect(() => {
    if (!addMode) {
      setPeriods(rawLeavePeriods)
    }
  }, [rawLeavePeriods]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 追加 ─────────────────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!isValidRange(startGrade, startSem, endGrade, endSem)) {
      setError('終了は開始より後の学期を選択してください')
      return
    }
    const leave_start = `${startGrade}_${startSem}`
    const leave_end   = `${endGrade}_${endSem}`

    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/leave-periods', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'add', leave_start, leave_end }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      // 楽観的更新（同じ leave_start があれば上書き）
      setPeriods(prev => [
        ...prev.filter(p => p.leave_start !== leave_start),
        { leave_start, leave_end },
      ])
      setAddMode(false)
      onSaved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // ── 削除 ─────────────────────────────────────────────────────────────────────

  async function handleRemove(leave_start) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/leave-periods', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'remove', leave_start }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      setPeriods(prev => prev.filter(p => p.leave_start !== leave_start))
      onSaved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // ── レンダリング ──────────────────────────────────────────────────────────────

  const valid    = isValidRange(startGrade, startSem, endGrade, endSem)
  const semCount = valid ? countLeaveSems(startGrade, startSem, endGrade, endSem) : 0

  return (
    <div className="fixed inset-0 z-[60] flex items-end"
      style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full bg-white dark:bg-[#1f2235] rounded-t-3xl flex flex-col"
        style={{ maxHeight: '88dvh' }}>

        {/* ドラッグハンドル */}
        <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mt-3 flex-shrink-0" />

        {/* ヘッダー */}
        <div className="flex-shrink-0 flex items-start px-5 pt-3 pb-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="flex-1">
            <div className="text-base font-bold text-gray-900 dark:text-slate-100">休学期間</div>
            <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              休学中の学期は履修登録がロックされます
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-slate-500 text-xl leading-none p-1 ml-2">×</button>
        </div>

        {/* スクロールエリア */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">

          {/* 既存の休学期間リスト */}
          {periods.length === 0 && !addMode && (
            <div className="text-center py-10 text-gray-400 dark:text-slate-500">
              <div className="text-4xl mb-2">🏠</div>
              <div className="text-sm font-medium">休学期間が登録されていません</div>
              <div className="text-xs mt-1 text-gray-300 dark:text-slate-600">
                休学した場合は下のボタンから追加してください
              </div>
            </div>
          )}

          <div className="space-y-2 mb-3">
            {periods.map(p => {
              const start = parseGradeSemester(p.leave_start)
              const end   = parseGradeSemester(p.leave_end)
              const count = (start && end) ? enumerateLeaveSemesters(start, end).length : 0
              return (
                <div key={p.leave_start}
                  className="flex items-center gap-3 bg-purple-50 dark:bg-purple-500/10
                             border border-purple-100 dark:border-purple-500/20 rounded-2xl px-4 py-3">
                  {/* アイコン */}
                  <span className="text-lg flex-shrink-0">🏠</span>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                      {formatPeriod(p.leave_start, p.leave_end)}
                    </div>
                    <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                      {count} 学期間の休学
                    </div>
                  </div>

                  {/* 削除ボタン */}
                  <button
                    onClick={() => handleRemove(p.leave_start)}
                    disabled={busy}
                    className="w-7 h-7 flex items-center justify-center rounded-full
                               bg-red-50 dark:bg-red-500/10 text-red-400 hover:text-red-600
                               disabled:opacity-40 transition-colors flex-shrink-0"
                    title="削除"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>

          {/* 追加フォーム */}
          {addMode ? (
            <div className="bg-gray-50 dark:bg-[#252839] rounded-2xl p-4">
              <div className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-3">
                休学期間を追加
              </div>

              <div className="space-y-3 mb-3">
                {/* 開始 */}
                <div>
                  <label className="text-xs text-gray-400 dark:text-slate-500 mb-1 block">
                    開始（休学する最初の学期）
                  </label>
                  <div className="flex gap-2">
                    <Sel
                      value={startGrade}
                      onChange={v => setStartGrade(Number(v))}
                      options={GRADE_OPTIONS.map(g => ({ value: g, label: `${g}年` }))}
                    />
                    <Sel
                      value={startSem}
                      onChange={setStartSem}
                      options={SEM_OPTIONS}
                    />
                  </div>
                </div>

                {/* 終了 */}
                <div>
                  <label className="text-xs text-gray-400 dark:text-slate-500 mb-1 block">
                    終了（復学する学期 ← この学期は復学済み）
                  </label>
                  <div className="flex gap-2">
                    <Sel
                      value={endGrade}
                      onChange={v => setEndGrade(Number(v))}
                      options={GRADE_OPTIONS.map(g => ({ value: g, label: `${g}年` }))}
                    />
                    <Sel
                      value={endSem}
                      onChange={setEndSem}
                      options={SEM_OPTIONS}
                    />
                  </div>
                </div>
              </div>

              {/* プレビュー */}
              {valid ? (
                <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20
                                rounded-xl px-3 py-2 mb-3">
                  <div className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                    {formatPeriod(`${startGrade}_${startSem}`, `${endGrade}_${endSem}`)}
                  </div>
                  <div className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">
                    {semCount} 学期間（displayGrade が {Math.floor(semCount / 2)} 学年分補正されます）
                  </div>
                </div>
              ) : (
                <div className="text-xs text-red-400 mb-3 px-1">
                  終了は開始より後の学期を選択してください
                </div>
              )}

              {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => { setAddMode(false); setError(null) }}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.07]
                             text-sm text-gray-600 dark:text-slate-300 font-semibold disabled:opacity-40"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAdd}
                  disabled={busy || !valid}
                  className="flex-1 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-semibold
                             disabled:opacity-40 flex items-center justify-center gap-1.5 transition-opacity"
                >
                  {busy ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      保存中…
                    </>
                  ) : '追加する'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddMode(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/[0.07]
                         text-sm font-semibold text-gray-400 dark:text-slate-500
                         hover:border-purple-300 dark:hover:border-purple-500/40
                         hover:text-purple-500 dark:hover:text-purple-400
                         transition-colors"
            >
              ＋ 休学期間を追加
            </button>
          )}

          {error && !addMode && (
            <p className="text-xs text-red-500 mt-3 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
