'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 初回ログイン時の利用規約・プライバシーポリシー同意モーダル。
 * 両方にチェックするまで閉じられない。
 *
 * Props:
 *   onConsented — 同意完了後に呼ばれるコールバック
 */
export default function ConsentModal({ onConsented }) {
  const router  = useRouter()
  const [terms,   setTerms]   = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState(null)

  const canProceed = terms && privacy

  const handleConsent = async () => {
    if (!canProceed || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/users/consent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ terms_accepted: true, privacy_accepted: true }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? '送信に失敗しました')
      onConsented()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center
                    bg-black/60 backdrop-blur-sm">
      <div className="w-full bg-white dark:bg-[#1a1d27] rounded-t-3xl
                      px-6 pt-6 shadow-2xl"
           style={{
             maxWidth: '430px',
             paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))',
           }}>

        {/* ハンドル */}
        <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-white/10 mx-auto mb-5" />

        {/* ロゴ + タイトル */}
        <div className="flex items-center gap-3 mb-2">
          <img src="/icons/icon-192.png" alt="YORA" className="w-9 h-9 rounded-xl" />
          <div>
            <p style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: '0.08em' }}
               className="text-gray-900 dark:text-white leading-none">
              YORA
            </p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-none mt-0.5">
              非公式サービス・東京学芸大学
            </p>
          </div>
        </div>

        <h2 className="text-[17px] font-bold text-gray-900 dark:text-white mt-4 mb-1">
          はじめにご確認ください
        </h2>
        <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed mb-5">
          YORAは東京学芸大学の非公式サービスです。卒業要件の判定は参考情報であり、最終確認は大学公式システムでお願いします。
        </p>

        {/* チェックボックス */}
        <div className="space-y-3 mb-6">
          {/* 利用規約 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTerms(v => !v)}
              className={`w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors
                ${terms
                  ? 'bg-indigo-500 border-indigo-500'
                  : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800'}`}
            >
              {terms && (
                <svg viewBox="0 0 12 10" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M1 5l3.5 3.5L11 1"/>
                </svg>
              )}
            </button>
            <span className="text-[13px] text-gray-700 dark:text-slate-300 leading-snug">
              <button onClick={() => router.push('/terms')}
                className="text-indigo-600 dark:text-indigo-400 underline font-medium">
                利用規約
              </button>
              に同意する
            </span>
          </div>

          {/* プライバシーポリシー */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPrivacy(v => !v)}
              className={`w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors
                ${privacy
                  ? 'bg-indigo-500 border-indigo-500'
                  : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800'}`}
            >
              {privacy && (
                <svg viewBox="0 0 12 10" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M1 5l3.5 3.5L11 1"/>
                </svg>
              )}
            </button>
            <span className="text-[13px] text-gray-700 dark:text-slate-300 leading-snug">
              <button onClick={() => router.push('/privacy')}
                className="text-indigo-600 dark:text-indigo-400 underline font-medium">
                プライバシーポリシー
              </button>
              に同意する
            </span>
          </div>
        </div>

        {error && (
          <p className="text-[12px] text-red-500 mb-3">{error}</p>
        )}

        {/* 同意ボタン */}
        <button
          onClick={handleConsent}
          disabled={!canProceed || busy}
          className={`w-full py-3.5 rounded-2xl text-[15px] font-bold transition-all
            ${canProceed && !busy
              ? 'bg-indigo-500 hover:bg-indigo-600 text-white active:scale-[0.98]'
              : 'bg-gray-100 dark:bg-white/[0.06] text-gray-300 dark:text-slate-600 cursor-not-allowed'}`}>
          {busy ? '送信中…' : '同意して始める'}
        </button>

        <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center mt-3 leading-relaxed">
          同意後もドロワーから利用規約・プライバシーポリシーをいつでも確認できます
        </p>
      </div>
    </div>
  )
}
