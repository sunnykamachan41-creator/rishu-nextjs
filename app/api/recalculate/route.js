import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  updateProgressAuto,
  updateStudentsSummary,
  recalculateGraduation,
  fetchAllStudentIds,
} from '@/lib/sheets'
import { normalizeId } from '@/lib/transform'

/**
 * POST /api/recalculate
 * ──────────────────────
 * Full recalculation pipeline for registered students.
 *
 * 認可ルール:
 *   - ログイン必須（未認証は 401）
 *   - student_id 指定あり → 自分自身のみ再計算可（他人指定は 403）
 *   - student_id 省略（全学生モード）→ X-Admin-Secret ヘッダーが必要（管理者専用）
 *
 * Pipeline:
 *   1. updateProgressAuto(sid)  — per student: rebuild enrollment × course JOIN
 *   2. updateStudentsSummary()  — aggregate COMPLETED credits for ALL students
 *   3. recalculateGraduation()  — evaluate rules → write GRADUATION_RESULT
 *
 * Body (all optional):
 *   { student_id?: string }
 */
export async function POST(request) {
  try {
    // ── 認証チェック ────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const sessionStudentId = session.user.student_id

    const body      = await request.json().catch(() => ({}))
    const rawSid    = body?.student_id ?? ''
    const studentId = rawSid ? normalizeId(rawSid) : null

    // ── 認可チェック ────────────────────────────────────────────────────────
    if (studentId) {
      // student_id 指定あり → 自分自身のみ許可
      if (studentId !== sessionStudentId) {
        console.warn('[POST /api/recalculate] forbidden: attempted to recalculate another student', {
          requester: sessionStudentId, requested: studentId,
        })
        return NextResponse.json({ error: '他の学生のデータを再計算する権限がありません' }, { status: 403 })
      }
    } else {
      // student_id 省略 = 全学生モード → 管理者シークレット必須
      const adminSecret = process.env.ADMIN_SECRET
      const providedSecret = request.headers.get('x-admin-secret')
      if (!adminSecret || providedSecret !== adminSecret) {
        console.warn('[POST /api/recalculate] forbidden: all-students mode requires admin secret', {
          requester: sessionStudentId,
        })
        return NextResponse.json({ error: '全学生の再計算には管理者権限が必要です' }, { status: 403 })
      }
    }

    // ── Step 1: Determine which students to recalculate ───────────────────────
    let targetIds

    if (studentId) {
      // Single-student mode — explicit student_id in request body
      targetIds = [studentId]
      console.log('[POST /api/recalculate] single-student mode:', studentId)
    } else {
      // All-students mode — iterate the users sheet
      targetIds = await fetchAllStudentIds()
      if (targetIds.length === 0) {
        // No users registered yet — fall back to env default
        const fallback = normalizeId(process.env.STUDENT_ID || 'student_001')
        targetIds = [fallback]
        console.warn('[POST /api/recalculate] users sheet empty — falling back to:', fallback)
      } else {
        console.log('[POST /api/recalculate] all-students mode:', targetIds)
      }
    }

    // ── Step 2: Rebuild progress_auto for each student (sequential) ───────────
    // updateProgressAuto is student-scoped: it reads the full sheet, strips only
    // this student's old rows, appends fresh rows, then writes the merged result.
    // Running sequentially avoids concurrent overwrites of the same sheet.
    for (const sid of targetIds) {
      console.log('[POST /api/recalculate] updateProgressAuto →', sid)
      await updateProgressAuto(sid)
    }

    // ── Step 3: Aggregate credits ─────────────────────────────────────────────
    // student_id が指定された場合はその学生のみ集計する。
    // 省略時（管理者用途）は全学生を対象にする。
    await updateStudentsSummary('', studentId ?? null)

    // ── Step 4: Recompute graduation results ──────────────────────────────────
    const graduation = await recalculateGraduation()

    console.log('[POST /api/recalculate] done', {
      students:   targetIds.length,
      graduation,
    })

    return NextResponse.json({ ok: true, students: targetIds, graduation })
  } catch (err) {
    console.error('[POST /api/recalculate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
