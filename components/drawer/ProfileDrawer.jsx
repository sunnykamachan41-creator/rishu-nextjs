'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useSession }       from 'next-auth/react'
import { useUserProfile }   from '@/hooks/useUserProfile'
import ProfileHeader        from './sections/ProfileHeader'
import AffiliationSection   from './sections/AffiliationSection'
import DisplaySection       from './sections/DisplaySection'
import DataSection          from './sections/DataSection'
import AuthSection          from './sections/AuthSection'

/**
 * 学生専用コントロールセンター — 左からスライドするDrawer
 *
 * Props:
 *   isOpen                 — 開閉フラグ
 *   onClose                — 閉じるコールバック
 *   departmentLabel        — 表示用ラベル（例: "英語教育専攻"）
 *   enrollmentYear         — 現在の入学年度
 *   onEnrollmentYearChange — 入学年度変更コールバック
 *   onChangeDepartment     — 学科変更開始コールバック（確認付きで呼ぶ）
 */
export default function ProfileDrawer({
  isOpen,
  onClose,
  departmentLabel,
  enrollmentYear,
  onEnrollmentYearChange,
  onChangeDepartment,
  rawLeavePeriods = [],
  onLeavePeriodChange,
  onOpenMinorSection = null,  // 副免許 → 卒業要件② に飛ぶ
  onOpenExemption    = null,  // 単位認定 → カタログタブに飛ぶ
  exemptionCount     = 0,
}) {
  const { data: session }                     = useSession()
  const { profile, isLoading, updateProfile } = useUserProfile()
  const touchStartX                           = useRef(null)

  // ESC キーで閉じる
  useEffect(() => {
    if (!isOpen) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [isOpen, onClose])

  // 開いている間は body スクロールをロック
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // 左スワイプで閉じる
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
  }, [])
  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return
    if (touchStartX.current - e.changedTouches[0].clientX > 60) onClose()
    touchStartX.current = null
  }, [onClose])

  const handleChangeDepartment = useCallback(() => {
    onClose()
    setTimeout(() => onChangeDepartment?.(), 300)
  }, [onClose, onChangeDepartment])

  // ── body エリア（max-width:430px, margin:0 auto）の左端にDrawerを合わせる ──
  // スマホ実機: 430px以下のviewport → left:0
  // PC開発環境: 430px超 → 本文左端を計算して合わせる
  const contentLeft = 'max(0px, calc((100vw - 430px) / 2))'

  const drawerStyle   = { left: contentLeft }
  const backdropStyle = { left: contentLeft, right: contentLeft }

  return (
    <>
      {/* ── バックドロップ ──────────────────────────────────────────────── */}
      <div
        aria-hidden
        onClick={onClose}
        style={backdropStyle}
        className={`fixed inset-y-0 z-40 bg-black/50 backdrop-blur-[2px]
                    transition-opacity duration-300
                    ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />

      {/* ── Drawer パネル ──────────────────────────────────────────────── */}
      <aside
        role="dialog"
        aria-modal
        aria-label="マイプロフィール"
        style={drawerStyle}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`fixed inset-y-0 z-50 flex flex-col
                    w-[92vw] max-w-[400px]
                    bg-gray-50 dark:bg-slate-900
                    shadow-[4px_0_40px_rgba(0,0,0,0.22)]
                    transform transition-transform duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/25
                     hover:bg-black/40 active:scale-90 transition-all"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white"
               stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* ── スクロール可能なコンテンツ ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          <ProfileHeader
            session={session}
            departmentLabel={departmentLabel}
            enrollmentYear={enrollmentYear}
            profile={profile}
          />

          <div className="px-3 pt-4 pb-8 space-y-4">
            <AffiliationSection
              departmentLabel={departmentLabel}
              enrollmentYear={enrollmentYear}
              profile={profile}
              isLoading={isLoading}
              onChangeDepartment={handleChangeDepartment}
              onEnrollmentYearChange={onEnrollmentYearChange}
              onUpdateProfile={updateProfile}
              rawLeavePeriods={rawLeavePeriods}
              onLeavePeriodChange={onLeavePeriodChange}
              onOpenMinorSection={onOpenMinorSection}
              onOpenExemption={onOpenExemption}
              exemptionCount={exemptionCount}
            />
            <DisplaySection />
            <DataSection profile={profile} />
            <AuthSection onClose={onClose} />

            <p className="text-center text-[11px] text-gray-300 dark:text-slate-600 pt-1">
              履修管理アプリ · 学芸大学
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
