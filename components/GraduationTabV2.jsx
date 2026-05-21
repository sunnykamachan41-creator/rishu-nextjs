'use client'
import { useState, useCallback } from 'react'
import useSWR from 'swr'

// ── SWR fetcher ───────────────────────────────────────────────────────────────

const fetcher = (url) =>
  fetch(url).then(r => r.json().then(d => {
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
    return d
  }))

// ── GraduationTabV2 ───────────────────────────────────────────────────────────

/**
 * 卒業要件タブ。
 * モード ① 卒業要件 / ② 副免許・資格 を切り替えて表示する。
 *
 * Props:
 *   studentId           : string — URL params から取得した確定済み student_id
 *   includeProjected?   : boolean — 履修予定を含むモード
 *   onToggleProjected?  : () => void
 *   includeTemporary?   : boolean — 仮登録を含むモード
 *   onToggleTemporary?  : () => void
 *   needsRecalc?        : boolean — 保存後に再集計が必要な場合 true
 *   onRecalculate?      : () => void — 再集計実行コールバック
 *   recalcBusy?         : boolean — 再集計中
 *   recalcError?        : string | null — 再集計エラーメッセージ
 */
export default function GraduationTabV2({
  studentId,
  includeProjected = false,
  onToggleProjected,
  includeTemporary = false,
  onToggleTemporary,
  needsRecalc   = false,
  onRecalculate = null,
  recalcBusy    = false,
  recalcError   = null,
}) {
  const [mode, setMode] = useState('graduation') // 'graduation' | 'license'

  return (
    <div className="h-full flex flex-col">
      {/* 再集計バナー */}
      <RecalcBanner
        needsRecalc={needsRecalc}
        onRecalculate={onRecalculate}
        recalcBusy={recalcBusy}
        recalcError={recalcError}
      />
      {(onToggleProjected || onToggleTemporary) && (
        <ProjectedToggle
          active={includeProjected}
          onToggle={onToggleProjected}
          activeTemporary={includeTemporary}
          onToggleTemporary={onToggleTemporary}
        />
      )}
      <ModeBar mode={mode} onChange={setMode} />
      {mode === 'graduation' && (
        <GraduationContent
          studentId={studentId}
          includeProjected={includeProjected}
          includeTemporary={includeTemporary}
        />
      )}
      {mode === 'license' && (
        <LicenseContent
          studentId={studentId}
          includeProjected={includeProjected}
          includeTemporary={includeTemporary}
        />
      )}
    </div>
  )
}

// ── RecalcBanner ──────────────────────────────────────────────────────────────

function RecalcBanner({ needsRecalc, onRecalculate, recalcBusy, recalcError }) {
  if (!needsRecalc && !recalcError) return null
  return (
    <div className="flex-shrink-0 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-100 dark:border-blue-500/20 px-4 py-2.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        {recalcError ? (
          <p className="text-xs font-medium text-red-500 truncate">再集計エラー: {recalcError}</p>
        ) : (
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
            保存した履修データを反映するには再集計してください
          </p>
        )}
      </div>
      {onRecalculate && (
        <button
          onClick={onRecalculate}
          disabled={recalcBusy}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold
                     bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg
                     disabled:opacity-50 transition-colors"
        >
          {recalcBusy ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              集計中…
            </>
          ) : '履修データを再集計'}
        </button>
      )}
    </div>
  )
}

// ── ModeBar ───────────────────────────────────────────────────────────────────

function ModeBar({ mode, onChange }) {
  return (
    <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-3 py-2">
      <div className="flex gap-1 bg-gray-100 dark:bg-[#252839] rounded-xl p-1">
        {[
          { id: 'graduation', label: '① 卒業要件' },
          { id: 'license',    label: '② 副免許・資格' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all ${
              mode === item.id
                ? 'bg-white dark:bg-[#1a1d27] text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-none'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── GraduationContent ─────────────────────────────────────────────────────────

function GraduationContent({ studentId, includeProjected, includeTemporary }) {
  const swrParams = new URLSearchParams()
  if (includeProjected) swrParams.set('include_projected', '1')
  if (includeTemporary) swrParams.set('include_temporary', '1')
  const swrParamStr = swrParams.toString()
  const swrKey = `/api/graduation/ui${swrParamStr ? `?${swrParamStr}` : ''}`

  const { data, isLoading, error, mutate } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
  })

  if (isLoading) return <LoadingState />
  if (error)     return <ErrorState message={error.message} onRetry={() => mutate()} />
  if (!data?.ok) return <ErrorState message={data?.error ?? 'Unknown error'} onRetry={() => mutate()} />

  const { items = [], groups = [] } = data

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="text-3xl">📋</div>
        <div className="text-sm font-semibold text-gray-400">
          graduation_ui シートが未設定です
        </div>
        <div className="text-xs text-gray-300 leading-relaxed">
          Google Sheets の graduation_ui シートに<br />
          表示項目を追加してください
        </div>
      </div>
    )
  }

  const byGroup = {}
  for (const item of items) {
    const g = item.ui_group || '未分類'
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push(item)
  }

  const FREE_GROUP    = '自由選択'
  const orderedGroups = [
    ...groups.filter(g => g !== FREE_GROUP),
    ...groups.filter(g => g === FREE_GROUP),
  ]

  const requiredItems = items.filter(i => i.required)
  const passedItems   = requiredItems.filter(i => i.pass === true)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── 全体サマリー ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-4 pt-4 pb-5">
        {/* 上行: ラベル + パーセント */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-400 dark:text-slate-500">卒業要件 達成状況</span>
          <span className={`text-sm font-bold tabular-nums ${
            passedItems.length === requiredItems.length && requiredItems.length > 0
              ? 'text-green-500' : 'text-gray-500 dark:text-slate-400'
          }`}>
            {requiredItems.length > 0
              ? Math.round((passedItems.length / requiredItems.length) * 100)
              : 0}%
          </span>
        </div>

        {/* 全幅プログレスバー */}
        <div className="h-3 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              passedItems.length === requiredItems.length && requiredItems.length > 0
                ? 'bg-green-400' : 'bg-blue-400'
            }`}
            style={{
              width: requiredItems.length > 0
                ? `${(passedItems.length / requiredItems.length) * 100}%`
                : '0%',
            }}
          />
        </div>

        {/* 下行: 項目数 */}
        <div className="flex items-baseline gap-1 mt-2.5">
          <span className={`text-2xl font-bold leading-none ${
            passedItems.length === requiredItems.length && requiredItems.length > 0
              ? 'text-green-500' : 'text-gray-800 dark:text-slate-100'
          }`}>
            {passedItems.length}
          </span>
          <span className="text-sm text-gray-400 dark:text-slate-500">
            / {requiredItems.length} 項目達成
          </span>
          {passedItems.length === requiredItems.length && requiredItems.length > 0 && (
            <span className="ml-1 text-xs font-semibold text-green-500 bg-green-50 dark:bg-green-500/10 px-2 py-0.5 rounded-full">
              ✓ 完了
            </span>
          )}
        </div>
      </div>

      {/* ── グループ一覧 ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-3 py-3 pb-8 space-y-3">
        {orderedGroups.map(group => (
          <GroupSection key={group} group={group} items={byGroup[group] || []} />
        ))}
      </div>
    </div>
  )
}

// ── LicenseContent ────────────────────────────────────────────────────────────

function LicenseContent({ studentId, includeProjected, includeTemporary }) {
  const licParams = new URLSearchParams()
  if (includeProjected) licParams.set('include_projected', '1')
  if (includeTemporary) licParams.set('include_temporary', '1')
  const licParamStr = licParams.toString()
  const swrKey = `/api/additional-license${licParamStr ? `?${licParamStr}` : ''}`

  const { data, isLoading, error, mutate } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
  })

  const [toggling, setToggling] = useState(null)
  const [addOpen,  setAddOpen]  = useState(false)

  const handleToggle = useCallback(async (licenseId, currentlyActive) => {
    if (!studentId || toggling) return
    console.log('[LicenseContent] toggle:', { studentId, licenseId, currentlyActive })
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
      console.log('[LicenseContent] toggle result:', { studentId, ...json })
      await mutate()
    } catch (err) {
      console.error('[LicenseContent] toggle failed:', err)
    } finally {
      setToggling(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, toggling])

  if (isLoading) return <LoadingState />
  if (error)     return <ErrorState message={error.message} onRetry={() => mutate()} />

  const { activeLicenses = [], allLicenses = [] } = data ?? {}

  // ── 診断ログ ──────────────────────────────────────────────────────────────
  console.log('[LicenseContent] student_id:', studentId,
              '| dept:', data?.department_id,
              '| active:', activeLicenses.length,
              '| allLicenses:', allLicenses.length)
  for (const lic of activeLicenses) {
    console.log(`[LicenseContent] active: ${lic.license_id}`, {
      label:         lic.label,
      groups:        lic.groups,
      items:         lic.items?.length,
      totalRequired: lic.totalRequired,
      totalPassed:   lic.totalPassed,
      overallPass:   lic.overallPass,
      _fallback:     lic._fallback ?? false,
    })
  }

  // ピッカーに表示するライセンス: 未選択のもの全件（blocked も含む）
  const pickerLicenses = allLicenses.filter(l => !l.isSelected)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── ヘッダー ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-4 py-3
                      flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400 dark:text-slate-500 font-medium">副免許・資格</div>
          <div className="text-sm font-bold text-gray-800 dark:text-slate-100 mt-0.5">
            {activeLicenses.length > 0
              ? `${activeLicenses.length}件 登録中`
              : '登録なし'}
          </div>
        </div>
        {pickerLicenses.length > 0 && (
          <button
            onClick={() => setAddOpen(true)}
            className="text-xs font-semibold text-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 px-3 py-1.5
                       rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
          >
            ＋ 追加
          </button>
        )}
      </div>

      {/* ── アクティブな免許カード ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-3 py-3 pb-8 space-y-3">
        {activeLicenses.length === 0 ? (
          <LicenseEmptyState
            onAdd={pickerLicenses.length > 0 ? () => setAddOpen(true) : null}
          />
        ) : (
          activeLicenses.map(license => (
            <LicenseCard
              key={license.license_id}
              license={license}
              toggling={toggling === license.license_id}
              onRemove={() => handleToggle(license.license_id, true)}
            />
          ))
        )}
      </div>

      {/* ── 追加モーダル ─────────────────────────────────────────────────────── */}
      {addOpen && (
        <AddLicenseModal
          licenses={pickerLicenses}
          toggling={toggling}
          onAdd={(licenseId) => {
            handleToggle(licenseId, false)
            setAddOpen(false)
          }}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}

// ── AddLicenseModal ───────────────────────────────────────────────────────────
//
// ReEnrollModal と完全同構造:
//   外側: fixed inset-0 z-50 flex items-end justify-center
//         style={{ maxWidth: 430, margin: '0 auto', background: 'rgba(0,0,0,0.45)' }}
//   内側: bg-white rounded-t-3xl w-full
//
// 全件表示。isBlocked は disabled + 「この学科では選択できません」表示。

function AddLicenseModal({ licenses, toggling, onAdd, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', maxWidth: 430, margin: '0 auto' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1f2235] rounded-t-3xl w-full pb-10"
        onClick={e => e.stopPropagation()}
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full" />
        </div>

        {/* title */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="text-base font-bold text-gray-900 dark:text-slate-100">副免許・資格を追加</div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center
                       rounded-full bg-gray-100 dark:bg-[#252839] text-gray-500 dark:text-slate-400 text-sm"
          >
            ✕
          </button>
        </div>

        {/* license list */}
        <div className="px-5 space-y-2.5 max-h-[60vh] overflow-auto">
          {licenses.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-2xl mb-2">🎓</div>
              <div className="text-sm text-gray-400">追加できる副免許・資格はありません</div>
            </div>
          ) : (
            licenses.map(lic => (
              lic.isBlocked ? (
                // ── Blocked: 全件表示 + disabled ─────────────────────────────
                <div
                  key={lic.license_id}
                  className="w-full rounded-2xl px-4 py-3.5 border-2
                             border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-[#252839] opacity-60"
                >
                  <div className="text-sm font-semibold text-gray-400 dark:text-slate-500">{lic.label}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-600 mt-0.5">
                    この学科では選択できません
                  </div>
                </div>
              ) : (
                // ── Available ─────────────────────────────────────────────────
                <button
                  key={lic.license_id}
                  onClick={() => !toggling && onAdd(lic.license_id)}
                  disabled={!!toggling}
                  className={`w-full rounded-2xl px-4 py-3.5 text-left transition-all border-2 ${
                    toggling
                      ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-[#252839] border-gray-100 dark:border-white/[0.07]'
                      : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-500/20 active:scale-[0.99]'
                  }`}
                >
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-300">{lic.label}</div>
                </button>
              )
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── LicenseCard ───────────────────────────────────────────────────────────────

function LicenseCard({ license, toggling, onRemove }) {
  const [open, setOpen] = useState(false)

  const {
    label         = '',
    groups        = [],
    items         = [],
    totalRequired = 0,
    totalPassed   = 0,
    overallPass   = false,
  } = license

  const pct = totalRequired > 0
    ? Math.min(Math.round((totalPassed / totalRequired) * 100), 100)
    : 0

  const byGroup = {}
  for (const item of items) {
    const g = item.ui_group || ''
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push(item)
  }

  return (
    <div className="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-sm dark:shadow-none overflow-hidden">

      {/* header */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b border-gray-50 dark:border-white/[0.05]
                   active:bg-gray-50 dark:active:bg-[#252839] transition-colors cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-bold text-gray-800 dark:text-slate-100 truncate">{label}</span>
          {overallPass && (
            <span className="text-[10px] bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 font-semibold
                             px-1.5 py-0.5 rounded-full flex-shrink-0">
              ✓ 取得可
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {totalRequired > 0 && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              overallPass ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-[#252839] text-gray-500 dark:text-slate-400'
            }`}>
              {totalPassed}/{totalRequired}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0
                        ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* progress bar + remove */}
      <div className="px-4 pt-2 pb-2">
        <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              overallPass ? 'bg-green-400' : 'bg-blue-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-gray-300 dark:text-slate-600">{pct}%</span>
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            disabled={toggling}
            className="text-[10px] text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {toggling ? '解除中…' : '取得をあきらめる'}
          </button>
        </div>
      </div>

      {/* expanded: requirement breakdown */}
      {open && (
        <div className="border-t border-gray-100 dark:border-white/[0.07]">
          {items.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-gray-300 dark:text-slate-600">
              additional_license_ui に要件が登録されていません
            </div>
          ) : groups.length > 0 ? (
            groups.map(group => {
              const groupItems  = byGroup[group] || []
              const reqItems    = groupItems.filter(i => i.required)
              const passedCount = reqItems.filter(i => i.pass === true).length
              const allPassed   = reqItems.length > 0 && passedCount === reqItems.length
              return (
                <div key={group} className="border-t border-gray-50 dark:border-white/[0.05] first:border-t-0">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50/70 dark:bg-[#1f2235]/60">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-gray-600 dark:text-slate-300">{group}</span>
                      {allPassed && (
                        <span className="text-[10px] bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 font-semibold
                                         px-1 py-0.5 rounded-full">
                          ✓ 達成
                        </span>
                      )}
                    </div>
                    {reqItems.length > 0 && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        allPassed ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-gray-200 dark:bg-[#252839] text-gray-500 dark:text-slate-400'
                      }`}>
                        {passedCount}/{reqItems.length}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-white/[0.05]">
                    {groupItems.map(item => (
                      <RequirementItem
                        key={item.category || item.display_name}
                        item={item}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="divide-y divide-gray-50">
              {items.map(item => (
                <RequirementItem
                  key={item.category || item.display_name}
                  item={item}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── LicenseEmptyState ─────────────────────────────────────────────────────────

function LicenseEmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 text-center mt-16">
      <div className="text-4xl">🎓</div>
      <div className="text-sm font-semibold text-gray-400">
        副免許・資格が登録されていません
      </div>
      <div className="text-xs text-gray-300 leading-relaxed">
        「追加」から取得を目指す<br />副免許・資格を選択してください
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          className="mt-2 text-sm font-semibold text-blue-500 bg-blue-50
                     px-5 py-2.5 rounded-full hover:bg-blue-100 transition-colors"
        >
          ＋ 副免許・資格を追加
        </button>
      )}
    </div>
  )
}

// ── GroupSection ──────────────────────────────────────────────────────────────

function GroupSection({ group, items }) {
  const [open, setOpen] = useState(false)

  const requiredItems = items.filter(i => i.required)
  const passedItems   = requiredItems.filter(i => i.pass === true)
  const allPassed     = requiredItems.length > 0 && passedItems.length === requiredItems.length

  return (
    <div className="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3
                   border-b border-gray-50 dark:border-white/[0.05] active:bg-gray-50 dark:active:bg-[#252839] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800 dark:text-slate-100">{group}</span>
          {allPassed && (
            <span className="text-xs bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 font-semibold
                             px-1.5 py-0.5 rounded-full">
              ✓ 達成
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {requiredItems.length > 0 && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              allPassed
                ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400'
            }`}>
              {passedItems.length}/{requiredItems.length}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200
                        ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-50 dark:divide-white/[0.05]">
          {items.map(item => (
            <RequirementItem
              key={item.category || item.display_name}
              item={item}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG_UI = {
  COMPLETED:   { label: '取得済み',     badge: 'bg-green-100 text-green-700'   },
  IN_PROGRESS: { label: '履修中',       badge: 'bg-blue-100 text-blue-700'     },
  PLANNED:     { label: '履修予定',     badge: 'bg-gray-100 text-gray-500'     },
  FAILED:      { label: '落単（笑）',   badge: 'bg-red-100 text-red-500'       },
  AUDIT:       { label: '聴講',         badge: 'bg-amber-100 text-amber-700'   },
  RE_ENROLL:   { label: '再履修（笑）', badge: 'bg-purple-100 text-purple-700' },
}

const STATUS_DOT = {
  COMPLETED:   'bg-green-400',
  IN_PROGRESS: 'bg-blue-400',
  PLANNED:     'bg-gray-300',
  FAILED:      'bg-red-400',
  AUDIT:       'bg-amber-400',
  RE_ENROLL:   'bg-purple-400',
}

// ── RequirementItem ───────────────────────────────────────────────────────────

function RequirementItem({ item }) {
  const [expanded, setExpanded] = useState(false)

  const {
    display_name,
    required,
    required_credits,
    current_credits,
    pass,
    condition,
    courses = [],
  } = item

  const progress = required && required_credits > 0
    ? Math.min((current_credits / required_credits) * 100, 100)
    : null

  const conditionLabel = condition === '>=' || condition === '>'
    ? '以上' : condition === '=' ? '単位' : '以上'

  const hasCourses = courses.length > 0

  return (
    <div>
      <button
        onClick={() => hasCourses && setExpanded(o => !o)}
        className={`w-full px-4 py-3 text-left transition-colors
                    ${hasCourses ? 'active:bg-gray-50 dark:active:bg-[#252839]' : 'cursor-default'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {required && (
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                pass === true ? 'bg-green-400' : 'bg-red-400 dark:bg-red-400/80'
              }`} />
            )}
            <span className="text-sm text-gray-800 dark:text-slate-200 truncate leading-snug">
              {display_name}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {required ? (
              <div className="flex items-baseline gap-0.5">
                <span className={`text-base font-bold leading-none ${
                  pass === true ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                }`}>
                  {current_credits}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-500 leading-none">
                  &nbsp;/&nbsp;{required_credits}{conditionLabel}
                </span>
              </div>
            ) : (
              <span className="text-sm font-medium text-gray-400 dark:text-slate-500">
                {current_credits} 単位
              </span>
            )}
            {hasCourses && (
              <svg
                className={`w-3.5 h-3.5 text-gray-300 transition-transform duration-200 flex-shrink-0
                            ${expanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
        </div>

        {required && required_credits > 0 && (
          <div className="mt-2 h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pass === true ? 'bg-green-400' : 'bg-blue-400'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {!required && (
          <div className="mt-0.5 text-xs text-gray-300 dark:text-slate-600">自由選択</div>
        )}
      </button>

      {/* course list (expanded) */}
      {expanded && hasCourses && (
        <div className="border-t border-gray-100 dark:border-white/[0.07]">
          <div className="bg-slate-50 dark:bg-[#1f2235] px-4 pt-2 pb-1.5 space-y-0.5">
            {courses.map((course, idx) => {
              const cfg      = STATUS_CONFIG_UI[course.status] ?? { label: course.status, badge: 'bg-gray-100 text-gray-500' }
              const dotColor = STATUS_DOT[course.status] ?? 'bg-gray-300'
              return (
                <div key={course.class_id || idx} className="flex items-center gap-2.5 py-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                  <span className="flex-1 text-xs text-gray-600 dark:text-slate-300 truncate leading-snug">
                    {course.course_name || course.class_id}
                  </span>
                  <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5
                                    rounded-full leading-none opacity-80 ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  <span className="flex-shrink-0 text-xs text-gray-400 dark:text-slate-500 tabular-nums w-7 text-right">
                    {course.credits}<span className="text-[10px]">単</span>
                  </span>
                </div>
              )
            })}
          </div>
          <div className="bg-slate-50 dark:bg-[#1f2235] border-t border-slate-200 dark:border-white/[0.07] px-4 py-2
                          flex items-center justify-between">
            <span className="text-[10px] text-gray-400 dark:text-slate-500 tracking-wide">取得済み合計</span>
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
              {courses
                .filter(c => c.status === 'COMPLETED')
                .reduce((s, c) => s + c.credits, 0)}
              <span className="text-[10px] font-normal ml-0.5">単位</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ProjectedToggle ───────────────────────────────────────────────────────────

function ToggleSwitch({ active, onToggle, label, description, color = 'blue' }) {
  const colorOn = color === 'amber'
    ? 'bg-amber-500'
    : 'bg-blue-500'
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">{label}</span>
        {description && (
          <span className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{description}</span>
        )}
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                    transition-colors duration-200 focus:outline-none
                    ${active ? colorOn : 'bg-gray-200 dark:bg-slate-600'}`}
        role="switch"
        aria-checked={active}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
                      transition duration-200 ease-in-out
                      ${active ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}

function ProjectedToggle({ active, onToggle, activeTemporary, onToggleTemporary }) {
  return (
    <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-3 py-2 flex flex-col gap-2">
      {onToggle && (
        <ToggleSwitch
          active={active}
          onToggle={onToggle}
          label="履修予定を含む"
          description={active ? '履修予定・履修中を取得済みとして集計中' : '取得済みのみを集計中'}
          color="blue"
        />
      )}
      {onToggleTemporary && (
        <ToggleSwitch
          active={activeTemporary}
          onToggle={onToggleTemporary}
          label="仮登録を含む"
          description={activeTemporary ? '仮登録コースを含めて集計中' : '仮登録コースは除外中'}
          color="amber"
        />
      )}
    </div>
  )
}

// ── Loading / Error states ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col gap-3 px-3 py-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-gray-100 dark:bg-[#1f2235] rounded-2xl h-24" />
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="text-3xl">⚠️</div>
      <div className="text-sm font-semibold text-gray-500 dark:text-slate-400">データ取得エラー</div>
      {message && (
        <div className="text-xs text-gray-400 dark:text-slate-500 font-mono bg-gray-50 dark:bg-[#1f2235] px-3 py-2 rounded-lg max-w-full break-all">
          {message}
        </div>
      )}
      <button
        onClick={onRetry}
        className="text-sm text-blue-500 font-semibold px-4 py-2 rounded-xl
                   border border-blue-200 dark:border-blue-500/30 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
      >
        再試行
      </button>
    </div>
  )
}
