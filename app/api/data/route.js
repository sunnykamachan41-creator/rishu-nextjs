import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fetchAllSheets } from '@/lib/sheets'
import { detectConflicts, computeRequirements, computeSummary } from '@/lib/compute'
import { buildEnrollmentMapsWithCourses, normalizeCourse, normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // ── 認証 ──────────────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

    const {
      courses: rawCourses,
      requirements,
      normalizedEnrollment,
      enrollmentVersion,
      studentsSummary,
      departmentRows,
      userDepartment,
    } = await fetchAllSheets(studentId)

    const departments = (departmentRows ?? [])
      .map(r => ({
        department_id: normalizeId(r.department_id),
        label:         (r.label || '').trim(),
      }))
      .filter(d => d.department_id && d.label)

    const courses = rawCourses.map(normalizeCourse)

    const { selectedIds, statusMap, enrolledByGradeSem } =
      buildEnrollmentMapsWithCourses(normalizedEnrollment, courses)

    const completedIds = new Set(
      normalizedEnrollment
        .filter(e => e.status === 'COMPLETED')
        .map(e => e.class_id)
    )
    const projectedIds = new Set(
      normalizedEnrollment
        .filter(e => ['COMPLETED', 'IN_PROGRESS', 'PLANNED'].includes(e.status))
        .map(e => e.class_id)
    )

    const conflicts      = detectConflicts(courses, selectedIds)
    const computedReqs   = computeRequirements(courses, completedIds, requirements)
    const projectedReqs  = computeRequirements(courses, projectedIds, requirements)
    const { totalCredits, safeCredits } = computeSummary(courses, completedIds, conflicts)

    return NextResponse.json({
      courses,
      requirements:          computedReqs,
      selectedIds:           [...selectedIds],
      conflicts:             [...conflicts],
      totalCredits,
      safeCredits,
      enrollment:            normalizedEnrollment,
      statusMap:             Object.fromEntries(statusMap),
      enrolledByGradeSem:    Object.fromEntries(enrolledByGradeSem),
      enrollmentVersion,
      studentsSummary:       studentsSummary ?? null,
      completedIds:          [...completedIds],
      projectedIds:          [...projectedIds],
      projectedRequirements: projectedReqs,
      departments,
      userDepartment:        userDepartment || null,
      studentId,
    })
  } catch (err) {
    console.error('[GET /api/data]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
