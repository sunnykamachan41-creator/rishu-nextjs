'use client'
import DrawerSection        from '../ui/DrawerSection'
import DrawerItem, { Toggle } from '../ui/DrawerItem'
import { useSettingsStore } from '@/store/settingsStore'

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <rect x="3"  y="3"  width="7" height="7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="3"  width="7" height="7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="14" width="7" height="7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3"  y="14" width="7" height="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="6" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  )
}

const TIMETABLE_VIEW_LABELS = {
  weekly: '週間表示',
  list:   'リスト表示',
}

export default function DisplaySection() {
  const {
    darkMode, toggleDarkMode,
    timetableView, setTimetableView,
    showCreditBadge, setShowCreditBadge,
  } = useSettingsStore()

  const nextView    = timetableView === 'weekly' ? 'list' : 'weekly'
  const nextViewLabel = TIMETABLE_VIEW_LABELS[nextView]

  return (
    <DrawerSection label="表示">
      {/* ダークモード */}
      <DrawerItem
        icon={<MoonIcon />}
        label="ダークモード"
        right={<Toggle checked={darkMode} onChange={toggleDarkMode} />}
      />

      {/* 時間割表示形式 */}
      <DrawerItem
        icon={<GridIcon />}
        label="時間割の表示形式"
        value={TIMETABLE_VIEW_LABELS[timetableView]}
        sublabel={`タップで${nextViewLabel}に切替`}
        onPress={() => setTimetableView(nextView)}
      />

      {/* 単位バッジ */}
      <DrawerItem
        icon={<BadgeIcon />}
        label="単位数バッジを表示"
        right={<Toggle checked={showCreditBadge} onChange={setShowCreditBadge} />}
      />
    </DrawerSection>
  )
}
