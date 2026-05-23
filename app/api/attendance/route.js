import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAttendanceRecords, upsertAttendanceRecord } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/**
 * GET /api/attendance?enrollment_id=xxx
 * Returns all attendance_records rows for the given enrollment_id.
 * Only accessible by the authenticated student who owns the enrollment.
 */
export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.student_id) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const enrollmentId = (searchParams.get('enrollment_id') || '').trim()

  if (!enrollmentId) {
    return NextResponse.json({ error: 'enrollment_id は必須です' }, { status: 400 })
  }

  const records = await getAttendanceRecords(enrollmentId)

  return NextResponse.json({ records })
}

/**
 * POST /api/attendance
 * Body: { enrollment_id, session_number, status, memo? }
 *
 * status: 'present' | 'late' | 'absent' | null
 * status が null/'' → そのセッションの記録を削除（未記録に戻す）
 */
export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.student_id) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { enrollment_id, session_number, status, memo = '' } = body

  if (!enrollment_id || typeof enrollment_id !== 'string') {
    return NextResponse.json({ error: 'enrollment_id は必須の文字列です' }, { status: 400 })
  }

  const sn = parseInt(String(session_number), 10)
  if (!Number.isFinite(sn) || sn < 1) {
    return NextResponse.json({ error: 'session_number は 1 以上の整数です' }, { status: 400 })
  }

  const VALID_STATUSES = ['present', 'late', 'absent', null, '']
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'status は present / late / absent / null のいずれかです' }, { status: 400 })
  }

  if (typeof memo !== 'string' || memo.length > 200) {
    return NextResponse.json({ error: 'memo は200文字以内の文字列です' }, { status: 400 })
  }

  await upsertAttendanceRecord({
    enrollmentId:  enrollment_id,
    sessionNumber: sn,
    status:        status || null,
    memo,
  })

  return NextResponse.json({ ok: true })
}
