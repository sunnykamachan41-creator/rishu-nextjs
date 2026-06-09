'use client'
import { useRouter } from 'next/navigation'
import DrawerSection from '../ui/DrawerSection'
import DrawerItem    from '../ui/DrawerItem'

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
    </svg>
  )
}

export default function LegalSection({ onClose }) {
  const router = useRouter()

  const go = (path) => {
    onClose()
    setTimeout(() => router.push(path), 300)
  }

  return (
    <DrawerSection label="法的情報">
      <DrawerItem
        icon={<DocIcon />}
        label="利用規約"
        sublabel="サービスの利用条件・免責事項"
        chevron
        onPress={() => go('/terms')}
      />
      <DrawerItem
        icon={<ShieldIcon />}
        label="プライバシーポリシー"
        sublabel="個人情報の取り扱い・データ削除"
        chevron
        onPress={() => go('/privacy')}
      />
    </DrawerSection>
  )
}
