'use client'
import { useState } from 'react'

const SEM_LABEL = { spring: '春学期', fall: '秋学期' }

/**
 * コマ時間設定ボトムシート
 *
 * @param {object} props
 * @param {number} props.year
 * @param {'spring'|'fall'} props.semester
 * @param {Array<{period,start,end}>} props.periodConfig  - 現在の設定
 * @param {Array<{period,start,end}>} props.defaultConfig - リセット先デフォルト
 * @param {(config: Array) => void} props.onSave
 * @param {() => void} props.onClose
 */
export default function PeriodSettingsModal({
  year, semester,
  periodConfig, defaultConfig,
  onSave, onClose,
}) {
  // ローカルコピーで編集（保存ボタンで親に反映）
  const [rows, setRows] = useState(() => periodConfig.map(p => ({ ...p })))

  function updateRow(i, field, value) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function addRow() {
    const last = rows[rows.length - 1]
    setRows(prev => [...prev, {
      period: (last?.period ?? 0) + 1,
      start:  '',
      end:    '',
    }])
  }

  function removeRow(i) {
    if (rows.length <= 1) return
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  function handleReset() {
    setRows(defaultConfig.map(p => ({ ...p })))
  }

  function handleSave() {
    // 空の start/end は除外しない（ユーザーが意図的に入力済みのものだけ保存）
    onSave(rows)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* ボトムシート */}
      <div className="relative w-full bg-white dark:bg-[#1f2235] rounded-t-3xl flex flex-col"
        style={{ maxHeight: '85dvh' }}>

        {/* ── ハンドル + ヘッダー ──────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mb-3" />
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-bold text-gray-900 dark:text-slate-100">コマ時間設定</div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                {year}年度 {SEM_LABEL[semester]} — この年度・学期のみ適用
              </div>
            </div>
            <button
              onClick={handleReset}
              className="text-xs text-blue-500 font-medium py-1">
              デフォルトに戻す
            </button>
          </div>
        </div>

        {/* ── コマ一覧 ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-4 py-3 space-y-2.5">

          {/* 列ヘッダー */}
          <div className="grid gap-2 text-xs text-gray-400 dark:text-slate-500 font-medium px-1"
            style={{ gridTemplateColumns: '28px 1fr 16px 1fr 28px' }}>
            <div className="text-center">限</div>
            <div className="text-center">開始</div>
            <div />
            <div className="text-center">終了</div>
            <div />
          </div>

          {rows.map((row, i) => (
            <div key={i}
              className="grid items-center gap-2 bg-gray-50 dark:bg-[#252839] rounded-xl px-3 py-2.5"
              style={{ gridTemplateColumns: '28px 1fr 16px 1fr 28px' }}>

              {/* コマ番号 */}
              <div className="text-center text-sm font-bold text-gray-500 dark:text-slate-400">
                {row.period}
              </div>

              {/* 開始時刻 */}
              <input
                type="time"
                value={row.start}
                onChange={e => updateRow(i, 'start', e.target.value)}
                className="w-full bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-white/[0.07] rounded-lg px-2 py-1.5
                           text-sm text-center font-medium text-gray-800 dark:text-slate-200
                           focus:outline-none focus:ring-2 focus:ring-blue-300"
              />

              {/* 区切り */}
              <div className="text-center text-gray-300 dark:text-slate-600 text-xs">〜</div>

              {/* 終了時刻 */}
              <input
                type="time"
                value={row.end}
                onChange={e => updateRow(i, 'end', e.target.value)}
                className="w-full bg-white dark:bg-[#1a1d27] border border-gray-200 dark:border-white/[0.07] rounded-lg px-2 py-1.5
                           text-sm text-center font-medium text-gray-800 dark:text-slate-200
                           focus:outline-none focus:ring-2 focus:ring-blue-300"
              />

              {/* 削除ボタン */}
              <button
                onClick={() => removeRow(i)}
                disabled={rows.length <= 1}
                className="flex items-center justify-center text-gray-300 dark:text-slate-600
                           hover:text-red-400 dark:hover:text-red-400 disabled:opacity-20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* コマ追加ボタン */}
          <button
            onClick={addRow}
            className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-white/[0.07] rounded-xl
                       text-sm text-gray-400 dark:text-slate-500 font-medium
                       hover:border-blue-300 hover:text-blue-400 dark:hover:border-blue-500/40 dark:hover:text-blue-400 transition-colors">
            ＋ コマを追加
          </button>

          {/* 注意書き */}
          <p className="text-xs text-gray-300 dark:text-slate-600 text-center pb-1">
            変更は{year}年度{SEM_LABEL[semester]}にのみ適用されます
          </p>
        </div>

        {/* ── フッター ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-100 dark:border-white/[0.07] flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-white/[0.07]
                       text-sm text-gray-600 dark:text-slate-300 font-semibold">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-2xl bg-blue-500 text-white text-sm font-semibold">
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
