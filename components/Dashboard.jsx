'use client'
import { useMemo, useState } from 'react'
import useSWR from 'swr'

const fetcher = url => fetch(url).then(r => r.json())

// ── 卒業進捗リング（1色）────────────────────────────────────────────────────

function ProgressRing({ pct, size = 148, stroke = 13, color = '#3b82f6' }) {
  const r      = (size - stroke) / 2
  const circ   = 2 * Math.PI * r
  const offset = circ - Math.min(1, pct / 100) * circ
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" className="text-gray-100 dark:text-white/10" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.7s ease' }}
      />
    </svg>
  )
}

// ── 取得率ドーナツ（緑=取得済み・赤=落単） ──────────────────────────────────

function TwoColorRing({ completedPct, failedPct, size = 72, stroke = 9 }) {
  const r        = (size - stroke) / 2
  const circ     = 2 * Math.PI * r
  const greenLen = (completedPct / 100) * circ
  const redLen   = (failedPct   / 100) * circ
  const isFull   = completedPct >= 100
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" className="text-gray-100 dark:text-white/10" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke={isFull ? '#22c55e' : '#4ade80'} strokeWidth={stroke}
        strokeDasharray={`${greenLen} ${circ}`} strokeDashoffset={0}
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.7s ease' }}
      />
      {redLen > 0 && (
        <circle cx={size/2} cy={size/2} r={r}
          fill="none" stroke="#f87171" strokeWidth={stroke}
          strokeDasharray={`${redLen} ${circ}`} strokeDashoffset={-greenLen}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dasharray 0.7s ease' }}
        />
      )}
    </svg>
  )
}

// ── 曜日パーサー ─────────────────────────────────────────────────────────────

const WEEKDAYS = ['月', '火', '水', '木', '金']
function parseDays(dayTime) {
  const s = String(dayTime || '')
  return WEEKDAYS.filter(d => s.includes(d))
}

// ── 「履修予定を含む」トグル ─────────────────────────────────────────────────

function ProjectedBadge({ active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                  border transition-all ${
        active
          ? 'bg-blue-500 text-white border-blue-500'
          : 'bg-white dark:bg-[#1a1d27] text-gray-500 dark:text-slate-400 border-gray-200 dark:border-white/[0.07] hover:border-blue-300'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-gray-300'}`} />
      履修予定を含む
    </button>
  )
}

// ── 「仮登録を含む」トグル ────────────────────────────────────────────────────

function TemporaryBadge({ active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                  border transition-all ${
        active
          ? 'bg-amber-500 text-white border-amber-500'
          : 'bg-white dark:bg-[#1a1d27] text-gray-500 dark:text-slate-400 border-gray-200 dark:border-white/[0.07] hover:border-amber-300'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-gray-300'}`} />
      仮登録を含む
    </button>
  )
}

// ── メインコンポーネント ───────────────────────────────────────────────────────

export default function Dashboard({
  studentId,
  courses,
  enrollment,
  creditSummary,
  includeProjected = false,
  onToggleProjected,
  includeTemporary = false,
  onToggleTemporary,
}) {
  const [chartMode, setChartMode] = useState('all')

  // ── 卒業進捗 (graduation/ui) ─────────────────────────────────────────────
  // サーバー側でセッションから user を特定するため student_id は不要
  const gradParams = new URLSearchParams()
  if (includeProjected) gradParams.set('include_projected', '1')
  if (includeTemporary) gradParams.set('include_temporary', '1')
  const gradParamStr = gradParams.toString()
  const gradKey = `/api/graduation/ui${gradParamStr ? `?${gradParamStr}` : ''}`
  const { data: gradData, isLoading: gradLoading } = useSWR(gradKey, fetcher, {
    revalidateOnFocus: false,
  })

  const gradItems   = gradData?.items ?? []
  const reqItems    = useMemo(() => gradItems.filter(i => i.required), [gradItems])
  const passedItems = useMemo(() => reqItems.filter(i => i.pass === true), [reqItems])
  const passedCount = passedItems.length
  const reqCount    = reqItems.length
  const targetCredits = useMemo(
    () => reqItems.reduce((s, i) => s + (Number(i.required_credits) || 0), 0),
    [reqItems]
  )

  // ── クレジット集計 ────────────────────────────────────────────────────────
  const totalCredits = creditSummary?.totalCredits ?? 0
  const ringPct  = targetCredits > 0 ? Math.min(100, Math.round((totalCredits / targetCredits) * 100)) : 0
  const ringColor = ringPct >= 100 ? '#22c55e' : '#3b82f6'

  // ── コースマップ (class_id → credits, day_time) ───────────────────────────
  const courseMap = useMemo(() => {
    const m = new Map()
    for (const c of (courses ?? [])) {
      m.set(c.class_id, { credits: Number(c.credits) || 0, day_time: c.day_time || '' })
    }
    return m
  }, [courses])

  // ── enrollment 集計 ───────────────────────────────────────────────────────
  const enr = enrollment ?? []

  const PROJECTED_STATUSES = new Set(['COMPLETED', 'IN_PROGRESS', 'PLANNED'])
  const completedEnr  = useMemo(() => enr.filter(e => e.status === 'COMPLETED'),   [enr])
  const failedEnr     = useMemo(() => enr.filter(e => e.status === 'FAILED'),      [enr])
  const inProgressEnr = useMemo(() => enr.filter(e => e.status === 'IN_PROGRESS'), [enr])
  const activeBarEnr  = useMemo(
    () => includeProjected
      ? enr.filter(e => PROJECTED_STATUSES.has(e.status))
      : completedEnr,
    [enr, completedEnr, includeProjected] // eslint-disable-line
  )

  // ── 取得率（COMPLETED / (COMPLETED + FAILED) 授業数） ────────────────────
  const completedCount = completedEnr.length
  const failedCount    = failedEnr.length
  const tanhokuDenom   = completedCount + failedCount
  const tanhokuPct     = tanhokuDenom > 0 ? Math.round((completedCount / tanhokuDenom) * 100) : null
  const failedPct      = tanhokuDenom > 0 ? Math.round((failedCount    / tanhokuDenom) * 100) : 0
  const isFultan       = tanhokuDenom > 0 && tanhokuPct === 100

  // ── 今学期 (IN_PROGRESS) 集計 ────────────────────────────────────────────
  const inProgressCount = inProgressEnr.length
  const inProgressCredits = useMemo(
    () => inProgressEnr.reduce((s, e) => s + (courseMap.get(e.class_id)?.credits || 0), 0),
    [inProgressEnr, courseMap]
  )
  const attendanceDays = useMemo(() => {
    const daySet = new Set()
    for (const e of inProgressEnr) {
      for (const d of parseDays(courseMap.get(e.class_id)?.day_time || '')) daySet.add(d)
    }
    return daySet
  }, [inProgressEnr, courseMap])
  const zenkyuCount = 5 - attendanceDays.size  // Mon-Fri = 5

  // ── 棒グラフ集計 ──────────────────────────────────────────────────────────
  const barData = useMemo(() => {
    const grouped = new Map()
    for (const e of activeBarEnr) {
      if (!e.year) continue
      const key = chartMode === 'year'
        ? String(e.year)
        : (e.semester ? `${e.year}:${e.semester}` : null)
      if (!key) continue
      grouped.set(key, (grouped.get(key) || 0) + (courseMap.get(e.class_id)?.credits || 0))
    }
    if (chartMode === 'year') {
      return [...grouped.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([year, credits]) => ({ label: `${year}年`, credits }))
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => {
        const [ay, as_] = a.split(':')
        const [by]      = b.split(':')
        if (ay !== by) return Number(ay) - Number(by)
        return as_ === 'spring' ? -1 : 1
      })
      .map(([key, credits]) => {
        const [year, sem] = key.split(':')
        return { label: `${year}年${sem === 'spring' ? '春学期' : '秋学期'}`, credits }
      })
  }, [activeBarEnr, courseMap, chartMode])

  const barMax = useMemo(() => Math.max(...barData.map(d => d.credits), 1), [barData])

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto pb-8">

      {/* 「履修予定を含む」「仮登録を含む」トグル */}
      {(onToggleProjected || onToggleTemporary) && (
        <div className="px-3 pt-3 flex justify-end gap-2 flex-wrap">
          {onToggleProjected && (
            <ProjectedBadge active={includeProjected} onToggle={onToggleProjected} />
          )}
          {onToggleTemporary && (
            <TemporaryBadge active={includeTemporary} onToggle={onToggleTemporary} />
          )}
        </div>
      )}

      {/* ① 卒業進捗リング ─────────────────────────────────────────────────── */}
      <div className={`px-3 ${(onToggleProjected || onToggleTemporary) ? 'pt-2' : 'pt-3'}`}>
        <div className="bg-white dark:bg-[#1a1d27] rounded-3xl shadow-sm dark:shadow-none px-5 py-5">
          {(includeProjected || includeTemporary) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {includeProjected && (
                <div className="text-[11px] text-blue-500 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-500/10
                                rounded-xl px-3 py-1.5 inline-block">
                  履修予定・履修中を含めて計算中
                </div>
              )}
              {includeTemporary && (
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-500/10
                                rounded-xl px-3 py-1.5 inline-block">
                  仮登録を含めて計算中
                </div>
              )}
            </div>
          )}
          <div className="text-xs font-semibold text-gray-400 dark:text-slate-500 mb-4">卒業進捗</div>

          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <ProgressRing pct={ringPct} color={ringColor} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {gradLoading ? (
                  <div className="w-8 h-2 bg-gray-200 dark:bg-white/10 rounded animate-pulse" />
                ) : (
                  <>
                    <div className="flex items-baseline gap-0.5 leading-none">
                      <span className="text-2xl font-bold text-gray-800 dark:text-slate-100">{totalCredits}</span>
                      {targetCredits > 0 && (
                        <span className="text-xs text-gray-400 dark:text-slate-500">/{targetCredits}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">単位</div>
                    {ringPct > 0 && (
                      <div className={`text-xs font-bold mt-1 ${ringPct >= 100 ? 'text-green-500' : 'text-blue-500'}`}>
                        {ringPct}%
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <div className="text-[11px] text-gray-400 dark:text-slate-500">取得済み</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-gray-800 dark:text-slate-100">{totalCredits}</span>
                  <span className="text-xs text-gray-400 dark:text-slate-500">単位</span>
                </div>
              </div>
              {targetCredits > 0 && (
                <div>
                  <div className="text-[11px] text-gray-400 dark:text-slate-500">卒業必要</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-gray-400 dark:text-slate-400">{targetCredits}</span>
                    <span className="text-xs text-gray-300 dark:text-slate-600">単位</span>
                  </div>
                </div>
              )}
              {reqCount > 0 && (
                <div>
                  <div className="text-[11px] text-gray-400 dark:text-slate-500">要件達成</div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-bold ${passedCount === reqCount ? 'text-green-500' : 'text-gray-800 dark:text-slate-100'}`}>
                      {passedCount}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-slate-500">/ {reqCount}項目</span>
                  </div>
                </div>
              )}
              <div className="text-[11px] text-gray-400 dark:text-slate-500 pt-0.5">
                取得済み {completedCount} 科目
              </div>
            </div>
          </div>

          {reqCount > 0 && (
            <div className="mt-4">
              <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${passedCount === reqCount ? 'bg-green-400' : 'bg-blue-400'}`}
                  style={{ width: `${Math.round((passedCount / reqCount) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400 dark:text-slate-500">
                  {passedCount === reqCount ? '✓ 卒業要件クリア' : `残り ${reqCount - passedCount} 項目`}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-slate-500">
                  {Math.round((passedCount / reqCount) * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ② 細長カード 2枚（取得率 + 今学期）─────────────────────────────────── */}
      <div className="px-3 mt-3 grid grid-cols-2 gap-2.5">

        {/* 取得率カード */}
        <div className={`rounded-2xl px-3 py-3 flex flex-col gap-2 ${
          isFultan ? 'bg-green-50 dark:bg-green-500/10' : 'bg-white dark:bg-[#1a1d27] shadow-sm dark:shadow-none'
        }`}>
          <div className="text-xs text-gray-400 dark:text-slate-500 font-medium leading-none">単位取得率</div>

          {tanhokuDenom === 0 ? (
            <div className="text-sm text-gray-300 dark:text-slate-600 font-semibold">──</div>
          ) : (
            <div className="flex items-center gap-2">
              {/* コンパクトドーナツ */}
              <div className="relative flex-shrink-0">
                <TwoColorRing completedPct={tanhokuPct ?? 0} failedPct={failedPct} />
                <div className="absolute inset-0 flex items-center justify-center">
                  {isFultan ? (
                    <span className="text-[9px] font-bold text-green-500 leading-none text-center">
                      フル単
                    </span>
                  ) : (
                    <span className="text-sm font-bold text-gray-800 leading-none">
                      {tanhokuPct}
                    </span>
                  )}
                </div>
              </div>

              {/* 数値 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="text-xs text-gray-600 dark:text-slate-300 leading-none">{completedCount}科目</span>
                </div>
                {failedCount > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-300 flex-shrink-0" />
                    <span className="text-xs text-gray-600 dark:text-slate-300 leading-none">落単 {failedCount}</span>
                  </div>
                )}
                {isFultan && (
                  <div className="text-[11px] text-green-500 font-bold mt-1 leading-none">
                    フル単！！
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 今学期情報カード */}
        <div className="bg-white dark:bg-[#1a1d27] rounded-2xl px-3 py-3 shadow-sm dark:shadow-none flex flex-col gap-1.5">
          <div className="text-xs text-gray-400 dark:text-slate-500 font-medium leading-none">今学期</div>
          {inProgressCount === 0 ? (
            <div className="text-sm text-gray-300 dark:text-slate-600 font-semibold">──</div>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-gray-800 dark:text-slate-100 leading-none">{inProgressCount}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">授業</span>
                <span className="text-base font-bold text-gray-800 dark:text-slate-100 leading-none ml-1">{inProgressCredits}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">単位</span>
              </div>
              {attendanceDays.size > 0 && (
                <div className="text-[11px] text-gray-500 dark:text-slate-400 leading-none">
                  週{attendanceDays.size}回登校
                </div>
              )}
              <div className="text-[11px] leading-none">
                {zenkyuCount > 0 ? (
                  <span className="text-blue-500 dark:text-blue-400 font-semibold">全休 {zenkyuCount}日</span>
                ) : (
                  <span className="text-gray-400 dark:text-slate-500">全休なし</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ③ グラフカード（全授業ドーナツ / 学期別・学年別棒グラフ）────────────── */}
      <div className="px-3 mt-3">
        <div className="bg-white dark:bg-[#1a1d27] rounded-3xl shadow-sm dark:shadow-none px-5 py-5">

          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold text-gray-400 dark:text-slate-500">
              {chartMode === 'all' ? '取得率' : chartMode === 'semester' ? '春秋学期別 取得単位' : '学年別 取得単位'}
            </div>
            <div className="flex bg-gray-100 dark:bg-[#252839] rounded-lg p-0.5 gap-0.5">
              {[
                { id: 'all',      label: '全授業' },
                { id: 'semester', label: '学期別' },
                { id: 'year',     label: '学年別' },
              ].map(opt => (
                <button key={opt.id} onClick={() => setChartMode(opt.id)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ${
                    chartMode === opt.id
                      ? 'bg-white dark:bg-[#1a1d27] text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none'
                      : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 全授業: ドーナツ */}
          {chartMode === 'all' && (
            tanhokuDenom === 0 ? (
              <div className="py-6 text-center">
                <div className="text-2xl mb-2">📚</div>
                <div className="text-sm text-gray-400">履修データがありません</div>
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <div className="relative flex-shrink-0">
                  <TwoColorRing completedPct={tanhokuPct ?? 0} failedPct={failedPct} size={148} stroke={13} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                    {isFultan ? (
                      <>
                        <div className="text-base font-bold text-green-500 leading-none">フル単</div>
                        <div className="text-[10px] text-green-400 leading-none">100%</div>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-bold text-gray-800 dark:text-slate-100 leading-none">{tanhokuPct}</div>
                        <div className="text-[11px] text-gray-400 dark:text-slate-500 leading-none">%</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-400 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-gray-400 dark:text-slate-500">取得済み</div>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-lg font-bold text-gray-800 dark:text-slate-100">{completedCount}</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">科目</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-300 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-gray-400 dark:text-slate-500">落単</div>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-lg font-bold text-gray-800 dark:text-slate-100">{failedCount}</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">科目</span>
                      </div>
                    </div>
                  </div>
                  <div className="pt-1 border-t border-gray-100 dark:border-white/[0.07]">
                    <div className="text-[11px] text-gray-400 dark:text-slate-500">履修総数</div>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-base font-bold text-gray-600 dark:text-slate-300">{tanhokuDenom}</span>
                      <span className="text-xs text-gray-400 dark:text-slate-500">科目</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {/* 学期別 / 学年別: 棒グラフ */}
          {chartMode !== 'all' && (
            barData.length === 0 ? (
              <div className="py-6 text-center">
                <div className="text-2xl mb-2">📚</div>
                <div className="text-sm text-gray-400">データがありません</div>
              </div>
            ) : (
              <>
                <div className="space-y-2.5">
                  {barData.map(({ label, credits }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="text-xs text-gray-500 dark:text-slate-400 w-16 flex-shrink-0 text-right leading-tight">
                        {label}
                      </div>
                      <div className="flex-1 relative h-7 bg-gray-50 dark:bg-[#1f2235] rounded-xl overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-xl transition-all duration-700"
                          style={{
                            width: `${Math.max(4, Math.round((credits / barMax) * 100))}%`,
                            background: includeProjected
                              ? 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)'
                              : 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                          }}
                        />
                        <div className="absolute inset-0 flex items-center px-3">
                          <span className="text-xs font-semibold text-white drop-shadow-sm leading-none">{credits}</span>
                          <span className="text-[10px] text-white/80 ml-0.5 leading-none">単位</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-white/[0.07] flex items-center justify-between">
                  <span className="text-xs text-gray-400 dark:text-slate-500">
                    {includeProjected ? '累計（予定含む）' : '累計取得単位'}
                  </span>
                  <span className="text-sm font-bold text-gray-700 dark:text-slate-200">
                    {barData.reduce((s, d) => s + d.credits, 0)}
                    <span className="text-xs font-normal text-gray-400 dark:text-slate-500 ml-0.5">単位</span>
                  </span>
                </div>
              </>
            )
          )}
        </div>
      </div>

    </div>
  )
}
