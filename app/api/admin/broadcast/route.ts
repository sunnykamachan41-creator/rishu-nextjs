import { NextRequest, NextResponse } from 'next/server'
import { createBroadcastNotification } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/broadcast
 *
 * 全ユーザーに通知を一括送信する管理者専用エンドポイント。
 * Discord Slash Command または curl から呼び出す。
 *
 * 認証: Authorization: Bearer <BROADCAST_SECRET>
 *
 * Body:
 *   title   : string  (必須)
 *   message : string  (必須)
 *   link    : string  (任意, デフォルト '')
 */
export async function POST(req: NextRequest) {
  // ── 認証 ──────────────────────────────────────────────────────────────────
  const secret = process.env.BROADCAST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'BROADCAST_SECRET が設定されていません' }, { status: 500 })
  }

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== secret) {
    return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 })
  }

  // ── リクエスト検証 ────────────────────────────────────────────────────────
  let body: { title?: string; message?: string; link?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { title, message, link = '' } = body
  if (!title?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'title と message は必須です' }, { status: 400 })
  }

  // ── 一括送信 ──────────────────────────────────────────────────────────────
  try {
    const count = await createBroadcastNotification({
      title:   title.trim(),
      message: message.trim(),
      link:    link.trim(),
    })
    return NextResponse.json({ ok: true, sent: count })
  } catch (err) {
    console.error('[POST /api/admin/broadcast]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '送信に失敗しました' },
      { status: 500 },
    )
  }
}
