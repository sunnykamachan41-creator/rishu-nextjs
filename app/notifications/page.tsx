'use client'
import { useRouter }          from 'next/navigation'
import { useNotifications }   from '@/hooks/useNotifications'
import {
  notificationTypeConfig,
  formatNotificationDate,
  type AppNotification,
} from '@/lib/notification'

// ── 通知カード ────────────────────────────────────────────────────────────────

function NotificationCard({
  notification,
  onRead,
}: {
  notification: AppNotification
  onRead: (id: string, link: string) => void
}) {
  const cfg     = notificationTypeConfig(notification.type)
  const isUnread = !notification.is_read

  return (
    <button
      className={`w-full text-left flex items-start gap-3 px-4 py-4 rounded-2xl
                  border transition-all active:scale-[0.99]
                  ${isUnread
                    ? `${cfg.bg} border-transparent`
                    : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700/50'
                  }`}
      onClick={() => onRead(notification.id, notification.link)}
    >
      {/* アイコン */}
      <span className={`flex-shrink-0 w-10 h-10 flex items-center justify-center
                        rounded-xl text-lg ${cfg.iconBg}`}>
        {cfg.icon}
      </span>

      {/* テキスト */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-[14px] font-semibold leading-snug
                         ${isUnread
                           ? 'text-gray-900 dark:text-slate-100'
                           : 'text-gray-700 dark:text-slate-300'
                         }`}>
            {notification.title}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
            )}
            <span className="text-[11px] text-gray-400 dark:text-slate-500 whitespace-nowrap">
              {formatNotificationDate(notification.created_at)}
            </span>
          </div>
        </div>
        <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
          {notification.message}
        </p>
        {notification.link && (
          <p className="text-[11px] text-indigo-400 dark:text-indigo-500 mt-1.5 font-medium">
            タップして確認 →
          </p>
        )}
      </div>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter()
  const { notifications, unreadCount, isLoading, markAsRead } = useNotifications()

  const handleRead = async (id: string, link: string) => {
    await markAsRead(id)
    if (link) router.push(link)
  }

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-[#12141e] flex flex-col"
      style={{ maxWidth: 430, margin: '0 auto' }}
    >
      {/* ヘッダー */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27]
                      border-b border-gray-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-3 h-14 px-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl text-gray-400 dark:text-slate-400
                       active:bg-gray-100 dark:active:bg-white/[0.08] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="flex-1 text-[16px] font-bold text-gray-900 dark:text-slate-100">
            通知
          </h1>
          {unreadCount > 0 && (
            <span className="text-[12px] font-semibold text-indigo-600 dark:text-indigo-400">
              未読 {unreadCount}件
            </span>
          )}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-5xl">🔔</span>
            <p className="text-[14px] text-gray-400 dark:text-slate-500 text-center">
              通知はありません
            </p>
          </div>
        ) : (
          notifications.map(n => (
            <NotificationCard
              key={n.id}
              notification={n}
              onRead={handleRead}
            />
          ))
        )}
      </div>
    </div>
  )
}
