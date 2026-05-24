'use client'
import { useState, useEffect, useRef } from 'react'

/**
 * SplashScreen — 起動ローディング画面
 *
 * ・RAF 駆動の一定速度プログレスバー（0 → 85% を 2.5 秒で線形移動）
 * ・データ完了時に 100% へジャンプ → フェードアウト
 * ・ダークモード完全対応（class-based dark:）
 * ・マウント直後のフェードイン + アイコン/テキストのスライドイン
 */
export default function SplashScreen({ exiting = false }) {
  const [progress, setProgress] = useState(0)
  const [mounted,  setMounted]  = useState(false)
  const rafRef   = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const DURATION = 2500
    const MAX      = 85
    startRef.current = Date.now()
    const tick = () => {
      const elapsed = Date.now() - startRef.current
      const t = Math.min(elapsed / DURATION, 1)
      setProgress(t * MAX)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    if (!exiting) return
    cancelAnimationFrame(rafRef.current)
    setProgress(100)
  }, [exiting])

  const visible = mounted && !exiting

  return (
    <div
      className={[
        'fixed top-0 bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[9999] flex flex-col',
        'bg-white dark:bg-[#0b0c12]',
        'transition-opacity duration-500 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
      aria-label="読み込み中"
      aria-live="polite"
    >

      {/* ── 中央: アイコン + ブランド + プログレスバー ───────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">

        {/* アイコン */}
        <div
          className={[
            'transition-all duration-700 ease-out',
            visible ? 'opacity-100 translate-y-0 scale-100'
                    : 'opacity-0  translate-y-4  scale-90',
          ].join(' ')}
          style={{ willChange: 'transform, opacity' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-512.png"
            alt="YORA"
            width={80}
            height={80}
            style={{
              borderRadius: 18,
              boxShadow: '0 16px 48px rgba(79,70,229,0.25), 0 4px 12px rgba(79,70,229,0.15)',
              display: 'block',
            }}
          />
        </div>

        {/* ブランド + プログレスバー */}
        <div
          className={[
            'flex flex-col items-center gap-3',
            'transition-all duration-700 delay-100 ease-out',
            visible ? 'opacity-100 translate-y-0'
                    : 'opacity-0  translate-y-5',
          ].join(' ')}
          style={{ willChange: 'transform, opacity' }}
        >
          {/* アプリ名 */}
          <p
            className="text-[#202f51] dark:text-white"
            style={{
              fontFamily:    'var(--font-league-spartan)',
              fontSize:      36,
              fontWeight:    700,
              letterSpacing: '0.05em',
              lineHeight:    1,
            }}
          >
            YORA
          </p>

          {/* サブタイトル */}
          <p
            className="text-[11px] font-light text-slate-400 dark:text-slate-600"
            style={{ letterSpacing: '0.08em' }}
          >
            学芸が苦行を、学芸学業に。
          </p>

          {/* プログレスバー */}
          <div
            className="rounded-full overflow-hidden bg-slate-100 dark:bg-white/[0.08]"
            style={{ width: 160, height: 2, marginTop: 4 }}
          >
            <div
              className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
              style={{
                width: `${progress}%`,
                transition: exiting ? 'width 350ms ease-out' : undefined,
              }}
            />
          </div>
          {/* 注意事項 */}
          <div
            className={[
              'flex flex-col gap-1.5 self-stretch mt-2',
              'transition-opacity duration-700 delay-200 ease-out',
              visible ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            {[
              '非公式アプリです。大学・学部とは無関係です。',
              'シラバス・開講情報・免許要件は公式情報を必ずご確認ください。',
              '不具合・誤りは設定のお問い合わせからご連絡ください。',
            ].map((text, i) => (
              <p
                key={i}
                className="text-[10px] leading-snug text-slate-400 dark:text-slate-600"
                style={{ letterSpacing: '0.02em' }}
              >
                <span className="text-slate-300 dark:text-slate-700 mr-1">•</span>
                {text}
              </p>
            ))}
          </div>

        </div>

      </div>

    </div>
  )
}
