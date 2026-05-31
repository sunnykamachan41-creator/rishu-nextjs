'use client'
import { useEffect, useRef, useState } from 'react'
import SlideIntro       from './slides/SlideIntro'
import SlideRecord      from './slides/SlideRecord'
import SlidePassRate    from './slides/SlidePassRate'
import SlideHeatmap     from './slides/SlideHeatmap'
import SlideClassroom   from './slides/SlideClassroom'
import SlideBusiestYear from './slides/SlideBusiestYear'
import SlideSemester    from './slides/SlideSemester'
import SlideFated       from './slides/SlideFated'
import SlideSummary     from './slides/SlideSummary'

const TOTAL_SLIDES = 9

export default function GraduationArchiveModal({ open, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [current, setCurrent] = useState(0)
  const slidesRef = useRef(null)

  // データ取得
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch('/api/graduation-story')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)

        // ── 運命の先生・メッセージをlocalStorageで固定 ──────────────────
        const cacheKey = `yora_fated_${d.studentId ?? 'user'}`
        let cached = null
        try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') } catch {}

        if (cached?.fatedInstructor) {
          // キャッシュあり → そちらを使う
          d.fatedInstructor  = cached.fatedInstructor
          d.fatedCourseCount = cached.fatedCourseCount
          d.fatedMessage     = cached.fatedMessage
        } else {
          // キャッシュなし → 今回の値を保存
          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              fatedInstructor:  d.fatedInstructor,
              fatedCourseCount: d.fatedCourseCount,
              fatedMessage:     d.fatedMessage,
            }))
          } catch {}
        }

        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [open])

  // スクロールでドット更新
  useEffect(() => {
    const el = slidesRef.current
    if (!el) return
    const onScroll = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight)
      setCurrent(Math.min(idx, TOTAL_SLIDES - 1))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [open])

  // 開くたびに先頭へ
  useEffect(() => {
    if (open && slidesRef.current) {
      slidesRef.current.scrollTo({ top: 0, behavior: 'instant' })
      setCurrent(0)
    }
  }, [open])

  if (!open) return null

  return (
    // オーバーレイ（PC では背景を暗く）
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.6)',
        animation: 'archiveOverlayIn .5s ease forwards',
      }}
    >
    <style>{`
      @keyframes archiveOverlayIn {
        from { opacity: 0 }
        to   { opacity: 1 }
      }
      @keyframes archiveSlideIn {
        from { opacity: 0; transform: scale(0.96) translateY(20px) }
        to   { opacity: 1; transform: scale(1) translateY(0) }
      }
    `}</style>
    {/* モーダル本体 — スマホ幅に制限 */}
    <div
      className="relative w-full max-w-[430px] h-full max-h-screen flex flex-col bg-[#faf6ef] overflow-hidden"
      style={{ animation: 'archiveSlideIn .7s cubic-bezier(0.34,1.1,0.64,1) forwards' }}
    >

      {/* ローディング */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <img src="/icons/icon-192.png" className="w-14 h-14 rounded-2xl animate-pulse" alt="YORA" />
          <p className="text-sm text-[#8a8a7a] tracking-widest font-light">LOADING...</p>
        </div>
      )}

      {/* エラー */}
      {error && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <p className="text-[#1e2d4e] text-center text-sm">データの取得に失敗しました。</p>
          <p className="text-[#8a8a7a] text-center text-xs">{error}</p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-2 bg-[#1e2d4e] text-white rounded-xl text-sm"
          >
            閉じる
          </button>
        </div>
      )}

      {/* スライド本体 */}
      {data && !loading && (
        <>
          {/* 閉じるボタン（右上） */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 text-[#1e2d4e]/50"
            aria-label="閉じる"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          {/* スライドコンテナ */}
          <div
            ref={slidesRef}
            className="flex-1 overflow-y-scroll"
            style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column' }}
          >
            <SlideIntro       data={data} />
            <SlideRecord      data={data} />
            <SlidePassRate    data={data} />
            <SlideHeatmap     data={data} />
            <SlideClassroom   data={data} />
            <SlideBusiestYear data={data} />
            <SlideSemester    data={data} />
            <SlideFated       data={data} />
            <SlideSummary     data={data} onClose={onClose} />
          </div>

          {/* ドットインジケーター */}
          <div className="flex-shrink-0 flex justify-center items-center gap-[5px] py-2 bg-[#faf6ef]">
            {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width:      i === current ? 14 : 5,
                  height:     5,
                  borderRadius: 3,
                  background: i === current ? '#b8922a' : '#e2cfa0',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
    </div>
  )
}
