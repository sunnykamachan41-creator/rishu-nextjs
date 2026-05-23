import { NextResponse }           from 'next/server'
import { getServerSession }       from 'next-auth'
import { authOptions }            from '@/lib/auth'
import { markNotificationAsRead } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/read
 * Body: { id: string }
 * 指定した通知を既読にする。
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { id } = body as { id?: string }

    if (!id) {
      return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
    }

    await markNotificationAsRead(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/notifications/read]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '更新に失敗しました' },
      { status: 500 },
    )
  }
}
