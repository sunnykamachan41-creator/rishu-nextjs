import { NextRequest, NextResponse } from 'next/server'
import * as crypto from 'crypto'
import { createBroadcastNotification } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

// Discord Interaction タイプ
const INTERACTION_TYPE_PING        = 1
const INTERACTION_TYPE_APPLICATION = 2

// Discord Interaction レスポンスタイプ
const RESPONSE_TYPE_PONG           = 1
const RESPONSE_TYPE_MESSAGE        = 4

/**
 * Discord の Ed25519 署名を検証する。
 * 公式ドキュメント: https://discord.com/developers/docs/interactions/receiving-and-responding
 */
async function verifyDiscordSignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      Buffer.from(publicKey, 'hex'),
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      Buffer.from(signature, 'hex'),
      Buffer.from(timestamp + body),
    )
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json({ error: 'DISCORD_PUBLIC_KEY が設定されていません' }, { status: 500 })
  }

  // 許可する Discord ユーザー ID（空ならチェックしない）
  const allowedUsers = (process.env.DISCORD_ALLOWED_USER_IDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  // ── 署名検証 ──────────────────────────────────────────────────────────────
  const signature = req.headers.get('x-signature-ed25519') ?? ''
  const timestamp = req.headers.get('x-signature-timestamp') ?? ''
  const rawBody   = await req.text()

  const isValid = await verifyDiscordSignature(publicKey, signature, timestamp, rawBody)
  if (!isValid) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  const interaction = JSON.parse(rawBody)

  // ── PING（Discord の疎通確認） ─────────────────────────────────────────────
  if (interaction.type === INTERACTION_TYPE_PING) {
    return NextResponse.json({ type: RESPONSE_TYPE_PONG })
  }

  // ── Slash Command ─────────────────────────────────────────────────────────
  if (interaction.type === INTERACTION_TYPE_APPLICATION) {
    const commandName = interaction.data?.name
    const userId      = interaction.member?.user?.id ?? interaction.user?.id

    // 許可ユーザーチェック
    if (allowedUsers.length > 0 && !allowedUsers.includes(userId)) {
      return NextResponse.json({
        type: RESPONSE_TYPE_MESSAGE,
        data: { content: '⛔ このコマンドの実行権限がありません。', flags: 64 },
      })
    }

    // /yora-notify コマンド
    if (commandName === 'yora-notify') {
      const options = interaction.data?.options ?? []
      const title   = options.find((o: { name: string }) => o.name === 'title')?.value   ?? ''
      const message = options.find((o: { name: string }) => o.name === 'message')?.value ?? ''
      const link    = options.find((o: { name: string }) => o.name === 'link')?.value    ?? ''

      if (!title.trim() || !message.trim()) {
        return NextResponse.json({
          type: RESPONSE_TYPE_MESSAGE,
          data: { content: '❌ title と message は必須です。', flags: 64 },
        })
      }

      try {
        const count = await createBroadcastNotification({
          title:   title.trim(),
          message: message.trim(),
          link:    link.trim(),
        })
        return NextResponse.json({
          type: RESPONSE_TYPE_MESSAGE,
          data: {
            content: `✅ **${count}人**に通知を送信しました。\n📢 **${title}**\n${message}`,
          },
        })
      } catch (err) {
        console.error('[discord/interaction] broadcast failed:', err)
        return NextResponse.json({
          type: RESPONSE_TYPE_MESSAGE,
          data: {
            content: `❌ 送信に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
            flags: 64,
          },
        })
      }
    }

    // 未知のコマンド
    return NextResponse.json({
      type: RESPONSE_TYPE_MESSAGE,
      data: { content: '❓ 未知のコマンドです。', flags: 64 },
    })
  }

  return new NextResponse('Unknown interaction type', { status: 400 })
}
