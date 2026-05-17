import { NextResponse } from 'next/server'
import {
  fetchStudentsSummaryAll,
  fetchGraduationRuleAll,
  fetchCategoryFormulaAll,
  writeGraduationResult,
} from '@/lib/sheets'
import { computeGraduationResults } from '@/lib/graduation'

/**
 * GET /api/graduation
 * ───────────────────
 * Return the current GRADUATION_RESULT without recomputing.
 * Reads students_summary + GRADUATION_RULE + runs computation in-memory,
 * but does NOT write back to Sheets (read-only preview).
 *
 * Use POST to persist results.
 */
export async function GET() {
  try {
    const [studentRows, ruleRows, categoryFormulaRows] = await Promise.all([
      fetchStudentsSummaryAll(),
      fetchGraduationRuleAll(),
      fetchCategoryFormulaAll(),
    ])

    if (studentRows.length === 0) {
      return NextResponse.json({ error: 'students_summary is empty' }, { status: 404 })
    }
    if (ruleRows.length === 0) {
      return NextResponse.json({ error: 'GRADUATION_RULE is empty' }, { status: 404 })
    }

    console.log('[GET /api/graduation] categoryFormulaRows:', categoryFormulaRows.length)

    const results = computeGraduationResults(studentRows, ruleRows, categoryFormulaRows)

    return NextResponse.json({
      results,
      summary: {
        total:  results.length,
        passed: results.filter(r => r.result).length,
        failed: results.filter(r => !r.result).length,
      },
    })
  } catch (err) {
    console.error('[GET /api/graduation]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/graduation
 * ────────────────────
 * Recompute graduation results and write them to GRADUATION_RESULT.
 *
 * Pipeline:
 *   1. Read students_summary (all students, all category credits)
 *   2. Read GRADUATION_RULE (all rules)
 *   3. computeGraduationResults() — O(n) pure evaluation
 *   4. writeGraduationResult()    — batchUpdate to GRADUATION_RESULT sheet
 *
 * Returns: { results, summary }
 *
 * Body: (none required)
 *   Optional: { dry_run: true } to compute but skip writing to Sheets.
 */
export async function POST(request) {
  try {
    const body    = await request.json().catch(() => ({}))
    const dry_run = body?.dry_run === true

    const [studentRows, ruleRows, categoryFormulaRows] = await Promise.all([
      fetchStudentsSummaryAll(),
      fetchGraduationRuleAll(),
      fetchCategoryFormulaAll(),
    ])

    if (studentRows.length === 0) {
      return NextResponse.json(
        { error: 'students_summary is empty — run updateStudentsSummary first' },
        { status: 422 }
      )
    }
    if (ruleRows.length === 0) {
      return NextResponse.json(
        { error: 'GRADUATION_RULE sheet is empty or missing' },
        { status: 422 }
      )
    }

    console.log('[POST /api/graduation] computing:', {
      students:        studentRows.length,
      rules:           ruleRows.length,
      categoryFormulas: categoryFormulaRows.length,
      dry_run,
    })

    const results = computeGraduationResults(studentRows, ruleRows, categoryFormulaRows)

    if (!dry_run) {
      await writeGraduationResult(results)
    }

    return NextResponse.json({
      ok: true,
      dry_run,
      results,
      summary: {
        total:  results.length,
        passed: results.filter(r => r.result).length,
        failed: results.filter(r => !r.result).length,
      },
    })
  } catch (err) {
    console.error('[POST /api/graduation]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
