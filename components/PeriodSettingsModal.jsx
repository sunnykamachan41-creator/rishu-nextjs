'use client'
import { useState } from 'react'

const SEM_LABEL = { spring: '春学期', fall: '秋学期' }

// ── セルスタイル選択 ミニプレビュー ───────────────────────────────────────────

const STYLE_OPTIONS = [
  { value: 'tall',   label: '縦長',   desc: '各コマを大きく表示' },
  { value: 'square', label: '均等',   desc: '全コマをスクロールなしで表示' },
]

// 小さなプレビューに使う固定データ（何が入るかを視覚化）
const PREVIEW_BLOCKS = [
  // [row, col, colorIndex]
  [0,0,0],[0,1,1],[0,2,1],
  [1,0,2],[1,2,0],
  [2,0,0],[2,1,2],[2,2,1],
  [3,1,0],[3,2,2],
  [4,0,1],[4,1,0],
]

function MiniTimetablePreview({ isTall }) {
  const rowH    = isTall ? 21 : 13
  const numRows = isTall ? 3  : 5
  const strips  = ['bg-indigo-400', 'bg-blue-400', 'bg-violet-400']
  const cards   = ['bg-indigo-50 dark:bg-indigo-500/[0.18]',
                   'bg-blue-50 dark:bg-blue-500/[0.18]',
                   'bg-violet-50 dark:bg-violet-500/[0.18]']

  return (
    <div className="w-full rounded-lg overflow-hidden border border-gray-100 dark:border-white/[0.07]
                    bg-white dark:bg-[#1a1d27]">
      {/* 曜日ヘッダー */}
      <div className="flex border-b border-gray-100 dark:border-white/[0.06]" style={{ height: 9 }}>
        <div className="w-[18px] flex-shrink-0 bg-gray-50 dark:bg-white/[0.03]" />
        {['月','火','水'].map(d => (
          <div key={d} className="flex-1 flex items-center justify-center">
            <span className="text-[5px] font-bold text-gray-400 dark:text-slate-500">{d}</span>
          </div>
        ))}
      </div>

      {/* コマ行 */}
      {Array.from({ length: numRows }, (_, row) => (
        <div key={row}
          className="flex border-b border-gray-50 dark:border-white/[0.04] last:border-0"
          style={{ height: rowH }}>
          {/* 時刻列 */}
          <div className="w-[18px] flex-shrink-0 flex items-center justify-center
                          bg-gray-50 dark:bg-white/[0.03]
                          border-r border-gray-100 dark:border-white/[0.05]">
            <span className="text-[4px] font-black text-gray-300 dark:text-slate-600">{row + 1}</span>
          </div>
          {/* 曜日セル */}
          {[0, 1, 2].map(col => {
            const block = PREVIEW_BLOCKS.find(([r, c]) => r === row && c === col)
            if (!block) {
              return <div key={col} className="flex-1 border-l border-gray-50 dark:border-white/[0.04]" />
            }
            const ci = block[2]
            return (
              <div key={col}
                className="flex-1 border-l border-gray-50 dark:border-white/[0.04] overflow-hidden p-px">
                <div className={`h-full rounded-[2px] overflow-hidden flex flex-row ${cards[ci]}`}>
                  <div className={`w-[2px] flex-shrink-0 ${strips[ci]}`} />
                  {isTall ? (
                    /* tall: 授業名を上端、教室ピルを下端に配置 */
                    <div className="flex-1 flex flex-col justify-between px-[2px] py-[2px] overflow-hidden">
                      <div className="flex flex-col gap-[1.5px]">
                        <div className={`rounded-[1px] ${strips[ci]} opacity-35`}
                          style={{ height: 2, width: '78%' }} />
                        <div className={`rounded-[1px] ${strips[ci]} opacity-25`}
                          style={{ height: 1.5, width: '55%' }} />
                      </div>
                      {/* 教室ピル（下端） */}
                      <div className={`rounded-[1.5px] ${strips[ci]} opacity-70`}
                        style={{ height: 3, width: '52%' }} />
                    </div>
                  ) : (
                    /* square: 中央揃え */
                    <div className="flex-1 flex flex-col justify-center px-[2px] gap-px overflow-hidden">
                      <div className={`rounded-[1px] ${strips[ci]} opacity-35`}
                        style={{ height: 2, width: '78%' }} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

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
 * @param {'tall'|'square'} [props.cellStyle]
 * @param {(style: string) => void} [props.onCellStyleChange]
 */
export default function PeriodSettingsModal({
  year, semester,
  periodConfig, defaultConfig,
  onSave, onClose,
  cellStyle,
  onCellStyleChange,
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

          {/* ── セルスタイル選択 ───────────────────────────────────────────── */}
          {onCellStyleChange && (
            <div className="pb-1">
              <p className="text-[11px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide mb-2 px-0.5">
                セル表示スタイル
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {STYLE_OPTIONS.map(({ value, label, desc }) => {
                  const active = cellStyle === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onCellStyleChange(value)}
                      className={[
                        'rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.97]',
                        active
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/[0.10]'
                          : 'border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#252839]',
                      ].join(' ')}
                    >
                      <MiniTimetablePreview isTall={value === 'tall'} />
                      <div className={`mt-2 text-[12px] font-bold
                                      ${active ? 'text-blue-600 dark:text-blue-400'
                                               : 'text-gray-700 dark:text-slate-200'}`}>
                        {label}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 leading-snug">
                        {desc}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* セクション区切り */}
              <div className="mt-4 mb-1 border-t border-gray-100 dark:border-white/[0.06]" />
            </div>
          )}

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
