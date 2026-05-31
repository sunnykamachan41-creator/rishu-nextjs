'use client'
import { Slide, SlideContent, YoraBrand, SwipeHint, Ornament, Card, Cat, Title, BigNum, FadeUp, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'
import { useSlotCount }    from '../hooks/useSlotCount'

const MESSAGES = {
  spring: {
    type: '春に燃えるタイプ',
    desc: '桜の季節が来ると自然と気持ちが高まり、\n学びへのエンジンがかかるタイプ。\n春の陽気とともに、あなたの4年間は\n確かに動き出していました。',
  },
  autumn: {
    type: '秋に深まるタイプ',
    desc: '澄んだ秋空の下で本領を発揮するタイプ。\n涼しさとともに集中力が高まり、\nあなたの学びは秋に深まっていました。',
  },
}

export default function SlideSemester({ data }) {
  const { ref, triggered } = useSlideVisible(0.5)
  const spring = useSlotCount(data.springCourses, { triggered, delay: 300 })
  const autumn = useSlotCount(data.autumnCourses, { triggered, delay: 550 })

  const type    = data.semesterType === 'spring' ? 'spring' : 'autumn'
  const msg     = MESSAGES[type]
  const isSpring = type === 'spring'

  return (
    <Slide ref={ref}>
      <SlideContent className="justify-center gap-4 pt-5">
        <FadeUp triggered={triggered} delay={0}><Cat>Semester Type</Cat></FadeUp>
        <FadeUp triggered={triggered} delay={80}><Title>あなたの学期タイプ</Title></FadeUp>
        <FadeUp triggered={triggered} delay={160}><Ornament /></FadeUp>

        {/* 春・秋カード 2列 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', width: '100%' }}>
          <FadeUp triggered={triggered} delay={240}>
            <Card
              style={{
                padding: '1.4rem 0.8rem',
                textAlign: 'center',
                borderColor: isSpring ? C.gd : C.gdp,
                boxShadow: isSpring ? `0 2px 16px rgba(184,146,42,.18)` : undefined,
              }}
            >
              <div style={{ fontSize: 9, color: isSpring ? C.gd : C.gy, letterSpacing: '0.12em', fontFamily: "'League Spartan', sans-serif", textTransform: 'uppercase', marginBottom: '0.5rem' }}>Spring</div>
              <BigNum style={{ fontSize: 44, color: isSpring ? C.gd : C.nv }}>{spring}</BigNum>
              <div style={{ fontSize: 10, color: C.gy, marginTop: '0.3rem' }}>授業</div>
              <div style={{ marginTop: '0.6rem', background: isSpring ? C.gd : C.cr2, color: isSpring ? 'white' : C.gy, fontSize: 9, fontFamily: "'League Spartan', sans-serif", letterSpacing: '0.1em', padding: '0.25rem 0.6rem', borderRadius: 20, display: 'inline-block' }}>春学期</div>
            </Card>
          </FadeUp>

          <FadeUp triggered={triggered} delay={320}>
            <Card
              style={{
                padding: '1.4rem 0.8rem',
                textAlign: 'center',
                borderColor: !isSpring ? C.gd : C.gdp,
                boxShadow: !isSpring ? `0 2px 16px rgba(184,146,42,.18)` : undefined,
              }}
            >
              <div style={{ fontSize: 9, color: !isSpring ? C.gd : C.gy, letterSpacing: '0.12em', fontFamily: "'League Spartan', sans-serif", textTransform: 'uppercase', marginBottom: '0.5rem' }}>Autumn</div>
              <BigNum style={{ fontSize: 44, color: !isSpring ? C.gd : C.nv }}>{autumn}</BigNum>
              <div style={{ fontSize: 10, color: C.gy, marginTop: '0.3rem' }}>授業</div>
              <div style={{ marginTop: '0.6rem', background: !isSpring ? C.gd : C.cr2, color: !isSpring ? 'white' : C.gy, fontSize: 9, fontFamily: "'League Spartan', sans-serif", letterSpacing: '0.1em', padding: '0.25rem 0.6rem', borderRadius: 20, display: 'inline-block' }}>秋学期</div>
            </Card>
          </FadeUp>
        </div>

        {/* タイプカード */}
        <FadeUp triggered={triggered} delay={480} style={{ width: '100%' }}>
          <Card style={{ padding: '1.3rem 1.4rem', textAlign: 'center' }}>
            <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 9, letterSpacing: '0.2em', color: C.gd, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Your Type</div>
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 21, fontWeight: 700, color: C.nv, marginBottom: '0.65rem' }}>
              {msg.type}
            </div>
            <Ornament style={{ margin: '0.5rem 0' }} />
            <div style={{ fontSize: 12.5, color: C.gy, lineHeight: 1.85, fontFamily: "'Noto Serif JP', serif", marginTop: '0.55rem', whiteSpace: 'pre-line' }}>
              {msg.desc}
            </div>
          </Card>
        </FadeUp>
      </SlideContent>

      <YoraBrand />
      <SwipeHint />
    </Slide>
  )
}
