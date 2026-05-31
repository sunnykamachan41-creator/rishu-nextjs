'use client'
import { forwardRef } from 'react'

// カラートークン
export const C = {
  cr:   '#faf6ef',
  cr2:  '#f0e9d8',
  nv:   '#1e2d4e',
  nv2:  '#2d4270',
  gd:   '#b8922a',
  gdl:  '#d4ac52',
  gdp:  '#e2cfa0',
  gdpp: '#f5edda',
  wh:   '#ffffff',
  gy:   '#8a8a7a',
}

/** スライド1枚のラッパー（ref 転送対応） */
export const Slide = forwardRef(function Slide({ children, className = '' }, ref) {
  return (
    <div
      ref={ref}
      className={`flex flex-col items-center overflow-hidden flex-shrink-0 ${className}`}
      style={{ scrollSnapAlign: 'start', background: C.cr, height: '100svh', width: '100%' }}
    >
      {children}
    </div>
  )
})

/** スライドのスクロール可能コンテンツ領域 */
export function SlideContent({ children, className = '' }) {
  return (
    <div className={`flex-1 w-full flex flex-col items-center px-5 overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

/** YORA ブランドロゴ（各スライド下部） */
export function YoraBrand() {
  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-[3px] py-2">
      <img src="/icons/icon-192.png" className="w-[46px] h-[46px] rounded-[11px] object-cover" alt="YORA" />
      <span style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 22, fontWeight: 900, letterSpacing: '0.1em', color: C.nv, lineHeight: 1 }}>YORA</span>
      <span style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 8.5, fontWeight: 700, letterSpacing: '0.3em', color: C.gd, textTransform: 'uppercase', lineHeight: 1.2 }}>Archive</span>
    </div>
  )
}

/** 装飾ライン＋ダイヤモンド */
export function Ornament({ style }) {
  // html2canvas は transparent を0×0キャンバスとして扱うバグがあるため rgba で代替
  const gradBg = `linear-gradient(90deg,rgba(250,246,239,0),${C.gdp},rgba(250,246,239,0))`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', ...style }}>
      <div style={{ flex: 1, height: 1, background: gradBg }} />
      <div style={{ width: 4, height: 4, background: C.gd, transform: 'rotate(45deg)', flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1, background: gradBg }} />
    </div>
  )
}

/** カード */
export function Card({ children, style, className = '' }) {
  return (
    <div
      className={`w-full relative rounded-2xl ${className}`}
      style={{ background: C.wh, border: `1px solid ${C.gdp}`, boxShadow: '0 2px 14px rgba(30,45,78,.07)', ...style }}
    >
      {/* コーナー装飾 */}
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />
      {children}
    </div>
  )
}

function Corner({ pos }) {
  const styles = {
    tl: { top: 5, left: 5, borderTop: `1.5px solid ${C.gd}`, borderLeft: `1.5px solid ${C.gd}` },
    tr: { top: 5, right: 5, borderTop: `1.5px solid ${C.gd}`, borderRight: `1.5px solid ${C.gd}` },
    bl: { bottom: 5, left: 5, borderBottom: `1.5px solid ${C.gd}`, borderLeft: `1.5px solid ${C.gd}` },
    br: { bottom: 5, right: 5, borderBottom: `1.5px solid ${C.gd}`, borderRight: `1.5px solid ${C.gd}` },
  }
  return <div style={{ position: 'absolute', width: 12, height: 12, ...styles[pos] }} />
}

/** カテゴリラベル */
export function Cat({ children }) {
  return (
    <div style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 8.5, fontWeight: 700, letterSpacing: '0.28em', color: C.gd, textTransform: 'uppercase', textAlign: 'center' }}>
      {children}
    </div>
  )
}

/** タイトル */
export function Title({ children }) {
  return (
    <div style={{ fontFamily: "'Noto Serif JP', serif", fontSize: 21, fontWeight: 700, color: C.nv, textAlign: 'center', lineHeight: 1.35 }}>
      {children}
    </div>
  )
}

/** 大きい数字 */
export function BigNum({ children, style }) {
  return (
    <div style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 900, color: C.nv, lineHeight: 1, ...style }}>
      {children}
    </div>
  )
}

/** フェードアップアニメーション用ラッパー */
export function FadeUp({ children, triggered, delay = 0, style }) {
  return (
    <div
      style={{
        opacity:    triggered ? 1 : 0,
        transform:  triggered ? 'none' : 'translateY(18px)',
        transition: `opacity .6s ease ${delay}ms, transform .6s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** SWIPE テキスト */
export function SwipeHint() {
  return (
    <div className="flex-shrink-0 text-center pb-1" style={{ fontSize: 8, color: 'rgba(30,45,78,.25)', letterSpacing: '0.18em' }}>
      ↓&nbsp;&nbsp;S W I P E
    </div>
  )
}
