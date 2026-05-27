'use client'
import { useState, useCallback } from 'react'
import DrawerSection from '../ui/DrawerSection'
import DrawerItem    from '../ui/DrawerItem'

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  )
}

export default function ShareSection() {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    const url  = window.location.origin
    const text = '東京学芸大学の履修管理アプリ「YORA」📚 時間割・卒業要件をスマートに管理できます！'

    // モバイルなどWeb Share API対応環境 → ネイティブ共有シートを起動
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'YORA', text, url })
        return
      } catch {
        // キャンセル or 非対応 → クリップボードにフォールバック
      }
    }

    // フォールバック: URLをクリップボードにコピー
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // clipboard APIも使えない場合は何もしない
    }
  }, [])

  return (
    <DrawerSection label="シェア">
      <DrawerItem
        icon={<ShareIcon />}
        label="友達に紹介する"
        sublabel="YORAをシェアしよう"
        chevron={!copied}
        onPress={handleShare}
        right={copied ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-green-500 flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            コピーしました
          </span>
        ) : undefined}
      />
    </DrawerSection>
  )
}
