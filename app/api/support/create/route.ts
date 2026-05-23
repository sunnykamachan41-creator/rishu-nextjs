import { NextResponse }        from 'next/server'
import { getServerSession }    from 'next-auth'
import { authOptions }         from '@/lib/auth'
import { normalizeId }         from '@/lib/transform'
import { appendSupportTicket } from '@/lib/sheets'
import { notifyDiscord }       from '@/lib/discord'
import type { InquiryCategory } from '@/lib/support'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = new Set<string>([
  'course_request', 'bug_report', 'feature_request', 'other',
])

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const userId = normalizeId(session.user.student_id)

    const body = await request.json().catch(() => ({}))
    const {
      inquiry_category,
      title,
      message,
      // 授業追加依頼フィールド
      course_name,
      term,
      day_period,
      teacher_name,
      academic_year,
      classroom,
      class_number,
    } = body as {
      inquiry_category?: string
      title?:            string
      message?:          string
      course_name?:      string
      term?:             string
      day_period?:       string
      teacher_name?:     string
      academic_year?:    string | number
      classroom?:        string
      class_number?:     string
    }

    // ── 共通バリデーション ──────────────────────────────────────────────────────
    if (!inquiry_category || !VALID_CATEGORIES.has(inquiry_category)) {
      return NextResponse.json({ error: 'カテゴリが不正です' }, { status: 400 })
    }
    if (!title?.trim()) {
      return NextResponse.json({ error: 'タイトルを入力してください' }, { status: 400 })
    }
    if (title.length > 100) {
      return NextResponse.json({ error: 'タイトルは100文字以内で入力してください' }, { status: 400 })
    }
    // 授業追加依頼以外はメッセージ必須
    if (inquiry_category !== 'course_request' && !message?.trim()) {
      return NextResponse.json({ error: '内容を入力してください' }, { status: 400 })
    }
    if (message && message.length > 2000) {
      return NextResponse.json({ error: '内容は2000文字以内で入力してください' }, { status: 400 })
    }

    // ── 授業追加依頼の構造化フィールドバリデーション ───────────────────────────
    if (inquiry_category === 'course_request') {
      if (!course_name?.trim()) {
        return NextResponse.json({ error: '授業名を入力してください' }, { status: 400 })
      }
      if (!term) {
        return NextResponse.json({ error: '開講時期を選択してください' }, { status: 400 })
      }
      if (!day_period) {
        return NextResponse.json({ error: '曜日時限を選択してください' }, { status: 400 })
      }
      if (!teacher_name?.trim()) {
        return NextResponse.json({ error: '教員名を入力してください' }, { status: 400 })
      }
      if (!academic_year) {
        return NextResponse.json({ error: '開講年度を選択してください' }, { status: 400 })
      }
      if (!classroom) {
        return NextResponse.json({ error: '教室を選択してください' }, { status: 400 })
      }
    }

    const id = crypto.randomUUID()

    // Google Sheets に保存
    await appendSupportTicket({
      id,
      user_id:          userId,
      inquiry_category: inquiry_category as InquiryCategory,
      title:            title.trim(),
      message:          message?.trim() ?? '',
      course_name:      course_name?.trim()  ?? '',
      term:             term              ?? '',
      day_period:       day_period        ?? '',
      teacher_name:     teacher_name?.trim() ?? '',
      academic_year:    academic_year != null ? String(academic_year) : '',
      classroom:        classroom         ?? '',
      class_number:     class_number?.trim() ?? '',
    })

    // Discord 通知（失敗してもチケット保存は成功扱い）
    await notifyDiscord({
      category: inquiry_category,
      title:    title.trim(),
      message:  message?.trim() ?? '',
      userId,
    })

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    console.error('[POST /api/support/create]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '送信に失敗しました' },
      { status: 500 },
    )
  }
}
