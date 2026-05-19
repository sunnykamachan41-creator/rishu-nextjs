'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import CourseModal from './CourseModal'
import FilterDrawer, { DEFAULT_FILTERS, DAY_OPTIONS, CAT_OPTIONS, DEGREE_OPTIONS } from './FilterDrawer'
import { getCourseColor, getCourseBadges } from '@/lib/courseColor'
import { isCourseEligible } from '@/lib/eligibility'
import { STATUS_CONFIG } from '@/lib/enrollmentStatus'

// ── ラベルマップ（アクティブタグ表示用） ──────────────────────────────────────

const DAY_LABEL   = Object.fromEntries(DAY_OPTIONS.map(o => [o.value, o.label]))
const CAT_LABEL   = Object.fromEntries(CAT_OPTIONS.map(o => [o.value, o.label]))
const DEG_LABEL   = Object.fromEntries(DEGREE_OPTIONS.map(o => [o.value, o.label]))

// ── スロット解析ユーティリティ ────────────────────────────────────────────────

function extractSlots(nt) {
  if (!nt || nt === 'EXTRA' || nt === '0') return []
  return String(nt).split('|')
    .map(s => {
      const m = s.trim().match(/^(MON|TUE|WED|THU|FRI)_(\d)$/)
      return m ? { day: m[1], period: m[2] } : null
    })
    .filter(Boolean)
}

function extractDegrees(tags) {
  if (!tags) return []
  const r = []
  if (tags.includes('HIENG')) r.push('HIENG')
  if (tags.includes('KIND'))  r.push('KIND')
  if (tags.includes('LIB'))   r.push('LIB')
  return r
}

// ── フィルタ適用ロジック ──────────────────────────────────────────────────────

/**
 * @param {{ grade: number, semester: 'spring'|'fall' } | null} eligibility
 *   null = 制限なし（全授業表示モード）
 *   grade/semester は lib/eligibility.isCourseEligible に渡す
 * @param {number|null} academicYear
 *   開講年度フィルタ。コースに academic_year が設定されている場合のみ適用。
 *   null または コースに academic_year がない場合はフィルタしない（後方互換）。
 */
function applyFilters(courses, filters, query, selectedSet, eligibility, academicYear = null) {
  return courses.filter(c => {
    // ── 開講年度フィルタ（academic_year が設定されている科目のみ適用） ───────
    // 科目に academic_year が無い（レガシーデータ）場合は除外しない。
    if (academicYear != null && c.academic_year != null) {
      if (c.academic_year !== academicYear) return false
    }

    // ── 履修可能条件（学年・学期の自動フィルタ）────────────────────────────
    // ルールは lib/eligibility.isCourseEligible に一元管理
    if (eligibility && !isCourseEligible(c, eligibility.grade, eligibility.semester)) {
      return false
    }

    // 履修状況（composite key で判定）
    const ck = `${c.class_id}|${c.academic_year ?? ''}`
    if (filters.enrolled === 'enrolled'     && !selectedSet.has(ck)) return false
    if (filters.enrolled === 'not-enrolled' &&  selectedSet.has(ck)) return false

    // 学期
    if (filters.terms.length > 0 && !filters.terms.includes(c.term)) return false

    // 曜日・時限（同一スロットで AND）
    if (filters.days.length > 0 || filters.periods.length > 0) {
      const slots = extractSlots(c.normalized_time)
      if (filters.days.length > 0 && filters.periods.length > 0) {
        // 曜日と時限の両方を指定 → 同じスロットで両方を満たすものを探す
        const hit = slots.some(
          s => filters.days.includes(s.day) && filters.periods.includes(s.period)
        )
        if (!hit) return false
      } else if (filters.days.length > 0) {
        if (!slots.some(s => filters.days.includes(s.day))) return false
      } else {
        if (!slots.some(s => filters.periods.includes(s.period))) return false
      }
    }

    // カテゴリ
    if (filters.categories.length > 0 && !filters.categories.includes(c.raw_category)) return false

    // サブカテゴリ
    if (filters.subCategories.length > 0 && !filters.subCategories.includes(c.sub_category)) return false

    // 学年
    if (filters.years.length > 0 && !filters.years.includes(String(c.year))) return false

    // 単位数
    if (filters.credits.length > 0 && !filters.credits.includes(String(c.credits))) return false

    // 資格系（いずれかに該当）
    if (filters.degrees.length > 0) {
      const deg = extractDegrees(c.tags)
      if (!deg.some(d => filters.degrees.includes(d))) return false
    }

    // 教室
    if (filters.rooms.length > 0 && !filters.rooms.includes(c.room)) return false

    // キーワード検索
    if (query) {
      const q = query.toLowerCase()
      if (
        !c.course_name?.toLowerCase().includes(q) &&
        !c.intructor?.toLowerCase().includes(q) &&
        !c.tags?.toLowerCase().includes(q)
      ) return false
    }

    return true
  })
}

// ── アクティブフィルタタグ生成 ────────────────────────────────────────────────

function buildActiveTags(filters) {
  const tags = []
  const push = (key, value, label, reset = null) =>
    tags.push({ key, value, label, reset })

  filters.terms.forEach(v          => push('terms', v, v))
  filters.days.forEach(v           => push('days', v, (DAY_LABEL[v] || v) + '曜'))
  filters.periods.forEach(v        => push('periods', v, v + '限'))
  filters.categories.forEach(v     => push('categories', v, CAT_LABEL[v] || v))
  filters.subCategories.forEach(v  => push('subCategories', v, v))
  filters.years.forEach(v          => push('years', v, v + '年次'))
  filters.credits.forEach(v        => push('credits', v, v + '単位'))
  filters.degrees.forEach(v        => push('degrees', v, DEG_LABEL[v] || v))
  filters.rooms.forEach(v          => push('rooms', v, v))

  if (filters.enrolled !== 'all') {
    push('enrolled', filters.enrolled,
      filters.enrolled === 'enrolled' ? '履修済のみ' : '未履修のみ',
      'all')  // reset value
  }
  return tags
}

function removeTag(filters, tag) {
  if (tag.reset !== null && tag.reset !== undefined) {
    // single-value filter (enrolled)
    return { ...filters, [tag.key]: tag.reset }
  }
  // multi-select filter
  return { ...filters, [tag.key]: filters[tag.key].filter(v => v !== tag.value) }
}

// ── CourseList ────────────────────────────────────────────────────────────────

export default function CourseList({
  courses, selectedIds, conflicts, onToggle, toggling,
  filters, onFiltersChange, query, onQueryChange,
  // New-schema props (optional — gracefully absent in legacy mode)
  statusMap = new Map(), enrollmentVersion = 'legacy', onStatusChange,
  // 履修可能条件フィルタ
  selectedGrade = null, semesterFilter = null,
  // 開講年度フィルタ（academic_year が設定されている科目のみ有効）
  academicYear = null,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modal,      setModal]      = useState(null)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const conflictSet = useMemo(() => new Set(conflicts),   [conflicts])

  // 履修可能条件（常にアクティブ・バイパス不可）
  // grade と semesterFilter が揃っていない場合のみ null（フィルタ無効）
  const eligibility = useMemo(() => {
    const grade = Number(selectedGrade)
    if (!grade || grade < 1) return null
    if (!semesterFilter) return null
    const semester = semesterFilter === '秋学期' ? 'fall' : 'spring'
    return { grade, semester }
  }, [selectedGrade, semesterFilter])

  const filtered = useMemo(
    () => applyFilters(courses, filters, query, selectedSet, eligibility, academicYear),
    [courses, filters, query, selectedSet, eligibility, academicYear]
  )

  // academic_year フィルタによる空状態かどうかを判定
  // → 他のフィルタなしで academicYear だけ適用した結果も空なら「該当年度の授業なし」
  const noCoursesForYear = useMemo(() => {
    if (academicYear == null) return false
    // academic_year が設定されている授業が存在し、かつその中に academicYear と一致するものがない場合
    const aySet = courses.filter(c => c.academic_year != null)
    if (aySet.length === 0) return false  // 全授業がレガシー → フィルタ無効
    return !aySet.some(c => c.academic_year === academicYear)
  }, [courses, academicYear])

  const activeTags = useMemo(() => buildActiveTags(filters), [filters])

  const filterCount = useMemo(() =>
    filters.terms.length + filters.days.length + filters.periods.length +
    filters.categories.length + filters.subCategories.length +
    filters.years.length + filters.credits.length + filters.degrees.length +
    (filters.enrolled !== 'all' ? 1 : 0),
    [filters])

  const handleRemoveTag = useCallback(tag => {
    onFiltersChange(f => removeTag(f, tag))
  }, [onFiltersChange])

  return (
    <div className="flex flex-col h-full">
      {/* ── 検索バー + フィルターボタン ── */}
      <div className="bg-white dark:bg-[#1a1d27] px-4 pt-3 pb-2 border-b border-gray-100 dark:border-white/[0.07]">
        <div className="flex gap-2">
          {/* 検索入力 */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={query} onChange={e => onQueryChange(e.target.value)}
              placeholder="授業名・担当者で検索"
              className="w-full bg-gray-50 dark:bg-[#252839] rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 border border-gray-100 dark:border-white/[0.07] dark:text-slate-200 dark:placeholder-slate-500" />
            {query && (
              <button onClick={() => onQueryChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">✕</button>
            )}
          </div>

          {/* フィルターボタン */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={`relative flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
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

        {/* 履修可能条件バッジ（非インタラクティブ）+ アクティブフィルタチップ */}
        {(activeTags.length > 0 || eligibility) && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {/* 現在の絞り込み条件を示す読み取り専用バッジ（トグル不可） */}
            {eligibility && (
              <span className="flex-shrink-0 flex items-center gap-1 text-xs px-2.5 py-1
                               rounded-full font-medium whitespace-nowrap
                               bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                {selectedGrade}年 {semesterFilter}
              </span>
            )}
            {activeTags.map((tag, i) => (
              <button
                key={i}
                onClick={() => handleRemoveTag(tag)}
                className="flex-shrink-0 flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
                {tag.label}
                <span className="text-blue-500 font-bold">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 件数 */}
      <div className="px-4 pt-2 pb-1 text-xs text-gray-400 dark:text-slate-500">
        {filtered.length}件
      </div>

      {/* コース一覧 */}
      <div className="flex-1 overflow-auto px-3 pb-4">
        <div className="flex flex-col gap-2">
          {filtered.map(c => {
            // composite key: class_id|academic_year — prevents cross-year selection leakage
            const ck         = `${c.class_id}|${c.academic_year ?? ''}`
            const isSel      = selectedSet.has(ck)
            const isConflict = conflictSet.has(ck)
            const isToggling = toggling === c.class_id
            const color      = getCourseColor(c)
            const badges     = getCourseBadges(c)

            // ステータスも composite key 参照
            const enrollStatus = statusMap.get(ck)

            const borderCls = isConflict
              ? 'border-2 border-red-500'
              : isSel
                ? `border-2 ${color.sel}`
                : 'border border-transparent'

            return (
              <button key={ck} onClick={() => setModal(c)}
                className={`${color.card} rounded-2xl p-3.5 text-left shadow-sm transition-all ${borderCls}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1 mb-1.5">
                      <span className="text-xs text-gray-500">{c.term}</span>
                      {badges.map(b => (
                        <span key={b.label}
                          className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${b.cls}`}>
                          {b.label}
                        </span>
                      ))}
                      {isConflict && (
                        <span className="text-xs text-red-600 font-semibold">⚠ 衝突</span>
                      )}
                      {enrollmentVersion === 'new' && enrollStatus && STATUS_CONFIG[enrollStatus] && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_CONFIG[enrollStatus].badge}`}>
                          {STATUS_CONFIG[enrollStatus].label}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-slate-100 leading-snug">{c.course_name}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {c.day_time || '時間外'} · {c.room} · {c.credits}単位
                    </div>
                    {c.intructor && (
                      <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate">{c.intructor}</div>
                    )}
                    {c.note && (
                      <div className="text-xs text-amber-700 mt-0.5 truncate opacity-80">📝 {c.note}</div>
                    )}
                  </div>

                  <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isToggling
                      ? 'border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-[#252839]'
                      : isSel
                        ? `${color.check} border-transparent`
                        : 'border-gray-300 dark:border-white/20 bg-white dark:bg-[#252839]'
                  }`}>
                    {isSel && !isToggling && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd" />
                      </svg>
                    )}
                    {isToggling && (
                      <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                </div>
              </button>
            )
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500">
              {noCoursesForYear ? (
                /* academic_year ミスマッチによる空状態 */
                <>
                  <div className="text-3xl mb-3">📅</div>
                  <div className="text-sm font-medium text-gray-500 dark:text-slate-400">
                    {academicYear}年度の授業がありません
                  </div>
                  <div className="text-xs mt-1.5 text-gray-400 dark:text-slate-500 leading-relaxed px-6">
                    現在の学年・入学年度の設定では、<br />
                    この年度に開講された授業は登録できません。
                  </div>
                </>
              ) : (
                /* その他のフィルタによる空状態 */
                <>
                  <div className="text-3xl mb-3">🔍</div>
                  <div className="text-sm">該当する授業が見つかりません</div>
                  {(filterCount > 0 || query) && (
                    <button
                      onClick={() => { onFiltersChange(DEFAULT_FILTERS); onQueryChange('') }}
                      className="mt-3 text-xs text-blue-500 font-medium block mx-auto">
                      フィルターをリセット
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* フィルタードロワー */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={onFiltersChange}
        courses={courses}
      />

      {/* コースモーダル */}
      {modal && (
        <CourseModal
          course={modal}
          isSelected={selectedSet.has(`${modal.class_id}|${modal.academic_year ?? ''}`)}
          isConflict={conflictSet.has(`${modal.class_id}|${modal.academic_year ?? ''}`)}
          toggling={toggling === modal.class_id}
          onToggle={() => { onToggle(modal.class_id); setModal(null) }}
          onClose={() => setModal(null)}
          enrollStatus={statusMap.get(`${modal.class_id}|${modal.academic_year ?? ''}`)}
          enrollmentVersion={enrollmentVersion}
          onStatusChange={onStatusChange
            ? (status) => { onStatusChange(modal.class_id, status); setModal(null) }
            : undefined}
        />
      )}
    </div>
  )
}
