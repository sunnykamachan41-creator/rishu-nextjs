'use client'
import { useState } from 'react'
import {
  creditsUpToGrade,
  uniqueCoursesByTag,
  hasCourseId,
  EB_REQUIRED,
} from '@/lib/practiceEligibility'

// ── PracticeChecker（メイン） ─────────────────────────────────────────────────

/**
 * @param {{ practiceEligibility: import('@/lib/practiceEligibility').AllPracticeResults|null,
 *            creditSummary:        import('@/lib/useCreditSummary').CreditSummary|null }} props
 */
export default function PracticeChecker({ practiceEligibility, creditSummary }) {
  if (!practiceEligibility || !creditSummary) {
    return (
      <div className="px-3 py-6 text-center text-sm text-gray-400">
        データを読み込み中…
      </div>
    )
  }

  const { practice1, practice2, subPractice } = practiceEligibility

  return (
    <div className="px-3 pb-6 flex flex-col gap-3">

      {/* ── 全体サマリーバー ── */}
      <SummaryBar
        results={[practice1, practice2, subPractice]}
        labels={['実習Ⅰ', '実習Ⅱ', '副免']}
      />

      {/* ── 各実習カード ── */}
      <PracticeCard
        title="教育実習Ⅰ"
        subtitle="申請目安：2年次修了時"
        result={practice1}
      >
        <Practice1Details state={creditSummary} />
      </PracticeCard>

      <PracticeCard
        title="教育実習Ⅱ"
        subtitle="申請目安：3年次修了時"
        result={practice2}
      >
        <Practice2Details state={creditSummary} p1={practice1} />
      </PracticeCard>

      <PracticeCard
        title="副免教育実習"
        subtitle="教育実習Ⅰ修了後に申請"
        result={subPractice}
      >
        <SubPracticeDetails state={creditSummary} p1={practice1} />
      </PracticeCard>
    </div>
  )
}

// ── SummaryBar ────────────────────────────────────────────────────────────────

function SummaryBar({ results, labels }) {
  const okCount = results.filter(r => r.eligible).length
  return (
    <div className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="flex-1">
        <div className="text-xs text-gray-500 mb-1">教育実習 要件達成</div>
        <div className="flex gap-1">
          {results.map((r, i) => (
            <span
              key={i}
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                r.eligible
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-600'
              }`}
            >
              {r.eligible ? '✓ ' : '✗ '}{labels[i]}
            </span>
          ))}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-2xl font-bold text-gray-800">{okCount}<span className="text-base font-normal text-gray-400"> / 3</span></div>
        <div className="text-xs text-gray-400">達成</div>
      </div>
    </div>
  )
}

// ── PracticeCard ──────────────────────────────────────────────────────────────

function PracticeCard({ title, subtitle, result, children }) {
  const [open, setOpen] = useState(false)
  const ok = result.eligible

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border-l-4 ${
      ok ? 'border-green-400' : 'border-red-400'
    }`}>
      {/* ── ヘッダー（クリックで展開） ── */}
      <button
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        {/* 判定バッジ */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          ok ? 'bg-green-100' : 'bg-red-100'
        }`}>
          {ok
            ? <span className="text-green-600 text-lg font-bold">✓</span>
            : <span className="text-red-500 text-lg font-bold">✗</span>
          }
        </div>

        {/* タイトル */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900">{title}</div>
          <div className={`text-xs mt-0.5 font-medium ${ok ? 'text-green-600' : 'text-red-500'}`}>
            {ok ? '履修可能' : `${result.missing.length}件の条件が未達`}
          </div>
          <div className="text-xs text-gray-400">{subtitle}</div>
        </div>

        {/* シェブロン */}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── 展開：詳細 ── */}
      {open && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 flex flex-col gap-2">
          {children}
        </div>
      )}
    </div>
  )
}

// ── 条件行 ────────────────────────────────────────────────────────────────────

/**
 * 数値進捗を表示する行（プログレスバー付き）
 */
function ProgressRow({ label, earned, required, unit = '単位' }) {
  const ok  = earned >= required
  const pct = required > 0 ? Math.min(100, (earned / required) * 100) : 100

  return (
    <div className={`rounded-xl px-3 py-2.5 ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className={`text-xs font-bold ${ok ? 'text-green-700' : 'text-red-600'}`}>
          {earned}<span className="font-normal text-gray-400"> / {required}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 bg-white rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${ok ? 'bg-green-400' : 'bg-red-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/**
 * 科目チェック行（✓ / ✗）
 */
function CourseCheckRow({ name, completed }) {
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${completed ? 'bg-green-50' : 'bg-red-50'}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        completed ? 'bg-green-400 text-white' : 'bg-red-300 text-white'
      }`}>
        {completed ? '✓' : '✗'}
      </div>
      <span className={`text-xs font-medium ${completed ? 'text-green-800' : 'text-red-700'}`}>
        {name}
      </span>
    </div>
  )
}

/**
 * セクション区切り
 */
function SectionLabel({ children }) {
  return (
    <div className="text-xs font-bold text-gray-400 mt-1 mb-0.5 px-0.5 uppercase tracking-wide">
      {children}
    </div>
  )
}

// ── 教育実習Ⅰ 詳細 ───────────────────────────────────────────────────────────

function Practice1Details({ state }) {
  const creditsY2  = creditsUpToGrade(state.creditsByGrade, 2)
  const ebCredits  = state.creditsByCategory['EB'] ?? 0
  const stCourses  = uniqueCoursesByTag(state.completedCourses, 'ST')
  const stCredits  = stCourses.reduce((s, c) => s + c.credits, 0)

  return (
    <>
      <SectionLabel>単位要件</SectionLabel>
      <ProgressRow label="2年生までの取得単位" earned={creditsY2} required={62} />

      <SectionLabel>EB 必修科目</SectionLabel>
      {EB_REQUIRED.map(req => (
        <CourseCheckRow
          key={req.id}
          name={req.name}
          completed={hasCourseId(state.completedCourses, req.id)}
        />
      ))}
      <ProgressRow label="EB 合計単位" earned={ebCredits} required={6} />

      <SectionLabel>ST 要件</SectionLabel>
      <ProgressRow label="ST 科目数" earned={stCourses.length} required={2} unit="科目" />
      <ProgressRow label="ST 合計単位" earned={stCredits} required={4} />
    </>
  )
}

// ── 教育実習Ⅱ 詳細 ───────────────────────────────────────────────────────────

function Practice2Details({ state, p1 }) {
  const creditsY3 = creditsUpToGrade(state.creditsByGrade, 3)
  const stCourses = uniqueCoursesByTag(state.completedCourses, 'ST')
  const stCredits = stCourses.reduce((s, c) => s + c.credits, 0)

  return (
    <>
      {/* 教育実習Ⅰ 要件サマリー */}
      <SectionLabel>教育実習Ⅰ 要件</SectionLabel>
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${p1.eligible ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          p1.eligible ? 'bg-green-400 text-white' : 'bg-red-300 text-white'
        }`}>
          {p1.eligible ? '✓' : '✗'}
        </div>
        <span className={`text-xs font-medium ${p1.eligible ? 'text-green-800' : 'text-red-700'}`}>
          {p1.eligible ? '教育実習Ⅰ 要件達成済み' : '教育実習Ⅰ 要件未達'}
        </span>
      </div>

      <SectionLabel>追加単位要件</SectionLabel>
      <ProgressRow label="3年生までの取得単位" earned={creditsY3} required={78} />

      <SectionLabel>ST 要件（強化）</SectionLabel>
      <ProgressRow label="ST 科目数" earned={stCourses.length} required={4} unit="科目" />
      <ProgressRow label="ST 合計単位" earned={stCredits} required={8} />
    </>
  )
}

// ── 副免教育実習 詳細 ─────────────────────────────────────────────────────────

function SubPracticeDetails({ state, p1 }) {
  const clCredits = state.creditsByCategory['CL_ENG_OP'] ?? 0

  return (
    <>
      <SectionLabel>教育実習Ⅰ 要件</SectionLabel>
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${p1.eligible ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          p1.eligible ? 'bg-green-400 text-white' : 'bg-red-300 text-white'
        }`}>
          {p1.eligible ? '✓' : '✗'}
        </div>
        <span className={`text-xs font-medium ${p1.eligible ? 'text-green-800' : 'text-red-700'}`}>
          {p1.eligible ? '教育実習Ⅰ 要件達成済み' : '教育実習Ⅰ 要件未達'}
        </span>
      </div>

      <SectionLabel>英語科目要件</SectionLabel>
      <ProgressRow label="CL_ENG_OP 単位" earned={clCredits} required={4} />
    </>
  )
}
