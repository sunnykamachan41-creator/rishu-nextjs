import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { backfillEnrollmentIds } from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

/**
 * POST /api/enrollment/backfill-ids
 *
 * enrollment シートの id 列が空の行に UUID を一括発行する。
 * 実装前に登録された既存行の救済用。冪等（何度呼んでも安全）。
 * Returns: { updated: number }
 */
export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.student_id) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  const studentId = normalizeId(session.user.student_id)
  const updated   = await backfillEnrollmentIds(studentId)

  return NextResponse.json({ ok: true, updated })
}
