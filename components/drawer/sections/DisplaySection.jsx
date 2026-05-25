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

export default function DisplaySection() {
  const { darkMode, toggleDarkMode } = useSettingsStore()

  return (
    <DrawerSection label="表示">
      <DrawerItem
        icon={<MoonIcon />}
        label="ダークモード"
        right={<Toggle checked={darkMode} onChange={toggleDarkMode} />}
      />
    </DrawerSection>
  )
}
