'use client'

/**
 * PwaInstallPrompt
 * ─────────────────
 * 初回ログイン後・オンボーディング完了直後に一度だけ表示する
 * PWA インストール案内モーダル。
 *
 * 表示条件:
 *   - すでに standalone モード（インストール済み）でない
 *   - localStorage に 'rishu_pwa_prompted' が未設定
 *
 * Props:
 *   onClose() — 閉じるときに呼ぶ（localStorage 書き込みは親側で行う）
 */
export default function PwaInstallPrompt({ onClose }) {
  const platform = detectPlatform()

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      {/* Bottom sheet */}
      <div
        className="animate-slide-up bg-white dark:bg-[#1a1d27] rounded-t-3xl w-full px-6 pt-6 pb-10"
        style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ハンドル */}
        <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-white/10 mx-auto mb-5" />

        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="YORA" width={44} height={44}
               className="rounded-[10px] shadow-sm flex-shrink-0" />
          <div>
            <p className="text-[16px] font-bold text-gray-900 dark:text-white leading-tight">
              ホーム画面に追加してね
            </p>
            <p className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              アプリとして快適に使えます
            </p>
          </div>
        </div>

        {/* 区切り */}
        <div className="h-px bg-gray-100 dark:bg-white/[0.06] my-4" />

        {/* プラットフォーム別の手順 */}
        <PlatformSteps platform={platform} />

        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          className="mt-5 w-full py-3.5 rounded-2xl
                     bg-indigo-500 active:bg-indigo-600
                     text-white text-[15px] font-semibold
                     transition-colors"
        >
          わかりました
        </button>
      </div>
    </div>
  )
}

// ── プラットフォーム検出 ──────────────────────────────────────────────────────

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  const isIOS     = /iPhone|iPad|iPod/.test(ua)
  const isAndroid = /Android/.test(ua)
  const isCriOS   = /CriOS/.test(ua)                       // iOS版Chrome
  const isSafari  = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua)
  const isChrome  = /Chrome/.test(ua) && !/Edg\//.test(ua) // Android Chrome

  if (isIOS && isSafari)  return 'ios-safari'
  if (isIOS && isCriOS)   return 'ios-chrome'
  if (isAndroid && isChrome) return 'android-chrome'
  return 'other'
}

// ── 手順コンポーネント ────────────────────────────────────────────────────────

function Step({ num, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500 text-white
                       text-[11px] font-bold flex items-center justify-center mt-0.5">
        {num}
      </span>
      <p className="text-[13px] text-gray-700 dark:text-slate-300 leading-relaxed">
        {children}
      </p>
    </div>
  )
}

function PlatformSteps({ platform }) {
  if (platform === 'ios-safari') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">
          Safari（iPhone / iPad）
        </p>
        <Step num="1">
          画面下部の共有ボタン
          <span className="inline-block mx-1 text-[11px] bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono">
            □↑
          </span>
          をタップ
        </Step>
        <Step num="2">
          メニューをスクロールして
          <span className="font-semibold text-gray-900 dark:text-white mx-1">「ホーム画面に追加」</span>
          をタップ
        </Step>
        <Step num="3">
          右上の
          <span className="font-semibold text-gray-900 dark:text-white mx-1">「追加」</span>
          をタップして完了
        </Step>
      </div>
    )
  }

  if (platform === 'ios-chrome') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-semibold text-amber-500 uppercase tracking-wide mb-1">
          Chrome（iPhone / iPad）
        </p>
        <div className="bg-amber-50 dark:bg-amber-500/10 rounded-2xl px-4 py-3 mb-1">
          <p className="text-[13px] text-amber-700 dark:text-amber-300 leading-relaxed">
            iOS 版 Chrome ではホーム画面への追加に対応していません。
            <span className="font-semibold">Safari</span> で開き直してから追加してください。
          </p>
        </div>
        <Step num="1">
          右下の
          <span className="font-semibold text-gray-900 dark:text-white mx-1">「...」メニュー</span>
          →
          <span className="font-semibold text-gray-900 dark:text-white mx-1">「Safari で開く」</span>
          をタップ
        </Step>
        <Step num="2">
          Safari で開いたら、共有ボタン
          <span className="inline-block mx-1 text-[11px] bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono">
            □↑
          </span>
          →
          <span className="font-semibold text-gray-900 dark:text-white mx-1">「ホーム画面に追加」</span>
        </Step>
      </div>
    )
  }

  if (platform === 'android-chrome') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-semibold text-indigo-500 uppercase tracking-wide mb-1">
          Chrome（Android）
        </p>
        <Step num="1">
          右上のメニュー
          <span className="inline-block mx-1 text-[11px] bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono">
            ⋮
          </span>
          をタップ
        </Step>
        <Step num="2">
          <span className="font-semibold text-gray-900 dark:text-white mr-1">「ホーム画面に追加」</span>
          または
          <span className="font-semibold text-gray-900 dark:text-white mx-1">「アプリをインストール」</span>
          をタップ
        </Step>
        <Step num="3">
          確認ダイアログで
          <span className="font-semibold text-gray-900 dark:text-white mx-1">「インストール」</span>
          をタップして完了
        </Step>
      </div>
    )
  }

  // PC / その他
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-gray-600 dark:text-slate-400 leading-relaxed">
        ブラウザのアドレスバー右端にある
        <span className="font-semibold text-gray-900 dark:text-white mx-1">インストールボタン</span>
        をクリックするか、メニューから
        <span className="font-semibold text-gray-900 dark:text-white mx-1">「アプリをインストール」</span>
        を選択してください。
      </p>
      <p className="text-[12px] text-gray-400 dark:text-slate-500">
        スマートフォンではより快適に使用できます。
      </p>
    </div>
  )
}
