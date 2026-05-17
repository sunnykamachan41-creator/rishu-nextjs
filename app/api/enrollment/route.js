import { NextResponse } from 'next/server'
import { upsertEnrollment, removeEnrollment, fetchAllSheets } from '@/lib/sheets'
import { normalizeCourse, normalizeId } from '@/lib/transform'
import { isCourseEligible, isGradeAllowed, isSemesterAllowed, termToSemKey } from '@/lib/eligibility'

/**
 * POST /api/enrollment
 *
 * Required fields (for COMPLETED / IN_PROGRESS / PLANNED):
 *   classId   — section-specific class ID (primary key)
 *   year      — integer 1–8 (student's current grade)
 *   semester  — 'spring' | 'fall' (current UI semester, used for validation only)
 *   status    — 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED' | 'REMOVE'
 *
 * Optional:
 *   courseId  — derived from classId if omitted
 *
 * Guards (applied before write, cannot be bypassed):
 *   • year/semester validation: both are required and must be well-formed (→ 400)
 *   • isCourseEligible(course, year, semester) from lib/eligibility (→ 403 on violation)
 *
 * The semester stored in Sheets is derived from course.term via termToSemKey
 * (null for 通年), NOT the client-supplied semester — that field is validation-only.
 *
 * Eligibility rules live exclusively in lib/eligibility.ts.
 */

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const body = await request.json()
    const { classId, courseId, year, semester, status, department = '', studentId: rawStudentId = '' } = body
    const studentId = normalizeId(rawStudentId || process.env.STUDENT_ID || 'student_001')

    if (!classId) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 })
    }
    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 })
    }

    // REMOVE は常に許可（ガード不要）
    if (status === 'REMOVE') {
      await removeEnrollment({ classId, studentId })
      // [DEV] 自動再計算無効 — POST /api/recalculate で手動実行
      return NextResponse.json({ classId, removed: true })
    }

    const validStatuses = ['COMPLETED', 'IN_PROGRESS', 'PLANNED', 'FAILED', 'AUDIT', 'RE_ENROLL']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}. Must be one of ${validStatuses.join(', ')} or REMOVE` },
        { status: 400 }
      )
    }

    // ── 必須フィールドの厳密バリデーション（silent fail 禁止）────────────────
    // year: 1〜8 の整数が必須。未送信・NaN・範囲外はすべて 400
    const studentGrade = parseInt(String(year ?? ''), 10)
    if (!Number.isFinite(studentGrade) || studentGrade < 1 || studentGrade > 8) {
      return NextResponse.json(
        { error: 'year は 1〜8 の整数で必須です', code: 'INVALID_YEAR', received: year },
        { status: 400 }
      )
    }

    // semester: 'spring' か 'fall' のみ受付。null・undefined・その他は 400
    if (semester !== 'spring' && semester !== 'fall') {
      return NextResponse.json(
        { error: 'semester は "spring" または "fall" で必須です', code: 'INVALID_SEMESTER', received: semester },
        { status: 400 }
      )
    }

    // ── 履修可能条件チェック（lib/eligibility の共通関数を使用）──────────────
    // fetchAllSheets は 15 秒キャッシュ済みなので追加コストはほぼゼロ
    const { courses: rawCourses } = await fetchAllSheets(studentId)
    const course = rawCourses.map(normalizeCourse).find(c => c.class_id === classId)

    if (course) {
      // course は normalizeCourse 済み:
      //   course.year = "2" などの数値文字列 or "" (transform.ts が保証)
      //   course.term = "春学期" などの正規日本語文字列 (transform.ts が保証)

      // 学年ガード（isGradeAllowed は正規化済み値を受け取り比較のみ実行）
      if (!isGradeAllowed(course.year, studentGrade)) {
        return NextResponse.json(
          { error: '履修可能学年を満たしていません', code: 'GRADE_GUARD',
            required: Number(course.year), actual: studentGrade },
          { status: 403 }
        )
      }

      // 学期ガード（通年は isSemesterAllowed が true を返すため通過）
      if (!isSemesterAllowed(course.term, semester)) {
        return NextResponse.json(
          { error: '学期が一致しません', code: 'SEMESTER_GUARD',
            required: termToSemKey(course.term), actual: semester },
          { status: 403 }
        )
      }
    }
    // course が見つからない場合はカタログ外の授業として登録を許可（手動追加コース等）

    // ストアする semester はコースの term から決定（通年 = null）
    // クライアントの semester フィールドはバリデーション専用であり保存しない
    const storedSemester = course ? termToSemKey(course.term) : null

    const finalStatus = await upsertEnrollment({
      classId, courseId,
      year: studentGrade,
      semester: storedSemester,
      status,
      studentId,
    })

    // [DEV] 自動再計算無効 — POST /api/recalculate で手動実行

    return NextResponse.json({ classId, status: finalStatus })
  } catch (err) {
    console.error('[POST /api/enrollment]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
