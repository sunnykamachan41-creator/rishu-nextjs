import { useRef, useCallback } from 'react'

/**
 * 下スワイプでモーダルを閉じる hook。
 *
 * 使い方:
 *   const { sheetRef, handleProps } = useSwipeDown(onClose)
 *
 *   // モーダル本体の div に ref と handleProps の両方を付ける
 *   <div ref={sheetRef} {...handleProps} ...>
 *     ...content...
 *   </div>
 *
 * 変更点（旧: ハンドル限定 / 新: 画面全体で検知）:
 *   - touchAction: none を削除 → 内部スクロールが正常に動作する
 *   - onTouchMove を廃止 → ドラッグ中の transform アニメーションなし
 *   - onTouchStart 時に最寄りのスクロール要素の scrollTop を記録し、
 *     スクロール中（scrollTop > 0）の場合は閉じる判定をスキップ
 *   - 閾値: 80px 以上下にスワイプして離すと onClose() を呼ぶ
 */
export function useSwipeDown(onClose) {
  const sheetRef        = useRef(null)
  const startY          = useRef(null)
  const startScrollTop  = useRef(0)

  const onTouchStart = useCallback((e) => {
    // タッチ開始位置の最寄りスクロール要素の scrollTop を記録
    // scrollTop > 0 の場合はスクロール操作とみなし、スワイプ判定をスキップする
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
    // スクロール中だった場合は無視
    if (startScrollTop.current > 0) { startY.current = null; return }
    const dy = e.changedTouches[0].clientY - startY.current
    startY.current = null
    if (dy > 80) {
      // 閾値超え → 閉じる（アニメーション後）
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.2s ease-out'
        sheetRef.current.style.transform  = 'translateY(100%)'
      }
      setTimeout(onClose, 180)
    }
  }, [onClose])

  // モーダル本体（sheetRef を付けた div）に {...handleProps} を展開する
  const handleProps = { onTouchStart, onTouchEnd }

  return { sheetRef, handleProps }
}
