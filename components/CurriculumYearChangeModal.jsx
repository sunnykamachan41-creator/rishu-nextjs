'use client'
import { useState } from 'react'

/**
 * CurriculumYearChangeModal
 *
 * 入学年度（curriculum_year）変更時の強制確認モーダル。
 * curriculum_year が変わると別カリキュラム体系が適用されるため、
 * 既存の全履修データを削除してから変更する必要がある。
 *
 * Props:
 *   fromYear   - 変更前の入学年度（number）
 *   toYear     - 変更後の入学年度（number）
 *   onConfirm  - 削除 + 変更を確定（async () => void）
 *   onCancel   - キャンセル（() => void）
 */
export default function CurriculumYearChangeModal({ fromYear, toYear, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err?.message ?? '不明なエラーが発生しました')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-5"
      style={{ background: 'rgba(0,0,0,0.55)', maxWidth: 430, margin: '0 auto' }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div className="w-full bg-white dark:bg-[#1f2235] rounded-3xl shadow-2xl p-6 flex flex-col gap-5">

        {/* アイコン + タイトル */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div className="text-base font-bold text-gray-900 dark:text-slate-100 text-center">
            入学年度を変更しますか？
          </div>
        </div>

        {/* 変更内容 */}
        <div className="flex items-center justify-center gap-3">
          <span className="text-sm font-bold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-[#252839] px-3 py-1.5 rounded-xl">
            {fromYear}年入学
          </span>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-3 py-1.5 rounded-xl">
            {toYear}年入学
          </span>
        </div>

        {/* 警告説明 */}
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl px-4 py-3 flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">
            ⚠️ カリキュラム依存データをすべて削除します
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400/80 leading-relaxed list-disc list-inside space-y-0.5">
            <li>登録済みのすべての授業・ステータス</li>
            <li>集計データ・進捗ログ（auto / summary）</li>
            <li>卒業判定結果（graduation_result）</li>
            <li>副免許判定結果（additional_license_result）</li>
            <li>単位認定の設定（exemptions）</li>
          </ul>
          <p className="text-xs text-red-500 dark:text-red-400/70 mt-0.5">
            学科・アカウント情報・休学期間は保持されます
          </p>
        </div>

        {/* エラー表示 */}
        {error && (
          <p className="text-xs text-red-500 font-medium text-center">
            エラー: {error}
          </p>
        )}

        {/* ボタン */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-white/[0.07]
                       text-sm text-gray-600 dark:text-slate-300 font-semibold
                       disabled:opacity-40 transition-opacity"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-sm font-bold
                       disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
          >
            {busy ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                削除中…
              </>
            ) : 'データを削除して変更'}
          </button>
        </div>
      </div>
    </div>
  )
}
