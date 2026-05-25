import { useRef, useCallback } from 'react'

/**
 * 下スワイプでモーダルを閉じる hook。
 *
 * 使い方:
 *   const { closeSheet } = useSheetClose(onClose)   // ← 先に useSheetClose を使う
 *   const { sheetRef, handleProps } = useSwipeDown(closeSheet)
 *
 *   <div ref={sheetRef} {...handleProps} ...>
 *
 * 変更履歴:
 *   - インラインスタイルアニメーションを廃止 → closeSheet() に委譲
 *     （CSS animate-slide-down で統一）
 *   - 閾値: 80px 以上下にスワイプして離すと closeSheet() を呼ぶ
 *   - スクロール中（scrollTop > 0）はスワイプ判定をスキップ
 */
export function useSwipeDown(closeSheet) {
  const sheetRef       = useRef(null)
  const startY         = useRef(null)
  const startScrollTop = useRef(0)

  const onTouchStart = useCallback((e) => {
    let scrollTop = 0
    let el = e.target
    while (el && el !== sheetRef.current) {
      if (el.scrollTop > 0) { scrollTop = el.scrollTop; break }
      el = el.parentElement
    }
    startScrollTop.current = scrollTop
    startY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback((e) => {
    if (startY.current === null) return
    if (startScrollTop.current > 0) { startY.current = null; return }
    const dy = e.changedTouches[0].clientY - startY.current
    startY.current = null
    if (dy > 80) closeSheet()
  }, [closeSheet])

  return { sheetRef, handleProps: { onTouchStart, onTouchEnd } }
}
