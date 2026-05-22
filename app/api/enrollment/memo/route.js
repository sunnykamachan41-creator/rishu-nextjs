import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateEnrollmentMemo } from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/enrollment/memo
 * Body: { classId: string, memo: string }
 *
 * メモのみを直接シートに書き込む。pendingChanges を経由しない。
 * 対象 enrollment 行が存在しない場合は 404 を返す。
 */
export async function PATCH(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.student_id) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  const studentId = normalizeId(session.user.student_id)

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { classId, memo } = body

  if (!classId || typeof classId !== 'string') {
    return NextResponse.json({ error: 'classId は必須の文字列です' }, { status: 400 })
  }
  if (typeof memo !== 'string') {
    return NextResponse.json({ error: 'memo は文字列である必要があります' }, { status: 400 })
  }
  if (memo.length > 200) {
    return NextResponse.json({ error: 'メモは200文字以内にしてください' }, { status: 400 })
  }

  const updated = await updateEnrollmentMemo({ classId, memo, studentId })

  if (!updated) {
    return NextResponse.json({ error: '対象の履修が見つかりません' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
