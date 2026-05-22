import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { migrateTempEnrollments } from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pre-enrollment/migrate
 * ──────────────────────────────────
 * 仮登録（is_temporary=TRUE）を新年度の本登録へ一括移行する。
 *
 * Body:
 *   classIds:      string[]  — 移行する class_id 配列（モーダルで確認済み）
 *   newLatestYear: number    — 移行先の academic_year（新年度）
 *
 * 処理:
 *   1. enrollment の is_temporary=TRUE 行を classIds で絞り込む
 *   2. batchUpdate: academic_year = newLatestYear, is_temporary = FALSE
 *   3. progress_auto / students_summary / graduation_result は更新しない
 *      （ユーザーが「再計算」ボタンを押したときに更新）
 *
 * Sheets API 呼び出し: fetchAllSheets (1 read) + batchUpdate (1 write) = 2 calls 最大
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = normalizeId(session.user.student_id)

    const body = await request.json().catch(() => ({}))
    const { classIds, newLatestYear } = body

    if (!Array.isArray(classIds) || classIds.length === 0) {
      return NextResponse.json({ error: 'classIds は必須の配列です' }, { status: 400 })
    }
    const year = Number(newLatestYear)
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: 'newLatestYear が不正です' }, { status: 400 })
    }

    const migrated = await migrateTempEnrollments(classIds, year, studentId)

    console.log('[POST /api/pre-enrollment/migrate] done', {
      studentId,
      requested: classIds.length,
      migrated,
      newLatestYear: year,
    })

    return NextResponse.json({ ok: true, migrated })
  } catch (err) {
    console.error('[POST /api/pre-enrollment/migrate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
