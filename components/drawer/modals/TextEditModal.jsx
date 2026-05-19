'use client'
import { useState } from 'react'

export default function TextEditModal({ title, placeholder, current, onSave, onClose }) {
  const [value,   setValue]   = useState(current ?? '')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSave = async () => {
    setLoading(true)
    setError('')
    try {
      await onSave(value.trim())
    } catch (err) {
      setError(err.message ?? '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-t-3xl w-full max-w-md pb-safe shadow-2xl
                   animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-slate-600" />
        </div>

        <div className="px-5 py-4">
          <h3 className="text-[16px] font-bold text-gray-900 dark:text-white text-center mb-5">
            {title}
          </h3>

          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 dark:border-slate-600
                       bg-gray-50 dark:bg-slate-700 text-[15px] text-gray-900 dark:text-white
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />

          {error && (
            <p className="text-[12px] text-red-500 mt-2 text-center">{error}</p>
          )}

          <div className="flex gap-3 mt-5">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3.5 rounded-2xl border border-gray-200 dark:border-slate-600
                         text-[14px] font-semibold text-gray-600 dark:text-slate-300
                         hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 py-3.5 rounded-2xl bg-indigo-500 text-white
                         text-[14px] font-semibold hover:bg-indigo-600 transition-colors
                         disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
