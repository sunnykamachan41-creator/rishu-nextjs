'use client'
import { useState, useMemo } from 'react'

// ── 教室マスタ ────────────────────────────────────────────────────────────────

const BUILDINGS = {
  'N棟': [
    'N101','N102','N103','N104','N105','N106','N107',
    'N201','N202','N203','N204','N205','N206','N207',
    'N301','N302','N303','N304','N305','N306','N307',
    'N401','N402','N403','N404','N405','N406','N407','N410','N411',
  ],
  'C棟': [
    'C102','C103',
    'C201','C202','C203','C204',
    'C301','C302','C303',
    'C401','C402',
  ],
  'S棟': [
    'S101','S102','S103','S104','S105','S106','S107',
    'S201','S202','S203','S204','S205','S206','S207',
    'S301','S302','S303','S304','S305','S306','S307','S310',
    'S401','S402','S403','S404','S405','S406','S407','S410',
  ],
  'W棟': [
    'W110','W201','W301','W302',
  ],
}

const ALL_ROOMS = Object.values(BUILDINGS).flat()

const DAYS    = ['MON','TUE','WED','THU','FRI']
const DAY_LBL = { MON:'月', TUE:'火', WED:'水', THU:'木', FRI:'金' }
const PERIODS = [1, 2, 3, 4, 5]

// ── 学期判定 ──────────────────────────────────────────────────────────────────

const FALL_TERMS   = new Set(['秋学期', '第3ターム', '第4ターム'])
const SPRING_TERMS = new Set(['春学期', '第1ターム', '第2ターム'])

/**
 * コースの term から学期を返す。
 *   'spring' | 'fall' | 'both'（通年）| null（不明・集計外）
 */
function getCourseSem(course) {
  if (SPRING_TERMS.has(course.term)) return 'spring'
  if (FALL_TERMS.has(course.term))   return 'fall'
  if (course.term === '通年')         return 'both'
  return null
}

// ── ロジック ──────────────────────────────────────────────────────────────────

/**
 * courses から roomId → 使用スロットSet のマップを構築。
 * 教室名が複数含まれる場合（"N101・N102" 等）は分割して処理。
 */
function buildUsageMap(courses) {
  const map = {}   // roomId → Set<"DAY_PERIOD">
  for (const c of courses) {
    if (!c.room || !c.normalized_time) continue
    const t = String(c.normalized_time)
    if (t === 'EXTRA' || t === '0') continue

    const rooms = c.room.split(/[・/,\s]+/).map(r => r.trim()).filter(Boolean)
    const slots = t.split('|').map(s => s.trim()).filter(Boolean)

    for (const room of rooms) {
      for (const slot of slots) {
        if (!map[room]) map[room] = new Set()
        map[room].add(slot)
      }
    }
  }
  return map
}

/**
 * 指定教室・曜日・指定コマが空きかどうかを判定し、
 * そのコマを含む連続空きコマ数を返す。使用中なら 0 を返す。
 */
function continuousFree(roomId, day, period, usageMap, maxPeriod = 5) {
  const used = usageMap[roomId] || new Set()
  if (used.has(`${day}_${period}`)) return 0

  let lo = period, hi = period
  while (lo > 1         && !used.has(`${day}_${lo - 1}`)) lo--
  while (hi < maxPeriod && !used.has(`${day}_${hi + 1}`)) hi++
  return hi - lo + 1
}

/** 連続空きコマ数 → スタイル情報 */
function freeStyle(free) {
  if (free === 0) return { bg: 'bg-gray-100 dark:bg-white/[0.05]',  border: 'border-gray-200 dark:border-white/[0.07]',  text: 'text-gray-400 dark:text-slate-600',  label: '使用中',        dot: 'bg-gray-300 dark:bg-white/20'  }
  if (free === 1) return { bg: 'bg-green-50 dark:bg-green-500/10',  border: 'border-green-100 dark:border-green-500/20', text: 'text-green-600 dark:text-green-400', label: '空き',          dot: 'bg-green-300' }
  if (free === 2) return { bg: 'bg-green-100 dark:bg-green-500/20', border: 'border-green-200 dark:border-green-500/30', text: 'text-green-700 dark:text-green-300', label: '2時間空き',     dot: 'bg-green-400' }
  return               { bg: 'bg-green-200 dark:bg-green-500/30', border: 'border-green-300 dark:border-green-500/40', text: 'text-green-900 dark:text-green-200', label: `${free}時間空き`, dot: 'bg-green-600 dark:bg-green-400' }
}

// ── EmptyRooms ────────────────────────────────────────────────────────────────

export default function EmptyRooms({ courses = [] }) {
  // デフォルト学期：現在の月から推定（4〜9月=春、10〜3月=秋）
  const defaultSem = useMemo(() => {
    const m = new Date().getMonth() + 1  // 1-12
    return (m >= 4 && m <= 9) ? 'spring' : 'fall'
  }, [])

  // デフォルト曜日：今日（月〜金、それ以外は月）
  const todayDay = useMemo(() => {
    const d = new Date().getDay()
    return DAYS[d - 1] ?? 'MON'
  }, [])

  const [selectedSem,    setSelectedSem]    = useState(defaultSem)
  const [selectedDay,    setSelectedDay]    = useState(todayDay)
  const [selectedPeriod, setSelectedPeriod] = useState(1)
  const [onlyFree,       setOnlyFree]       = useState(false)
  const [only2h,         setOnly2h]         = useState(false)
  const [detailRoom,     setDetailRoom]     = useState(null)

  // 選択学期でコースを絞り込む（通年は両学期に含める）
  const semCourses = useMemo(() => {
    return courses.filter(c => {
      const sem = getCourseSem(c)
      return sem === selectedSem || sem === 'both'
    })
  }, [courses, selectedSem])

  const usageMap = useMemo(() => buildUsageMap(semCourses), [semCourses])

  const roomFree = useMemo(() => {
    const m = {}
    for (const room of ALL_ROOMS) {
      m[room] = continuousFree(room, selectedDay, selectedPeriod, usageMap)
    }
    return m
  }, [usageMap, selectedDay, selectedPeriod])

  const visibleRooms = useMemo(() => {
    const s = new Set()
    for (const room of ALL_ROOMS) {
      const f = roomFree[room]
      if (onlyFree && f === 0) continue
      if (only2h   && f < 2)   continue
      s.add(room)
    }
    return s
  }, [roomFree, onlyFree, only2h])

  const stats = useMemo(() => {
    let free1 = 0, free2 = 0, free3 = 0, used = 0
    for (const room of ALL_ROOMS) {
      const f = roomFree[room]
      if (f === 0) used++
      else if (f === 1) free1++
      else if (f === 2) free2++
      else free3++
    }
    return { used, free1, free2, free3 }
  }, [roomFree])

  return (
    <div className="flex flex-col h-full">

      {/* ── フィルタバー ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-3 pt-2 pb-2 flex flex-col gap-2 flex-shrink-0">

        {/* 学期セレクタ */}
        <div className="flex gap-1.5">
          {[
            { key: 'spring', label: '春学期', sub: '春・第1〜2ターム' },
            { key: 'fall',   label: '秋学期', sub: '秋・第3〜4ターム' },
          ].map(({ key, label, sub }) => (
            <button
              key={key}
              onClick={() => setSelectedSem(key)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors border ${
                selectedSem === key
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-gray-50 dark:bg-[#252839] text-gray-500 dark:text-slate-400 border-gray-200 dark:border-white/[0.07] hover:bg-gray-100 dark:hover:bg-[#2a2d3f]'
              }`}
            >
              <div className="leading-tight">{label}</div>
              <div className={`text-xs font-normal leading-tight mt-0.5 ${
                selectedSem === key ? 'text-blue-100' : 'text-gray-400 dark:text-slate-500'
              }`}>{sub}</div>
            </button>
          ))}
        </div>

        {/* 曜日 + 時限 */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {DAYS.map(d => (
              <button key={d}
                onClick={() => setSelectedDay(d)}
                className={`w-8 h-8 rounded-xl text-xs font-bold transition-colors ${
                  selectedDay === d
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-[#252839] text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-[#2a2d3f]'
                }`}>
                {DAY_LBL[d]}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-200 dark:bg-white/10" />

          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button key={p}
                onClick={() => setSelectedPeriod(p)}
                className={`w-8 h-8 rounded-xl text-xs font-bold transition-colors ${
                  selectedPeriod === p
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* トグル + 統計 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Toggle label="空きのみ" value={onlyFree} onChange={setOnlyFree} />
          <Toggle label="2時間以上" value={only2h}  onChange={setOnly2h}  />
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              {stats.free1 + stats.free2 + stats.free3}空き
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
              {stats.used}使用中
            </span>
          </div>
        </div>
      </div>

      {/* ── 凡例 ──────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-50 dark:bg-[#1f2235] px-3 py-1.5 flex gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {[
          { label: '使用中',    dot: 'bg-gray-300 dark:bg-white/20'  },
          { label: '空き',      dot: 'bg-green-300' },
          { label: '2時間空き', dot: 'bg-green-400' },
          { label: '3時間以上', dot: 'bg-green-600' },
        ].map(({ label, dot }) => (
          <div key={label} className="flex items-center gap-1 whitespace-nowrap">
            <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
            <span className="text-xs text-gray-500 dark:text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      {/* ── 教室一覧 ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-3 py-2 pb-4">
        {Object.entries(BUILDINGS).map(([building, rooms]) => {
          const visible = rooms.filter(r => visibleRooms.has(r))
          if (visible.length === 0) return null
          return (
            <div key={building} className="mb-3">
              <div className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5 px-0.5">{building}</div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
                {visible.map(room => {
                  const free  = roomFree[room]
                  const style = freeStyle(free)
                  return (
                    <button
                      key={room}
                      onClick={() => setDetailRoom(room)}
                      className={`${style.bg} border ${style.border} rounded-xl px-1.5 py-2
                                  flex flex-col items-center gap-0.5
                                  active:opacity-70 transition-opacity`}
                    >
                      <span className={`w-2 h-2 rounded-full ${style.dot} flex-shrink-0`} />
                      <span className={`text-xs font-bold ${style.text} leading-none`}>{room}</span>
                      {free > 0 && (
                        <span className={`text-xs ${style.text} leading-none opacity-70`}
                          style={{ fontSize: 9 }}>
                          {free}h空き
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {visibleRooms.size === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-slate-500">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-sm">条件に一致する教室がありません</div>
          </div>
        )}
      </div>

      {/* ── 教室詳細ボトムシート ──────────────────────────────────────────────── */}
      {detailRoom && (
        <RoomDetailSheet
          room={detailRoom}
          day={selectedDay}
          sem={selectedSem}
          usageMap={usageMap}
          onClose={() => setDetailRoom(null)}
        />
      )}
    </div>
  )
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ label, value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-xl border transition-colors ${
        value
          ? 'bg-blue-500 text-white border-blue-500'
          : 'bg-white dark:bg-[#252839] text-gray-500 dark:text-slate-400 border-gray-200 dark:border-white/[0.07] hover:bg-gray-50 dark:hover:bg-[#2a2d3f]'
      }`}
    >
      {label}
    </button>
  )
}

// ── RoomDetailSheet ───────────────────────────────────────────────────────────

const SEM_LABEL = { spring: '春学期', fall: '秋学期' }

function RoomDetailSheet({ room, day, sem, usageMap, onClose }) {
  const used = usageMap[room] || new Set()

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white dark:bg-[#1f2235] rounded-t-3xl px-4 pt-3 pb-6">
        <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mb-3" />

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-bold text-gray-900 dark:text-slate-100">{room}</div>
            <div className="text-xs text-gray-400 dark:text-slate-500">
              {SEM_LABEL[sem]} · {DAY_LBL[day]}曜日の使用状況
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-slate-500 text-xl p-1">×</button>
        </div>

        <div className="flex flex-col gap-2">
          {PERIODS.map(p => {
            const slot   = `${day}_${p}`
            const isUsed = used.has(slot)
            return (
              <div key={p}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                  isUsed ? 'bg-gray-100 dark:bg-white/[0.05]' : 'bg-green-50 dark:bg-green-500/10'
                }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                                 text-xs font-bold ${isUsed ? 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-slate-500' : 'bg-green-200 dark:bg-green-500/30 text-green-700 dark:text-green-300'}`}>
                  {p}
                </div>
                <div className="flex-1">
                  <span className={`text-sm font-semibold ${isUsed ? 'text-gray-500 dark:text-slate-500' : 'text-green-700 dark:text-green-400'}`}>
                    {p}限
                  </span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  isUsed ? 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-slate-500' : 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
                }`}>
                  {isUsed ? '使用中' : '空き'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
