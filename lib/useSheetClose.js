import { useState, useCallback, useRef } from 'react'

/** 閉じるアニメーション duration (ms) — globals.css の animate-slide-down と合わせる */
export const SHEET_CLOSE_MS = 260

/**
 * ボトムシートの閉じるアニメーションを管理するフック。
 *
 * 使い方:
 *   const { closing, closeSheet } = useSheetClose(onClose)
 *
 *   // パネルのクラスを切り替える
 *   <div className={closing ? 'animate-slide-down' : 'animate-slide-up'}>
 *
 *   // バックドロップのフェードアウト
 *   <div className={`transition-opacity duration-[260ms] ${closing ? 'opacity-0' : 'opacity-100'}`}>
 *
 *   // 全ての閉じるアクション（バックドロップ・ボタン・スワイプ）を closeSheet に統一
 *   onClick={closeSheet}
 */
export function useSheetClose(onClose) {
  const [closing, setClosing] = useState(false)
  const firedRef = useRef(false)

  const closeSheet = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    setClosing(true)
    setTimeout(() => {
      firedRef.current = false
      onClose()
    }, SHEET_CLOSE_MS)
  }, [onClose])

  return { closing, closeSheet }
}
