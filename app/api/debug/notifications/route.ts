import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { normalizeId }      from '@/lib/transform'
import { getRange }         from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/notifications
 * 通知が生成されない原因を診断するデバッグ用エンドポイント。
 * support_tickets / notifications の生データを返す（変更は行わない）。
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const userId = normalizeId(session.user.student_id)

    // ── support_tickets ───────────────────────────────────────────────────────
    let supportRaw: string[][] = []
    let supportError: string | null = null
    try {
      supportRaw = await getRange('support_tickets', 'A:K') as string[][]
    } catch (e) {
      supportError = e instanceof Error ? e.message : String(e)
    }

    const supportHeaders = supportRaw[0] ?? []
    const supportRows    = supportRaw.slice(1)

    // ユーザーの全チケットをオブジェクト化
    const allTickets = supportRows.map(row =>
      Object.fromEntries(supportHeaders.map((h, i) => [h, row[i] ?? '']))
    )
    const myTickets = allTickets.filter(t => t.user_id === userId)

    // ── notifications ─────────────────────────────────────────────────────────
    let notifRaw: string[][] = []
    let notifError: string | null = null
    try {
      notifRaw = await getRange('notifications', 'A:H') as string[][]
    } catch (e) {
      notifError = e instanceof Error ? e.message : String(e)
    }

    const notifHeaders = notifRaw[0] ?? []
    const notifRows    = notifRaw.slice(1)
    const myNotifs     = notifRows
      .map(row => Object.fromEntries(notifHeaders.map((h, i) => [h, row[i] ?? ''])))
      .filter(n => n.user_id === userId)

    // ── 診断 ──────────────────────────────────────────────────────────────────
    const diagnosis = myTickets.map(t => ({
      id:                t.id,
      status:            t.status,
      has_admin_reply:   (t.admin_reply ?? '').trim().length > 0,
      notification_sent: t.notification_sent,
      would_notify:
        t.status === 'resolved' &&
        (t.admin_reply ?? '').trim().length > 0 &&
        t.notification_sent !== 'true',
    }))

    return NextResponse.json({
      session_user_id: userId,

      support_tickets: {
        error:          supportError,
        headers:        supportHeaders,
        total_rows:     supportRows.length,
        my_tickets:     myTickets,
        my_ticket_count: myTickets.length,
      },

      notifications: {
        error:       notifError,
        headers:     notifHeaders,
        my_notifs:   myNotifs,
        my_notif_count: myNotifs.length,
      },

      diagnosis,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
