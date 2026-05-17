import "./globals.css";
import { Suspense } from 'react'

export const metadata = {
  title: "履修管理",
  description: "Google Sheets 連携 履修管理アプリ",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full antialiased"><Suspense>{children}</Suspense></body>
    </html>
  );
}
