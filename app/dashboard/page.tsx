import { getServerSession } from "next-auth"

export default async function Page() {
  const session = await getServerSession()

  const email = session?.user?.email ?? null

  // ─────────────────────────────
  // ① ログインチェック
  // ─────────────────────────────
  if (!email) {
    return (
      <div style={{ padding: 24 }}>
        <h1>ログインが必要です</h1>
        <p>セッションが見つかりません。</p>
        <p>NextAuth未設定 or ログイン未実装の可能性があります。</p>
      </div>
    )
  }

  // ─────────────────────────────
  // ② ユーザー取得
  // ─────────────────────────────
  let user = null

  try {
    const res = await fetch(
      `http://localhost:3000/api/users?email=${email}`,
      { cache: "no-store" }
    )
    user = await res.json()
  } catch (err) {
    return (
      <div style={{ padding: 24 }}>
        <h1>ユーザー取得エラー</h1>
        <p>APIに接続できません</p>
      </div>
    )
  }

  if (!user?.user_id) {
    return (
      <div style={{ padding: 24 }}>
        <h1>ユーザーが見つかりません</h1>
        <p>{email}</p>
      </div>
    )
  }

  // ─────────────────────────────
  // ③ 履修取得
  // ─────────────────────────────
  let enrollments = []

  try {
    const enrollRes = await fetch(
      `http://localhost:3000/api/enrollment?user_id=${user.user_id}`,
      { cache: "no-store" }
    )

    const enrollData = await enrollRes.json()
    enrollments = enrollData?.enrollments ?? []
  } catch (err) {
    enrollments = []
  }

  // ─────────────────────────────
  // ④ UI
  // ─────────────────────────────
  return (
    <div style={{ padding: 24 }}>
      <h1>ダッシュボード</h1>

      <div style={{ marginTop: 12 }}>
        <p>email: {email}</p>
        <p>user_id: {user.user_id}</p>
        <p>department: {user.department_id}</p>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <p>履修数: {enrollments.length}</p>
    </div>
  )
}