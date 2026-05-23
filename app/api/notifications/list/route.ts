import { NextResponse }                      from 'next/server'
import { getServerSession }                  from 'next-auth'
import { authOptions }                       from '@/lib/auth'
import { normalizeId }                       from '@/lib/transform'
import {
  getNotificationsByUserId,
  checkAndCreateSupportNotifications,
}                                            from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const userId = normalizeId(session.user.student_id)

    // resolved かつ未通知の support_tickets があれば通知を自動生成する。
    // エラーは握りつぶして通知取得に影響させない。
    try {
      await checkAndCreateSupportNotifications(userId)
    } catch (err) {
      console.error('[notifications/list] checkAndCreateSupportNotifications failed:', err)
    }

    const notifications = await getNotificationsByUserId(userId)
    // Sheets からは is_read が文字列 'true'/'false' で返るが、
    // getNotificationsByUserId 内で boolean 変換済み。
    const unreadCount   = notifications.filter(n => !n.is_read).length

    return NextResponse.json({ notifications, unreadCount })
  } catch (err) {
    console.error('[GET /api/notifications/list]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '取得に失敗しました' },
      { status: 500 },
    )
  }
}
