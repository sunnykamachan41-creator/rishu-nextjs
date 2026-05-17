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
export default function OnboardingModal({ departments = [], onSelect }) {
  const [selected, setSel]  = useState('')
  const [saving,   setSaving] = useState(false)
  const [error,    setError]  = useState('')

  const selectedLabel = departments.find(d => d.department_id === selected)?.label ?? ''

  async function handleConfirm() {
    if (!selected || saving) return
    setSaving(true)
    setError('')
    try {
      await onSelect(selected)
      // If onSelect resolves → parent updated state → modal unmounts automatically
    } catch {
      setError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    /* Backdrop — pointer-events blocked so taps cannot reach the app behind */
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50">

      <div
        className="
          bg-white w-full max-w-sm mx-0 sm:mx-4
          rounded-t-2xl sm:rounded-2xl
          shadow-2xl flex flex-col
          max-h-[90dvh]
        "
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-6 pt-7 pb-4">
          <h2 className="text-xl font-bold text-gray-900">専攻を選択してください</h2>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            この設定はアプリ全体の履修集計・卒業要件判定に使用されます。
            選択後も設定から変更できます。
          </p>
        </div>

        {/* ── Department list (scrollable) ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 space-y-2 pb-2">
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
                'w-full text-left px-4 py-3 rounded-xl border-2 transition-colors',
                selected === d.department_id
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                saving ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* ── Footer: selection message + error + confirm ─────────────────── */}
        <div className="flex-shrink-0 px-6 pb-8 pt-4 space-y-3">

          {/* Selection feedback */}
          <p
            className={[
              'text-sm text-center transition-opacity duration-150',
              selected && !error
                ? 'text-blue-600 font-medium opacity-100'
                : 'opacity-0 select-none',
            ].join(' ')}
            aria-live="polite"
          >
            {selected ? `「${selectedLabel}」を選択しました` : '　'}
          </p>

          {/* Error message */}
          {error && (
            <p className="text-sm text-center text-red-500" role="alert">
              {error}
            </p>
          )}

          {/* Confirm button */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="
              w-full py-3 rounded-xl font-semibold transition-colors
              bg-blue-500 text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              hover:bg-blue-600 active:bg-blue-700
            "
          >
            {saving ? '保存中…' : '決定して開始する'}
          </button>
        </div>
      </div>
    </div>
  )
}
