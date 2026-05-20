import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchAllSheets, fetchRecognizedCoursesForStudent } from '@/lib/sheets'
import { detectConflicts, computeSummary } from '@/lib/compute'
import { buildEnrollmentMapsWithCourses, normalizeCourse, normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

/**
 * start_year / end_year レンジを持つコースを年ごとに展開する。
 *
 * 例: start_year=2023, end_year=2025 のコース →
 *   academic_year=2023 版 / 2024 版 / 2025 版 の3件に展開。
 *
 * レンジがないコース（academic_year 単一値のみ）はそのまま返す。
 * 展開後の一意キーは class_id + academic_year（composite key）。
 */
function expandCoursesByYear(courses) {
  const result = []
  for (const c of courses) {
    const { start_year, end_year } = c
    if (
      start_year != null && end_year != null &&
      Number.isFinite(start_year) && Number.isFinite(end_year) &&
      start_year <= end_year
    ) {
      for (let y = start_year; y <= end_year; y++) {
        result.push({ ...c, academic_year: y })
      }
    } else {
      result.push(c)
    }
  }
  return result
}

export async function GET() {
  try {
    // ── 認証 ──────────────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

    const [
      {
        courses: rawCourses,
        normalizedEnrollment,
        enrollmentVersion,
        studentsSummary,
        departmentRows,
        userDepartment,
        userCurriculumYear,
      },
      recognizedCourses,
    ] = await Promise.all([
      fetchAllSheets(studentId),
      fetchRecognizedCoursesForStudent(studentId),
    ])

    const departments = (departmentRows ?? [])
      .map(r => ({
        department_id: normalizeId(r.department_id),
        label:         (r.label || '').trim(),
      }))
      .filter(d => d.department_id && d.label)

    const courses = expandCoursesByYear(rawCourses.map(normalizeCourse))

    const { selectedIds, statusMap, enrolledByGradeSem } =
      buildEnrollmentMapsWithCourses(normalizedEnrollment, courses)

    // is_temporary = TRUE の enrollment（仮登録）は卒業要件・単位集計から除外する。
    // temporaryIds を別セットで管理し、UI が「仮登録を含む」フラグで制御できるようにする。
    const temporaryIds = new Set(
      normalizedEnrollment
        .filter(e => e.is_temporary)
        .map(e => `${e.class_id}|${e.academic_year ?? ''}`)
    )

    // completedIds / projectedIds からは仮登録を除外する（デフォルト動作）
    const completedIds = new Set(
      normalizedEnrollment
        .filter(e => e.status === 'COMPLETED' && !e.is_temporary)
        .map(e => `${e.class_id}|${e.academic_year ?? ''}`)
    )
    const projectedIds = new Set(
      normalizedEnrollment
        .filter(e => ['COMPLETED', 'IN_PROGRESS', 'PLANNED'].includes(e.status) && !e.is_temporary)
        .map(e => `${e.class_id}|${e.academic_year ?? ''}`)
    )

    const conflicts                    = detectConflicts(courses, selectedIds)
    const { totalCredits, safeCredits } = computeSummary(courses, completedIds, conflicts)

    return NextResponse.json({
      courses,
      selectedIds:        [...selectedIds],
      conflicts:          [...conflicts],
      totalCredits,
      safeCredits,
      enrollment:         normalizedEnrollment,
      statusMap:          Object.fromEntries(statusMap),
      enrolledByGradeSem: Object.fromEntries(enrolledByGradeSem),
      enrollmentVersion,
      studentsSummary:    studentsSummary ?? null,
      completedIds:       [...completedIds],
      projectedIds:       [...projectedIds],
      temporaryIds:       [...temporaryIds],
      departments,
      userDepartment:     userDepartment || null,
      userCurriculumYear: userCurriculumYear ?? null,
      studentId,
      recognizedCourses:  recognizedCourses ?? [],
    })
  } catch (err) {
    console.error('[GET /api/data]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
