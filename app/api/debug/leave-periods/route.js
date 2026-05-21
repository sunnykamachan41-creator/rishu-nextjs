import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRange } from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'
import { parseLeavePeriodRows } from '@/lib/leavePeriods'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const studentId = session?.user?.student_id ?? '(no session)'
    const normalizedStudentId = normalizeId(String(studentId))

    // leave_periods シートを直接（キャッシュなし）で取得
    let rawRows = []
    let error = null
    try {
      rawRows = await getRange('leave_periods')
    } catch (e) {
      error = e.message
    }

    const [headerRow, ...bodyRows] = rawRows.length > 0 ? rawRows : [[], []]
    const headers = headerRow ?? []

    const rowObjects = bodyRows.map(row =>
      Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
    )

    const matching = rowObjects.filter(r => {
      const sid = normalizeId(String(r.student_id ?? r.Student_ID ?? ''))
      return sid === normalizedStudentId
    })

    const leaveSemesters = parseLeavePeriodRows(rowObjects, normalizedStudentId)

    return NextResponse.json({
      studentId,
      normalizedStudentId,
      sheetError: error,
      rawRows,
      headers,
      rowObjects,
      matchingRows: matching,
      leaveSemesters,
      rawLeavePeriods: matching
        .filter(r => (r.leave_start ?? r.Leave_Start) && (r.leave_end ?? r.Leave_End))
        .map(r => ({
          leave_start: String(r.leave_start ?? r.Leave_Start ?? '').trim(),
          leave_end:   String(r.leave_end   ?? r.Leave_End   ?? '').trim(),
        })),
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
