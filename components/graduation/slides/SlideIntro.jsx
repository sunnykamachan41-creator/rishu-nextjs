'use client'
import { Slide, SlideContent, YoraBrand, SwipeHint, Ornament, Card, Cat, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'

export default function SlideIntro({ data }) {
  const { ref, triggered } = useSlideVisible(0.5)

  return (
    <Slide ref={ref}>
      <SlideContent className="justify-center pt-3">
        <Card
          style={{
            padding: '1.8rem 1.6rem',
            textAlign: 'center',
            opacity:    triggered ? 1 : 0,
            transform:  triggered ? 'scale(1) translateY(0)' : 'scale(.93) translateY(18px)',
            transition: 'opacity .8s cubic-bezier(0.34,1.2,0.64,1), transform .8s cubic-bezier(0.34,1.2,0.64,1)',
          }}
        >
          <Cat>YORA ARCHIVE {data.latestAcademicYear}</Cat>
          <Ornament style={{ width: '72%', margin: '0.85rem auto' }} />

          <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 10.5, color: C.gy, marginBottom: '0.4rem', letterSpacing: '0.1em' }}>在学者</div>
          <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 26, fontWeight: 700, color: C.nv, letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
            {data.userName} 殿
          </div>
          <div style={{ fontSize: 13, color: C.nv2, fontWeight: 500, marginBottom: '0.2rem' }}>{data.department}</div>
          <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 11, color: C.gd, letterSpacing: '0.12em', marginBottom: '1rem' }}>
            {data.curriculumYear} 入学
          </div>

          <Ornament style={{ width: '72%', margin: '0 auto 1rem' }} />

          <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 29, fontWeight: 700, color: C.nv, lineHeight: 1.25, marginBottom: '0.65rem' }}>
            4年間<br />お疲れさまでした
          </div>
          <div style={{ fontSize: 12, color: C.gy, marginBottom: '0.3rem' }}>あなたの大学生活の記録</div>
          <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 12, fontWeight: 700, color: C.gd, letterSpacing: '0.12em', marginBottom: '0.3rem' }}>
            {data.yearRange}
          </div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 12.5, color: 'rgba(30,45,78,.38)' }}>
            Faculty of Education
          </div>
        </Card>
      </SlideContent>

      <YoraBrand />
      <SwipeHint />
    </Slide>
  )
}
