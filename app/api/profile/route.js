import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserProfile, updateUserProfile } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/** GET /api/profile — プロフィール取得 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.student_id) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  const profile = await getUserProfile(session.user.student_id)
  return NextResponse.json({
    ...profile,
    name:  session.user.name,
    email: session.user.email,
    image: session.user.image,
  })
}

/** PATCH /api/profile — specialty / minor / enrollment_year の更新 */
export async function PATCH(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.student_id) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  const body = await request.json()

  // 更新許可フィールドのみ通す（department は /api/users で管理）
  const ALLOWED = ['specialty', 'minor', 'enrollment_year']
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED.includes(k))
  )

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '更新フィールドがありません' }, { status: 400 })
  }

  await updateUserProfile(session.user.student_id, updates)
  return NextResponse.json({ success: true })
}
