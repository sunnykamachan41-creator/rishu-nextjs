import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { upsertEnrollment, removeEnrollment, fetchAllSheets } from '@/lib/sheets'
import { normalizeCourse } from '@/lib/transform'
import { termToSemKey } from '@/lib/eligibility'

export const dynamic = 'force-dynamic'

/**
 * POST /api/enrollment
 *
 * 認証: NextAuth セッション (session.user.student_id)
 * クライアントから studentId を送る必要はない。
 */
export async function POST(request) {
  let _step = 'init'
  try {
    // ── 認証 ────────────────────────────────────────────────────────────────
    _step = 'auth'
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

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

    // コースの保存学期と academic_year を取得
    _step = 'fetchAllSheets'
    const { courses: rawCourses, userCurriculumYear } = await fetchAllSheets(studentId)
    const courses = rawCourses.map(normalizeCourse)
    const course  = courses.find(c => c.class_id === classId)
    const storedSemester = course ? termToSemKey(course.term) : null
    // academic_year: コースレコードが持つ開講年度（ない場合は null）
    const academicYear = course?.academic_year ?? null

    // ── academic_year バリデーション ──────────────────────────────────────────
    // コースに academic_year が設定されている場合、学生の「学年 + 入学年度」と一致するか確認。
    // 一致しない → 別年度の授業への誤登録を防ぐ。
    // curriculum_year が未設定（null）の場合はチェックをスキップ（後方互換）。
    if (academicYear != null && userCurriculumYear != null) {
      // 学生のその学年での開講年度: curriculum_year + (grade - 1)
      const expectedAcademicYear = userCurriculumYear + (studentGrade - 1)
      if (academicYear !== expectedAcademicYear) {
        console.warn('[POST /api/enrollment] academic_year mismatch:', {
          classId, academicYear, expectedAcademicYear, studentGrade, userCurriculumYear,
        })
        return NextResponse.json(
          {
            error: `この授業（${academicYear}年度開講）は${studentGrade}年生として登録できません。`,
            code:  'ACADEMIC_YEAR_MISMATCH',
            academicYear,
            expectedAcademicYear,
          },
          { status: 400 }
        )
      }
    }

    _step = 'upsertEnrollment'
    const finalStatus = await upsertEnrollment({
      classId, courseId,
      year: studentGrade,
      semester: storedSemester,
      status,
      studentId,
      academic_year: academicYear,
    })

    return NextResponse.json({ classId, status: finalStatus })
  } catch (err) {
    // Google API エラーは err.message が空で err.errors に詳細が入ることがある
    const detail =
      err.message ||
      (Array.isArray(err.errors) ? JSON.stringify(err.errors) : '') ||
      (err.response?.data ? JSON.stringify(err.response.data) : '') ||
      String(err)
    console.error(`[POST /api/enrollment] FAILED at step=${_step}:`, detail, err)
    return NextResponse.json({ error: `[${_step}] ${detail}` }, { status: 500 })
  }
}
