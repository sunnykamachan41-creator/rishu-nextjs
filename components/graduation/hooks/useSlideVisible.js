import { useEffect, useRef, useState } from 'react'

/**
 * スクロールでスライドが画面に入ったとき triggered=true になるフック
 * 一度だけ発火する（再スクロールで再発火しない）
 */
export function useSlideVisible(threshold = 0.5) {
  const ref      = useRef(null)
  const [triggered, setTriggered] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTriggered(true)
          observer.disconnect()
        }
      },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, triggered }
}
