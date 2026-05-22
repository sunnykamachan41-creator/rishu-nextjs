'use client'
import { useState } from 'react'
import DrawerSection       from '../ui/DrawerSection'
import DrawerItem          from '../ui/DrawerItem'
import EnrollmentYearModal from '../modals/EnrollmentYearModal'
import LeavePeriodModal    from '../modals/LeavePeriodModal'

function DeptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 14l9-5-9-5-9 5 9 5z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
      <line x1="8"  y1="2" x2="8"  y2="6" strokeLinecap="round" />
      <line x1="3"  y1="10" x2="21" y2="10" strokeLinecap="round" />
    </svg>
  )
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function ExemptionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  )
}

export default function AffiliationSection({
  departmentLabel,        // 表示用ラベル（例: "英語教育専攻"）
  enrollmentYear,
  profile,
  isLoading,
  onChangeDepartment,
  onEnrollmentYearChange,
  onUpdateProfile,
  rawLeavePeriods = [],
  onLeavePeriodChange,
  onOpenMinorSection = null,
  onOpenExemption    = null,
  exemptionCount     = 0,
}) {
  const [yearModalOpen,  setYearModalOpen]  = useState(false)
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)

  return (
    <>
      <DrawerSection label="所属">
        {/* 学科 */}
        <DrawerItem
          icon={<DeptIcon />}
          label="学科"
          value={departmentLabel || '未設定'}
          sublabel="タップで変更"
          chevron
          onPress={onChangeDepartment}
        />

        {/* 副免許 → 卒業要件 ② に飛ぶ */}
        <DrawerItem
          icon={<BookIcon />}
          label="副免許"
          value={isLoading ? '読込中…' : (profile?.minor || '未設定')}
          sublabel="② 副免許・資格で管理"
          chevron
          onPress={onOpenMinorSection ?? undefined}
        />

        {/* 単位認定 → カタログタブに飛ぶ */}
        <DrawerItem
          icon={<ExemptionIcon />}
          label="単位認定"
          value={exemptionCount > 0 ? `${exemptionCount}件` : 'なし'}
          sublabel="認定済み単位を管理"
          chevron
          onPress={onOpenExemption ?? undefined}
        />

        {/* 入学年度 */}
        <DrawerItem
          icon={<CalendarIcon />}
          label="入学年度"
          value={enrollmentYear ? `${enrollmentYear}年度` : '未設定'}
          sublabel="学年計算の基準"
          chevron
          onPress={() => setYearModalOpen(true)}
        />

        {/* 休学期間 */}
        <DrawerItem
          icon={<LeaveIcon />}
          label="休学期間"
          value={rawLeavePeriods.length > 0 ? `${rawLeavePeriods.length}件` : 'なし'}
          sublabel="休学中は履修登録がロックされます"
          chevron
          onPress={() => setLeaveModalOpen(true)}
        />
      </DrawerSection>

      {yearModalOpen && (
        <EnrollmentYearModal
          current={enrollmentYear}
          onSave={(y) => { onEnrollmentYearChange(y); setYearModalOpen(false) }}
          onClose={() => setYearModalOpen(false)}
        />
      )}

      {leaveModalOpen && (
        <LeavePeriodModal
          rawLeavePeriods={rawLeavePeriods}
          onSaved={onLeavePeriodChange}
          onClose={() => setLeaveModalOpen(false)}
        />
      )}
    </>
  )
}
