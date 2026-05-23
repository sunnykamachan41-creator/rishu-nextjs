import { useRef, useCallback } from 'react'

/**
 * 下スワイプでモーダルを閉じる hook。
 *
 * 使い方:
 *   const { sheetRef, handleProps } = useSwipeDown(onClose)
 *
 *   // モーダル本体の div に ref を付ける
 *   <div ref={sheetRef} ...>
 *     // ドラッグハンドル部分に handleProps を付ける
 *     <div {...handleProps}>
 *       <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
 *     </div>
 *     ...content...
 *   </div>
 *
 * 閾値: 80px 以上下にドラッグして離すと onClose() を呼ぶ。
 * それ以下なら元の位置にアニメーションで戻る。
 */
export function useSwipeDown(onClose) {
  const sheetRef  = useRef(null)
  const startY    = useRef(null)
  const currentDy = useRef(0)

  const onTouchStart = useCallback((e) => {
    startY.current    = e.touches[0].clientY
    currentDy.current = 0
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none'
    }
  }, [])

  const onTouchMove = useCallback((e) => {
    if (startY.current === null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy < 0) return  // 上方向はスルー
    currentDy.current = dy
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    if (startY.current === null) return
    startY.current = null
    if (currentDy.current > 80) {
      // 閾値超え → 閉じる（アニメーション後）
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.2s ease-out'
        sheetRef.current.style.transform  = `translateY(100%)`
      }
      setTimeout(onClose, 180)
    } else {
      // 閾値未満 → 元に戻す
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.2s ease-out'
        sheetRef.current.style.transform  = 'translateY(0)'
      }
    }
  }, [onClose])

  const handleProps = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    style: { touchAction: 'none' },
  }

  return { sheetRef, handleProps }
}
