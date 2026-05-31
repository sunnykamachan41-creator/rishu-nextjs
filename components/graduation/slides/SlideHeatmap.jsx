'use client'
import React from 'react'
import { Slide, SlideContent, YoraBrand, SwipeHint, Ornament, Card, Cat, Title, BigNum, FadeUp, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'

const DAYS    = ['月', '火', '水', '木', '金']
const PERIODS = [1, 2, 3, 4, 5]

function getLevel(count, max) {
  if (!count) return 0
  const ratio = count / max
  if (ratio >= 0.9) return 7
  if (ratio >= 0.75) return 6
  if (ratio >= 0.6) return 5
  if (ratio >= 0.45) return 4
  if (ratio >= 0.3) return 3
  if (ratio >= 0.15) return 2
  return 1
}

const LEVEL_BG = [
  'rgba(30,45,78,.03)',  // 0: なし
  'rgba(30,45,78,.08)',  // 1
  'rgba(30,45,78,.15)',  // 2
  'rgba(30,45,78,.25)',  // 3
  'rgba(30,45,78,.38)',  // 4
  'rgba(30,45,78,.52)',  // 5
  'rgba(30,45,78,.70)',  // 6
  '#1e2d4e',             // 7: 最多
]

export default function SlideHeatmap({ data }) {
  const { ref, triggered } = useSlideVisible(0.5)
  const { heatmap = {}, mostDay, mostPeriod } = data

  const maxCount = Math.max(1, ...Object.values(heatmap))

  return (
    <Slide ref={ref}>
      <SlideContent className="justify-center gap-4 pt-5">
        <FadeUp triggered={triggered} delay={0}><Cat>Time Spent</Cat></FadeUp>
        <FadeUp triggered={triggered} delay={80}><Title>最も過ごした時間</Title></FadeUp>
        <FadeUp triggered={triggered} delay={160}><Ornament /></FadeUp>

        <FadeUp triggered={triggered} delay={240} style={{ width: '100%' }}>
          <Card style={{ padding: '1.3rem' }}>
            <div style={{ fontSize: 10, color: C.gy, marginBottom: '0.9rem', textAlign: 'center', letterSpacing: '0.06em' }}>
              曜日・時限ヒートマップ
            </div>
            {/* グリッド */}
            <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(5,1fr)', gap: 3.5 }}>
              {/* ヘッダー行 */}
              <div />
              {DAYS.map(d => (
                <div key={d} style={{ fontSize: 10, color: C.gy, textAlign: 'center', fontFamily: "'League Spartan', sans-serif", padding: '2px 0' }}>{d}</div>
              ))}

              {/* データ行 */}
              {PERIODS.map(p => (
                <React.Fragment key={p}>
                  <div style={{ fontSize: 9.5, color: C.gy, display: 'flex', alignItems: 'center' }}>{p}限</div>
                  {DAYS.map((d, di) => {
                    // 水曜4・5限はなし
                    if (d === '水' && p > 3) {
                      return <div key={`${d}${p}`} style={{ aspectRatio: '1' }} />
                    }
                    const key   = `${d}_${p}`
                    const count = heatmap[key] ?? 0
                    const level = getLevel(count, maxCount)
                    const isPeak = d === mostDay && p === mostPeriod
                    const delay = 300 + (p - 1 + di) * 60

                    return (
                      <div
                        key={key}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 5,
                          background: isPeak ? C.nv : LEVEL_BG[level],
                          transform:  triggered ? 'scale(1)' : 'scale(0)',
                          opacity:    triggered ? 1 : 0,
                          transition: `transform .35s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms, opacity .25s ease ${delay}ms`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                        }}
                      >
                        {count > 0 && (
                          <span style={{
                            fontSize: 7,
                            fontFamily: "'League Spartan', sans-serif",
                            fontWeight: 700,
                            color: level >= 5 || isPeak ? 'rgba(255,255,255,0.7)' : 'rgba(30,45,78,0.35)',
                            lineHeight: 1,
                            userSelect: 'none',
                          }}>
                            {count}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
            </div>
          </Card>
        </FadeUp>

        <FadeUp triggered={triggered} delay={700} style={{ width: '100%' }}>
          <div style={{ background: C.nv, borderRadius: 13, padding: '0.9rem 1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 8.5, color: 'rgba(255,255,255,.4)', letterSpacing: '0.12em', marginBottom: '0.3rem' }}>MOST FREQUENT</div>
              <BigNum style={{ fontSize: 24, color: 'white', letterSpacing: '0.04em' }}>{mostDay}曜日 {mostPeriod}限</BigNum>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginBottom: '0.2rem' }}>が最多でした</div>
              <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 13, fontWeight: 900, color: C.gdl }}>
                {mostDay && mostPeriod ? (heatmap[`${mostDay}_${mostPeriod}`] ?? 0) : 0}
                <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,.5)', marginLeft: 2 }}>授業</span>
              </div>
            </div>
          </div>
        </FadeUp>
      </SlideContent>

      <YoraBrand />
      <SwipeHint />
    </Slide>
  )
}
