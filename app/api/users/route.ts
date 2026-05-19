import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  upsertUserDepartment,
  createOrInitStudentSummary,
  createOrInitGraduationResult,
} from "@/lib/sheets"
import { normalizeId } from "@/lib/transform"

/**
 * GET /api/users
 * ログイン中ユーザーの student_id / department_id を返す。
 *
 * users シートの構造: email | student_id | department_id
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.student_id) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  return NextResponse.json({
    student_id:    session.user.student_id,
    email:         session.user.email ?? "",
    department_id: "",   // department_id は fetchAllSheets 経由で取得
  })
}

/**
 * POST /api/users
 * ログイン中ユーザーの department_id と curriculum_year を更新する。
 * Body: { department_id: string, curriculum_year?: number }
 *
 * パイプライン:
 *   1. upsertUserDepartment         — users シートを更新
 *   2. createOrInitStudentSummary   — students_summary に行を確保
 *   3. createOrInitGraduationResult — GRADUATION_RESULT に行を確保
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
    }
    const studentId = session.user.student_id

    const body = await req.json()
    const { department_id, curriculum_year } = body

    if (!department_id) {
      return NextResponse.json({ error: "department_id is required" }, { status: 400 })
    }

    const normalizedDept = normalizeId(department_id)
    const cyNum = curriculum_year != null ? Number(curriculum_year) : null
    const normalizedCY = (cyNum != null && Number.isFinite(cyNum)) ? cyNum : null

    // 1. users シートに department_id と curriculum_year を書き込む
    await upsertUserDepartment(normalizedDept, normalizedCY, studentId)

    // 2. students_summary / GRADUATION_RESULT の行を確保（fire-and-forget）
    //    enrollment 集計パイプラインの前提となる行を作るだけ。
    //    完了を待たずにレスポンスを返すことで UI の応答速度を保つ。
    ;(async () => {
      try {
        await createOrInitStudentSummary(normalizedDept, studentId)
        await createOrInitGraduationResult(normalizedDept, studentId)
        console.log('[POST /api/users] init pipeline done:', { studentId, department_id: normalizedDept })
      } catch (err) {
        console.error('[POST /api/users] init pipeline error:', err)
      }
    })()

    return NextResponse.json({
      ok:              true,
      student_id:      studentId,
      department_id:   normalizedDept,
      curriculum_year: normalizedCY,
    })
  } catch (err: any) {
    console.error("[POST /api/users]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
