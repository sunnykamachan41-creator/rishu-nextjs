'use client'
import { useState } from 'react'
import CourseModal from './CourseModal'
import { getCourseColor, getCourseBadges } from '@/lib/courseColor'
import { getPeriodConfig, ACADEMIC_YEARS, SEMESTER_LABELS } from '@/lib/periodConfig'

// ── 定数 ──────────────────────────────────────────────────────────────────────

const DAYS    = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const DAY_LBL = { MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金' }

// ── グリッド構築 ──────────────────────────────────────────────────────────────

function buildGrid(courses, selectedSet, periods) {
  const grid = {}
  DAYS.forEach(d => {
    grid[d] = {}
    periods.forEach(({ period: p }) => { grid[d][p] = [] })
  })
  for (const c of courses) {
    if (!selectedSet.has(c.class_id)) continue
    const t = c.normalized_time
    if (!t || t === 'EXTRA' || t === '0' || t === 0) continue
    for (const slot of String(t).split('|')) {
      const m = slot.trim().match(/^(MON|TUE|WED|THU|FRI)_(\d)$/)
      if (m && grid[m[1]]?.[+m[2]] !== undefined) grid[m[1]][+m[2]].push(c)
    }
  }
  return grid
}

// ── Timetable コンポーネント ──────────────────────────────────────────────────

export default function Timetable({
  courses, selectedIds, conflicts, onToggle, toggling,
  termFilter, onTermFilterChange,
  academicYear, onAcademicYearChange,
}) {
  const [modal, setModal] = useState(null)

  // 内部でのセメスターキー（spring / fall）
  const semester = termFilter === '春学期' ? 'spring' : 'fall'

  // コマ時間設定（年度 + 学期で解決）
  const periodConfig = getPeriodConfig(academicYear, semester)

  const selectedSet = new Set(selectedIds)
  const conflictSet = new Set(conflicts)

  // 表示対象の学期に属するコースのみ
  const termCourses = courses.filter(c => {
    if (termFilter === '春学期')
      return ['春学期', '通年', '第1ターム', '第2ターム'].includes(c.term)
    return ['秋学期', '通年', '第3ターム', '第4ターム'].includes(c.term)
  })

  const termSelectedSet = new Set(
    termCourses.filter(c => selectedSet.has(c.class_id)).map(c => c.class_id)
  )
  const grid   = buildGrid(termCourses, termSelectedSet, periodConfig)
  const extras = termCourses.filter(c =>
    termSelectedSet.has(c.class_id) &&
    (!c.normalized_time || c.normalized_time === 'EXTRA' ||
      c.normalized_time === '0' || c.normalized_time === 0)
  )

  // ── レンダリング ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── ヘッダー（年度 + 学期） ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-0 flex items-center gap-3">

        {/* 年度ドロップダウン */}
        <div className="relative flex-shrink-0">
          <select
            value={academicYear}
            onChange={e => onAcademicYearChange(Number(e.target.value))}
            className="appearance-none bg-gray-50 border border-gray-200 rounded-xl
                       pl-3 pr-7 py-1.5 text-sm font-semibold text-gray-700
                       focus:outline-none focus:ring-2 focus:ring-blue-300">
            {ACADEMIC_YEARS.map(y => (
              <option key={y} value={y}>{y}年度</option>
            ))}
          </select>
          {/* chevron */}
          <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* 学期タブ */}
        <div className="flex gap-4">
          {Object.entries(SEMESTER_LABELS).map(([key, label]) => (
            <button key={key}
              onClick={() => onTermFilterChange(label)}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                termFilter === label
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-400'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* 右端：コマ時間設定の小さなラベル */}
        <div className="ml-auto text-xs text-gray-300 hidden sm:block">
          {periodConfig[0]?.start}〜{periodConfig[periodConfig.length - 1]?.end}
        </div>
      </div>

      {/* ── グリッド ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-2">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">

          {/* ヘッダー行：空白 + 曜日 */}
          <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '44px repeat(5, 1fr)' }}>
            <div className="py-2" />
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-600">
                {DAY_LBL[d]}
              </div>
            ))}
          </div>

          {/* コマ行 */}
          {periodConfig.map(({ period, start, end }) => (
            <div key={period}
              className="grid border-b border-gray-50 last:border-0"
              style={{ gridTemplateColumns: '44px repeat(5, 1fr)', minHeight: 72 }}>

              {/* 時刻 + コマ番号 */}
              <div className="flex flex-col items-center justify-between py-1.5 px-0.5 select-none">
                <span className="font-medium text-gray-300 leading-none" style={{ fontSize: 9 }}>
                  {start}
                </span>
                <span className="text-xs font-bold text-gray-400">{period}</span>
                <span className="font-medium text-gray-300 leading-none" style={{ fontSize: 9 }}>
                  {end}
                </span>
              </div>

              {/* 曜日セル */}
              {DAYS.map(d => {
                const cells = grid[d]?.[period] ?? []
                return (
                  <div key={d}
                    className="border-l border-gray-50 p-0.5 flex flex-col gap-0.5">
                    {cells.map(c => {
                      const isConflict = conflictSet.has(c.class_id)
                      const color  = getCourseColor(c)
                      const badges = getCourseBadges(c)
                      const tileCls = isConflict
                        ? 'bg-red-100 border-red-400 text-red-900'
                        : color.tile
                      return (
                        <button key={c.class_id} onClick={() => setModal(c)}
                          className={`flex-1 rounded-lg p-1 text-left w-full border transition-all ${tileCls}`}
                          style={{ minHeight: 60 }}>
                          {isConflict && (
                            <div className="text-red-500 text-xs mb-0.5">⚠</div>
                          )}
                          <div className="font-semibold leading-tight" style={{ fontSize: 9 }}>
                            {c.course_name.length > 12
                              ? c.course_name.slice(0, 12) + '…'
                              : c.course_name}
                          </div>
                          {badges.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-0.5">
                              {badges.map(b => (
                                <span key={b.label}
                                  className={`rounded-full px-1 font-medium ${b.cls}`}
                                  style={{ fontSize: 7 }}>
                                  {b.label}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-0.5 opacity-60" style={{ fontSize: 8 }}>{c.room}</div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── 集中講義・時間外 ───────────────────────────────────────────────── */}
        {extras.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-gray-500 font-semibold mb-2 px-1">集中講義・時間外</div>
            <div className="flex flex-col gap-2">
              {extras.map(c => {
                const isConflict = conflictSet.has(c.class_id)
                const color  = getCourseColor(c)
                const badges = getCourseBadges(c)
                return (
                  <button key={c.class_id} onClick={() => setModal(c)}
                    className={`rounded-xl p-3 text-left border shadow-sm ${
                      isConflict ? 'bg-red-100 border-red-400 text-red-900' : color.tile
                    }`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{c.course_name}</div>
                        <div className="text-xs opacity-70 mt-0.5">
                          {c.day_time} / {c.room} / {c.credits}単位
                        </div>
                      </div>
                      {badges.length > 0 && (
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          {badges.map(b => (
                            <span key={b.label}
                              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${b.cls}`}>
                              {b.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── コースモーダル ──────────────────────────────────────────────────── */}
      {modal && (
        <CourseModal
          course={modal}
          isSelected={selectedSet.has(modal.class_id)}
          isConflict={conflictSet.has(modal.class_id)}
          toggling={toggling === modal.class_id}
          onToggle={() => { onToggle(modal.class_id); setModal(null) }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
