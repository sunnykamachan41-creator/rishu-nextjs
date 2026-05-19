'use client'
import { useState } from 'react'

/**
 * OnboardingModal
 * ───────────────
 * 初回ログイン時: 2ステップ（学科選択 → 入学年度選択）
 * 学科変更モード (onCancel あり): 学科選択のみ（1ステップ）
 *
 * Props:
 *   departments  — [{department_id, label}] from /api/data (Sheets master)
 *   onSelect(departmentId, enrollmentYear) → Promise<void>
 *     学科変更モードでは enrollmentYear = null が渡される
 *   onCancel     — キャンセルコールバック（学科変更モード時のみ）
 */
export default function OnboardingModal({ departments = [], onSelect, onCancel }) {
  const [step,           setStep]      = useState(1)          // 1: 学科, 2: 入学年度
  const [selectedDept,   setDept]      = useState('')
  const [selectedYear,   setYear]      = useState(() => {
    // デフォルト: 今年度 (4月始まり)
    const d = new Date()
    return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  })
  const [saving,  setSaving] = useState(false)
  const [error,   setError]  = useState('')

  const isChanging   = !!onCancel   // 学科変更モード
  const selectedLabel = departments.find(d => d.department_id === selectedDept)?.label ?? ''

  // 入学年度の選択肢: 今年度 +1 〜 4年前
  const currentAY = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentAY + 1 - i)

  // ── ステップ1: 学科確定 → 次へ or 保存 ────────────────────────────────────
  function handleNextOrConfirm() {
    if (!selectedDept || saving) return
    if (isChanging) {
      // 学科変更モード: 入学年度ステップはスキップして直接保存
      handleSave(selectedDept, null)
    } else {
      setStep(2)
    }
  }

  // ── ステップ2: 入学年度確定 → 保存 ──────────────────────────────────────────
  async function handleSave(deptId, year) {
    setSaving(true)
    setError('')
    try {
      await onSelect(deptId ?? selectedDept, year ?? selectedYear)
    } catch {
      setError('保存に失敗しました。もう一度お試しください。')
      setSaving(false)
      if (!isChanging) setStep(1)  // エラー時はステップ1に戻す
    }
    // 成功時は親コンポーネントが modal を閉じるので finally で setSaving(false) しない
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="bg-white dark:bg-[#1f2235] w-full max-w-[430px]
                      rounded-t-2xl shadow-2xl dark:shadow-none flex flex-col max-h-[88dvh]">

        {/* ── ハンドル ───────────────────────────────────────────────────── */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-white/10" />
        </div>

        {/* ── ステップインジケーター（初回のみ） ───────────────────────── */}
        {!isChanging && (
          <div className="flex-shrink-0 flex justify-center gap-1.5 pt-2 pb-0">
            {[1, 2].map(s => (
              <div key={s}
                className={`h-1 rounded-full transition-all duration-300
                            ${step === s ? 'w-6 bg-indigo-500' : 'w-3 bg-gray-200 dark:bg-white/10'}`}
              />
            ))}
          </div>
        )}

        {/* ── ヘッダー ───────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pt-3 pb-4">
          {step === 1 ? (
            <>
              <h2 className="text-[18px] font-bold text-gray-900 dark:text-white">
                {isChanging ? '学科を変更する' : '学科を選択してください'}
              </h2>
              <p className="mt-1.5 text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
                {isChanging
                  ? '変更すると、卒業要件・履修集計がリセットされる場合があります。'
                  : 'この設定は履修集計・卒業要件判定に使用されます。'}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[18px] font-bold text-gray-900 dark:text-white">
                入学年度を選択してください
              </h2>
              <p className="mt-1.5 text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
                学年計算・時間割管理に使用されます。後から変更できます。
              </p>
            </>
          )}
        </div>

        {/* ── コンテンツ（スクロール） ───────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-2 overscroll-contain">

          {/* ステップ1: 学科リスト */}
          {step === 1 && (
            <>
              {departments.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">読み込み中…</p>
              )}
              {departments.map(d => (
                <button
                  key={d.department_id}
                  type="button"
                  disabled={saving}
                  onClick={() => { setDept(d.department_id); setError('') }}
                  className={[
                    'w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all text-[14px]',
                    selectedDept === d.department_id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-slate-200 bg-white dark:bg-[#252839]',
                    saving ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]',
                  ].join(' ')}
                >
                  {d.label}
                </button>
              ))}
            </>
          )}

          {/* ステップ2: 入学年度リスト */}
          {step === 2 && yearOptions.map(y => (
            <button
              key={y}
              type="button"
              disabled={saving}
              onClick={() => { setYear(y); setError('') }}
              className={[
                'w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all text-[14px]',
                selectedYear === y
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-slate-200 bg-white dark:bg-[#252839]',
                saving ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]',
              ].join(' ')}
            >
              {y}年度入学
              {y === currentAY && (
                <span className="ml-2 text-xs text-indigo-400 font-normal">（今年度）</span>
              )}
            </button>
          ))}
        </div>

        {/* ── フッター ───────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pb-8 pt-4 space-y-3">

          {/* 選択フィードバック */}
          {step === 1 && (
            <p
              className={[
                'text-[13px] text-center transition-opacity duration-150',
                selectedDept && !error ? 'text-indigo-600 font-medium opacity-100' : 'opacity-0 select-none',
              ].join(' ')}
              aria-live="polite"
            >
              {selectedDept ? `「${selectedLabel}」を選択しました` : '　'}
            </p>
          )}
          {step === 2 && (
            <p className="text-[13px] text-center text-indigo-600 font-medium opacity-100" aria-live="polite">
              {selectedYear}年度入学を選択しました
            </p>
          )}

          {error && (
            <p className="text-[13px] text-center text-red-500" role="alert">{error}</p>
          )}

          {/* ボタン行 */}
          <div className="flex gap-3">
            {/* 戻る / キャンセル */}
            {(isChanging || step === 2) && (
              <button
                type="button"
                onClick={step === 2 ? () => setStep(1) : onCancel}
                disabled={saving}
                className="flex-1 py-3.5 rounded-2xl border border-gray-200 dark:border-white/[0.07]
                           text-[14px] font-semibold text-gray-600 dark:text-slate-300
                           hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors
                           disabled:opacity-50"
              >
                {step === 2 ? '戻る' : 'キャンセル'}
              </button>
            )}

            {/* 次へ / 決定 */}
            <button
              type="button"
              onClick={step === 1 ? handleNextOrConfirm : () => handleSave(selectedDept, selectedYear)}
              disabled={step === 1 ? (!selectedDept || saving) : saving}
              className={[
                'py-3.5 rounded-2xl font-semibold transition-colors text-[14px]',
                'bg-indigo-500 text-white',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'hover:bg-indigo-600 active:bg-indigo-700',
                (isChanging || step === 2) ? 'flex-1' : 'w-full',
              ].join(' ')}
            >
              {saving ? '保存中…' :
               step === 1 ? (isChanging ? '変更する' : '次へ') :
               '決定して開始する'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
