'use client'
import { useState, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import CourseModal from './CourseModal'
import { getCourseColor } from '@/lib/courseColor'
import { STATUS_CONFIG } from '@/lib/enrollmentStatus'

// ── SWR fetcher ───────────────────────────────────────────────────────────────

const fetcher = url => fetch(url).then(r => {
  if (!r.ok) return r.json().then(d => Promise.reject(d))
  return r.json()
})

// ── 定数 ──────────────────────────────────────────────────────────────────────

const TERM_OPTIONS = ['春学期', '秋学期', '通年', '第1ターム', '第2ターム', '第3ターム', '第4ターム']
const DAY_OPTIONS  = [
  { value: 'MON', label: '月' },
  { value: 'TUE', label: '火' },
  { value: 'WED', label: '水' },
  { value: 'THU', label: '木' },
  { value: 'FRI', label: '金' },
]

// ── フィルタ適用 ──────────────────────────────────────────────────────────────

function extractSlots(nt) {
  if (!nt || nt === 'EXTRA' || nt === '0') return []
  return String(nt).split('|').map(s => {
    const m = s.trim().match(/^(MON|TUE|WED|THU|FRI)_(\d)$/)
    return m ? { day: m[1], period: m[2] } : null
  }).filter(Boolean)
}

function applyFilters(courses, { rawCat, subCat, terms, days, periods, yearLevels, query }) {
  return courses.filter(c => {
    if (rawCat && rawCat !== '__all__' && c.raw_category !== rawCat) return false
    if (subCat && c.sub_category !== subCat) return false
    if (terms.length > 0 && !terms.includes(c.term)) return false
    if (yearLevels.length > 0 && !yearLevels.includes(String(c.year))) return false

    if (days.length > 0 || periods.length > 0) {
      const slots = extractSlots(c.normalized_time)
      if (days.length > 0 && periods.length > 0) {
        if (!slots.some(s => days.includes(s.day) && periods.includes(s.period))) return false
      } else if (days.length > 0) {
        if (!slots.some(s => days.includes(s.day))) return false
      } else {
        if (!slots.some(s => periods.includes(s.period))) return false
      }
    }

    if (query) {
      const q = query.toLowerCase()
      if (
        !c.course_name?.toLowerCase().includes(q) &&
        !c.class_id?.toLowerCase().includes(q) &&
        !c.course_id?.toLowerCase().includes(q)
      ) return false
    }
    return true
  })
}

// ── CatalogTab ────────────────────────────────────────────────────────────────

/**
 * カタログタブ（閲覧専用）
 *
 * カタログは授業の閲覧・検索のみ。履修登録は時間割タブから行う。
 *
 * @param {number}   catalogYear        - 現在表示中の academic_year モード
 * @param {Function} onYearChange       - 年度変更コールバック
 * @param {number}   enrollmentYear     - 学生の入学年度（curriculum_year）
 * @param {number}   currentRealYear    - 現実世界の現在年度（new Date().getFullYear()）
 * @param {string[]} selectedIds        - 履修済 composite keys（ステータス表示用・登録不可）
 * @param {Map}      statusMap          - composite key → EnrollmentStatus（ステータス表示用）
 * @param {Set}      temporaryIds       - 仮登録の composite keys（バッジ表示用）
 * @param {Set}      recognizedCourseIds- 単位認定済み course_id の Set
 */
export default function CatalogTab({
  catalogYear,
  onYearChange,
  enrollmentYear,
  currentRealYear,
  selectedIds,
  statusMap = new Map(),
  temporaryIds = new Set(),
  recognizedCourseIds = new Set(),
}) {
  // ── カタログデータ（年度モード切替でデータソースが変わる） ────────────────────
  const swrKey = catalogYear != null ? `/api/catalog?year=${catalogYear}` : null
  const { data, isLoading, error } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval:  30_000,
  })

  // ── フィルタ状態 ──────────────────────────────────────────────────────────
  const [rawCat,     setRawCat]     = useState('__all__')
  const [subCat,     setSubCat]     = useState('')
  const [terms,      setTerms]      = useState([])
  const [days,       setDays]       = useState([])
  const [periods,    setPeriods]    = useState([])
  const [yearLevels, setYearLevels] = useState([])
  const [query,      setQuery]      = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [modal,      setModal]      = useState(null)

  // 年度変更時にカテゴリ・フィルタをリセット
  const handleYearChange = useCallback((year) => {
    setRawCat('__all__')
    setSubCat('')
    setTerms([])
    setDays([])
    setPeriods([])
    setYearLevels([])
    setQuery('')
    onYearChange(year)
  }, [onYearChange])

  const courses      = data?.courses          ?? []
  const rawCategories = data?.rawCategories   ?? []
  const subCategoriesByRaw = data?.subCategoriesByRaw ?? {}
  const availableYears = data?.availableYears ?? []

  // raw_category 変更時に sub_category をリセット
  const handleRawCatChange = useCallback((cat) => {
    setRawCat(cat)
    setSubCat('')
  }, [])

  // 現在の raw_category のサブカテゴリ一覧
  const subCatOptions = useMemo(
    () => (rawCat && rawCat !== '__all__') ? (subCategoriesByRaw[rawCat] ?? []) : [],
    [rawCat, subCategoriesByRaw]
  )

  // フィルタ適用済みコース
  const filtered = useMemo(
    () => applyFilters(courses, { rawCat, subCat, terms, days, periods, yearLevels, query }),
    [courses, rawCat, subCat, terms, days, periods, yearLevels, query]
  )

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // 仮登録モード（現在年度より未来）— バナー表示用のみ（登録機能はない）
  const isTemporaryMode = catalogYear != null && currentRealYear != null && catalogYear > currentRealYear

  const filterCount = terms.length + days.length + periods.length + yearLevels.length

  // ── 年次レベルオプション（コースデータから動的生成） ─────────────────────────
  const yearLevelOpts = useMemo(
    () => [...new Set(courses.map(c => c.year).filter(Boolean))].sort(),
    [courses]
  )

  return (
    <div className="flex flex-col h-full">

      {/* ── 年度モードセレクタ ─────────────────────────────────────────────── */}
      <YearModeBar
        availableYears={availableYears}
        selectedYear={catalogYear}
        enrollmentYear={enrollmentYear}
        currentRealYear={currentRealYear}
        onSelect={handleYearChange}
      />

      {/* ── raw_category タブ ──────────────────────────────────────────────── */}
      {rawCategories.length > 0 && (
        <CategoryTabs
          categories={rawCategories}
          selected={rawCat}
          onSelect={handleRawCatChange}
        />
      )}

      {/* ── sub_category ドロップダウン ────────────────────────────────────── */}
      {subCatOptions.length > 0 && (
        <SubCategoryBar
          options={subCatOptions}
          selected={subCat}
          onSelect={setSubCat}
        />
      )}

      {/* ── 検索 + フィルタ ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1a1d27] px-4 pt-2 pb-2 border-b border-gray-100 dark:border-white/[0.07]">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="授業名・コードで検索"
              className="w-full bg-gray-50 dark:bg-[#252839] rounded-xl pl-9 pr-4 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-300
                         border border-gray-100 dark:border-white/[0.07]
                         dark:text-slate-200 dark:placeholder-slate-500"
            />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">✕</button>
            )}
          </div>
          <button onClick={() => setFilterOpen(v => !v)}
            className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
              filterCount > 0
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-300 border-gray-100 dark:border-white/[0.07]'
            }`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            フィルター
            {filterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {filterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 詳細フィルタパネル ──────────────────────────────────────────────── */}
      {filterOpen && (
        <FilterPanel
          terms={terms}         onTermsChange={setTerms}
          days={days}           onDaysChange={setDays}
          periods={periods}     onPeriodsChange={setPeriods}
          yearLevels={yearLevels} onYearLevelsChange={setYearLevels}
          yearLevelOpts={yearLevelOpts}
          onClear={() => { setTerms([]); setDays([]); setPeriods([]); setYearLevels([]) }}
        />
      )}

      {/* ── 仮登録モードバナー ──────────────────────────────────────────────── */}
      {isTemporaryMode && (
        <div className="flex-shrink-0 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 px-4 py-2 flex items-center gap-2">
          <span className="text-xs font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded">仮</span>
          <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            将来年度（{catalogYear}）は閲覧のみです。時間割タブから仮登録できます。
          </span>
        </div>
      )}

      {/* ── 件数 + ロード状態 ───────────────────────────────────────────────── */}
      <div className="px-4 pt-1.5 pb-1 text-xs text-gray-400 dark:text-slate-500 flex items-center gap-2">
        {isLoading
          ? <span>読み込み中…</span>
          : error
            ? <span className="text-red-400">取得エラー</span>
            : <span>{filtered.length}件</span>
        }
      </div>

      {/* ── コース一覧 ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-3 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-300 dark:text-slate-600">
            <div className="text-4xl mb-3">📚</div>
            <div className="text-sm font-medium">
              {courses.length === 0 ? 'この年度の授業データがありません' : '条件に一致する授業がありません'}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            {filtered.map(c => (
              <CatalogCourseCard
                key={`${c.class_id}|${c.academic_year ?? ''}`}
                course={c}
                selectedSet={selectedSet}
                statusMap={statusMap}
                temporaryIds={temporaryIds}
                recognizedCourseIds={recognizedCourseIds}
                onDetail={() => setModal(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 授業詳細モーダル ────────────────────────────────────────────────── */}
      {modal && (
        <CourseModal
          course={modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── YearModeBar ───────────────────────────────────────────────────────────────

function YearModeBar({ availableYears, selectedYear, enrollmentYear, currentRealYear, onSelect }) {
  // availableYears が空の場合でも selectedYear は表示する
  const years = availableYears.length > 0 ? availableYears : (selectedYear ? [selectedYear] : [])

  return (
    <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-4 pt-2.5 pb-2">
      <div className="text-xs font-bold text-gray-400 dark:text-slate-500 mb-1.5">開講年度</div>
      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {years.map(y => {
          const isPast    = y < (enrollmentYear ?? 0)
          const isFuture  = y > (currentRealYear ?? 9999)
          const isSelected = y === selectedYear
          return (
            <button
              key={y}
              onClick={() => onSelect(y)}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isSelected
                  ? isFuture
                    ? 'bg-amber-400 text-white'
                    : 'bg-blue-500 text-white'
                  : isPast
                    ? 'bg-gray-100 dark:bg-[#252839] text-gray-400 dark:text-slate-500'
                    : isFuture
                      ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                      : 'bg-gray-100 dark:bg-[#252839] text-gray-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-500/10'
              }`}
            >
              {y}
              {isFuture && !isSelected && (
                <span className="text-[9px] font-bold bg-amber-400 text-white px-1 rounded">仮</span>
              )}
              {isFuture && isSelected && (
                <span className="text-[9px] font-bold opacity-80">仮</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── CategoryTabs ──────────────────────────────────────────────────────────────

function CategoryTabs({ categories, selected, onSelect }) {
  return (
    <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-4 pt-2 pb-0">
      <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {/* 「すべて」タブ */}
        <CategoryTab label="すべて" value="__all__" selected={selected} onSelect={onSelect} />
        {categories.map(cat => (
          <CategoryTab key={cat} label={cat} value={cat} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function CategoryTab({ label, value, selected, onSelect }) {
  const isActive = selected === value
  return (
    <button
      onClick={() => onSelect(value)}
      className={`flex-shrink-0 px-3.5 pb-2 pt-1 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
        isActive
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

// ── SubCategoryBar ────────────────────────────────────────────────────────────

function SubCategoryBar({ options, selected, onSelect }) {
  return (
    <div className="flex-shrink-0 bg-gray-50 dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-4 py-2">
      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => onSelect('')}
          className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
            !selected
              ? 'bg-blue-500 text-white'
              : 'bg-white dark:bg-[#252839] text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-white/[0.07]'
          }`}
        >
          すべて
        </button>
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              selected === opt
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-[#252839] text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-white/[0.07]'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── FilterPanel ───────────────────────────────────────────────────────────────

function FilterPanel({ terms, onTermsChange, days, onDaysChange, periods, onPeriodsChange,
                       yearLevels, onYearLevelsChange, yearLevelOpts, onClear }) {
  function toggle(arr, set, val) {
    return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
  }

  return (
    <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-4 py-3 flex flex-col gap-3">
      {/* 学期 */}
      <div>
        <div className="text-xs font-bold text-gray-400 dark:text-slate-500 mb-1.5">学期</div>
        <div className="flex flex-wrap gap-1.5">
          {['春学期', '秋学期', '通年', '第1ターム', '第2ターム', '第3ターム', '第4ターム'].map(t => (
            <button key={t} onClick={() => onTermsChange(toggle(terms, null, t))}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                terms.includes(t)
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-400 border-gray-200 dark:border-white/[0.07]'
              }`}>{t}</button>
          ))}
        </div>
      </div>

      {/* 曜日・時限 */}
      <div className="flex gap-4">
        <div>
          <div className="text-xs font-bold text-gray-400 dark:text-slate-500 mb-1.5">曜日</div>
          <div className="flex gap-1">
            {DAY_OPTIONS.map(d => (
              <button key={d.value} onClick={() => onDaysChange(toggle(days, null, d.value))}
                className={`w-8 h-8 rounded-lg text-xs font-bold border transition-colors ${
                  days.includes(d.value)
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-400 border-gray-200 dark:border-white/[0.07]'
                }`}>{d.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold text-gray-400 dark:text-slate-500 mb-1.5">時限</div>
          <div className="flex gap-1">
            {['1','2','3','4','5'].map(p => (
              <button key={p} onClick={() => onPeriodsChange(toggle(periods, null, p))}
                className={`w-8 h-8 rounded-lg text-xs font-bold border transition-colors ${
                  periods.includes(p)
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-400 border-gray-200 dark:border-white/[0.07]'
                }`}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 対象学年 */}
      {yearLevelOpts.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-400 dark:text-slate-500 mb-1.5">対象学年</div>
          <div className="flex gap-1.5">
            {yearLevelOpts.map(y => (
              <button key={y} onClick={() => onYearLevelsChange(toggle(yearLevels, null, String(y)))}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  yearLevels.includes(String(y))
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-400 border-gray-200 dark:border-white/[0.07]'
                }`}>{y}年次</button>
            ))}
          </div>
        </div>
      )}

      {/* クリア */}
      <button onClick={onClear}
        className="self-start text-xs text-blue-500 font-semibold">
        フィルタをリセット
      </button>
    </div>
  )
}

// ── CatalogCourseCard ─────────────────────────────────────────────────────────

function CatalogCourseCard({
  course: c, selectedSet, statusMap, temporaryIds, recognizedCourseIds, onDetail,
}) {
  const ck           = `${c.class_id}|${c.academic_year ?? ''}`
  const isSel        = selectedSet.has(ck)
  const isTemp       = temporaryIds.has(ck)
  const isRecognized = recognizedCourseIds.has(c.course_id)
  const enrollStatus = statusMap.get(ck)
  const color        = getCourseColor(c)
  const statusCfg    = enrollStatus ? STATUS_CONFIG[enrollStatus] : null

  const slots = extractSlots(c.normalized_time)
  const DAY_JP = { MON:'月', TUE:'火', WED:'水', THU:'木', FRI:'金' }
  const timeStr = slots.length > 0
    ? slots.map(s => `${DAY_JP[s.day] ?? s.day}${s.period}限`).join(' / ')
    : (c.normalized_time === 'EXTRA' || c.normalized_time === '0') ? '時間割外' : '—'

  return (
    <div
      onClick={onDetail}
      className={`rounded-2xl border transition-all relative overflow-hidden cursor-pointer
                  active:opacity-70 ${
        isTemp
          ? 'border-dashed border-amber-300 dark:border-amber-500/50 bg-amber-50/60 dark:bg-amber-500/5 opacity-85'
          : isSel
            ? `border-2 ${color.border} bg-white dark:bg-[#1f2235]`
            : 'border border-gray-100 dark:border-white/[0.07] bg-white dark:bg-[#1f2235] hover:border-gray-200 dark:hover:border-white/[0.12]'
      }`}
    >
      {/* 左カラーストリップ */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${color.strip}`} />

      <div className="pl-4 pr-3 py-3">
        {/* 授業名 + バッジ */}
        <div className="flex flex-wrap items-center gap-1 mb-0.5">
          {isTemp && (
            <span className="text-[10px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded-full flex-shrink-0">仮</span>
          )}
          {isRecognized && (
            <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full flex-shrink-0">認定</span>
          )}
          <span className={`text-sm font-bold leading-snug ${
            isTemp ? 'text-amber-900 dark:text-amber-200' : 'text-gray-900 dark:text-slate-100'
          }`}>
            {c.course_name}
          </span>
        </div>

        {/* メタ情報 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
          <span className="text-xs text-gray-400 dark:text-slate-500">{c.term}</span>
          {timeStr !== '—' && (
            <span className="text-xs text-gray-400 dark:text-slate-500">{timeStr}</span>
          )}
          <span className="text-xs text-gray-400 dark:text-slate-500">{c.credits}単位</span>
          {c.year && (
            <span className="text-xs text-gray-400 dark:text-slate-500">{c.year}年次</span>
          )}
          {c.raw_category && (
            <span className="text-[10px] bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
              {c.raw_category}
            </span>
          )}
        </div>

        {/* ステータスバッジ（時間割での登録状況） */}
        {statusCfg && (
          <div className="mt-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg.badge}`}>
              {statusCfg.label}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
