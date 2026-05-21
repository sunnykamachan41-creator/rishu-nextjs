import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { upsertLeavePeriod, removeLeavePeriod } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/**
 * POST /api/leave-periods
 *
 * 休学期間の追加・削除を単一エンドポイントで処理する。
 *
 * 追加: { action: 'add', leave_start: '3_fall', leave_end: '4_spring' }
 * 削除: { action: 'remove', leave_start: '3_fall' }
 *
 * leave_start / leave_end フォーマット: "{grade}_{semester}"
 *   e.g. "3_fall" = 3年秋学期
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

    const body = await request.json()
    const { action, leave_start, leave_end } = body

    if (!action || !leave_start) {
      return NextResponse.json({ error: 'action と leave_start は必須です' }, { status: 400 })
    }

    // フォーマット検証: "{grade}_{spring|fall}"
    const VALID_FORMAT = /^\d+_(spring|fall)$/
    if (!VALID_FORMAT.test(leave_start)) {
      return NextResponse.json({ error: `leave_start のフォーマットが不正です: ${leave_start}` }, { status: 400 })
    }

    if (action === 'add') {
      if (!leave_end || !VALID_FORMAT.test(leave_end)) {
        return NextResponse.json({ error: `leave_end のフォーマットが不正です: ${leave_end}` }, { status: 400 })
      }
      await upsertLeavePeriod({ studentId, leaveStart: leave_start, leaveEnd: leave_end })
      return NextResponse.json({ ok: true, action: 'added', leave_start, leave_end })
    }

    if (action === 'remove') {
      const removed = await removeLeavePeriod({ studentId, leaveStart: leave_start })
      return NextResponse.json({ ok: true, action: 'removed', removed })
    }

    return NextResponse.json({ error: `不明な action: ${action}` }, { status: 400 })
  } catch (err) {
    console.error('[POST /api/leave-periods]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
