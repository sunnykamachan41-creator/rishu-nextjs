'use client'
import { useMemo } from 'react'

const CAT_COLORS = {
  CA: 'bg-blue-100 text-blue-700',   CH: 'bg-green-100 text-green-700',
  CL: 'bg-yellow-100 text-yellow-700', EC: 'bg-purple-100 text-purple-700',
  EP: 'bg-pink-100 text-pink-700',   SA: 'bg-orange-100 text-orange-700',
  EB: 'bg-teal-100 text-teal-700',   EM: 'bg-cyan-100 text-cyan-700',
  SP: 'bg-indigo-100 text-indigo-700', ST: 'bg-rose-100 text-rose-700',
  S:  'bg-violet-100 text-violet-700',
}

export default function Summary({ courses, selectedIds, requirements, totalCredits,
                                   enrollmentCredits = null, exemptionCredits = 0,
                                   duplicateCourseIds = [], creditSummary = null }) {
  const selectedSet = new Set(selectedIds)
  const selected = useMemo(() => courses.filter(c => selectedSet.has(c.class_id)), [courses, selectedIds]) // eslint-disable-line

  const byCategory = useMemo(() => {
    const map = {}
    for (const c of selected) {
      const cat = c.raw_category || '?'
      if (!map[cat]) map[cat] = { count: 0, credits: 0 }
      map[cat].count++
      map[cat].credits += Number(c.credits) || 0
    }
    return map
  }, [selected])

  const byTerm = useMemo(() => {
    const map = {}
    for (const c of selected) { map[c.term] = (map[c.term] || 0) + (Number(c.credits) || 0) }
    return map
  }, [selected])

  // 重複科目の名前を取得（courseId → 最初に見つかった名前）
  const duplicateNames = useMemo(() => {
    if (!duplicateCourseIds.length || !creditSummary) return []
    const seen = new Set()
    const result = []
    for (const c of creditSummary.completedCourses) {
      if (duplicateCourseIds.includes(c.courseId) && !seen.has(c.courseId)) {
        seen.add(c.courseId)
        result.push(c.name)
      }
    }
    return result
  }, [duplicateCourseIds, creditSummary])

  const shortReqs = requirements.filter(r => r.status === 'short')
  const okCount = requirements.filter(r => r.status === 'ok').length

  return (
    <div className="px-3 pt-3 space-y-3">
      {/* Credit card */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-md">
        <div className="text-sm opacity-80 mb-1">取得単位数</div>
        <div className="flex items-end gap-2">
          <div className="text-4xl font-bold">{totalCredits}</div>
          <div className="text-sm opacity-70 mb-1">単位</div>
        </div>
        {exemptionCredits > 0 && enrollmentCredits != null && (
          <div className="mt-1.5 text-xs bg-white/20 rounded-lg px-2.5 py-1.5 flex gap-3">
            <span>履修: {enrollmentCredits}単位</span>
            <span>認定: {exemptionCredits}単位</span>
          </div>
        )}
        <div className="mt-3 flex gap-4 text-sm">
          <div><div className="opacity-70 text-xs">履修科目</div><div className="font-bold">{selected.length} 科目</div></div>
          <div><div className="opacity-70 text-xs">要件達成</div><div className="font-bold">{okCount} / {requirements.length}</div></div>
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicateNames.length > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
          <div className="text-sm font-semibold text-orange-700 mb-2">⚠ 学年間重複 ({duplicateNames.length}科目)</div>
          <div className="text-xs text-orange-600 mb-2">同じ授業が複数の学年で登録されています。</div>
          <div className="flex flex-col gap-1.5">
            {duplicateNames.map((name, i) => (
              <div key={i} className="text-xs text-orange-700 bg-orange-100 rounded-lg px-2.5 py-1.5">
                {name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shortage */}
      {shortReqs.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <div className="text-sm font-semibold text-amber-700 mb-2">不足要件 ({shortReqs.length}件)</div>
          <div className="flex flex-col gap-1.5">
            {shortReqs.map(r => (
              <div key={r.requirement_id} className="flex items-center justify-between text-xs">
                <span className="text-amber-800">{r.name}</span>
                <span className="text-amber-600 font-medium">あと {r.shortage} 単位</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By term */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="text-sm font-semibold text-gray-700 mb-3">学期別</div>
        <div className="space-y-2">
          {Object.entries(byTerm).map(([term, credits]) => (
            <div key={term} className="flex items-center gap-3">
              <div className="text-xs text-gray-500 w-16 flex-shrink-0">{term}</div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, (credits / 30) * 100)}%` }} />
              </div>
              <div className="text-xs font-semibold text-gray-700 w-10 text-right">{credits}単位</div>
            </div>
          ))}
        </div>
      </div>

      {/* By category */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="text-sm font-semibold text-gray-700 mb-3">カテゴリ別</div>
        <div className="space-y-2">
          {Object.entries(byCategory).sort((a, b) => b[1].credits - a[1].credits).map(([cat, d]) => (
            <div key={cat} className="flex items-center gap-3">
              <div className={`text-xs font-medium px-2 py-0.5 rounded-full w-20 text-center flex-shrink-0 ${CAT_COLORS[cat] || 'bg-gray-100 text-gray-600'}`}>{cat}</div>
              <div className="flex-1 text-xs text-gray-600 truncate" />
              <div className="text-xs font-semibold text-gray-700 flex-shrink-0">{d.credits}単位 · {d.count}科目</div>
            </div>
          ))}
        </div>
      </div>

      {/* Course list */}
      {selected.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-700 mb-3">登録科目一覧 ({selected.length}件)</div>
          <div className="space-y-2">
            {selected.map(c => (
              <div key={c.class_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">{c.course_name}</div>
                  <div className="text-xs text-gray-400">{c.term} · {c.day_time || '時間外'}</div>
                </div>
                <div className="text-xs font-semibold text-gray-600 ml-2 flex-shrink-0">{c.credits}単位</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
