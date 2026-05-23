// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType = 'support' | 'system' | 'warning'

export interface AppNotification {
  id:         string
  created_at: string
  user_id:    string
  title:      string
  message:    string
  link:       string   // 押下時の遷移先（例: /support）
  is_read:    boolean
  type:       NotificationType
}

// ── Type config ───────────────────────────────────────────────────────────────

export const NOTIFICATION_TYPE_CONFIG: Record<
  NotificationType,
  { icon: string; bg: string; iconBg: string; iconText: string }
> = {
  support: {
    icon:     '💬',
    bg:       'bg-indigo-50 dark:bg-indigo-500/10',
    iconBg:   'bg-indigo-100 dark:bg-indigo-500/20',
    iconText: 'text-indigo-600 dark:text-indigo-400',
  },
  system: {
    icon:     '🔔',
    bg:       'bg-blue-50 dark:bg-blue-500/10',
    iconBg:   'bg-blue-100 dark:bg-blue-500/20',
    iconText: 'text-blue-600 dark:text-blue-400',
  },
  warning: {
    icon:     '⚠️',
    bg:       'bg-amber-50 dark:bg-amber-500/10',
    iconBg:   'bg-amber-100 dark:bg-amber-500/20',
    iconText: 'text-amber-600 dark:text-amber-400',
  },
}

export function notificationTypeConfig(type: NotificationType | string) {
  return NOTIFICATION_TYPE_CONFIG[type as NotificationType] ?? NOTIFICATION_TYPE_CONFIG.system
}

// ── Date formatting ───────────────────────────────────────────────────────────

export function formatNotificationDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min  = Math.floor(diff / 60_000)
  const hour = Math.floor(diff / 3_600_000)
  const day  = Math.floor(diff / 86_400_000)
  if (min  <  1)  return 'たった今'
  if (min  < 60)  return `${min}分前`
  if (hour < 24)  return `${hour}時間前`
  if (day  <  7)  return `${day}日前`
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}
