import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRange } from '@/lib/sheets'
import { normalizeCourse } from '@/lib/transform'

export const dynamic = 'force-dynamic'

// ── course 年度展開（/api/data と同じロジック） ──────────────────────────────

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

/**
 * GET /api/catalog?year=2025
 *
 * 指定された academic_year のコース一覧を返す。
 * academic_year モード（WHERE academic_year = selectedYear）で取得することで
 * 全年度をメモリに展開してフィルタする設計を回避する。
 *
 * レスポンス:
 *   courses          - 指定年度のコース一覧
 *   availableYears   - カタログに存在する年度一覧（モードセレクタ用）
 *   rawCategories    - 指定年度コースの raw_category 一覧
 *   subCategoriesByRaw - { [rawCategory]: string[] } 各カテゴリのサブカテゴリ
 */
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const yearParam   = searchParams.get('year')
    const selectedYear = yearParam ? parseInt(yearParam, 10) : null

    // ── course シートを直接読む ──────────────────────────────────────────────
    const rows = await getRange('course')
    if (!rows || rows.length < 2) {
      return NextResponse.json({
        courses: [], availableYears: [], rawCategories: {}, subCategoriesByRaw: {},
      })
    }

    const [headers, ...dataRows] = rows
    const rawCourses = dataRows.map(row => {
      const obj = Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
      return normalizeCourse(obj)
    })

    const allCourses = expandCoursesByYear(rawCourses)

    // ── 利用可能年度一覧（モードセレクタ用） ─────────────────────────────────
    const availableYears = [...new Set(
      allCourses.map(c => c.academic_year).filter(y => y != null && Number.isFinite(y))
    )].sort((a, b) => a - b)

    // ── 選択年度でフィルタ ────────────────────────────────────────────────────
    const courses = selectedYear != null
      ? allCourses.filter(c => c.academic_year === selectedYear)
      : allCourses

    // ── raw_category 一覧 ─────────────────────────────────────────────────────
    // raw_category の優先度でソート（空文字は末尾）
    const rawCatSet = new Set(courses.map(c => c.raw_category).filter(Boolean))
    const rawCategories = [...rawCatSet].sort()

    // ── sub_category マップ ───────────────────────────────────────────────────
    const subCategoriesByRaw = {}
    for (const c of courses) {
      if (!c.raw_category) continue
      if (!subCategoriesByRaw[c.raw_category]) subCategoriesByRaw[c.raw_category] = new Set()
      if (c.sub_category) subCategoriesByRaw[c.raw_category].add(c.sub_category)
    }
    for (const key of Object.keys(subCategoriesByRaw)) {
      subCategoriesByRaw[key] = [...subCategoriesByRaw[key]].sort()
    }

    return NextResponse.json({
      courses,
      availableYears,
      rawCategories,
      subCategoriesByRaw,
    })
  } catch (err) {
    console.error('[GET /api/catalog]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
