import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { upsertEnrollment, removeEnrollment, fetchAllSheets } from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

/**
 * POST /api/enrollment
 *
 * 認証: NextAuth セッション (session.user.student_id)
 * クライアントから studentId を送る必要はない。
 */
export async function POST(request: Request) {
  let _step = 'init'
  console.log('[POST /api/enrollment] called')
  try {
    // ── 認証 ────────────────────────────────────────────────────────────────
    _step = 'auth'
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId: string = session.user.student_id

    _step = 'parse-body'
    const body = await request.json()
    const { classId, courseId, year, semester, status } = body

    console.log('[POST /api/enrollment] req:', { studentId, classId, status, year, semester })

    if (!classId) return NextResponse.json({ error: 'classId is required' }, { status: 400 })
    if (!status)  return NextResponse.json({ error: 'status is required' },  { status: 400 })

    // REMOVE は常に許可
    if (status === 'REMOVE') {
      _step = 'remove'
      await removeEnrollment({ classId, studentId })
      return NextResponse.json({ classId, removed: true })
    }

    const validStatuses = ['COMPLETED', 'IN_PROGRESS', 'PLANNED', 'FAILED', 'AUDIT', 'RE_ENROLL']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}` },
        { status: 400 }
      )
    }

    // 学年バリデーション（範囲チェックのみ）
    const studentGrade = parseInt(String(year ?? ''), 10)
    if (!Number.isFinite(studentGrade) || studentGrade < 1 || studentGrade > 8) {
      return NextResponse.json(
        { error: 'year は 1〜8 の整数で必須です', code: 'INVALID_YEAR', received: year },
        { status: 400 }
      )
    }

    // 学期バリデーション（形式チェックのみ）
    if (semester !== 'spring' && semester !== 'fall') {
      return NextResponse.json(
        { error: 'semester は "spring" または "fall" で必須です', code: 'INVALID_SEMESTER', received: semester },
        { status: 400 }
      )
    }

    // academic_year の決定:
    //   userCurriculumYear が設定されている場合は curriculum_year + (grade - 1) を使用する。
    //   start_year/end_year レンジコースでも登録時に正しい年度が記録される。
    //   userCurriculumYear が未設定（レガシー）の場合はコースの academic_year を使用する。
    _step = 'fetchAllSheets'
    const { courses: rawCourses, userCurriculumYear } = await fetchAllSheets(studentId)

    // 正規化なしで class_id を比較（normalizeId のみ使用）
    const normalizedClassId = normalizeId(classId)
    const rawCourse = rawCourses.find(
      (c: Record<string, string>) => normalizeId(c.class_id || c.course_id) === normalizedClassId
    )

    const rawAcademicYear = rawCourse?.academic_year
    const courseAcademicYear = rawAcademicYear ? parseInt(String(rawAcademicYear), 10) : null

    const academicYear: number | null = (userCurriculumYear != null && Number.isFinite(studentGrade))
      ? userCurriculumYear + (studentGrade - 1)
      : (Number.isFinite(courseAcademicYear) ? courseAcademicYear : null)

    console.log('[POST /api/enrollment] academicYear:', academicYear, 'userCurriculumYear:', userCurriculumYear)

    _step = 'upsertEnrollment'
    const finalStatus = await upsertEnrollment({
      classId, courseId,
      year: studentGrade,
      semester,   // クライアントが送った UI 学期をそのまま保存（'spring' | 'fall'）
      status,
      studentId,
      academic_year: academicYear,
    })

    return NextResponse.json({ classId, status: finalStatus })
  } catch (err: unknown) {
    // JSON.stringify itself can throw (circular refs in gaxios response objects),
    // so use a safe serialiser that never throws.
    const safeStr = (v: unknown) => {
      try { return JSON.stringify(v) } catch { return String(v) }
    }
    const e = err as Record<string, unknown> | null
    const detail: string =
      (typeof e?.message === 'string' && e.message ? e.message : '') ||
      (Array.isArray(e?.errors) ? safeStr(e.errors) : '') ||
      (e?.response && (e.response as Record<string, unknown>)?.data
        ? safeStr((e.response as Record<string, unknown>).data) : '') ||
      (err != null ? String(err) : 'unknown error')
    console.error(`[POST /api/enrollment] FAILED at step=${_step}:`, detail, err)
    try {
      return NextResponse.json({ error: `[${_step}] ${detail || 'unknown error'}` }, { status: 500 })
    } catch {
      // Last-resort: if NextResponse.json itself throws, return manually-constructed JSON
      const msg = `[${_step}] ${detail || 'unknown error'}`
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}
