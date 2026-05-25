'use client'
import { useState } from 'react'
import DrawerSection from '../ui/DrawerSection'
import DrawerItem    from '../ui/DrawerItem'

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 6l-1 14H6L5 6m5 0V4h4v2" />
    </svg>
  )
}

export default function DataSection() {
  const [confirmOpen, setConfirmOpen] = useState(false)

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

  return (
    <>
      <DrawerSection label="データ">
        <DrawerItem
          icon={<TrashIcon />}
          label="ローカルデータを初期化"
          sublabel="履修エントリなどの端末キャッシュを消去"
          danger
          chevron
          onPress={() => setConfirmOpen(true)}
        />
      </DrawerSection>

      {/* 確認ダイアログ */}
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
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-slate-600
                           text-[14px] font-semibold text-gray-600 dark:text-slate-300
                           hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white
                           text-[14px] font-semibold hover:bg-red-600 transition-colors"
              >
                初期化する
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
