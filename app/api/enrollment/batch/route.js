import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { batchWriteEnrollments } from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

/**
 * POST /api/enrollment/batch
 * ─────────────────────────────────────────────────────────────────────────────
 * 複数の履修変更をまとめて1回の batchUpdate で保存する。
 * 再計算（progress_auto / students_summary / graduation_result）は行わない。
 * 再計算は別途「再計算」ボタンから /api/recalculate を呼ぶこと。
 *
 * Body:
 *   { changes: Array<{
 *       op:            'upsert' | 'remove',
 *       classId:       string,
 *       courseId?:     string | null,
 *       year?:         number,
 *       semester?:     'spring' | 'fall',
 *       status?:       string,
 *       academic_year?: number | null,
 *       is_temporary?:  boolean,
 *     }>
 *   }
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = normalizeId(session.user.student_id)

    const body = await request.json().catch(() => ({}))
    const { changes } = body

    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json(
        { error: 'changes must be a non-empty array' },
        { status: 400 },
      )
    }

    const VALID_OPS      = new Set(['upsert', 'remove'])
    const VALID_STATUSES = new Set(['COMPLETED', 'IN_PROGRESS', 'PLANNED', 'FAILED', 'AUDIT', 'RE_ENROLL'])

    for (const c of changes) {
      if (!VALID_OPS.has(c.op)) {
        return NextResponse.json({ error: `Invalid op: ${c.op}` }, { status: 400 })
      }
      if (!c.classId) {
        return NextResponse.json({ error: 'classId is required for each change' }, { status: 400 })
      }
      if (c.op === 'upsert' && !VALID_STATUSES.has(c.status)) {
        return NextResponse.json({ error: `Invalid status: ${c.status}` }, { status: 400 })
      }
    }

    console.log('[POST /api/enrollment/batch] student:', studentId, 'changes:', changes.length)
    await batchWriteEnrollments(changes, studentId)
    console.log('[POST /api/enrollment/batch] done')

    return NextResponse.json({ ok: true, count: changes.length })
  } catch (err) {
    console.error('[POST /api/enrollment/batch]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
