'use client'
import { useState, useEffect } from 'react'

/**
 * DisclaimerScreen — 初回起動時の注意書き画面
 *
 * ・スプラッシュ終了後に表示（splashDone になってから mount）
 * ・「確認しました」で localStorage に記録 → 次回以降はスキップ
 * ・SplashScreen と同じ幅制約（max-w-[430px] 中央揃え）
 */
export default function DisclaimerScreen({ onAck }) {
  const [visible, setVisible] = useState(false)

  // マウント直後にフェードイン
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      className={[
        'fixed top-0 bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px]',
        'z-[9998] flex flex-col',
        'bg-white dark:bg-[#0b0c12]',
        'transition-opacity duration-300 ease-out',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {/* スクロール領域 */}
      <div className="flex-1 overflow-y-auto px-6 pt-14 pb-4">

        {/* アイコン + タイトル */}
        <div className="flex flex-col items-center gap-4 mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-512.png"
            alt="アイコン"
            width={52}
            height={52}
            style={{
              borderRadius: 13,
              boxShadow: '0 8px 24px rgba(79,70,229,0.2), 0 2px 8px rgba(79,70,229,0.12)',
              display: 'block',
            }}
          />
          <div className="text-center">
            <p
              className="text-[9px] font-light uppercase tracking-[0.3em]
                         text-slate-400 dark:text-slate-600 mb-1"
            >
              Tokyo Gakugei Univ.
            </p>
            <p className="text-base font-bold text-slate-900 dark:text-white tracking-wide">
              CAMPUS LIFE
            </p>
          </div>
        </div>

        {/* 注意書きカード */}
        <div className="bg-slate-50 dark:bg-white/[0.04] rounded-2xl px-5 py-5 space-y-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
            ご利用の前に
          </p>

          <DisclaimerItem
            icon="⚠️"
            title="非公式アプリです"
            body="このアプリは学生が個人で開発した非公式ツールです。大学・学部とは一切関係ありません。"
          />

          <DisclaimerItem
            icon="📋"
            title="公式情報を必ず確認してください"
            body="履修登録・免許取得要件・開講情報は変更される場合があります。正式なシラバスや学務情報システムでご確認ください。"
          />

          <DisclaimerItem
            icon="💬"
            title="不具合・誤りはご報告を"
            body="バグや情報の誤りに気づいた場合は、設定画面の「お問い合わせ」からご連絡ください。"
          />
        </div>

        {/* 免責文 */}
        <p className="mt-5 text-[10px] leading-relaxed text-center text-slate-400 dark:text-slate-600 px-2">
          本アプリの利用により生じた不利益について、開発者は責任を負いかねます。
        </p>
      </div>

      {/* 確認ボタン（固定フッター） */}
      <div className="flex-shrink-0 px-6 py-5 bg-white dark:bg-[#0b0c12]">
        <button
          onClick={onAck}
          className="w-full bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700
                     text-white font-semibold text-sm rounded-2xl py-4
                     transition-colors active:scale-[0.98] shadow-lg shadow-indigo-500/25"
        >
          確認しました
        </button>
      </div>
    </div>
  )
}

function DisclaimerItem({ icon, title, body }) {
  return (
    <div className="flex gap-3">
      <span className="text-xl leading-none mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 mb-1">
          {title}
        </p>
        <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
          {body}
        </p>
      </div>
    </div>
  )
}
