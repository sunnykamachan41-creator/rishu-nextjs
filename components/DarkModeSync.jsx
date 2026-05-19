'use client'
import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settingsStore'

/**
 * Zustand の darkMode フラグを <html> の class に同期するだけのコンポーネント。
 * Providers にマウントしておけば全ページで自動的に機能する。
 */
export default function DarkModeSync() {
  const darkMode = useSettingsStore((s) => s.darkMode)

  useEffect(() => {
    const html = document.documentElement
    if (darkMode) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }, [darkMode])

  return null
}
