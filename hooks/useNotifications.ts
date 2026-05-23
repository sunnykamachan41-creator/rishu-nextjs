import useSWR from 'swr'
import type { AppNotification } from '@/lib/notification'

const fetcher = (url: string) =>
  fetch(url).then(r => {
    if (!r.ok) return r.json().then((d: { error?: string }) => Promise.reject(d))
    return r.json()
  })

// Sheets は boolean を文字列で返す場合があるため正規化
function normalizeIsRead(v: boolean | string | undefined): boolean {
  if (typeof v === 'boolean') return v
  return v === 'true'
}

/**
 * ログインユーザーの通知一覧と未読数を取得する。
 * - 3分ごとに自動リフレッシュ
 * - フォーカス時に再検証（タブに戻ったとき最新通知を取得）
 * - markAsRead は楽観更新 + API → 即時再検証の3段階で Bell を確実に更新
 */
export function useNotifications() {
  const { data, error, isLoading, mutate } = useSWR<{
    notifications: AppNotification[]
    unreadCount:   number
  }>('/api/notifications/list', fetcher, {
    refreshInterval:   3 * 60_000,
    revalidateOnFocus: true,
    // Sheets の string boolean を正規化するために onSuccess で変換
    onSuccess: (d) => {
      if (!d?.notifications) return
      d.notifications = d.notifications.map(n => ({
        ...n,
        is_read: normalizeIsRead(n.is_read),
      }))
      d.unreadCount = d.notifications.filter(n => !n.is_read).length
    },
  })

  /**
   * 通知を既読にする。
   * 1. ローカル楽観更新（即時 UI 反映）
   * 2. API POST
   * 3. 再検証（Bell バッジをサーバーと確実に同期）
   */
  const markAsRead = async (id: string) => {
    // ① 楽観更新
    mutate(cur => {
      if (!cur) return cur
      const notifications = cur.notifications.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      )
      return {
        ...cur,
        notifications,
        unreadCount: notifications.filter(n => !n.is_read).length,
      }
    }, false)

    // ② API
    try {
      await fetch('/api/notifications/read', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
    } catch (e) {
      console.error('[markAsRead]', e)
    }

    // ③ 再検証（サーバーと同期してBell件数を確定）
    mutate()
  }

  // Sheets string boolean を正規化して返す
  const notifications = (data?.notifications ?? []).map(n => ({
    ...n,
    is_read: normalizeIsRead(n.is_read),
  }))
  const unreadCount = notifications.filter(n => !n.is_read).length

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    mutate,
    markAsRead,
  }
}
