'use client'
import Image from 'next/image'

function calcGrade(enrollmentYear) {
  if (!enrollmentYear) return null
  const now   = new Date()
  const grade = now.getFullYear() - enrollmentYear + (now.getMonth() >= 3 ? 1 : 0)
  return grade >= 1 && grade <= 8 ? grade : null
}

export default function ProfileHeader({ session, departmentLabel, enrollmentYear, profile }) {
  const grade    = calcGrade(enrollmentYear)
  const hasMinor = profile?.minor && profile.minor !== ''

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-700 pt-14 pb-7 px-5">
      {/* 装飾円 */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5  pointer-events-none" />

      <div className="relative flex items-end gap-4">
        {/* アバター */}
        <div className="relative flex-shrink-0">
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? 'avatar'}
              width={72}
              height={72}
              className="rounded-2xl ring-2 ring-white/30 shadow-xl"
            />
          ) : (
            <div className="w-[72px] h-[72px] rounded-2xl bg-white/20 flex items-center justify-center
                            text-white text-2xl font-bold ring-2 ring-white/30">
              {session?.user?.name?.[0] ?? '?'}
            </div>
          )}
          {/* Google バッジ */}
          <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-white rounded-full
                           flex items-center justify-center shadow-md">
            <GoogleLogo />
          </span>
        </div>

        {/* 名前・メール・バッジ */}
        <div className="flex-1 min-w-0 pb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-white font-bold text-[17px] leading-tight truncate max-w-[150px]">
              {session?.user?.name ?? '---'}
            </h2>
            {grade && (
              <span className="px-2 py-0.5 bg-white/20 text-white text-[11px] font-semibold
                               rounded-full backdrop-blur-sm flex-shrink-0">
                {grade}年生
              </span>
            )}
          </div>

          <p className="text-indigo-200 text-[12px] truncate mt-0.5">
            {session?.user?.email ?? ''}
          </p>

          {/* 学科・副免許 */}
          {(departmentLabel || hasMinor) && (
            <p className="text-indigo-200/80 text-[11px] mt-1 truncate">
              {[departmentLabel, hasMinor && `副：${profile.minor}`]
                .filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
