import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { clearCurriculumDependentData } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/**
 * POST /api/enrollment/clear-all
 *
 * curriculum_year 変更時の完全リセット。
 *
 * curriculum_year に依存する派生データをすべて削除する:
 *   - enrollment（行空白化）
 *   - progress_auto（物理削除）
 *   - students_summary（物理削除）
 *   - GRADUATION_RESULT（物理削除）
 *   - additional_license_result（物理削除）
 *
 * 保持するもの: users / leave_periods / recognized_courses / account 情報
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

    const results = await clearCurriculumDependentData(studentId)
    console.log('[POST /api/enrollment/clear-all] curriculum reset complete for', studentId, results)

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('[POST /api/enrollment/clear-all]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
