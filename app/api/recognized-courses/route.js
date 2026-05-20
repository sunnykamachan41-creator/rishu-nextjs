import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  fetchRecognizedCoursesForStudent,
  upsertRecognizedCourse,
  removeRecognizedCoursesBatch,
  updateProgressAuto,
  updateStudentsSummary,
  recalculateGraduation,
  invalidateCache,
} from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recognized-courses
 *
 * 認証済み学生の recognized_courses 行を全件返す。
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = normalizeId(session.user.student_id)
    const rows = await fetchRecognizedCoursesForStudent(studentId)
    return NextResponse.json({ recognizedCourses: rows })
  } catch (err) {
    console.error('[GET /api/recognized-courses]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/recognized-courses
 *
 * 単一コース:
 *   { action: 'add' | 'remove', courseId: string, academicYear?: number|null,
 *     recognizedType?: string, recognizedNote?: string }
 *
 * バッチ（複数コース一括）:
 *   { action: 'add' | 'remove', courses: Array<{ courseId, academicYear?, recognizedType?, recognizedNote? }> }
 *   ※ courses が存在する場合は courseId フィールドを無視してバッチ処理する。
 *
 * 書き込みを全件完了してから recalculate パイプラインを1回だけ実行する。
 * これにより第二外国語（4コース）などのバッチ登録でも recalculate は1回で済む。
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = normalizeId(session.user.student_id)

    const body = await request.json()
    const { action, courseId, academicYear, recognizedType, recognizedNote, courses } = body

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    // バッチ（courses 配列）または単一（courseId）を統一的に扱う
    const targets = Array.isArray(courses) && courses.length > 0
      ? courses
      : courseId
        ? [{ courseId, academicYear, recognizedType, recognizedNote }]
        : null

    if (!targets) {
      return NextResponse.json({ error: 'courseId or courses[] is required' }, { status: 400 })
    }

    // ── 書き込み（sequential — Google Sheets への並列書き込みを避ける） ──────
    if (action === 'add') {
      for (const t of targets) {
        await upsertRecognizedCourse({
          studentId,
          courseId:       normalizeId(t.courseId),
          academicYear:   t.academicYear != null ? Number(t.academicYear) : null,
          recognizedType: t.recognizedType ?? null,
          recognizedNote: t.recognizedNote ?? null,
        })
        console.log('[POST /api/recognized-courses] add:', { studentId, courseId: t.courseId, recognizedType: t.recognizedType })
      }
    } else if (action === 'remove') {
      await removeRecognizedCoursesBatch({
        studentId,
        courseIds: targets.map(t => normalizeId(t.courseId)),
      })
      console.log('[POST /api/recognized-courses] remove batch:', {
        studentId,
        courseIds: targets.map(t => t.courseId),
      })
    } else {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 })
    }

    // ── 再計算パイプライン（全書き込み完了後に1回だけ実行） ──────────────────
    invalidateCache(studentId)
    await updateProgressAuto(studentId)
    await updateStudentsSummary()
    await recalculateGraduation()

    console.log('[POST /api/recognized-courses] recalculate done:', {
      studentId, action, count: targets.length,
    })

    return NextResponse.json({
      [action === 'add' ? 'added' : 'removed']: targets.map(t => t.courseId),
      recalculated: true,
    })
  } catch (err) {
    console.error('[POST /api/recognized-courses]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
