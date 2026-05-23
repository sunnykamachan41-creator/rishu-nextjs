import { NextResponse }     from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { normalizeId }      from '@/lib/transform'
import { getSupportTickets } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const userId = normalizeId(session.user.student_id)

    const tickets = await getSupportTickets(userId)
    return NextResponse.json({ tickets })
  } catch (err) {
    console.error('[GET /api/support/list]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '取得に失敗しました' },
      { status: 500 },
    )
  }
}
