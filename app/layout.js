import "./globals.css";
import { Suspense } from 'react'
import { Providers } from './providers'

export const metadata = {
  title: "履修管理",
  description: "Google Sheets 連携 履修管理アプリ",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full antialiased">
        <Providers>
          <Suspense>{children}</Suspense>
        </Providers>
      </body>
    </html>
  );
}
