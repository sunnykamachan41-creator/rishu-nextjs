import { NextResponse } from 'next/server'
import {
  fetchRawRows,
  fetchAdditionalLicenseAvailabilityAll,
  fetchProgressAutoForStudent,
  fetchAllSheets,
} from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a raw 2-D array (row 0 = header) into a structured object
 * that includes count, headers, and the first rows as objects.
 * Returns a safe shape even for empty / missing sheets.
 *
 * @param {string[][]} raw         2-D array returned by fetchRawRows()
 * @param {number}     [maxRows=20] max data rows to include in .rows
 */
function sheetSummary(raw, maxRows = 20) {
  if (!raw || raw.length === 0) {
    return { count: 0, headers: [], rows: [] }
  }

  const [headerRow, ...body] = raw
  const headers = headerRow.map(h => String(h ?? ''))

  const rows = body
    .slice(0, maxRows)
    .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])))

  return {
    count: body.length,
    headers,
    rows,
  }
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawStudentId = searchParams.get('student_id') ?? process.env.STUDENT_ID ?? 'student_001'
    const studentId    = normalizeId(rawStudentId)

    // ── 1. Fetch core sheet data (users → department) ─────────────────────────
    const allSheets = await fetchAllSheets(studentId)
    const rawDepartment = (() => {
      // Read raw department from users sheet via allSheets.userDepartment (already normalised)
      // Also surface the raw (pre-normalise) value from the users rows
      const usersRaw = allSheets._enrollmentRows  // not directly available for users
      return allSheets.userDepartment ?? ''
    })()
    const departmentId = normalizeId(rawDepartment)

    // ── 2. Fetch all sheet raws in parallel ───────────────────────────────────
    const [
      rawLicenseDisplay,
      rawAdditionalLicenseUI,
      rawAdditionalLicenseRule,
      rawAdditionalLicenseAvailability,
      rawAdditionalLicenseResult,
      rawProgressAuto,
    ] = await Promise.all([
      fetchRawRows('license_display'),
      fetchRawRows('additional_license_ui'),
      fetchRawRows('additional_license_rule'),
      fetchRawRows('additional_license_availability'),
      fetchRawRows('additional_license_result'),
      fetchRawRows('progress_auto'),
    ])

    // ── 3. Build sheet summaries ──────────────────────────────────────────────
    const sheets = {
      license_display:                   sheetSummary(rawLicenseDisplay),
      additional_license_ui:             sheetSummary(rawAdditionalLicenseUI),
      additional_license_rule:           sheetSummary(rawAdditionalLicenseRule),
      additional_license_availability:   sheetSummary(rawAdditionalLicenseAvailability),
      additional_license_result:         sheetSummary(rawAdditionalLicenseResult),
    }

    // ── 4. progress_auto sample (first 5 rows, trimmed columns) ──────────────
    const progressSample = (() => {
      if (!rawProgressAuto || rawProgressAuto.length < 2) return []
      const [hdr, ...body] = rawProgressAuto
      const normalize = h => normalizeId(String(h ?? ''))
      const idxOf = col => hdr.findIndex(h => normalize(h) === col)
      const sidIdx  = idxOf('student_id')
      const catIdx  = idxOf('final_category')
      const stIdx   = idxOf('status')
      const crIdx   = idxOf('credits')

      return body
        .filter(row => normalizeId(String(row[sidIdx] ?? '')) === studentId)
        .slice(0, 5)
        .map(row => ({
          final_category: row[catIdx] ?? '',
          status:         row[stIdx]  ?? '',
          credits:        row[crIdx]  ?? '',
        }))
    })()

    // ── 5. Analysis ───────────────────────────────────────────────────────────

    // 5a. Blocked licenses (from additional_license_availability for this department)
    const normKey = s => normalizeId(String(s || '')).toUpperCase()
    const availabilityObjects = await fetchAdditionalLicenseAvailabilityAll()
    // Expose all department_id values in the sheet so the user can compare
    const allAvailDeptIds = [...new Set(availabilityObjects.map(r => String(r.department_id ?? '')))]
    const blockedLicenses = availabilityObjects
      .filter(r => normKey(r.department_id) === normKey(departmentId))
      .map(r => normKey(r.blocked_license_id ?? r.license_id ?? ''))
      .filter(Boolean)

    // 5b. Active license IDs (license_display minus blocked)
    const licenseDisplayObjects = sheetSummary(rawLicenseDisplay).rows
    const allLicenseIds = licenseDisplayObjects
      .map(r => r.license_id ?? '')
      .filter(Boolean)
    const blockedSet       = new Set(blockedLicenses)
    const activeLicenseIds = allLicenseIds.filter(id => !blockedSet.has(normKey(id)))

    // 5c. Count additional_license_ui rows per active license_id
    const uiObjects = sheetSummary(rawAdditionalLicenseUI, 10000).rows  // full scan
    const uiRowsForEachActiveLicense = {}
    for (const licId of activeLicenseIds) {
      uiRowsForEachActiveLicense[licId] = uiObjects.filter(
        r => normKey(r.license_id) === normKey(licId)
      ).length
    }

    // Also report blocked licenses UI row counts for comparison
    const uiRowsForEachBlockedLicense = {}
    for (const licId of blockedLicenses) {
      uiRowsForEachBlockedLicense[licId] = uiObjects.filter(
        r => normalizeId(r.license_id) === normalizeId(licId)
      ).length
    }

    // 5d. progress_auto credit totals for this student (all statuses)
    const progressObjects = await fetchProgressAutoForStudent(studentId)
    const creditsByCategory = {}
    for (const row of progressObjects) {
      const cat     = row.final_category ?? ''
      const credits = Number(row.credits ?? 0)
      const status  = (row.status ?? '').toUpperCase()
      if (!cat) continue
      if (!creditsByCategory[cat]) {
        creditsByCategory[cat] = { COMPLETED: 0, other: 0, rows: 0 }
      }
      creditsByCategory[cat].rows += 1
      if (status === 'COMPLETED') {
        creditsByCategory[cat].COMPLETED += Number.isFinite(credits) ? credits : 0
      } else {
        creditsByCategory[cat].other += Number.isFinite(credits) ? credits : 0
      }
    }

    const analysis = {
      // ① department matching — compare these two to find blocking issues
      departmentIdNormalized:      normKey(departmentId),
      allDeptIdsInAvailability:    allAvailDeptIds,
      allDeptIdsNormalized:        allAvailDeptIds.map(normKey),
      blockedLicenses,
      // ③ ui rows — if all counts are 0, license_id in additional_license_ui doesn't match
      activeLicenseIds,
      uiRowsForEachActiveLicense,
      uiRowsForEachBlockedLicense,
      progressCreditsByCategory: creditsByCategory,
    }

    // ── 6. Assemble response ──────────────────────────────────────────────────
    return NextResponse.json({
      studentId,
      departmentId,
      rawDepartment,
      sheets,
      progressSample,
      analysis,
    })
  } catch (err) {
    console.error('[debug/additional-license] error:', err)
    return NextResponse.json(
      {
        error:   err.message ?? String(err),
        stack:   process.env.NODE_ENV !== 'production' ? err.stack : undefined,
      },
      { status: 500 }
    )
  }
}
