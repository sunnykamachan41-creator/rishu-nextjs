'use client'
import { useState, useMemo } from 'react'
import {
  EXEMPTION_DEFS,
  EXEMPTION_TYPE_ORDER,
  SECOND_LANG_OPTIONS,
  EXEMPTION_COURSE_IDS,
  SECOND_LANG_COURSE_IDS,
  addExemption,
  removeExemption,
} from '@/lib/exemptionStore'

// ── ユーティリティ ─────────────────────────────────────────────────────────────

function getCourseId(c) {
  return c.course_id || c.class_id?.replace(/-\d+$/, '') || c.class_id || ''
}

function getCourseTags(c) {
  return String(c.tags || '').split('|').map(t => t.trim()).filter(Boolean)
}

/**
 * 第二外国語コースを返す（COURSEID ベース・厳密版）。
 *
 * ルール
 *  1. SECOND_LANG_COURSE_IDS に定義された course_id のみ対象
 *  2. tags に 'CL_SEC' を持つことをガードとして確認
 *  3. 同一 course_id の複数クラスは先頭 1 件のみ採用（重複排除）
 *  4. 名前検索フォールバックは使用しない
 */
function getSecondLangCourses(courses, _langLabel, langKey) {
  const knownIds = SECOND_LANG_COURSE_IDS[langKey]
  if (!knownIds?.length) return []

  const seen = new Set()
  const result = []
  for (const c of courses) {
    const cid = getCourseId(c)
    if (!knownIds.includes(cid)) continue          // 対象外 course_id
    if (seen.has(cid))           continue          // 同一 course_id の重複クラス
    if (!getCourseTags(c).includes('CL_SEC')) continue  // CL_SEC タグのガード
    seen.add(cid)
    result.push(c)
  }
  return result
}

/**
 * 英語系カテゴリのコースを返す（COURSEID 単位・重複排除）。
 *
 * ルール
 *  1. EXEMPTION_COURSE_IDS に定義された course_id を優先
 *     定義がない場合は raw_category / tags で判定
 *  2. 同一 course_id の複数クラスは先頭 1 件のみ採用
 */
function getEnglishCatCourses(courses, cat) {
  const knownIds = EXEMPTION_COURSE_IDS[cat]
  const seen = new Set()
  const result = []
  for (const c of courses) {
    const cid     = getCourseId(c)
    const matches = knownIds?.length
      ? knownIds.includes(cid)
      : (c.raw_category === cat || getCourseTags(c).includes(cat))
    if (!matches)    continue
    if (seen.has(cid)) continue   // 同一 course_id の重複クラスを除外
    seen.add(cid)
    result.push(c)
  }
  return result
}

/**
 * 選択済みコースの categoryCredits を計算する（上限付き）。
 *
 * - CL_SECOND_LANG_SKIP: 全コース → CL_SEC に合算（上限 4）
 * - 英語系: 既知IDマッピング → raw_category の順でカテゴリ判定
 */
function computeCategoryCredits(selectedCourses, caps, exemptionType) {
  if (exemptionType === 'CL_SECOND_LANG_SKIP') {
    const total = Math.min(
      selectedCourses.reduce((s, c) => s + Number(c.credits), 0),
      caps.CL_SEC ?? 4,
    )
    return total > 0 ? { CL_SEC: total } : {}
  }

  // 英語系: コースのカテゴリを特定して集計
  const raw = {}
  for (const c of selectedCourses) {
    const cid = getCourseId(c)
    let cat = null

    // 1) 既知 ID マッピングで特定
    for (const [catKey, ids] of Object.entries(EXEMPTION_COURSE_IDS)) {
      if (ids?.includes(cid)) { cat = catKey; break }
    }
    // 2) フォールバック: raw_category
    if (!cat) cat = c.raw_category
    // 3) フォールバック: tags
    if (!cat) cat = getCourseTags(c).find(t => Object.prototype.hasOwnProperty.call(caps, t)) ?? null

    if (cat && Object.prototype.hasOwnProperty.call(caps, cat)) {
      raw[cat] = (raw[cat] || 0) + Number(c.credits)
    }
  }

  const result = {}
  for (const [cat, cap] of Object.entries(caps)) {
    const v = Math.min(raw[cat] || 0, cap)
    if (v > 0) result[cat] = v
  }
  return result
}

// ── カテゴリ表示名 ────────────────────────────────────────────────────────────

const CAT_LABELS = {
  CL_ENG_MAN: '英語必修',
  CL_ENG_OP:  '英語選択',
  CL_SEC:     '第二外国語',
}
const CAT_LABELS_FULL = {
  CL_ENG_MAN: '英語必修 (CL_ENG_MAN)',
  CL_ENG_OP:  '英語選択 (CL_ENG_OP)',
  CL_SEC:     '第二外国語 (CL_SEC)',
}

// ── ExemptionModal（メイン） ───────────────────────────────────────────────────

export default function ExemptionModal({ courses, exemptions, onExemptionsChange, onClose }) {
  const [view,         setView]         = useState('list')
  const [step,         setStep]         = useState(1)
  const [selType,      setSelType]      = useState(null)
  const [selLang,      setSelLang]      = useState(null)
  const [selCourseIds, setSelCourseIds] = useState(new Set())

  // ── handlers ─────────────────────────────────────────────────────────────

  function handleAdd() {
    if (!selType) return
    const def = EXEMPTION_DEFS[selType]

    let appliedCourses = []
    let language       = undefined
    let label          = def.label

    if (selType === 'CL_SECOND_LANG_SKIP') {
      language = selLang
      const langLabel  = SECOND_LANG_OPTIONS.find(l => l.key === selLang)?.label ?? selLang
      appliedCourses   = getSecondLangCourses(courses, langLabel, selLang)
      label            = `${def.label} (${langLabel})`
    } else {
      appliedCourses = courses.filter(c => selCourseIds.has(getCourseId(c)))
    }

    const categoryCredits = computeCategoryCredits(appliedCourses, def.caps, selType)
    const totalCredits    = Object.values(categoryCredits).reduce((s, v) => s + v, 0)
    if (totalCredits === 0) return

    onExemptionsChange(addExemption({
      exemptionType:    selType,
      language,
      appliedCourseIds: appliedCourses.map(c => getCourseId(c)),
      categoryCredits,
      label,
    }))
    resetAddFlow()
  }

  function handleRemove(id) {
    onExemptionsChange(removeExemption(id))
  }

  function resetAddFlow() {
    setView('list'); setStep(1)
    setSelType(null); setSelLang(null); setSelCourseIds(new Set())
  }

  // ── Step 2 → 3 プレビュー ─────────────────────────────────────────────────

  const previewCategoryCredits = useMemo(() => {
    if (!selType) return {}
    const def = EXEMPTION_DEFS[selType]
    if (selType === 'CL_SECOND_LANG_SKIP') {
      const langOpt = SECOND_LANG_OPTIONS.find(l => l.key === selLang)
      if (!langOpt) return {}
      const langCourses = getSecondLangCourses(courses, langOpt.label, selLang)
      return computeCategoryCredits(langCourses, def.caps, selType)
    }
    const selCourses = courses.filter(c => selCourseIds.has(getCourseId(c)))
    return computeCategoryCredits(selCourses, def.caps, selType)
  }, [selType, selLang, selCourseIds, courses])

  const canProceedStep2 = useMemo(() => {
    if (!selType) return false
    if (selType === 'CL_SECOND_LANG_SKIP') return !!selLang
    return selCourseIds.size > 0
  }, [selType, selLang, selCourseIds])

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={view === 'list' ? onClose : undefined} />
      <div className="relative w-full bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: '90dvh' }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-2.5 flex-shrink-0" />

        {view === 'list' && (
          <ListView
            exemptions={exemptions}
            onRemove={handleRemove}
            onAdd={() => { setView('add'); setStep(1) }}
            onClose={onClose}
          />
        )}
        {view === 'add' && step === 1 && (
          <Step1 selType={selType} onSelect={setSelType} onNext={() => setStep(2)} onBack={resetAddFlow} />
        )}
        {view === 'add' && step === 2 && selType && (
          <Step2
            selType={selType} courses={courses}
            selLang={selLang} onLangSelect={setSelLang}
            selCourseIds={selCourseIds} onCourseIdsChange={setSelCourseIds}
            canProceed={canProceedStep2}
            onNext={() => setStep(3)} onBack={() => setStep(1)}
          />
        )}
        {view === 'add' && step === 3 && selType && (
          <Step3
            selType={selType} selLang={selLang}
            previewCredits={previewCategoryCredits}
            onConfirm={handleAdd} onBack={() => setStep(2)}
          />
        )}
      </div>
    </div>
  )
}

// ── ListView ──────────────────────────────────────────────────────────────────

function ListView({ exemptions, onRemove, onAdd, onClose }) {
  const totalExemptionCredits = exemptions.reduce(
    (s, ex) => s + Object.values(ex.categoryCredits).reduce((a, b) => a + b, 0), 0
  )
  return (
    <>
      <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-gray-900">単位認定</div>
            {totalExemptionCredits > 0 && (
              <div className="text-xs text-blue-500 mt-0.5">合計 {totalExemptionCredits}単位 認定済み</div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none p-1">×</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2">
        {exemptions.length === 0 ? (
          <div className="text-center py-12 text-gray-300">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-sm font-medium">単位認定がありません</div>
            <div className="text-xs mt-1">外部試験等による認定を追加できます</div>
          </div>
        ) : (
          exemptions.map(ex => {
            const total = Object.values(ex.categoryCredits).reduce((s, v) => s + v, 0)
            return (
              <div key={ex.id} className="flex items-start gap-2.5 bg-blue-50 rounded-2xl px-3.5 py-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-blue-900">{ex.label}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {Object.entries(ex.categoryCredits).map(([cat, cred]) => (
                      <span key={cat}
                        className="text-xs bg-white text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">
                        {CAT_LABELS[cat] || cat}: {cred}単位
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-blue-400 mt-1.5">
                    計 {total}単位 · {new Date(ex.addedAt).toLocaleDateString('ja-JP')}
                  </div>
                </div>
                <button onClick={() => onRemove(ex.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-xl text-blue-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100">
        <button onClick={onAdd}
          className="w-full py-3 rounded-2xl bg-blue-500 text-white text-sm font-semibold">
          ＋ 単位認定を追加
        </button>
      </div>
    </>
  )
}

// ── BackButton ────────────────────────────────────────────────────────────────

function BackButton({ onClick }) {
  return (
    <button onClick={onClick} className="text-gray-400 p-1 -ml-1">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

// ── Step1 ─────────────────────────────────────────────────────────────────────

function Step1({ selType, onSelect, onNext, onBack }) {
  return (
    <>
      <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BackButton onClick={onBack} />
          <div>
            <div className="text-base font-bold text-gray-900">認定タイプを選択</div>
            <div className="text-xs text-gray-400">Step 1 / 3</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3 flex flex-col gap-2">
        {EXEMPTION_TYPE_ORDER.map(type => {
          const def      = EXEMPTION_DEFS[type]
          const selected = selType === type
          return (
            <button key={type} onClick={() => onSelect(type)}
              className={`w-full text-left rounded-2xl px-4 py-3.5 border-2 transition-all ${
                selected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                  selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                }`}>
                  {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <div className={`text-sm font-bold leading-snug ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
                    {def.label}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{def.description}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100">
        <button onClick={onNext} disabled={!selType}
          className="w-full py-3 rounded-2xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-40">
          次へ
        </button>
      </div>
    </>
  )
}

// ── Step2 ─────────────────────────────────────────────────────────────────────

function Step2({ selType, courses, selLang, onLangSelect,
                 selCourseIds, onCourseIdsChange, canProceed, onNext, onBack }) {
  const def = EXEMPTION_DEFS[selType]
  return (
    <>
      <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BackButton onClick={onBack} />
          <div>
            <div className="text-base font-bold text-gray-900">対象授業を選択</div>
            <div className="text-xs text-gray-400">Step 2 / 3 · {def.label}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3">
        {selType === 'CL_SECOND_LANG_SKIP' && (
          <SecondLangPicker courses={courses} selLang={selLang} onSelect={onLangSelect} />
        )}
        {(selType === 'CL_ENGLISH_730' || selType === 'CL_ENGLISH_600') && (
          <EnglishCoursePicker
            courses={courses}
            caps={def.caps}
            selCourseIds={selCourseIds}
            onCourseIdsChange={onCourseIdsChange}
          />
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100">
        <button onClick={onNext} disabled={!canProceed}
          className="w-full py-3 rounded-2xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-40">
          次へ
        </button>
      </div>
    </>
  )
}

// ── SecondLangPicker ──────────────────────────────────────────────────────────

function SecondLangPicker({ courses, selLang, onSelect }) {
  const { previewCourses, previewCredits } = useMemo(() => {
    if (!selLang) return { previewCourses: [], previewCredits: 0 }
    const langOpt = SECOND_LANG_OPTIONS.find(l => l.key === selLang)
    if (!langOpt) return { previewCourses: [], previewCredits: 0 }
    const list = getSecondLangCourses(courses, langOpt.label, selLang)
    return {
      previewCourses: list,
      previewCredits: list.reduce((s, c) => s + Number(c.credits), 0),
    }
  }, [courses, selLang])

  return (
    <div className="flex flex-col gap-4">
      {/* 言語選択 */}
      <div>
        <div className="text-xs font-bold text-gray-500 mb-2">言語を選択</div>
        <div className="grid grid-cols-3 gap-2">
          {SECOND_LANG_OPTIONS.map(lang => (
            <button key={lang.key} onClick={() => onSelect(lang.key)}
              className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                selLang === lang.key
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* プレビュー */}
      {selLang && previewCourses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-gray-500">認定対象（自動選択）</div>
            <div className="text-xs font-bold text-blue-500">
              {Math.min(previewCredits, 4)}単位（上限4単位）
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {previewCourses.map(c => (
              <div key={c.class_id ?? c.course_id}
                className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
                <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-medium text-blue-800 flex-1 truncate">
                  {c.course_name}
                </span>
                <span className="text-xs text-blue-500 font-bold flex-shrink-0">{c.credits}単位</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selLang && previewCourses.length === 0 && (
        <div className="text-center py-6 bg-gray-50 rounded-2xl text-gray-400">
          <div className="text-2xl mb-1">📭</div>
          <div className="text-sm">
            認定対象の授業がカタログに見つかりません
          </div>
          <div className="text-xs mt-1 text-gray-300">
            カタログデータを確認してください（CL_SEC タグ必須）
          </div>
        </div>
      )}
    </div>
  )
}

// ── EnglishCoursePicker ───────────────────────────────────────────────────────

function EnglishCoursePicker({ courses, caps, selCourseIds, onCourseIdsChange }) {
  // カテゴリ別コース（既知ID優先 → raw_category フォールバック）
  const coursesByCategory = useMemo(() => {
    const result = {}
    for (const cat of Object.keys(caps)) {
      result[cat] = getEnglishCatCourses(courses, cat)
    }
    return result
  }, [courses, caps])

  // カテゴリ別 選択済み単位
  const creditsByCategory = useMemo(() => {
    const result = {}
    for (const [cat, catCourses] of Object.entries(coursesByCategory)) {
      result[cat] = catCourses
        .filter(c => selCourseIds.has(getCourseId(c)))
        .reduce((s, c) => s + Number(c.credits), 0)
    }
    return result
  }, [coursesByCategory, selCourseIds])

  function toggleCourse(c, cat) {
    const cid     = getCourseId(c)
    const checked = selCourseIds.has(cid)
    const next    = new Set(selCourseIds)
    if (checked) {
      next.delete(cid)
    } else {
      if ((creditsByCategory[cat] || 0) + Number(c.credits) > caps[cat]) return
      next.add(cid)
    }
    onCourseIdsChange(next)
  }

  return (
    <div className="flex flex-col gap-5">
      {Object.entries(caps).map(([cat, cap]) => {
        const catCourses  = coursesByCategory[cat] || []
        const usedCredits = creditsByCategory[cat]  || 0
        const full        = usedCredits >= cap

        return (
          <div key={cat}>
            {/* カテゴリヘッダー */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-600">{CAT_LABELS[cat] || cat}</div>
              <div className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                full ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {usedCredits} / {cap}単位
              </div>
            </div>

            {catCourses.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl">
                対象授業がカタログにありません
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {catCourses.map(c => {
                  const cid         = getCourseId(c)
                  const checked     = selCourseIds.has(cid)
                  const wouldExceed = !checked && (usedCredits + Number(c.credits)) > cap

                  return (
                    <button key={c.class_id ?? cid}
                      onClick={() => !wouldExceed && toggleCourse(c, cat)}
                      disabled={wouldExceed}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border text-left transition-all ${
                        checked       ? 'bg-blue-50 border-blue-200'
                        : wouldExceed ? 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed'
                        : 'bg-gray-50 border-gray-100 hover:bg-blue-50 hover:border-blue-200 active:scale-[0.99]'
                      }`}
                    >
                      {/* チェックボックス */}
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                      }`}>
                        {checked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-medium truncate ${
                          checked ? 'text-blue-800' : 'text-gray-700'
                        }`}>
                          {c.course_name}
                        </div>
                        {c.intructor && (
                          <div className="text-xs text-gray-400 truncate">{c.intructor}</div>
                        )}
                      </div>
                      <span className={`text-xs font-bold flex-shrink-0 ${
                        checked ? 'text-blue-600' : 'text-gray-400'
                      }`}>
                        {c.credits}単位
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step3 ─────────────────────────────────────────────────────────────────────

function Step3({ selType, selLang, previewCredits, onConfirm, onBack }) {
  const def          = EXEMPTION_DEFS[selType]
  const langLabel    = selLang ? SECOND_LANG_OPTIONS.find(l => l.key === selLang)?.label : null
  const totalCredits = Object.values(previewCredits).reduce((s, v) => s + v, 0)
  const hasCredits   = totalCredits > 0

  return (
    <>
      <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BackButton onClick={onBack} />
          <div>
            <div className="text-base font-bold text-gray-900">認定内容を確認</div>
            <div className="text-xs text-gray-400">Step 3 / 3</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 flex flex-col gap-3">
        {/* サマリーカード */}
        <div className={`rounded-2xl p-4 ${hasCredits ? 'bg-blue-50' : 'bg-gray-50'}`}>
          <div className={`text-sm font-bold leading-snug ${hasCredits ? 'text-blue-900' : 'text-gray-500'}`}>
            {langLabel ? `${def.label} (${langLabel})` : def.label}
          </div>
          <div className={`text-xs mt-1 ${hasCredits ? 'text-blue-600' : 'text-gray-400'}`}>
            {hasCredits ? `${totalCredits}単位が認定されます` : '認定対象の授業が選択されていません'}
          </div>
        </div>

        {/* 内訳 */}
        {hasCredits && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">認定内訳</div>
            {Object.entries(previewCredits).map(([cat, credits]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{CAT_LABELS_FULL[cat] || cat}</span>
                <span className="text-sm font-bold text-blue-600">{credits}単位</span>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-gray-300 text-center leading-relaxed">
          ※ 実際の認定は大学事務局での審査が必要です。<br />
          このアプリはシミュレーション用途です。
        </div>
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 flex gap-2">
        <button onClick={onBack}
          className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm text-gray-600 font-semibold">
          戻る
        </button>
        <button onClick={onConfirm} disabled={!hasCredits}
          className="flex-1 py-3 rounded-2xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-40">
          認定を追加
        </button>
      </div>
    </>
  )
}
