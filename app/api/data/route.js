import { NextResponse } from 'next/server'
import { fetchAllSheets, bootstrapUserIfNeeded } from '@/lib/sheets'
import { detectConflicts, computeRequirements, computeSummary } from '@/lib/compute'
import { buildEnrollmentMapsWithCourses, normalizeCourse, normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = normalizeId(searchParams.get('student_id') || process.env.STUDENT_ID || 'student_001')

    // Auto-register student in users sheet on first access.
    // bootstrapUserIfNeeded is idempotent (no-op if row already exists) and
    // invalidates the per-student cache when a new row is created, so the
    // subsequent fetchAllSheets call picks up the newly written row.
    await bootstrapUserIfNeeded(studentId)

    const {
      courses: rawCourses,
      requirements,
      normalizedEnrollment,
      enrollmentVersion,
      studentsSummary,
      departmentRows,
      userDepartment,
    } = await fetchAllSheets(studentId)

    // Normalize departments master: NFKC department_id, trimmed label
    // department_id is the sole internal key; label is display-only
    const departments = (departmentRows ?? [])
      .map(r => ({
        department_id: normalizeId(r.department_id),
        label:         (r.label || '').trim(),
      }))
      .filter(d => d.department_id && d.label)

    // Normalise course rows
    const courses = rawCourses.map(normalizeCourse)

    // Build enrollment maps (selectedIds for legacy UI, statusMap for new UI)
    const { selectedIds, statusMap, enrolledByGradeSem } =
      buildEnrollmentMapsWithCourses(normalizedEnrollment, courses)

    // ── Status-filtered ID sets ───────────────────────────────────────────
    // completedIds  : COMPLETED のみ → 卒業要件・単位集計の基準値
    // projectedIds  : COMPLETED + IN_PROGRESS + PLANNED → 「取得予定を含む」モード
    const completedIds  = new Set(
      normalizedEnrollment
        .filter(e => e.status === 'COMPLETED')
        .map(e => e.class_id)
    )
    const projectedIds  = new Set(
      normalizedEnrollment
        .filter(e => e.status === 'COMPLETED' || e.status === 'IN_PROGRESS' || e.status === 'PLANNED')
        .map(e => e.class_id)
    )

    // Server-side computations (completedIds が卒業要件の基準)
    const conflicts      = detectConflicts(courses, selectedIds)
    const computedReqs   = computeRequirements(courses, completedIds, requirements)
    const projectedReqs  = computeRequirements(courses, projectedIds, requirements)
    const { totalCredits, safeCredits } = computeSummary(courses, completedIds, conflicts)

    return NextResponse.json({
      // ── Backward-compatible fields (existing UI unchanged) ──────────────
      courses,
      requirements:   computedReqs,
      selectedIds:    [...selectedIds],
      conflicts:      [...conflicts],
      totalCredits,
      safeCredits,

      // ── New fields (for new UI features) ────────────────────────────────
      enrollment:              normalizedEnrollment,
      statusMap:               Object.fromEntries(statusMap),
      enrolledByGradeSem:      Object.fromEntries(enrolledByGradeSem),
      enrollmentVersion,
      studentsSummary:         studentsSummary ?? null,
      completedIds:            [...completedIds],
      projectedIds:            [...projectedIds],
      projectedRequirements:   projectedReqs,

      // departments master — {department_id, label}[]
      // Client builds departmentsMap from this; never use hardcoded labels
      departments,

      // Current user's department_id from users sheet (source of truth)
      // Client syncs this to localStorage on load
      userDepartment: userDepartment || null,

      // Current student_id (NFKC-normalised)
      // Exposed so the client can pass it to bulk-update endpoints
      studentId,
    })
  } catch (err) {
    console.error('[GET /api/data]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
