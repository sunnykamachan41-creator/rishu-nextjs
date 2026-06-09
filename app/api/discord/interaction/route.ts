import { NextRequest, NextResponse } from 'next/server'
import nacl from 'tweetnacl'
import { createBroadcastNotification } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

// Discord Interaction types
const INTERACTION_TYPE_PING = 1
const INTERACTION_TYPE_APPLICATION = 2

const RESPONSE_TYPE_PONG = 1
const RESPONSE_TYPE_MESSAGE = 4

/**
 * Discord署名検証（正しい方式）
 */
function verifyDiscordSignature(
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const publicKey = process.env.DISCORD_PUBLIC_KEY

  if (!publicKey) return false

  return nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, 'hex'),
    Buffer.from(publicKey, 'hex')
  )
}

export async function POST(req: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json(
      { error: 'DISCORD_PUBLIC_KEY が設定されていません' },
      { status: 500 }
    )
  }

  const allowedUsers = (process.env.DISCORD_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const signature = req.headers.get('x-signature-ed25519') ?? ''
  const timestamp = req.headers.get('x-signature-timestamp') ?? ''
  const rawBody = await req.text()

  // ── 署名チェック ─────────────────────────
  const isValid = verifyDiscordSignature(signature, timestamp, rawBody)
  if (!isValid) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  const interaction = JSON.parse(rawBody)

  // ── PING ───────────────────────────────
  if (interaction.type === INTERACTION_TYPE_PING) {
    return NextResponse.json({ type: RESPONSE_TYPE_PONG })
  }

  // ── Slash Command ───────────────────────
  if (interaction.type === INTERACTION_TYPE_APPLICATION) {
    const commandName = interaction.data?.name
    const userId = interaction.member?.user?.id ?? interaction.user?.id

    if (allowedUsers.length > 0 && !allowedUsers.includes(userId)) {
      return NextResponse.json({
        type: RESPONSE_TYPE_MESSAGE,
        data: {
          content: '⛔ 権限がありません',
          flags: 64,
        },
      })
    }

    if (commandName === 'yora-notify') {
      const options = interaction.data?.options ?? []

      const title =
        options.find((o: any) => o.name === 'title')?.value ?? ''
      const message =
        options.find((o: any) => o.name === 'message')?.value ?? ''
      const link =
        options.find((o: any) => o.name === 'link')?.value ?? ''

      if (!title || !message) {
        return NextResponse.json({
          type: RESPONSE_TYPE_MESSAGE,
          data: {
            content: '❌ title と message は必須です',
            flags: 64,
          },
        })
      }

      try {
        const count = await createBroadcastNotification({
          title: title.trim(),
          message: message.trim(),
          link: link.trim(),
        })

        return NextResponse.json({
          type: RESPONSE_TYPE_MESSAGE,
          data: {
            content: `✅ ${count}人に通知送信\n📢 ${title}\n${message}`,
          },
        })
      } catch (err) {
        console.error(err)
        return NextResponse.json({
          type: RESPONSE_TYPE_MESSAGE,
          data: {
            content: '❌ 送信失敗',
            flags: 64,
          },
        })
      }
    }

    return NextResponse.json({
      type: RESPONSE_TYPE_MESSAGE,
      data: {
        content: '❓ unknown command',
        flags: 64,
      },
    })
  }

  return new NextResponse('Bad request', { status: 400 })
}