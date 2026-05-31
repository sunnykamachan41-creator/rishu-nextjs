'use client'
import { useEffect, useRef } from 'react'
import { Slide, SlideContent, YoraBrand, SwipeHint, Ornament, Card, Cat, Title, BigNum, FadeUp, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'
import { useSlotCount }    from '../hooks/useSlotCount'

const CIRCUMFERENCE = 2 * Math.PI * 61 // r=61

export default function SlidePassRate({ data }) {
  const { ref, triggered } = useSlideVisible(0.5)
  const rate   = useSlotCount(data.passRate,    { triggered, delay: 400 })
  const total  = useSlotCount(data.enrolledCount, { triggered, delay: 700 })
  const passed = useSlotCount(data.passedCount,   { triggered, delay: 900 })
  const arcRef = useRef(null)

  // 円グラフアニメーション
  useEffect(() => {
    if (!triggered || !arcRef.current) return
    const offset = CIRCUMFERENCE * (1 - data.passRate / 100)
    setTimeout(() => {
      if (arcRef.current) arcRef.current.style.strokeDashoffset = offset
    }, 400)
  }, [triggered, data.passRate])

  const isFullPass = data.passRate === 100

  return (
    <Slide ref={ref}>
      <SlideContent className="justify-center gap-4 pt-5">
        <FadeUp triggered={triggered} delay={0}><Cat>Achievement</Cat></FadeUp>
        <FadeUp triggered={triggered} delay={80}><Title>単位取得率</Title></FadeUp>
        <FadeUp triggered={triggered} delay={160}><Ornament /></FadeUp>

        <FadeUp triggered={triggered} delay={240} style={{ width: '100%' }}>
          <Card style={{ padding: '1.8rem 1.4rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.gy, marginBottom: '0.9rem', letterSpacing: '0.06em' }}>
                あなたの頑張りがカタチになりました
              </div>
              {/* 円グラフ */}
              <div style={{ position: 'relative', width: 148, height: 148, margin: '0 auto' }}>
                <svg width="148" height="148" viewBox="0 0 148 148" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="74" cy="74" r="61" fill="none" stroke={C.gdpp} strokeWidth="9" />
                  <circle
                    ref={arcRef}
                    cx="74" cy="74" r="61"
                    fill="none"
                    stroke={C.gd}
                    strokeWidth="9"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <BigNum style={{ fontSize: 40 }}>{rate}</BigNum>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.gd }}>%</div>
                </div>
              </div>
            </div>

            <Ornament style={{ margin: '0.8rem 0' }} />

            <div style={{ textAlign: 'center', fontSize: 13, color: C.gy, lineHeight: 1.9 }}>
              <BigNum style={{ fontSize: 22, display: 'inline' }}>{total}</BigNum> 授業のうち<br />
              <BigNum style={{ fontSize: 22, display: 'inline' }}>{passed}</BigNum> 授業の単位を修得しました
            </div>
          </Card>
        </FadeUp>

        <FadeUp triggered={triggered} delay={320} style={{ width: '100%' }}>
          <div style={{ background: C.gdpp, borderRadius: 10, padding: '0.6rem 1rem', textAlign: 'center' }}>
            <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 9, letterSpacing: '0.22em', color: C.gd, textTransform: 'uppercase' }}>
              {isFullPass ? '🏆 Perfect Achievement' : 'Excellent Achievement'}
            </div>
          </div>
        </FadeUp>
      </SlideContent>

      <YoraBrand />
      <SwipeHint />
    </Slide>
  )
}
