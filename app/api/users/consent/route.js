import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth'
import { updateUserConsent } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

/**
 * POST /api/users/consent
 * Body: { terms_accepted: boolean, privacy_accepted: boolean }
 *
 * 利用規約・プライバシーポリシーへの同意を users シートに記録する。
 */
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }

    const { terms_accepted, privacy_accepted } = await req.json()

    if (!terms_accepted || !privacy_accepted) {
      return NextResponse.json(
        { error: '利用規約とプライバシーポリシーの両方への同意が必要です' },
        { status: 400 }
      )
    }

    await updateUserConsent(session.user.student_id, {
      terms_accepted:   true,
      privacy_accepted: true,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/users/consent]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
