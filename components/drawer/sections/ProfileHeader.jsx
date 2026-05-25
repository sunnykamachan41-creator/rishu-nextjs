'use client'

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
    <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-700 pt-11 pb-7 px-5">
      {/* 装飾円 */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5  pointer-events-none" />

      {/* ── ロゴ ロックアップ（左・横並び・大きめ） ─────────────────────────── */}
      <div
        className="relative flex items-center gap-3 mb-5 select-none pointer-events-none"
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={40}
          height={40}
          style={{
            borderRadius: 10,
            boxShadow:    '0 3px 12px rgba(0,0,0,0.30)',
            display:      'block',
            flexShrink:   0,
          }}
        />
        <span
          style={{
            fontFamily:    'var(--font-league-spartan)',
            fontSize:      22,
            fontWeight:    700,
            letterSpacing: '0.1em',
            lineHeight:    1,
            color:         'rgba(255,255,255,0.95)',
          }}
        >
          YORA
        </span>
      </div>

      {/* ── ユーザー情報 ────────────────────────────────────────────────────── */}
      <div className="relative">

        {/* 名前 + 学年バッジ */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-white font-bold text-[17px] leading-tight">
            {session?.user?.name ?? '---'}
          </h2>
          {grade && (
            <span className="px-2 py-0.5 bg-white/20 text-white text-[11px] font-semibold
                             rounded-full backdrop-blur-sm flex-shrink-0">
              {grade}年生
            </span>
          )}
        </div>

        {/* 専攻 */}
        {(departmentLabel || hasMinor) && (
          <p className="text-indigo-200/90 text-[12px] mt-1 leading-snug">
            {[departmentLabel, hasMinor && `副：${profile.minor}`]
              .filter(Boolean).join(' · ')}
          </p>
        )}

        {/* メール */}
        <p className="text-indigo-300/70 text-[11px] mt-1 truncate">
          {session?.user?.email ?? ''}
        </p>
      </div>
    </div>
  )
}
