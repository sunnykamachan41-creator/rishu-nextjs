'use client'
import { useState } from 'react'
import DrawerSection from '../ui/DrawerSection'
import DrawerItem    from '../ui/DrawerItem'

// ローカルキャッシュをすべてクリアする
function clearAllLocalStorage() {
  const keys = Object.keys(localStorage).filter(k =>
    k.startsWith('rishu_') || k.startsWith('yora_') || k.startsWith('semester_')
  )
  keys.forEach(k => localStorage.removeItem(k))
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 6l-1 14H6L5 6m5 0V4h4v2" />
    </svg>
  )
}

function RecalcIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

export default function DataSection({ onRecalculate, recalcBusy }) {
  const [confirmOpen,      setConfirmOpen]      = useState(false)  // ローカル初期化
  const [deleteOpen,       setDeleteOpen]       = useState(false)  // 全データ削除
  const [deleteBusy,       setDeleteBusy]       = useState(false)
  const [deleteError,      setDeleteError]      = useState(null)

  // ローカルキャッシュのみ削除
  const handleReset = () => {
    const KEYS = [
      'rishu_enrollment_entries',
      'rishu_include_projected',
      'rishu_exemptions',
      'rishu_active_degrees',
    ]
    KEYS.forEach(k => localStorage.removeItem(k))
    window.location.reload()
  }

  // Sheets + ローカル全削除
  const handleDeleteAll = async () => {
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/enrollment/clear-all', { method: 'POST' })
      if (!res.ok) throw new Error((await res.json())?.error ?? '削除失敗')
      clearAllLocalStorage()
      window.location.reload()
    } catch (e) {
      setDeleteError(e.message)
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <DrawerSection label="データ">
        {/* 再計算 */}
        {onRecalculate && (
          <DrawerItem
            icon={<RecalcIcon />}
            label={recalcBusy ? '再計算中...' : '卒業要件を再計算'}
            sublabel="単位数が合わない・更新されない場合に実行"
            chevron={!recalcBusy}
            onPress={() => !recalcBusy && onRecalculate()}
          />
        )}
        <DrawerItem
          icon={<TrashIcon />}
          label="ローカルデータを初期化"
          sublabel="端末キャッシュのみ消去。Sheetsのデータは残る"
          danger
          chevron
          onPress={() => setConfirmOpen(true)}
        />
        <DrawerItem
          icon={<TrashIcon />}
          label="全データを削除"
          sublabel="履修・単位・進捗データをすべて消去する"
          danger
          chevron
          onPress={() => setDeleteOpen(true)}
        />
      </DrawerSection>

      {/* ローカル初期化ダイアログ */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 bg-black/50 backdrop-blur-sm"
             onClick={() => setConfirmOpen(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="text-3xl mb-3">⚠️</div>
              <h3 className="text-[16px] font-bold text-gray-900 dark:text-white">
                ローカルデータを初期化しますか？
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-2 leading-relaxed">
                端末に保存されている履修エントリ・設定が削除されます。
                Google Sheets のデータは削除されません。
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-slate-600
                           text-[14px] font-semibold text-gray-600 dark:text-slate-300
                           hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                キャンセル
              </button>
              <button onClick={handleReset}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white
                           text-[14px] font-semibold hover:bg-red-600 transition-colors">
                初期化する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 全データ削除ダイアログ */}
      {deleteOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 bg-black/50 backdrop-blur-sm"
             onClick={() => !deleteBusy && setDeleteOpen(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="text-center mb-5">
              <div className="text-3xl mb-3">🗑️</div>
              <h3 className="text-[16px] font-bold text-gray-900 dark:text-white">
                全データを削除しますか？
              </h3>
              <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-2 leading-relaxed">
                履修登録・成績・卒業要件の進捗・単位認定データがすべて削除されます。
                この操作は取り消せません。
              </p>
              {deleteError && (
                <p className="text-[12px] text-red-500 mt-2">{deleteError}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteOpen(false)} disabled={deleteBusy}
                className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-slate-600
                           text-[14px] font-semibold text-gray-600 dark:text-slate-300
                           hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">
                キャンセル
              </button>
              <button onClick={handleDeleteAll} disabled={deleteBusy}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white
                           text-[14px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-60
                           flex items-center justify-center gap-1.5">
                {deleteBusy ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    削除中…
                  </>
                ) : '全て削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
