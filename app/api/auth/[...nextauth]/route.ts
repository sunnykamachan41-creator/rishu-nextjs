import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"

const handler = NextAuth(authOptions)

/**
 * Next.js 15+ では context.params が Promise になったため、
 * next-auth v4 の同期アクセスが壊れる。
 * params を await してから handler に渡すことで互換性を確保する。
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const params = await context.params
  return handler(request, { params })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  const params = await context.params
  return handler(request, { params })
}
