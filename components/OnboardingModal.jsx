'use client'
import { useState } from 'react'

/**
 * OnboardingModal
 * ───────────────
 * Shown on first launch when user.department is not yet set.
 * Blocks all other UI until a department is confirmed and saved.
 *
 * Props:
 *   departments  — [{department_id, label}] from /api/data (Sheets master)
 *   onSelect(departmentId: string) → Promise<void>
 *     Called when user confirms. Parent handles the API POST.
 *     Modal stays open if the parent throws / returns without resolving.
 */
/**
 * Props:
 *   departments  — [{department_id, label}]
 *   onSelect(id) — 決定時のコールバック（API保存まで担当）
 *   onCancel     — キャンセル時のコールバック（省略時=初回起動→非表示）
 *                  ドロワーからの学科変更時のみ渡す
 */
export default function OnboardingModal({ departments = [], onSelect, onCancel }) {
  const [selected, setSel]   = useState('')
  const [saving,   setSaving] = useState(false)
  const [error,    setError]  = useState('')

  const selectedLabel = departments.find(d => d.department_id === selected)?.label ?? ''
  const isChanging    = !!onCancel  // キャンセルボタンを出す=学科変更モード

  async function handleConfirm() {
    if (!selected || saving) return
    setSaving(true)
    setError('')
    try {
      await onSelect(selected)
    } catch {
      setError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="bg-white dark:bg-[#1f2235] w-full max-w-[430px]
                      rounded-t-2xl shadow-2xl dark:shadow-none flex flex-col max-h-[88dvh]">

        {/* ── ハンドル ───────────────────────────────────────────────────── */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-white/10" />
        </div>

        {/* ── ヘッダー ───────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pt-3 pb-4">
          <h2 className="text-[18px] font-bold text-gray-900 dark:text-white">
            {isChanging ? '学科を変更する' : '学科を選択してください'}
          </h2>
          <p className="mt-1.5 text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
            {isChanging
              ? '変更すると、卒業要件・履修集計がリセットされる場合があります。'
              : 'この設定はアプリ全体の履修集計・卒業要件判定に使用されます。'}
          </p>
        </div>

        {/* ── 学科リスト（スクロール） ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-2 overscroll-contain">
          {departments.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">読み込み中…</p>
          )}
          {departments.map(d => (
            <button
              key={d.department_id}
              type="button"
              disabled={saving}
              onClick={() => { setSel(d.department_id); setError('') }}
              className={[
                'w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all text-[14px]',
                selected === d.department_id
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-slate-200 bg-white dark:bg-[#252839]',
                saving ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]',
              ].join(' ')}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* ── フッター ───────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pb-8 pt-4 space-y-3">

          {/* 選択フィードバック */}
          <p
            className={[
              'text-[13px] text-center transition-opacity duration-150',
              selected && !error ? 'text-indigo-600 font-medium opacity-100' : 'opacity-0 select-none',
            ].join(' ')}
            aria-live="polite"
          >
            {selected ? `「${selectedLabel}」を選択しました` : '　'}
          </p>

          {error && (
            <p className="text-[13px] text-center text-red-500" role="alert">{error}</p>
          )}

          {/* ボタン行 */}
          <div className={isChanging ? 'flex gap-3' : ''}>
            {/* キャンセル（学科変更モードのみ） */}
            {isChanging && (
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="flex-1 py-3.5 rounded-2xl border border-gray-200 dark:border-white/[0.07]
                           text-[14px] font-semibold text-gray-600 dark:text-slate-300
                           hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors
                           disabled:opacity-50"
              >
                キャンセル
              </button>
            )}

            {/* 決定 */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selected || saving}
              className={[
                'py-3.5 rounded-2xl font-semibold transition-colors text-[14px]',
                'bg-indigo-500 text-white',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'hover:bg-indigo-600 active:bg-indigo-700',
                isChanging ? 'flex-1' : 'w-full',
              ].join(' ')}
            >
              {saving ? '保存中…' : isChanging ? '変更する' : '決定して開始する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
