'use client'
import { Slide, SlideContent, YoraBrand, SwipeHint, Ornament, Card, Cat, Title, BigNum, FadeUp, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'

const MAX_GRADES = 4

export default function SlideBusiestYear({ data }) {
  const { ref, triggered } = useSlideVisible(0.5)
  const { coursesByGrade = {}, busiestGrade, busiestGradeCount } = data

  const maxCredits = Math.max(1, ...Object.values(coursesByGrade))

  return (
    <Slide ref={ref}>
      <SlideContent className="justify-center gap-4 pt-5">
        <FadeUp triggered={triggered} delay={0}><Cat>Busiest Year</Cat></FadeUp>
        <FadeUp triggered={triggered} delay={80}><Title>最も忙しかった学年</Title></FadeUp>
        <FadeUp triggered={triggered} delay={160}><Ornament /></FadeUp>

        <FadeUp triggered={triggered} delay={240} style={{ width: '100%' }}>
          <Card style={{ padding: '1.4rem 1.3rem' }}>
            <div style={{ fontSize: 10, color: C.gy, marginBottom: '1.1rem', textAlign: 'center', letterSpacing: '0.06em' }}>
              学年ごとの履修授業数
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {Array.from({ length: MAX_GRADES }, (_, i) => i + 1).map((grade, idx) => {
                const count = coursesByGrade[grade] ?? 0
                const widthPct = maxCredits > 0 ? (count / maxCredits) * 100 : 0
                const isBusiest = grade === busiestGrade
                const delay = 300 + idx * 150

                return (
                  <div key={grade} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <div style={{ fontSize: 9.5, color: C.gy, width: 32, textAlign: 'right', flexShrink: 0 }}>{grade}年</div>
                    <div style={{ flex: 1, height: 30, background: C.gdpp, borderRadius: 6, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 6,
                          background: isBusiest ? C.gd : C.nv,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          paddingRight: '0.6rem',
                          minWidth: 36,
                          width: triggered ? `${widthPct}%` : '0%',
                          transition: `width 1.1s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
                        }}
                      >
                        <span style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 12, fontWeight: 900, color: 'white' }}>
                          {count}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 9.5, color: C.gy, width: 28, textAlign: 'right', flexShrink: 0 }}>授業</div>
                  </div>
                )
              })}
            </div>

            <Ornament style={{ margin: '0.95rem 0 0.55rem' }} />
            <div style={{ textAlign: 'center', fontSize: 11, color: C.gy }}>
              最も忙しかったのは <span style={{ fontWeight: 700, color: C.nv }}>{busiestGrade}年生</span> の{' '}
              <BigNum style={{ fontSize: 18, display: 'inline' }}>{busiestGradeCount}</BigNum> 授業
            </div>
          </Card>
        </FadeUp>

        <FadeUp triggered={triggered} delay={700}>
          <div style={{ fontSize: 11.5, color: C.gy, textAlign: 'center', fontFamily: "'Noto Serif JP', serif", letterSpacing: '0.04em' }}>
            積み重ねてきた学びの軌跡です。
          </div>
        </FadeUp>
      </SlideContent>

      <YoraBrand />
      <SwipeHint />
    </Slide>
  )
}
