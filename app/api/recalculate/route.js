import { NextResponse } from 'next/server'
import {
  updateProgressAuto,
  updateStudentsSummary,
  recalculateGraduation,
  fetchAllStudentIds,
} from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

/**
 * POST /api/recalculate
 * ──────────────────────
 * [DEV-ONLY] Full recalculation pipeline for all registered students (or a
 * specific student when student_id is supplied in the request body).
 *
 * Pipeline:
 *   1. updateProgressAuto(sid)  — per student: rebuild enrollment × course JOIN
 *   2. updateStudentsSummary()  — aggregate COMPLETED credits for ALL students
 *   3. recalculateGraduation()  — evaluate rules → write GRADUATION_RESULT
 *
 * Body (all optional):
 *   { student_id?: string }
 *
 *   student_id supplied  → recalculate only that student's progress_auto row
 *   student_id omitted   → iterate over every row in the users sheet
 *
 * Note: updateProgressAuto is student-scoped and non-destructive — calling it
 * for student A preserves student B's rows in progress_auto.
 * updateStudentsSummary always runs globally (reads all rows in progress_auto).
 */
export async function POST(request) {
  try {
    const body      = await request.json().catch(() => ({}))
    const rawSid    = body?.student_id ?? ''
    const studentId = rawSid ? normalizeId(rawSid) : null

    // ── Step 1: Determine which students to recalculate ───────────────────────
    let targetIds

    if (studentId) {
      // Single-student mode — explicit student_id in request body
      targetIds = [studentId]
      console.log('[POST /api/recalculate] single-student mode:', studentId)
    } else {
      // All-students mode — iterate the users sheet
      targetIds = await fetchAllStudentIds()
      if (targetIds.length === 0) {
        // No users registered yet — fall back to env default
        const fallback = normalizeId(process.env.STUDENT_ID || 'student_001')
        targetIds = [fallback]
        console.warn('[POST /api/recalculate] users sheet empty — falling back to:', fallback)
      } else {
        console.log('[POST /api/recalculate] all-students mode:', targetIds)
      }
    }

    // ── Step 2: Rebuild progress_auto for each student (sequential) ───────────
    // updateProgressAuto is student-scoped: it reads the full sheet, strips only
    // this student's old rows, appends fresh rows, then writes the merged result.
    // Running sequentially avoids concurrent overwrites of the same sheet.
    for (const sid of targetIds) {
      console.log('[POST /api/recalculate] updateProgressAuto →', sid)
      await updateProgressAuto(sid)
    }

    // ── Step 3: Aggregate credits ─────────────────────────────────────────────
    // student_id が指定された場合はその学生のみ集計する。
    // 省略時（管理者用途）は全学生を対象にする。
    await updateStudentsSummary('', studentId ?? null)

    // ── Step 4: Recompute graduation results ──────────────────────────────────
    const graduation = await recalculateGraduation()

    console.log('[POST /api/recalculate] done', {
      students:   targetIds.length,
      graduation,
    })

    return NextResponse.json({ ok: true, students: targetIds, graduation })
  } catch (err) {
    console.error('[POST /api/recalculate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
