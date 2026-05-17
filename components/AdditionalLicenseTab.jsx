'use client'
import { useState, useCallback } from 'react'
import useSWR from 'swr'

// ── SWR fetcher ───────────────────────────────────────────────────────────────

const fetcher = url =>
  fetch(url).then(r => r.json().then(d => {
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
    return d
  }))

// ── AdditionalLicenseTab ──────────────────────────────────────────────────────

/**
 * 副免許タブ。
 *
 * データソース: /api/additional-license?student_id=xxx
 *   - availableLicenses : license_display 全件（追加候補）
 *   - activeLicenses    : additional_license_result に存在する免許（進捗付き）
 *
 * Props:
 *   studentId: string  — URL params から取得した確定済み student_id
 */
export default function AdditionalLicenseTab({ studentId }) {
  const swrKey = studentId
    ? `/api/additional-license?student_id=${studentId}`
    : '/api/additional-license'

  const { data, isLoading, error, mutate } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
  })

  const [toggling, setToggling] = useState(null)  // license_id being toggled

  // ── Toggle ON / OFF ────────────────────────────────────────────────────────
  const handleToggle = useCallback(async (licenseId, currentlyActive) => {
    if (!studentId || toggling) return
    setToggling(licenseId)
    try {
      const res = await fetch('/api/additional-license', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          license_id: licenseId,
          action:     currentlyActive ? 'remove' : 'add',
          studentId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      await mutate()   // SWR 再検証
    } catch (err) {
      console.error('[AdditionalLicenseTab] toggle failed:', err)
    } finally {
      setToggling(null)
    }
  }, [studentId, toggling, mutate])

  // ── Render states ──────────────────────────────────────────────────────────

  if (isLoading) return <LoadingState />
  if (error)     return <ErrorState message={error.message} onRetry={() => mutate()} />

  const { activeLicenses = [], availableLicenses = [] } = data ?? {}

  // Inactive = in availableLicenses but NOT in activeLicenses
  const activeIds  = new Set(activeLicenses.map(l => l.license_id))
  const inactive   = availableLicenses.filter(l => !activeIds.has(l.license_id))

  return (
    <div className="h-full flex flex-col">

      {/* ── アクティブな副免許 ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-3 py-3 pb-4 space-y-3">

        {activeLicenses.length === 0 && inactive.length === 0 && (
          <EmptyState />
        )}

        {/* Active license cards */}
        {activeLicenses.map(license => (
          <LicenseCard
            key={license.license_id}
            license={license}
            active
            toggling={toggling === license.license_id}
            onToggle={() => handleToggle(license.license_id, true)}
          />
        ))}

        {/* ── 追加できる副免許 ─────────────────────────────────────────────── */}
        {inactive.length > 0 && (
          <div className="mt-1">
            <div className="text-xs font-semibold text-gray-400 px-1 mb-2">
              追加できる副免許
            </div>
            <div className="space-y-2">
              {inactive.map(lic => (
                <div
                  key={lic.license_id}
                  className="bg-white rounded-2xl shadow-sm px-4 py-3
                             flex items-center justify-between"
                >
                  <span className="text-sm font-medium text-gray-500">{lic.label}</span>
                  <button
                    onClick={() => handleToggle(lic.license_id, false)}
                    disabled={!!toggling}
                    className="text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5
                               rounded-full hover:bg-blue-100 transition-colors
                               disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {toggling === lic.license_id ? '追加中…' : '＋ 追加'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── LicenseCard ───────────────────────────────────────────────────────────────

function LicenseCard({ license, active, toggling, onToggle }) {
  const [open, setOpen] = useState(false)

  const { license_id, label, earned_credits, required_credits, status, rules = [] } = license

  const allPass = status === 'pass'
  const pct     = required_credits > 0
    ? Math.min(Math.round((earned_credits / required_credits) * 100), 100)
    : 0

  const statusChip = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

      {/* ── Card header ────────────────────────────────────────────────────── */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b border-gray-50
                   active:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-bold text-gray-800 truncate">{label}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0
                            ${statusChip.badge}`}>
            {statusChip.label}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Credit counter */}
          <div className="flex items-baseline gap-0.5">
            <span className={`text-base font-bold leading-none ${
              allPass ? 'text-green-600' : 'text-gray-800'
            }`}>
              {earned_credits}
            </span>
            <span className="text-xs text-gray-400 leading-none">
              &nbsp;/&nbsp;{required_credits}単位
            </span>
          </div>

          {/* Chevron */}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0
                        ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-2 pb-1.5">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allPass ? 'bg-green-400' : 'bg-blue-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-gray-300">{pct}%</span>
          {/* Remove button */}
          <button
            onClick={e => { e.stopPropagation(); onToggle() }}
            disabled={toggling}
            className="text-[10px] text-gray-400 hover:text-red-400 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {toggling ? '解除中…' : '解除'}
          </button>
        </div>
      </div>

      {/* ── Per-rule breakdown (expanded) ────────────────────────────────── */}
      {open && rules.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {rules.map((rule, idx) => (
            <RuleRow key={idx} rule={rule} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── RuleRow ───────────────────────────────────────────────────────────────────

function RuleRow({ rule }) {
  const { display_category, required_credits, earned_credits, condition, note, pass } = rule

  const condLabel = condition === '>=' || condition === '>'
    ? '以上' : condition === '=' ? '単位' : '以上'

  const progress = required_credits > 0
    ? Math.min((earned_credits / required_credits) * 100, 100)
    : null

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            pass ? 'bg-green-400' : 'bg-gray-200'
          }`} />
          <span className="text-sm text-gray-700 truncate">{display_category}</span>
          {note && <span className="text-[10px] text-gray-400 truncate">{note}</span>}
        </div>
        <div className="flex items-baseline gap-0.5 flex-shrink-0">
          <span className={`text-base font-bold leading-none ${
            pass ? 'text-green-600' : 'text-gray-800'
          }`}>
            {earned_credits}
          </span>
          <span className="text-xs text-gray-400 leading-none">
            &nbsp;/&nbsp;{required_credits}{condLabel}
          </span>
        </div>
      </div>

      {progress !== null && (
        <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              pass ? 'bg-green-400' : 'bg-blue-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pass:         { label: '✓ 取得可',   badge: 'bg-green-100 text-green-600'  },
  in_progress:  { label: '履修中',     badge: 'bg-blue-100 text-blue-600'    },
  not_started:  { label: '未着手',     badge: 'bg-gray-100 text-gray-500'    },
}

// ── Loading / Error / Empty ───────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="h-full flex flex-col gap-3 px-3 py-3 animate-pulse">
      {[1, 2].map(i => (
        <div key={i} className="bg-gray-100 rounded-2xl h-24" />
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="text-3xl">⚠️</div>
      <div className="text-sm font-semibold text-gray-500">データ取得エラー</div>
      {message && (
        <div className="text-xs text-gray-400 font-mono bg-gray-50 px-3 py-2 rounded-lg max-w-full break-all">
          {message}
        </div>
      )}
      <button
        onClick={onRetry}
        className="text-sm text-blue-500 font-semibold px-4 py-2 rounded-xl
                   border border-blue-200 hover:bg-blue-50 transition-colors"
      >
        再試行
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center mt-20">
      <div className="text-3xl">🎓</div>
      <div className="text-sm font-semibold text-gray-400">副免許が設定されていません</div>
      <div className="text-xs text-gray-300 leading-relaxed">
        license_display シートに免許を追加すると<br />ここに表示されます
      </div>
    </div>
  )
}
