import { NextResponse } from 'next/server'
import {
  upsertUserDepartment,
  createOrInitStudentSummary,
  createOrInitGraduationResult,
  deleteStudentAllData,
  fetchAllSheets,
} from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

/**
 * GET /api/users
 * Returns the current user's department_id from the users sheet.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = normalizeId(searchParams.get('student_id') || process.env.STUDENT_ID || 'student_001')
    const { userDepartment } = await fetchAllSheets(studentId)
    return NextResponse.json({ department_id: userDepartment || null })
  } catch (err) {
    console.error('[GET /api/users]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/users
 * Upsert the current user's department in the users sheet,
 * then ensure a corresponding row exists in students_summary.
 *
 * Body: { department_id: string }
 * Returns: { ok: true, department_id: string }
 *
 * Pipeline (fire-and-forget after response is sent):
 *   upsertUserDepartment   → writes to users sheet (awaited, blocks response)
 *   createOrInitStudentSummary → ensures students_summary row exists (fire-and-forget)
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { department_id, studentId: rawStudentId = '' } = body
    const studentId = normalizeId(rawStudentId || process.env.STUDENT_ID || 'student_001')

    if (!department_id || typeof department_id !== 'string') {
      return NextResponse.json(
        { error: 'department_id is required' },
        { status: 400 }
      )
    }

    await upsertUserDepartment(department_id, studentId)

    // Fire-and-forget: create / sync the student's row in students_summary and GRADUATION_RESULT.
    // users sheet is source of truth; department_id is synced in both sheets.
    // Does NOT block the API response — failures are logged, not surfaced to client.
    createOrInitStudentSummary(department_id, studentId).catch(err =>
      console.error('[createOrInitStudentSummary] failed:', err)
    )
    createOrInitGraduationResult(department_id, studentId).catch(err =>
      console.error('[createOrInitGraduationResult] failed:', err)
    )

    console.log('[POST /api/users] user department saved:', department_id)
    return NextResponse.json({ ok: true, department_id })
  } catch (err) {
    console.error('[POST /api/users]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * DELETE /api/users?student_id=xxx
 * ─────────────────────────────────
 * Remove all rows belonging to student_id from every data sheet:
 *   users, enrollment, students_summary, progress_auto, GRADUATION_RESULT
 *
 * student_id is NFKC-normalised before comparison.
 * Each sheet is attempted independently — partial failures are logged
 * and reflected as 0 in the response count, but do not abort the operation.
 *
 * Returns:
 *   { ok: true, student_id, deleted: { users, enrollment, summary, progress, graduation } }
 */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('student_id')

    if (!studentId || !studentId.trim()) {
      return NextResponse.json(
        { error: 'student_id query parameter is required' },
        { status: 400 }
      )
    }

    console.log('[DELETE API HIT]', studentId)

    const { _counts: deleted, _debug: debug } = await deleteStudentAllData(studentId)

    console.log('[DELETE /api/users] done:', { studentId, deleted, debug })
    return NextResponse.json({
      ok:         true,
      student_id: studentId,
      deleted,
      debug,
    })
  } catch (err) {
    console.error('[DELETE /api/users]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
