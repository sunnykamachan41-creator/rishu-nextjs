import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic'

// ── Auth（sheets.js と同じ構造） ──────────────────────────────────────────────
function makeAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}
function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: makeAuth() })
}
const SPREADSHEET_ID = () => process.env.SPREADSHEET_ID

// ── helpers ───────────────────────────────────────────────────────────────────

function toObjects(raw) {
  if (!raw || raw.length < 1) return []
  const [header, ...body] = raw
  return body.map(row =>
    Object.fromEntries(header.map((h, i) => [String(h ?? ''), String(row[i] ?? '')]))
  )
}

// エラーをキャッチせずに結果 or エラーを返す
async function safeGetRange(client, spreadsheetId, sheetName, range = 'A:ZZ') {
  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!${range}`,
    })
    return { ok: true, raw: res.data.values ?? [], error: null }
  } catch (err) {
    return { ok: false, raw: [], error: err.message }
  }
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('student_id') ?? 'student_001'

    const client        = getSheetsClient()
    const spreadsheetId = SPREADSHEET_ID()

    // ── ① スプレッドシートの全タブ名を取得（最重要） ─────────────────────────
    const metaRes = await client.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(title,sheetId)',
    })
    const allSheetTitles = metaRes.data.sheets.map(s => s.properties.title)

    // ── ② 各シートを個別に取得（エラーもそのまま返す） ───────────────────────
    const sheetNames = [
      'users',
      'additional_license_result',
      'additional_license_rule',
      'additional_license_ui',
      'additional_license_availability',
      'students_summary',
      'progress_auto',
      'license_display',
    ]

    const results = {}
    await Promise.all(
      sheetNames.map(async name => {
        const { ok, raw, error } = await safeGetRange(client, spreadsheetId, name)
        const objects = toObjects(raw)
        results[name] = {
          ok,
          error,
          row_count: objects.length,
          headers: raw.length > 0 ? (raw[0] ?? []) : [],
          rows: objects,   // 全件（大きいシートは後で絞る）
        }
      })
    )

    // progress_auto はこの student に絞る
    if (results.progress_auto.rows.length > 0) {
      results.progress_auto.all_count = results.progress_auto.row_count
      results.progress_auto.rows = results.progress_auto.rows.filter(
        r => String(r.student_id ?? '').trim() === String(studentId).trim()
      )
      results.progress_auto.row_count = results.progress_auto.rows.length
    }

    // students_summary はこの student の行だけ別出し
    const my_summary = results.students_summary.rows.find(
      r => String(r.student_id ?? '').trim() === String(studentId).trim()
    ) ?? null

    // ── ③ ヘッダー名クロスチェック（コードが期待するキーと実際を比較） ───────
    const expected = {
      additional_license_ui:           ['license_id', 'category', 'display_name', 'ui_group', 'display_order'],
      additional_license_rule:         ['license_id', 'category', 'required_credits', 'condition'],
      additional_license_availability: ['department_id', 'blocked_license_id'],
      additional_license_result:       ['student_id', 'license_id', 'status'],
      students_summary:                ['student_id', 'department_id'],
    }
    const header_mismatch = {}
    for (const [sheet, expectedCols] of Object.entries(expected)) {
      const actual = results[sheet]?.headers ?? []
      const missing = expectedCols.filter(col =>
        !actual.some(h => String(h).toLowerCase() === col.toLowerCase())
      )
      if (missing.length > 0) {
        header_mismatch[sheet] = {
          expected_missing: missing,
          actual_headers: actual,
        }
      }
    }

    // ── ④ タブ名チェック ────────────────────────────────────────────────────
    const tab_mismatch = sheetNames.filter(name => !allSheetTitles.includes(name))
    const tab_match    = sheetNames.filter(name =>  allSheetTitles.includes(name))

    return NextResponse.json({
      _queried_student_id: studentId,

      // ★ 最重要: 実際のタブ名一覧
      actual_sheet_tabs: allSheetTitles,

      // ★ コードが期待するタブ名 vs 実際のタブ名の差分
      tab_check: {
        matched: tab_match,
        NOT_FOUND_in_spreadsheet: tab_mismatch,
      },

      // ★ ヘッダー名の不一致
      header_mismatch,

      // ── 行数サマリー ─────────────────────────────────────────────────
      row_counts: Object.fromEntries(
        sheetNames.map(name => [name, results[name].row_count])
      ),

      // ── フェッチエラー（タブ名不一致以外の原因があれば出る） ──────────
      fetch_errors: Object.fromEntries(
        sheetNames
          .filter(name => results[name].error)
          .map(name => [name, results[name].error])
      ),

      // ── この student の summary 行 ─────────────────────────────────
      my_summary,

      // ── 全件データ ────────────────────────────────────────────────
      users:                           results.users.rows,
      additional_license_result:       results.additional_license_result.rows,
      additional_license_rule:         results.additional_license_rule.rows,
      additional_license_ui:           results.additional_license_ui.rows,
      additional_license_availability: results.additional_license_availability.rows,
      students_summary:                results.students_summary.rows,
      progress_auto:                   results.progress_auto.rows,
      license_display:                 results.license_display.rows,

      headers: {
        users:                        results.users.headers,
        result:                       results.additional_license_result.headers,
        rule:                         results.additional_license_rule.headers,
        ui:                           results.additional_license_ui.headers,
        availability:                 results.additional_license_availability.headers,
        summary:                      results.students_summary.headers,
        progress:                     results.progress_auto.headers,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err.message, stack: err.stack },
      { status: 500 }
    )
  }
}
