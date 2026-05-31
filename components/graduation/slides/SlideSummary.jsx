'use client'
import { useRef, useState } from 'react'
import { Slide, Ornament, Card, Cat, BigNum, FadeUp, C } from '../SlideLayout'
import { useSlideVisible } from '../hooks/useSlideVisible'

const SEMESTER_LABEL = { spring: '春に燃えるタイプ', autumn: '秋に深まるタイプ' }

// html2canvas はグラデーション内の transparent を 0×0 canvas として誤処理するバグがある。
// save-target 内では gradient を使わない SolidOrnament を使う。
function SolidOrnament({ style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', ...style }}>
      <div style={{ flex: 1, height: 1, background: C.gdp }} />
      <div style={{ width: 4, height: 4, background: C.gd, transform: 'rotate(45deg)', flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1, background: C.gdp }} />
    </div>
  )
}

export default function SlideSummary({ data, onClose }) {
  const { ref, triggered } = useSlideVisible(0.5)
  const saveRef  = useRef(null)
  const [saving, setSaving] = useState(false)

  async function generateCanvas() {
    const html2canvas = (await import('html2canvas')).default
    return html2canvas(saveRef.current, {
      backgroundColor: C.cr,
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      imageTimeout: 15000,
      onclone: (clonedDoc) => {
        clonedDoc.body.style.fontFamily = "'Noto Sans JP', sans-serif"
      },
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const canvas = await generateCanvas()
      canvas.toBlob((blob) => {
        if (!blob) { alert('保存に失敗しました。'); return }
        const url  = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = 'YORA_ARCHIVE.png'
        link.href = url
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }, 'image/png')
    } catch (e) {
      console.error('[html2canvas]', e)
      alert(`保存に失敗しました: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleShare() {
    setSaving(true)
    try {
      const canvas = await generateCanvas()
      canvas.toBlob(async (blob) => {
        if (!blob) { alert('シェアに失敗しました。'); return }
        const file = new File([blob], 'YORA_ARCHIVE.png', { type: 'image/png' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'YORA ARCHIVE' })
        } else {
          // Web Share API 非対応 → ダウンロードにフォールバック
          const url  = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.download = 'YORA_ARCHIVE.png'
          link.href = url
          link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
      }, 'image/png')
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[share]', e)
        alert(`シェアに失敗しました: ${e.message}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const { coursesByGrade = {}, busiestGrade, busiestGradeCount } = data
  const typeLabel = SEMESTER_LABEL[data.semesterType] ?? ''

  return (
    <Slide ref={ref}>
      {/* 画像保存対象エリア */}
      <div
        ref={saveRef}
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '0.7rem 1.3rem 0.6rem',
          gap: 0,
          background: C.cr,
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        {/* ヘッダー — save-target内はFadeUp不使用（html2canvasでtransformがずれるため） */}
        <div>
          <Card style={{ padding: '0.9rem 1.3rem', textAlign: 'center' }}>
            <Cat>YORA ARCHIVE {data.latestAcademicYear}</Cat>
            <SolidOrnament style={{ width: '65%', margin: '0.3rem auto 0.45rem' }} />
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 10, color: C.gy, letterSpacing: '0.08em' }}>在学者</div>
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 18, fontWeight: 700, color: C.nv, margin: '0.15rem 0 0.1rem' }}>
              {data.userName} 殿
            </div>
            <div style={{ fontSize: 11, color: C.nv2, fontWeight: 500, marginBottom: '0.1rem' }}>
              {data.department} ／ {data.curriculumYear}年度 入学
            </div>
            <SolidOrnament style={{ width: '65%', margin: '0.3rem auto 0.4rem' }} />
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 14, fontWeight: 700, color: C.nv }}>卒業記念レコード</div>
            <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 9, color: C.gd, letterSpacing: '0.12em', marginTop: '0.2rem' }}>
              {data.yearRange}
            </div>
          </Card>
        </div>

        {/* Stats 上段 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.45rem', marginTop: '0.5rem' }}>
          {[
            { label: '取得単位数', value: data.totalCredits, unit: '単位' },
            { label: '履修授業数', value: data.totalCourses, unit: '授業' },
            { label: '単位取得率', value: `${data.passRate}`, unit: '%', unitColor: C.gd },
          ].map(({ label, value, unit, unitColor }) => (
            <Card key={label} style={{ textAlign: 'center', padding: '0.9rem 0.4rem' }}>
              <div style={{ fontSize: 8.5, color: C.gy, marginBottom: '0.3rem' }}>{label}</div>
              <BigNum style={{ fontSize: 28 }}>{value}</BigNum>
              <div style={{ fontSize: 8.5, color: unitColor ?? C.gy, marginTop: '0.2rem', fontWeight: unitColor ? 700 : 400 }}>{unit}</div>
            </Card>
          ))}
        </div>

        {/* Stats 下段 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.45rem', marginTop: '0.45rem' }}>
          <Card style={{ textAlign: 'center', padding: '0.9rem 0.4rem' }}>
            <div style={{ fontSize: 8.5, color: C.gy, marginBottom: '0.3rem' }}>最多の時間</div>
            <BigNum style={{ fontSize: 14, lineHeight: 1.35 }}>{data.mostDay}曜日<br />{data.mostPeriod}限</BigNum>
          </Card>
          <Card style={{ textAlign: 'center', padding: '0.9rem 0.4rem' }}>
            <div style={{ fontSize: 8.5, color: C.gy, marginBottom: '0.3rem' }}>最多の教室</div>
            <BigNum style={{ fontSize: 22 }}>{data.topClassroom}</BigNum>
            <div style={{ fontSize: 8.5, color: C.gy, marginTop: '0.2rem' }}>{data.topClassroomMinutes?.toLocaleString()}分</div>
          </Card>
          <Card style={{ textAlign: 'center', padding: '0.9rem 0.4rem' }}>
            <div style={{ fontSize: 8.5, color: C.gy, marginBottom: '0.3rem' }}>最忙学年</div>
            <BigNum style={{ fontSize: 24 }}>{busiestGrade}年</BigNum>
            <div style={{ fontSize: 8.5, color: C.gy, marginTop: '0.2rem' }}>{busiestGradeCount}授業</div>
          </Card>
        </div>

        {/* 学期タイプ */}
        <div style={{ marginTop: '0.45rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: C.gdpp, borderRadius: 20, padding: '0.35rem 0.9rem' }}>
            <div style={{ fontSize: 8.5, color: C.gy, marginRight: '0.5rem' }}>学期タイプ</div>
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 12, fontWeight: 700, color: C.nv }}>{typeLabel}</div>
          </div>
        </div>

        {/* 運命の人 */}
        <Card style={{ padding: '1rem 1.1rem', marginTop: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: C.cr2, border: `1.5px solid ${C.gdp}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '0.7rem' }}>
              <svg width="22" height="22" viewBox="0 0 44 44" fill={C.nv} opacity=".30">
                <circle cx="22" cy="16" r="10" />
                <ellipse cx="22" cy="38" rx="16" ry="12" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 7.5, color: C.gd, letterSpacing: '0.15em', fontFamily: "'League Spartan', sans-serif", textTransform: 'uppercase' }}>Fated Person</div>
              <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 15, fontWeight: 700, color: C.nv }}>{data.fatedInstructor} 先生</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.gy, lineHeight: 1.75, borderLeft: `2px solid ${C.gdp}`, paddingLeft: '0.6rem' }}>
            {data.fatedMessage}
          </div>
        </Card>

        {/* メッセージ + YORAロゴ */}
        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 13, fontWeight: 700, color: C.nv, marginBottom: '0.25rem' }}>
              4年間、本当にお疲れさまでした。
            </div>
            <div style={{ fontSize: 10.5, color: C.gy, marginBottom: '0.3rem' }}>
              あなたのこれからの未来が、実り多きものになりますように。
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: 11, color: C.gdl, marginBottom: '0.5rem' }}>
              Congratulations on your graduation.
            </div>
            {/* YORAロゴ（保存画像内） */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <img src="/icons/icon-192.png" style={{ width: 24, height: 24, borderRadius: 5 }} alt="YORA" />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 15, fontWeight: 900, letterSpacing: '0.1em', color: C.nv, lineHeight: 1 }}>YORA</div>
                <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 7, fontWeight: 700, letterSpacing: '0.28em', color: C.gd, textTransform: 'uppercase' }}>Archive</div>
              </div>
            </div>
          </div>
      </div>

      {/* 保存・シェア・閉じる（1行コンパクト、画像外）*/}
      <div style={{
        flexShrink: 0,
        padding: '0.45rem 1.1rem 0.45rem',
        borderTop: `1px solid ${C.gdp}`,
        background: C.cr,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        {/* 保存 */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: '0.55rem 0',
            background: saving ? C.gy : C.nv,
            border: 'none',
            borderRadius: 10,
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'Noto Sans JP', sans-serif",
            cursor: saving ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          {saving ? '処理中' : '保存'}
        </button>

        {/* シェア */}
        <button
          onClick={handleShare}
          disabled={saving}
          style={{
            flex: 1,
            padding: '0.55rem 0',
            background: saving ? C.gy : C.gd,
            border: 'none',
            borderRadius: 10,
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'Noto Sans JP', sans-serif",
            cursor: saving ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
          </svg>
          シェア
        </button>

        {/* 閉じる */}
        <button
          onClick={onClose}
          style={{
            flexShrink: 0,
            padding: '0.55rem 0.7rem',
            background: 'none',
            border: `1px solid ${C.gdp}`,
            borderRadius: 10,
            color: C.gy,
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: "'Noto Sans JP', sans-serif",
          }}
        >
          閉じる
        </button>
      </div>
    </Slide>
  )
}
