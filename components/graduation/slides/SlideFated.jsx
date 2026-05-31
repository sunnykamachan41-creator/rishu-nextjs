'use client'
import { Slide, SlideContent, YoraBrand, SwipeHint, Ornament, Card, Cat, Title, FadeUp, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'

export default function SlideFated({ data }) {
  const { ref, triggered } = useSlideVisible(0.5)

  return (
    <Slide ref={ref}>
      <SlideContent className="justify-center gap-4 pt-5">
        <FadeUp triggered={triggered} delay={0}><Cat>Fated Person</Cat></FadeUp>
        <FadeUp triggered={triggered} delay={80}><Title>運命の人</Title></FadeUp>
        <FadeUp triggered={triggered} delay={160}>
          <div style={{ fontSize: 11.5, color: C.gy, textAlign: 'center' }}>
            YORAが選んだ、あなたに縁のある一人
          </div>
        </FadeUp>
        <FadeUp triggered={triggered} delay={200}><Ornament /></FadeUp>

        <FadeUp triggered={triggered} delay={280} style={{ width: '100%' }}>
          <Card style={{ padding: '2rem 1.5rem' }}>
            {/* プロフィール */}
            <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
              <div style={{ width: 84, height: 84, borderRadius: '50%', background: C.cr2, border: `2px solid ${C.gdp}`, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="50" height="50" viewBox="0 0 44 44" fill={C.nv} opacity=".28">
                  <circle cx="22" cy="16" r="10" />
                  <ellipse cx="22" cy="38" rx="16" ry="12" />
                </svg>
              </div>
              <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 8.5, letterSpacing: '0.2em', color: C.gd, margin: '0.7rem 0 0.3rem', textTransform: 'uppercase' }}>
                Your Fated Professor
              </div>
              <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 21, fontWeight: 700, color: C.nv }}>
                {data.fatedInstructor} 先生
              </div>
              {data.fatedCourseCount > 0 && (
                <div style={{ fontSize: 11.5, color: C.gy, marginTop: '0.3rem' }}>
                  {data.fatedCourseCount}授業でお世話になりました
                </div>
              )}
            </div>

            <Ornament style={{ margin: '0.7rem 0' }} />

            {/* メッセージ */}
            <div
              style={{
                padding: '1rem 0.8rem',
                background: C.cr,
                borderRadius: 10,
                marginTop: '0.6rem',
                position: 'relative',
                opacity:    triggered ? 1 : 0,
                transform:  triggered ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity .7s ease 500ms, transform .7s ease 500ms',
              }}
            >
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, color: C.gdl, position: 'absolute', top: '0.1rem', left: '0.5rem', lineHeight: 1 }}>"</div>
              <div style={{ fontSize: 13.5, color: C.nv, lineHeight: 1.85, padding: '0 0.8rem', textAlign: 'center' }}>
                {data.fatedMessage}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, color: C.gdl, position: 'absolute', bottom: '-0.4rem', right: '0.5rem', lineHeight: 1 }}>"</div>
            </div>
          </Card>
        </FadeUp>
      </SlideContent>

      <YoraBrand />
      <SwipeHint />
    </Slide>
  )
}
