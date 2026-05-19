import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { bulkUpdateEnrollmentStatus } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/**
 * POST /api/enrollment/bulk-status
 *
 * 認証: NextAuth セッション
 * Body: { class_ids: string[], status: string }
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

    const body = await request.json().catch(() => ({}))
    const { class_ids, status } = body

    if (!Array.isArray(class_ids) || class_ids.length === 0) {
      return NextResponse.json({ error: 'class_ids must be a non-empty array' }, { status: 400 })
    }

    const VALID = ['COMPLETED', 'IN_PROGRESS', 'PLANNED', 'FAILED', 'AUDIT', 'RE_ENROLL']
    if (!VALID.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID.join(', ')}` },
        { status: 400 }
      )
    }

    const updatedCount = await bulkUpdateEnrollmentStatus(class_ids, status, studentId)

    return NextResponse.json({ ok: true, class_ids, status, updated_count: updatedCount })
  } catch (err) {
    console.error('[POST /api/enrollment/bulk-status]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
