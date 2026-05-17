import { NextResponse } from 'next/server'
import { recalculateGraduation } from '@/lib/sheets'

/**
 * POST /api/graduation/recalculate
 * ─────────────────────────────────
 * Manually trigger the full graduation pipeline:
 *   fetchStudentsSummaryAll → fetchGraduationRuleAll → fetchCategoryFormulaAll
 *   → computeGraduationResults → writeGraduationResult
 *
 * Useful during development to force-refresh GRADUATION_RESULT
 * without waiting for an enrollment status change.
 *
 * Returns: { ok, summary: { total, passed, failed } }
 */
export async function POST() {
  try {
    const summary = await recalculateGraduation()

    if (!summary) {
      return NextResponse.json(
        { ok: false, error: 'skipped — students_summary or rules are empty' },
        { status: 422 }
      )
    }

    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    console.error('[POST /api/graduation/recalculate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
