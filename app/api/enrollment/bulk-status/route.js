import { NextResponse } from 'next/server'
import { bulkUpdateEnrollmentStatus } from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

/**
 * POST /api/enrollment/bulk-status
 * ─────────────────────────────────
 * Bulk-update the status of specific enrollment rows by class_id.
 *
 * Body: { class_ids: string[], status: string }
 *
 * [DEV] 自動再計算無効 — POST /api/recalculate で手動実行。
 *
 * Returns: { ok, class_ids, status, updated_count }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { class_ids, status, studentId: rawStudentId = '' } = body
    const studentId = normalizeId(rawStudentId || process.env.STUDENT_ID || 'student_001')

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

    console.log('[POST /api/enrollment/bulk-status] start:', { class_ids_count: class_ids.length, status })

    const updatedCount = await bulkUpdateEnrollmentStatus(class_ids, status, studentId)

    console.log('[POST /api/enrollment/bulk-status] done:', { updated_count: updatedCount })

    return NextResponse.json({ ok: true, class_ids, status, updated_count: updatedCount })
  } catch (err) {
    console.error('[POST /api/enrollment/bulk-status]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
