import { categoryLabel, type InquiryCategory } from './support'

/**
 * Discord webhook に問い合わせ通知を送信する。
 * DISCORD_WEBHOOK_URL が未設定の場合はスキップ（エラーにしない）。
 */
export async function notifyDiscord({
  category,
  title,
  message,
  userId,
}: {
  category: InquiryCategory | string
  title:    string
  message:  string
  userId:   string
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    console.warn('[discord] DISCORD_WEBHOOK_URL is not set — skipping notification')
    return
  }

  const content = [
    '📩 **新しい問い合わせ**',
    '',
    `**カテゴリ：**`,
    categoryLabel(category as InquiryCategory),
    '',
    `**タイトル：**`,
    title,
    '',
    `**メッセージ：**`,
    message,
    '',
    `**ユーザー：**`,
    userId,
  ].join('\n')

  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content }),
    })
    if (!res.ok) {
      console.error('[discord] webhook failed:', res.status, await res.text().catch(() => ''))
    }
  } catch (err) {
    // 通知失敗はチケット保存の失敗にしない
    console.error('[discord] fetch error:', err)
  }
}
