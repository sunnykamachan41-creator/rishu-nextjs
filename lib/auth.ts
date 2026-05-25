/**
 * NextAuth 設定 — Single Source of Truth
 *
 * 設計:
 *   1. Google ログイン → signIn callback でメールアドレスを確認
 *   2. jwt callback    → bootstrapUserIfNeeded(email) で student_id を取得・採番
 *                        → JWT トークンに student_id を保存
 *   3. session callback → JWT の student_id を session.user.student_id に公開
 *
 * users シートのスキーマ: email | student_id | department_id
 * student_id は内部管理用の採番ID（例: student_001, student_002 …）
 */

import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { bootstrapUserIfNeeded } from "@/lib/sheets"

// ── TypeScript 型拡張 ─────────────────────────────────────────────────────────
// session.user.student_id を型安全に参照できるようにする

declare module "next-auth" {
  interface Session {
    user: {
      name?:       string | null
      email?:      string | null
      image?:      string | null
      student_id:  string          // Google email から採番された内部ID
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    student_id?: string
  }
}

// ── authOptions ───────────────────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    // ① ログイン可否の判定
    //    ALLOWED_EMAIL_DOMAINS が設定されている場合は、そのドメインのみ許可する。
    //    例: ALLOWED_EMAIL_DOMAINS=u-gakugei.ac.jp,gakugei-u.ac.jp
    //    未設定の場合はすべての Google アカウントを許可する（開発用途）。
    async signIn({ user }) {
      if (!user?.email) return false

      const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS
      if (!allowedDomains) return true   // 未設定 = 制限なし

      const email = user.email.toLowerCase()
      const domains = allowedDomains
        .split(',')
        .map(d => d.trim().toLowerCase())
        .filter(Boolean)

      const allowed = domains.some(domain => email.endsWith(`@${domain}`))
      if (!allowed) {
        console.warn('[signIn] rejected email outside allowed domains:', email)
      }
      return allowed
    },

    // ② JWT 生成/更新時に student_id を埋め込む
    //    - user が存在する = 初回ログイン時
    //    - token.student_id が未設定 = 旧トークンのリフレッシュ時
    async jwt({ token, user }) {
      if (!token.student_id) {
        const email = user?.email ?? (token.email as string | undefined)
        if (email) {
          try {
            const result = await bootstrapUserIfNeeded(email)
            token.student_id = result.student_id
          } catch (err) {
            console.error("[jwt] bootstrapUserIfNeeded failed:", err)
          }
        }
      }
      return token
    },

    // ③ session にクライアントが参照できる student_id を公開
    async session({ session, token }) {
      if (session.user) {
        session.user.student_id = token.student_id ?? ""
      }
      return session
    },
  },
}
