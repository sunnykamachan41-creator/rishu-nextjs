'use client'
import { useState } from 'react'
import { useSheetClose } from '@/lib/useSheetClose'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i)

export default function EnrollmentYearModal({ current, onSave, onClose }) {
  const [selected, setSelected] = useState(current ?? CURRENT_YEAR)
  const { closing, closeSheet } = useSheetClose(onClose)

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm
                  transition-opacity duration-[260ms] ${closing ? 'opacity-0' : 'opacity-100'}`}
      onClick={closeSheet}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-t-3xl w-full max-w-md pb-safe shadow-2xl
                    ${closing ? 'animate-slide-down' : 'animate-slide-up'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-slate-600" />
        </div>

        <div className="px-5 py-4">
          <h3 className="text-[16px] font-bold text-gray-900 dark:text-white text-center mb-1">
            入学年度を選択
          </h3>
          <p className="text-[12px] text-gray-400 text-center mb-5">
            学年計算の基準となる年度です
          </p>

          <div className="space-y-2 max-h-64 overflow-y-auto overscroll-contain -mx-1 px-1">
            {YEARS.map(y => (
              <button
                key={y}
                onClick={() => setSelected(y)}
                className={`w-full py-3.5 rounded-2xl text-[15px] font-semibold transition-all
                  ${selected === y
                    ? 'bg-indigo-500 text-white shadow-md scale-[1.01]'
                    : 'bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-600'}`}
              >
                {y}年度入学
                {y === CURRENT_YEAR && (
                  <span className="ml-2 text-[11px] opacity-70">（今年度）</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-3 mt-5">
            <button
              onClick={closeSheet}
              className="flex-1 py-3.5 rounded-2xl border border-gray-200 dark:border-slate-600
                         text-[14px] font-semibold text-gray-600 dark:text-slate-300
                         hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={() => onSave(selected)}
              className="flex-1 py-3.5 rounded-2xl bg-indigo-500 text-white
                         text-[14px] font-semibold hover:bg-indigo-600 transition-colors"
            >
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
