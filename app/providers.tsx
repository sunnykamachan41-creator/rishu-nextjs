'use client'
import { SessionProvider } from 'next-auth/react'
import DarkModeSync        from '@/components/DarkModeSync'

/**
 * next-auth の SessionProvider を App Router で使えるようにするラッパー。
 * DarkModeSync を同梱することで全ページでダークモードが機能する。
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DarkModeSync />
      {children}
    </SessionProvider>
  )
}
