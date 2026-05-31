'use client'
import { Slide, SlideContent, YoraBrand, SwipeHint, Ornament, Card, Cat, Title, BigNum, FadeUp, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'
import { useSlotCount }    from '../hooks/useSlotCount'

export default function SlideRecord({ data }) {
  const { ref, triggered } = useSlideVisible(0.5)
  const classes = useSlotCount(data.totalCourses, { triggered, delay: 300 })
  const credits = useSlotCount(data.totalCredits, { triggered, delay: 600 })

  return (
    <Slide ref={ref}>
      <SlideContent className="justify-center gap-4 pt-5">
        <FadeUp triggered={triggered} delay={0}><Cat>Your Record</Cat></FadeUp>
        <FadeUp triggered={triggered} delay={80}><Title>4年間の履修記録</Title></FadeUp>
        <FadeUp triggered={triggered} delay={160}><Ornament /></FadeUp>

        <FadeUp triggered={triggered} delay={240} style={{ width: '100%' }}>
          <Card style={{ padding: '2.2rem 1.4rem', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.gy, marginBottom: '0.7rem', letterSpacing: '0.08em' }}>総履修授業数</div>
            <BigNum style={{ fontSize: 68 }}>{classes}</BigNum>
            <div style={{ fontSize: 13, color: C.gy, marginTop: '0.5rem' }}>授業</div>
          </Card>
        </FadeUp>

        <FadeUp triggered={triggered} delay={320} style={{ width: '100%' }}>
          <Card style={{ padding: '2.2rem 1.4rem', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.gy, marginBottom: '0.7rem', letterSpacing: '0.08em' }}>総取得単位数</div>
            <BigNum style={{ fontSize: 68 }}>{credits}</BigNum>
            <div style={{ fontSize: 13, color: C.gy, marginTop: '0.5rem' }}>単位</div>
          </Card>
        </FadeUp>

        <FadeUp triggered={triggered} delay={400}>
          <div style={{ fontSize: 12, color: C.gy, textAlign: 'center', fontFamily: "'Noto Serif JP', serif", letterSpacing: '0.04em' }}>
            4年間の学びが、数字になりました。
          </div>
        </FadeUp>
      </SlideContent>

      <YoraBrand />
      <SwipeHint />
    </Slide>
  )
}
