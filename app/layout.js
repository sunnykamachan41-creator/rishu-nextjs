import "./globals.css";
import { Suspense } from 'react'
import { Providers } from './providers'

export const metadata = {
  title:       '履修管理',
  description: 'Google Sheets 連携 履修管理アプリ',
  // iOS フルスクリーン PWA
  appleWebApp: {
    capable:         true,
    title:           '履修管理',
    statusBarStyle:  'default',
  },
  // スマートフォンの電話番号自動リンクを無効化
  formatDetection: { telephone: false },
};

export const viewport = {
  width:         'device-width',
  initialScale:  1,
  maximumScale:  1,
  userScalable:  false,
  viewportFit:   'cover',
  // Android Chrome / Safari のテーマカラー（ライト・ダーク両対応）
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4f46e5' },
    { media: '(prefers-color-scheme: dark)',  color: '#1a1d27' },
  ],
};

// iOS PWA: ドキュメントレベルの touchmove バウンスを防ぐインラインスクリプト
// スクロール可能な子要素（overflow: auto/scroll）内のタッチは通過させる
const NO_BOUNCE_SCRIPT = `
(function() {
  document.addEventListener('touchmove', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      var style = window.getComputedStyle(el);
      var overflow = style.overflow + style.overflowY;
      if (overflow.includes('auto') || overflow.includes('scroll')) {
        // スクロール可能な要素の内部 → バウンスを止めない
        return;
      }
      el = el.parentElement;
    }
    // それ以外（グリッド、ヘッダーなど）→ バウンスを止める
    e.preventDefault();
  }, { passive: false });
})();
`

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className="h-dvh">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_BOUNCE_SCRIPT }} />
      </head>
      <body className="h-full antialiased">
        <Providers>
          <Suspense>{children}</Suspense>
        </Providers>
      </body>
    </html>
  );
}
