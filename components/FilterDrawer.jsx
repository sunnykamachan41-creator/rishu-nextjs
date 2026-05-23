'use client'
import { useMemo, useState } from 'react'
import { useSwipeDown } from '@/lib/useSwipeDown'

// ── 固定オプション ────────────────────────────────────────────────────────────

export const TERM_OPTIONS = [
  { value: '春学期',   label: '春学期' },
  { value: '秋学期',   label: '秋学期' },
  { value: '通年',     label: '通年' },
  { value: '第1ターム', label: '第1ターム' },
  { value: '第2ターム', label: '第2ターム' },
  { value: '第3ターム', label: '第3ターム' },
  { value: '第4ターム', label: '第4ターム' },
]

export const DAY_OPTIONS = [
  { value: 'MON', label: '月' },
  { value: 'TUE', label: '火' },
  { value: 'WED', label: '水' },
  { value: 'THU', label: '木' },
  { value: 'FRI', label: '金' },
]

export const PERIOD_OPTIONS = [1, 2, 3, 4, 5].map(p => ({
  value: String(p), label: `${p}限`,
}))

export const CAT_OPTIONS = [
  { value: 'CA', label: '教養' }, { value: 'CH', label: '健康・体育' },
  { value: 'CL', label: '言語' }, { value: 'EC', label: '教育創生' },
  { value: 'EP', label: '実習' }, { value: 'SA', label: '選択A' },
  { value: 'S',  label: '専門' }, { value: 'EB', label: '教育基礎' },
  { value: 'EM', label: '道徳・総合' }, { value: 'SP', label: '研究' },
  { value: 'ST', label: '指導法' }, { value: 'SE', label: 'SE' },
  { value: 'SZ', label: 'SZ' }, { value: '中高英語', label: '中高英語' },
  { value: '幼稚園', label: '幼稚園' },
]

export const DEGREE_OPTIONS = [
  { value: 'HIENG', label: '中高英語' },
  { value: 'KIND',  label: '幼稚園' },
  { value: 'LIB',   label: '司書' },
]

const ENROLLED_OPTIONS = [
  { value: 'all',         label: 'すべて' },
  { value: 'enrolled',    label: '履修済' },
  { value: 'not-enrolled', label: '未履修' },
]

// ── デフォルトフィルタ（拡張時はここに追加するだけ） ─────────────────────────

export const DEFAULT_FILTERS = {
  terms:         [],     // string[]
  days:          [],     // 'MON'|'TUE'|…
  periods:       [],     // '1'|'2'|…
  categories:    [],     // raw_category
  subCategories: [],     // sub_category
  years:         [],     // '1'|'2'|'3'|'4'
  credits:       [],     // '1'|'2'|'4'
  degrees:       [],     // 'HIENG'|'KIND'|'LIB'
  rooms:         [],     // 教室名
  enrolled:      'all',  // 'all'|'enrolled'|'not-enrolled'
}

// ── FilterDrawer ──────────────────────────────────────────────────────────────

export default function FilterDrawer({ open, onClose, filters, onChange, courses }) {
  const { sheetRef, handleProps } = useSwipeDown(onClose)

  // データから動的オプションを生成
  const yearOpts = useMemo(() =>
    [...new Set(courses.map(c => c.year).filter(Boolean))].sort()
      .map(y => ({ value: String(y), label: `${y}年次` })),
    [courses])

  const creditOpts = useMemo(() =>
    [...new Set(courses.map(c => String(c.credits)).filter(v => v && v !== 'undefined'))]
      .sort((a, b) => Number(a) - Number(b))
      .map(c => ({ value: c, label: `${c}単位` })),
    [courses])

  const allRooms = useMemo(() =>
    [...new Set(courses.map(c => c.room).filter(Boolean))].sort(),
    [courses])

  // 最後に選択したrawのsubのみ表示
  const activeRaw = filters.categories[filters.categories.length - 1] ?? null
  const activeSubOpts = useMemo(() => {
    if (!activeRaw) return []
    return [...new Set(
      courses
        .filter(c => c.raw_category === activeRaw && c.sub_category)
        .map(c => c.sub_category)
    )].sort().map(s => ({ value: s, label: s }))
  }, [courses, activeRaw])

  function toggle(key, value) {
    const cur = filters[key]
    onChange({
      ...filters,
      [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value],
    })
  }

  // カテゴリ切り替え：activeRaw が変わったらsubの選択をクリア
  function toggleCategory(value) {
    const cur  = filters.categories
    const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
    const newActiveRaw = next[next.length - 1] ?? null
    const subCategories = newActiveRaw !== activeRaw ? [] : filters.subCategories
    onChange({ ...filters, categories: next, subCategories })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* ボトムシート */}
      <div ref={sheetRef} className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1f2235] rounded-t-3xl flex flex-col"
        style={{ maxHeight: '88dvh' }}>
        {/* ハンドル + ヘッダー */}
        <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div {...handleProps} className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-gray-900 dark:text-slate-100">絞り込み</span>
            <button
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="text-sm text-blue-500 font-medium">
              すべてクリア
            </button>
          </div>
        </div>

        {/* スクロール可能コンテンツ */}
        <div className="flex-1 overflow-auto px-4 py-3 space-y-5">
          {/* 履修状況 */}
          <Section title="履修状況">
            <div className="flex gap-2">
              {ENROLLED_OPTIONS.map(o => (
                <button key={o.value}
                  onClick={() => onChange({ ...filters, enrolled: o.value })}
                  className={`flex-1 text-sm py-2 rounded-xl border font-medium transition-colors ${
                    filters.enrolled === o.value
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-300 border-gray-100 dark:border-white/[0.07]'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </Section>

          {/* 学期 */}
          <Section title="学期">
            <ChipGroup options={TERM_OPTIONS} selected={filters.terms}
              onToggle={v => toggle('terms', v)} />
          </Section>

          {/* 曜日 */}
          <Section title="曜日">
            <ChipGroup options={DAY_OPTIONS} selected={filters.days}
              onToggle={v => toggle('days', v)} />
          </Section>

          {/* 時限 */}
          <Section title="時限">
            <ChipGroup options={PERIOD_OPTIONS} selected={filters.periods}
              onToggle={v => toggle('periods', v)} />
          </Section>

          {/* カテゴリ */}
          <Section title="カテゴリ">
            <ChipGroup options={CAT_OPTIONS} selected={filters.categories}
              onToggle={toggleCategory} />
          </Section>

          {/* サブカテゴリ：最後に選択したrawのみ */}
          {activeRaw && activeSubOpts.length > 0 && (
            <Section title={`${CAT_OPTIONS.find(o => o.value === activeRaw)?.label ?? activeRaw}のサブカテゴリ`}>
              <ChipGroup options={activeSubOpts} selected={filters.subCategories}
                onToggle={v => toggle('subCategories', v)} />
            </Section>
          )}

          {/* 対象学年 */}
          {yearOpts.length > 0 && (
            <Section title="対象学年">
              <ChipGroup options={yearOpts} selected={filters.years}
                onToggle={v => toggle('years', v)} />
            </Section>
          )}

          {/* 単位数 */}
          {creditOpts.length > 0 && (
            <Section title="単位数">
              <ChipGroup options={creditOpts} selected={filters.credits}
                onToggle={v => toggle('credits', v)} />
            </Section>
          )}

          {/* 教室 */}
          <Section title="教室">
            <RoomFilter
              selected={filters.rooms}
              allRooms={allRooms}
              onChange={rooms => onChange({ ...filters, rooms })}
            />
          </Section>

          {/* 資格系 */}
          <Section title="資格系">
            <ChipGroup options={DEGREE_OPTIONS} selected={filters.degrees}
              onToggle={v => toggle('degrees', v)} />
          </Section>
        </div>

        {/* 閉じるボタン */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-100 dark:border-white/[0.07]">
          <button onClick={onClose}
            className="w-full bg-blue-500 text-white py-3 rounded-2xl font-semibold text-sm">
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

// ── サブコンポーネント ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">{title}</div>
      {children}
    </div>
  )
}

function ChipGroup({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.value} onClick={() => onToggle(o.value)}
          className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
            selected.includes(o.value)
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-300 border-gray-100 dark:border-white/[0.07]'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function RoomFilter({ selected, allRooms, onChange }) {
  const [query, setQuery] = useState('')

  const suggestions = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return allRooms.filter(r => r.toLowerCase().includes(q) && !selected.includes(r))
  }, [query, allRooms, selected])

  function add(room) {
    if (!selected.includes(room)) onChange([...selected, room])
    setQuery('')
  }
  function remove(room) {
    onChange(selected.filter(r => r !== room))
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 別途指示（時間外）固定チップ */}
      <div>
        <button
          onClick={() => selected.includes('別途指示') ? remove('別途指示') : add('別途指示')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
            selected.includes('別途指示')
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-300 border-gray-100 dark:border-white/[0.07]'
          }`}>
          別途指示（時間外）
        </button>
      </div>

      {/* テキスト検索 */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="教室名で検索（例: N410）"
          className="w-full bg-gray-50 dark:bg-[#252839] rounded-xl px-3 py-2 text-sm border border-gray-100 dark:border-white/[0.07] text-gray-800 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        {query && (
          <button onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-xs">✕</button>
        )}
      </div>

      {/* サジェスト */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 20).map(r => (
            <button key={r} onClick={() => add(r)}
              className="text-xs px-3 py-1.5 rounded-full font-medium bg-gray-50 dark:bg-[#252839] text-gray-600 dark:text-slate-300 border border-gray-100 dark:border-white/[0.07]">
              {r}
            </button>
          ))}
        </div>
      )}

      {/* 選択済み教室 */}
      {selected.filter(r => r !== '別途指示').length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.filter(r => r !== '別途指示').map(r => (
            <button key={r} onClick={() => remove(r)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium border border-blue-200">
              {r}
              <span className="text-blue-500 font-bold">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
