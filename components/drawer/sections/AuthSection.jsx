'use client'
import { signOut } from 'next-auth/react'
import DrawerSection from '../ui/DrawerSection'
import DrawerItem    from '../ui/DrawerItem'

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}

export default function AuthSection({ onClose }) {
  const handleSignOut = async () => {
    onClose()
    await signOut({ callbackUrl: '/' })
  }

  return (
    <DrawerSection label="アカウント">
      <DrawerItem
        icon={<LogoutIcon />}
        label="ログアウト"
        sublabel="Google アカウントからサインアウト"
        danger
        chevron
        onPress={handleSignOut}
      />
    </DrawerSection>
  )
}
