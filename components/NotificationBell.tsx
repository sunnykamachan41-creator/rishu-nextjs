'use client'
import { useRouter }        from 'next/navigation'
import { useNotifications } from '@/hooks/useNotifications'

export default function NotificationBell() {
  const router                = useRouter()
  const { unreadCount, isLoading } = useNotifications()

  return (
    <button
      onClick={() => router.push('/notifications')}
      aria-label={`通知${unreadCount > 0 ? `（未読${unreadCount}件）` : ''}`}
      className="relative w-8 h-8 flex items-center justify-center rounded-full
                 active:bg-gray-100 dark:active:bg-white/[0.08] transition-colors flex-shrink-0"
    >
      {/* ベルアイコン */}
      <svg
        className="w-5 h-5 text-gray-500 dark:text-slate-400"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>

      {/* 未読バッジ */}
      {!isLoading && unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1
                     bg-indigo-500 text-white text-[10px] font-bold
                     rounded-full flex items-center justify-center
                     ring-2 ring-white dark:ring-[#1a1d27]"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
