'use client'
import { Slide, SlideContent, YoraBrand, SwipeHint, Ornament, Card, Cat, Title, BigNum, FadeUp, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'
import { useSlotCount }    from '../hooks/useSlotCount'

export default function SlideClassroom({ data }) {
  const { ref, triggered } = useSlideVisible(0.5)
  const visits  = useSlotCount(data.topClassroomCount,   { triggered, delay: 400 })
  const minutes = useSlotCount(data.topClassroomMinutes, { triggered, delay: 700, comma: true })

  // 日数・時間換算
  const totalMin  = data.topClassroomMinutes
  const days      = Math.floor(totalMin / (60 * 24))
  const hours     = Math.floor((totalMin % (60 * 24)) / 60)

  return (
    <Slide ref={ref}>
      <SlideContent className="justify-center gap-4 pt-5">
        <FadeUp triggered={triggered} delay={0}><Cat>Home Ground</Cat></FadeUp>
        <FadeUp triggered={triggered} delay={80}><Title>最も多く通った教室</Title></FadeUp>
        <FadeUp triggered={triggered} delay={160}><Ornament /></FadeUp>

        <FadeUp triggered={triggered} delay={240} style={{ width: '100%' }}>
          <Card style={{ padding: '1.6rem 1.4rem', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: C.gy, letterSpacing: '0.1em', marginBottom: '0.7rem' }}>
              あなたが最も多く通った教室
            </div>
            <BigNum style={{ fontSize: 52, letterSpacing: '0.04em' }}>{data.topClassroom}</BigNum>
            {data.topClassroomBuilding && (
              <div style={{ fontSize: 12, color: C.gy, marginTop: '0.3rem', marginBottom: '1.1rem' }}>
                {data.topClassroomBuilding}棟
              </div>
            )}

            <Ornament style={{ margin: '0.6rem 0' }} />

            <div style={{ marginTop: '0.7rem' }}>
              <div style={{ fontSize: 10, color: C.gy, marginBottom: '0.4rem' }}>通った回数</div>
              <BigNum style={{ fontSize: 58 }}>{visits}</BigNum>
              <div style={{ fontSize: 11, color: C.gy, marginTop: '0.3rem' }}>回</div>
            </div>
          </Card>
        </FadeUp>

        <FadeUp triggered={triggered} delay={360} style={{ width: '100%' }}>
          <div style={{ background: C.nv, borderRadius: 13, padding: '0.9rem 1.3rem', textAlign: 'center' }}>
            <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 8.5, color: 'rgba(255,255,255,.4)', letterSpacing: '0.14em', marginBottom: '0.35rem' }}>
              TOTAL TIME IN THIS ROOM
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', lineHeight: 1.7 }}>
              合計 <BigNum style={{ fontSize: 20, color: 'white', display: 'inline' }}>{minutes}</BigNum> 分<br />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>これは </span>
              <BigNum style={{ fontSize: 18, color: C.gdl, display: 'inline' }}>
                {days}日と{hours}時間
              </BigNum>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}> に値します</span>
            </div>
          </div>
        </FadeUp>
      </SlideContent>

      <YoraBrand />
      <SwipeHint />
    </Slide>
  )
}
