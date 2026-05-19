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

    // コースの保存学期を取得（学年・学期の履修可否チェックは行わない）
    _step = 'fetchAllSheets'
    const { courses: rawCourses } = await fetchAllSheets(studentId)
    const course = rawCourses.map(normalizeCourse).find(c => c.class_id === classId)
    const storedSemester = course ? termToSemKey(course.term) : null

    _step = 'upsertEnrollment'
    const finalStatus = await upsertEnrollment({
      classId, courseId,
      year: studentGrade,
      semester: storedSemester,
      status,
      studentId,
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
