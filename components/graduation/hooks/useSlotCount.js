import { useEffect, useRef, useState } from 'react'

/**
 * じゃがじゃがじゃん！カウントアップフック
 * triggered が true になったタイミングでアニメーション開始
 */
export function useSlotCount(target, { triggered = false, delay = 0, duration = 1300, comma = false } = {}) {
  const [value, setValue] = useState(0)
  const ranRef = useRef(false)

  useEffect(() => {
    if (!triggered || ranRef.current) return
    ranRef.current = true

    const fmt = n => comma ? n.toLocaleString() : String(n)

    const timer = setTimeout(() => {
      const startTime = performance.now()
      const tick = (now) => {
        const elapsed  = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        if (progress < 1) {
          const eased = 1 - Math.pow(1 - progress, 3)
          if (progress < 0.65) {
            setValue(fmt(Math.floor(Math.random() * (target + 1))))
          } else {
            const jitter = Math.floor(Math.random() * target * (1 - progress) * 0.6)
            setValue(fmt(Math.min(Math.floor(target * eased) + jitter, target)))
          }
          requestAnimationFrame(tick)
        } else {
          setValue(fmt(target))
        }
      }
      requestAnimationFrame(tick)
    }, delay)

    return () => clearTimeout(timer)
  }, [triggered, target, delay, duration, comma])

  return value
}
