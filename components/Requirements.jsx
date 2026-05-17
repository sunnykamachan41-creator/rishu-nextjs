'use client'
import { useState, useMemo } from 'react'

const TARGET_LABELS = {
  CA: '教養科目', CH: '健康・体育', CL: '言語科目',
  EC: '教育創生', EP: '実習', SA: '選択A',
  SE: 'SE', SZ: 'SZ', EB: '教育基礎理解', EM: '道徳・総合',
  SP: '研究', ST: '各教科指導法', S: '専門',
  HIENG: '中高英語', KINDER: '幼稚園',
}

const TARGET_ORDER = ['CA','CH','CL','EC','EP','SA','S','HIENG','EB','EM','SP','ST','SE','SZ','KINDER']

const CONDITION_LABEL = {
  FIXED: '必修', MIN: '最低単位', SUM: '合算', SELECT_ONE: '1科目',
  OPTIONAL: '選択', NON_COUNT: '参照',
}

const ALL_DEGREE_KEYS = ['COMMON', 'ELE', 'HIENG', 'KIND', 'LIB']

// ── ユーティリティ ─────────────────────────────────────────────────────────────

function getCourseId(c) {
  return c.course_id || c.class_id?.replace(/-\d+$/, '') || c.class_id || ''
}

/**
 * 要件の「表示用ステータス」と「表示用不足単位」を計算する。
 *
 * FIXED 要件はサーバーが常に status:'info' を返すため、
 * earned_units vs fixed_units で充足を独自判定して赤/緑表示に使う。
 *
 * @returns {{ status: 'ok'|'short'|'info'|'optional', shortage: number }}
 */
function getDisplayStatus(req) {
  const earned = Number(req.earned_units) || 0

  if (req.condition_type === 'FIXED') {
    const need = Number(req.fixed_units) || 0
    if (need === 0) {
      // fixed_units 未設定: 単位が認定/履修済みなら達成、なければ中立
      return { status: earned > 0 ? 'ok' : 'info', shortage: 0 }
    }
    const shortage = Math.max(0, need - earned)
    return { status: shortage === 0 ? 'ok' : 'short', shortage }
  }

  // FIXED 以外はサーバー値をそのまま使う
  return { status: req.status, shortage: Number(req.shortage) || 0 }
}

// ── Requirements（メイン） ────────────────────────────────────────────────────

export default function Requirements({
  requirements,
  courses          = [],
  selectedIds      = [],   // 後方互換のため保持
  completedCourses = [],   // COURSEID 単位・重複排除済み（useCreditSummary から）
  exemptions       = [],   // 単位認定データ
  activeDegrees,
  onToggleDegree,
  degreeLabels,
  fixedDegrees,
}) {
  const [expanded,  setExpanded]  = useState({})
  const [detailReq, setDetailReq] = useState(null)

  // courseId → カタログコース のマップ（単位認定科目の名称参照用）
  const courseIdMap = useMemo(() => {
    const map = new Map()
    for (const c of courses) {
      const cid = getCourseId(c)
      if (cid && !map.has(cid)) map.set(cid, c)
    }
    return map
  }, [courses])

  const grouped = TARGET_ORDER.reduce((acc, key) => {
    const reqs = requirements.filter(r => r.target_type === key)
    if (reqs.length) acc[key] = reqs
    return acc
  }, {})

  // 達成カウント（FIXED の充足判定も含む）
  const okCount = requirements.filter(r => {
    const { status } = getDisplayStatus(r)
    return status === 'ok' || status === 'info' || status === 'optional'
  }).length
  const total = requirements.length

  /**
   * 要件に対応する「取得済み科目」を返す（COURSEID 単位・enrollment + exemption 統合）
   *
   * @returns {{ courseId, name, credits, term, source:'enrolled'|'exemption', exemptionLabel? }[]}
   */
  function matchedItems(req) {
    const groups = req.source_groups
      ? String(req.source_groups).split(';').map(s => s.trim()).filter(Boolean)
      : []
    if (groups.length === 0) return []

    const items         = []
    const seenCourseIds = new Set()

    // ① 通常履修（COURSEID 単位・重複排除済みの completedCourses を使用）
    for (const cc of completedCourses) {
      if (!cc.tags || !groups.some(g => cc.tags.includes(g))) continue
      if (seenCourseIds.has(cc.courseId)) continue
      seenCourseIds.add(cc.courseId)
      items.push({
        courseId: cc.courseId,
        name:     cc.name,
        credits:  cc.credits,
        term:     cc.term ?? null,
        source:   'enrolled',
      })
    }

    // ② 単位認定（appliedCourseIds をカタログ参照）
    for (const ex of exemptions) {
      const hasMatch = Object.keys(ex.categoryCredits).some(cat => groups.includes(cat))
      if (!hasMatch) continue
      for (const cid of ex.appliedCourseIds) {
        if (seenCourseIds.has(cid)) continue
        const course = courseIdMap.get(cid)
        if (!course) continue
        const tags = String(course.tags || '').split('|').map(t => t.trim()).filter(Boolean)
        if (!groups.some(g => tags.includes(g))) continue
        seenCourseIds.add(cid)
        items.push({
          courseId:       cid,
          name:           course.course_name,
          credits:        Number(course.credits) || 0,
          term:           course.term ?? null,
          source:         'exemption',
          exemptionLabel: ex.label,
        })
      }
    }

    return items
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── ヘッダー：達成状況 ── */}
      <div className="bg-white px-4 pt-3 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-sm font-semibold text-gray-700">卒業要件 達成状況</div>
          <div className="text-sm font-bold text-blue-600">{okCount} / {total}</div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${total ? (okCount / total) * 100 : 0}%` }}
          />
        </div>
        <div className="text-xs text-gray-400">※ 必修・参照・選択は「達成」としてカウント</div>
      </div>

      {/* ── 資格セレクタ ── */}
      <div className="bg-white px-4 py-2 border-b border-gray-100 flex items-center gap-2">
        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">対象資格</span>
        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {ALL_DEGREE_KEYS.map(key => {
            const isFixed  = fixedDegrees.has(key)
            const isActive = activeDegrees.has(key)
            const label    = degreeLabels[key] || key
            return (
              <button
                key={key}
                onClick={() => !isFixed && onToggleDegree(key)}
                disabled={isFixed}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full whitespace-nowrap border transition-colors ${
                  isActive
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-100 text-gray-400 border-gray-100'
                } ${isFixed ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
              >
                {isActive && isFixed && '✓ '}{label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 要件一覧 ── */}
      <div className="flex-1 overflow-auto px-3 pb-4 pt-2">
        {Object.entries(grouped).map(([targetType, reqs]) => {
          const isExpanded = expanded[targetType]
          // FIXED の充足判定も含めて不足件数をカウント
          const shortCount = reqs.filter(r => getDisplayStatus(r).status === 'short').length
          return (
            <div key={targetType} className="mb-2 bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3.5"
                onClick={() => setExpanded(e => ({ ...e, [targetType]: !e[targetType] }))}>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${shortCount ? 'bg-red-400' : 'bg-green-400'}`} />
                  <span className="text-sm font-semibold text-gray-800">{TARGET_LABELS[targetType] || targetType}</span>
                  {shortCount > 0 && (
                    <span className="text-xs text-red-500 font-medium">{shortCount}件不足</span>
                  )}
                </div>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-50 divide-y divide-gray-50">
                  {reqs.map(req => (
                    <ReqRow
                      key={req.requirement_id}
                      req={req}
                      matched={matchedItems(req)}
                      onDetail={() => setDetailReq(req)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {Object.keys(grouped).length === 0 && (
          <div className="text-center text-gray-400 py-12 text-sm">対象の要件がありません</div>
        )}
      </div>

      {/* ── 取得済み科目 詳細ボトムシート ── */}
      {detailReq && (
        <CourseDetailSheet
          req={detailReq}
          matched={matchedItems(detailReq)}
          onClose={() => setDetailReq(null)}
        />
      )}
    </div>
  )
}

// ── ReqRow ────────────────────────────────────────────────────────────────────

function ReqRow({ req, matched, onDetail }) {
  const need   = req.condition_type === 'FIXED' ? Number(req.fixed_units) : (Number(req.min_units) || 0)
  const earned = Number(req.earned_units) || 0
  const pct    = need > 0 ? Math.min(100, (earned / need) * 100) : 100

  const { status: displayStatus, shortage: displayShortage } = getDisplayStatus(req)

  const cfg = {
    ok:       { bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700', bar: 'bg-green-400', label: '達成' },
    short:    { bg: 'bg-red-50',    badge: 'bg-red-100 text-red-600',     bar: 'bg-red-400',   label: '不足' },
    info:     { bg: 'bg-gray-50',   badge: 'bg-gray-100 text-gray-500',   bar: 'bg-gray-300',  label: CONDITION_LABEL[req.condition_type] || '—' },
    optional: { bg: 'bg-blue-50',   badge: 'bg-blue-100 text-blue-600',   bar: 'bg-blue-300',  label: '選択' },
  }[displayStatus] || { bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-500', bar: 'bg-gray-300', label: '—' }

  return (
    <div className={`px-4 py-3 ${cfg.bg}`}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        {/* 要件名 + バッジ */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate">{req.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>{cfg.label}</span>
        </div>

        {/* 単位数 + 詳細ボタン */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(need > 0 || earned > 0) && (
            <span className="text-sm font-semibold text-gray-700">
              {need > 0 ? <>{earned} / {need}</> : earned}
              <span className="text-xs font-normal text-gray-400">単位</span>
            </span>
          )}
          <button
            onClick={onDetail}
            className="flex items-center gap-0.5 text-xs text-blue-500 font-medium
                       bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors
                       flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {matched.length > 0 ? matched.length : '0'}科目
          </button>
        </div>
      </div>

      {need > 0 && (
        <div className="h-1.5 bg-white rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {need === 0 && earned > 0 && (
        <div className="h-1.5 bg-white rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`} style={{ width: '100%' }} />
        </div>
      )}
      {req.note && <div className="text-xs text-gray-400 mt-1">{req.note}</div>}
      {displayStatus === 'short' && displayShortage > 0 && (
        <div className="text-xs text-red-500 mt-1">あと {displayShortage} 単位必要</div>
      )}
    </div>
  )
}

// ── CourseDetailSheet ─────────────────────────────────────────────────────────

function CourseDetailSheet({ req, matched, onClose }) {
  const need   = req.condition_type === 'FIXED' ? Number(req.fixed_units) : (Number(req.min_units) || 0)
  const earned = Number(req.earned_units) || 0

  const { status: displayStatus, shortage: displayShortage } = getDisplayStatus(req)

  const statusCfg = {
    ok:       { badge: 'bg-green-100 text-green-700', label: '達成' },
    short:    { badge: 'bg-red-100 text-red-600',     label: '不足' },
    info:     { badge: 'bg-gray-100 text-gray-500',   label: CONDITION_LABEL[req.condition_type] || '—' },
    optional: { badge: 'bg-blue-100 text-blue-600',   label: '選択' },
  }[displayStatus] || { badge: 'bg-gray-100 text-gray-500', label: '—' }

  const enrolledCount  = matched.filter(i => i.source === 'enrolled').length
  const exemptionCount = matched.filter(i => i.source === 'exemption').length

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative w-full bg-white rounded-t-3xl flex flex-col"
        style={{ maxHeight: '80dvh' }}>

        {/* ヘッダー */}
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-gray-900">{req.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusCfg.badge}`}>
                  {statusCfg.label}
                </span>
              </div>
              {(need > 0 || earned > 0) && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {need > 0 ? `${earned} / ${need} 単位` : `${earned} 単位`}
                  {displayStatus === 'short' && displayShortage > 0 && (
                    <span className="text-red-400 ml-1">（あと {displayShortage} 単位）</span>
                  )}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 text-xl leading-none p-1 flex-shrink-0">×</button>
          </div>
        </div>

        {/* 科目一覧 */}
        <div className="flex-1 overflow-auto px-3 py-2">
          {matched.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-2xl mb-2">📭</div>
              <div className="text-sm">この要件に対応する取得済み科目がありません</div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {matched.map(item => (
                <div key={item.courseId}
                  className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {item.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {item.term && (
                        <span className="text-xs text-gray-400">{item.term}</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        item.source === 'exemption'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-green-100 text-green-600'
                      }`}>
                        {item.source === 'exemption' ? '単位認定' : '履修済'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-500 flex-shrink-0">
                    {item.credits}単位
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-100">
          <div className="text-xs text-gray-400 text-center mb-3">
            取得済み {matched.length} 科目 · {earned} 単位
            {exemptionCount > 0 && (
              <span className="ml-1.5 text-blue-400">
                （履修 {enrolledCount} · 単位認定 {exemptionCount}）
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gray-100 text-sm text-gray-700 font-semibold">
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
