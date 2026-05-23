'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSwipeDown } from '@/lib/useSwipeDown'
import CourseModal from './CourseModal'
import { isCourseEligible } from '@/lib/eligibility'
import { CLASSROOM_GROUPS } from '@/lib/support'

// ── 定数 ──────────────────────────────────────────────────────────────────────

const DAY_LBL = { MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金' }

/**
 * DBの term 文字列 → ターム番号（整数）
 * これに含まれる授業のみがターム制として扱われる。
 * それ以外（春学期・秋学期・通年 など）は通常授業（term = null）。
 */
const TERM_STR_TO_NUM = {
  '第1ターム': 1,
  '第2ターム': 2,
  '第3ターム': 3,
  '第4ターム': 4,
}

const TERM_NUM_TO_STR = {
  1: '第1ターム',
  2: '第2ターム',
  3: '第3ターム',
  4: '第4ターム',
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

function filterBySlot(courses, day, period) {
  return courses.filter(c => {
    const t = c.normalized_time
    if (!t || t === 'EXTRA' || t === '0') return false
    return String(t).split('|').some(slot => {
      const m = slot.trim().match(/^(MON|TUE|WED|THU|FRI)_(\d)$/)
      return m && m[1] === day && +m[2] === period
    })
  })
}

/**
 * 学年・学期の両条件を満たすコースだけを残す。
 * isCourseEligible は lib/eligibility の共通関数（CourseList・API と同一ルール）。
 */
function filterEligible(courses, grade, semester) {
  return courses.filter(c => isCourseEligible(c, grade, semester))
}

/**
 * 開講年度でフィルタ。
 *
 * - academicYear が null → 全件通す
 * - カタログに academicYear と一致するコースが 1 件以上ある → 一致 + 年度未設定を返す
 * - 一致するコースが 0 件（カタログが別年度のみ）→ 全件通す
 *   （古いカタログでも登録できるようにするため）
 */
function filterByAcademicYear(courses, academicYear) {
  if (academicYear == null) return courses
  const hasExactMatch = courses.some(c => c.academic_year === academicYear)
  if (!hasExactMatch) return courses   // 年度不一致 → 全件フォールバック
  return courses.filter(c => c.academic_year == null || c.academic_year === academicYear)
}

/** コースがターム制かどうか */
function isTermCourse(course) {
  return course.term in TERM_STR_TO_NUM
}

// ── AddCourseModal ────────────────────────────────────────────────────────────

/**
 * 授業追加ボトムシート。
 *
 * ターム判定はすべて DB の course.term フィールドで自動決定。
 * ユーザーが手動でタームを選ぶ UI は持たない。
 *
 * @param {object}       props
 * @param {string}       props.day
 * @param {number}       props.period
 * @param {number|null}  props.lockedTerm
 *   - null   : 空セルクリック → 通常授業・ターム授業を全表示
 *   - 1〜4  : 空ハーフクリック → そのターム番号の授業のみ表示
 * @param {'spring'|'fall'} props.semester
 * @param {number}       props.academicYear
 * @param {object[]}     props.courses         - カタログ（Google Sheets）
 * @param {object[]}     props.existingEntries - 現在の履修エントリ
 * @param {(data)=>void} props.onAdd
 * @param {()=>void}     props.onClose
 */
export default function AddCourseModal({
  day, period, lockedTerm, semester,
  academicYear, grade, displayGrade, courses, existingEntries,
  onAdd, onClose,
}) {
  const router = useRouter()
  const { sheetRef, handleProps } = useSwipeDown(onClose)

  const [query,              setQuery]             = useState('')
  const [customTitle,        setCustomTitle]       = useState('')
  const [customClassroom,    setCustomClassroom]   = useState('')
  const [customMode,         setCustomMode]        = useState(false)
  const [preview,            setPreview]           = useState(null)
  const [prioritizeGrade,    setPrioritizeGrade]   = useState(true)
  // ④ 授業申請ショートカット
  const [showCourseReqWarn,  setShowCourseReqWarn] = useState(false)

  // ── コース絞り込み ────────────────────────────────────────────────────────

  /** 学年・学期・スロット・開講年度で絞ったコース（登録可能候補のみ） */
  const slotCourses = useMemo(
    () => filterBySlot(filterByAcademicYear(filterEligible(courses, grade, semester), academicYear), day, period),
    [courses, grade, semester, day, period, academicYear]
  )

  /**
   * lockedTerm に応じてさらに絞る:
   *   null    → 全コース表示（通常 + 全ターム混在）
   *   1〜4  → そのタームのコースのみ
   */
  const termFilteredCourses = useMemo(() => {
    if (lockedTerm == null) return slotCourses
    const termStr = TERM_NUM_TO_STR[lockedTerm]
    return slotCourses.filter(c => c.term === termStr)
  }, [slotCourses, lockedTerm])

  /** 検索クエリで絞り、学年優先ソートを適用 */
  const filtered = useMemo(() => {
    // 授業名なしは除外
    const named = termFilteredCourses.filter(c => c.course_name?.trim())

    const q = query.toLowerCase()
    const searched = q
      ? named.filter(c =>
          c.course_name?.toLowerCase().includes(q) ||
          c.intructor?.toLowerCase().includes(q)
        )
      : named

    if (!prioritizeGrade) return searched
    // 表示学年（displayGrade）に一致する year の授業を優先（休学補正済み）
    const sortGrade = displayGrade ?? grade
    return [...searched].sort((a, b) => {
      const aMatch = String(a.year) === String(sortGrade) ? 0 : 1
      const bMatch = String(b.year) === String(sortGrade) ? 0 : 1
      return aMatch - bMatch
    })
  }, [termFilteredCourses, query, grade, displayGrade, prioritizeGrade])

  // ── ハンドラ ────────────────────────────────────────────────────────────────

  function handleSelectCourse(c) {
    /**
     * term の決定ルール:
     *   DB の c.term が '第NターM' → TERM_STR_TO_NUM で数値化（ターム制）
     *   それ以外（春学期・通年など）→ null（通常授業）
     *
     *   lockedTerm が設定されている場合（ハーフクリック）:
     *     カタログから自動推定された term を使う（通常は lockedTerm と一致）
     */
    const catalogTerm = TERM_STR_TO_NUM[c.term] ?? null

    onAdd({
      day,
      period,
      term:        catalogTerm,       // null=通常授業 / 1〜4=ターム制
      courseTitle: c.course_name,
      room:        c.room ?? '',      // 教室をエントリに含める
      classId:     c.class_id,
    })
  }

  function handleCustomAdd() {
    const title = customTitle.trim()
    if (!title) return
    onAdd({
      day,
      period,
      term:        lockedTerm ?? null,
      courseTitle: title,
      room:        customClassroom || '',
      classId:     null,
    })
    setCustomClassroom('')
  }

  // ── 表示用ラベル ────────────────────────────────────────────────────────────

  const semLabel = semester === 'spring' ? '春学期' : '秋学期'
  const [oddT, evnT] = semester === 'spring' ? [1, 2] : [3, 4]

  const lockedLabel = lockedTerm != null ? TERM_NUM_TO_STR[lockedTerm] : null

  // ── レンダリング ────────────────────────────────────────────────────────────
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* ボトムシート */}
      <div ref={sheetRef} {...handleProps} className="relative w-full bg-white dark:bg-[#1f2235] rounded-t-3xl flex flex-col"
        style={{ maxHeight: '80dvh' }}>

        {/* ── ハンドル + ヘッダー ──────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mb-3" />

          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-bold text-gray-900 dark:text-slate-100">授業を追加</div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                {DAY_LBL[day]}曜 {period}限 · {grade}年生{semLabel}
                {lockedLabel && (
                  <span className={`ml-1.5 font-semibold ${
                    lockedTerm % 2 === 1 ? 'text-blue-500' : 'text-violet-500'
                  }`}>
                    {lockedLabel}
                  </span>
                )}
              </div>

              {/* 空セルクリック時の説明 */}
              {lockedTerm == null && (
                <div className="text-xs text-gray-300 dark:text-slate-600 mt-1">
                  通常授業はセル全体・ターム授業は自動で上下分割されます
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setPrioritizeGrade(v => !v)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  prioritizeGrade
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-100 dark:bg-[#252839] text-gray-500 dark:text-slate-400 border-gray-200 dark:border-white/[0.07]'
                }`}
                title="標準受講学年の授業を優先表示"
              >
                {grade}年優先
              </button>
              <button onClick={onClose} className="text-gray-400 dark:text-slate-500 text-xl leading-none p-1">×</button>
            </div>
          </div>
        </div>

        {/* ── 検索バー ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 py-2 border-b border-gray-50 dark:border-white/[0.07]">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="授業名・担当者で検索"
              autoFocus
              className="w-full bg-gray-50 dark:bg-[#252839] rounded-xl pl-9 pr-8 py-2 text-sm
                         border border-gray-100 dark:border-white/[0.07]
                         text-gray-800 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500
                         focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 text-xs">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── コース一覧 ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto px-3 py-2">

          {/* ⑤ 私用・ゼミ追加ボタン（一覧最上部） */}
          <button
            onClick={() => { setCustomMode(true); setQuery('') }}
            className="w-full flex items-center justify-center gap-1.5 mb-3 py-2 rounded-xl
                       bg-gray-50 dark:bg-[#252839] border border-dashed border-gray-200 dark:border-white/[0.1]
                       text-xs font-medium text-gray-500 dark:text-slate-400
                       hover:border-indigo-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            <span className="text-base leading-none">＋</span>
            私用・ゼミ・補講などを追加
          </button>

          {/* 空状態 */}
          {filtered.length === 0 && !query && (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              <div className="text-2xl mb-2">📭</div>
              <div className="text-sm">
                {lockedLabel
                  ? `${lockedLabel}の授業がこの時間枠にありません`
                  : 'この時間枠の授業がカタログにありません'}
              </div>
              <div className="text-xs mt-1 text-gray-300 dark:text-slate-600">手動入力で追加できます</div>
            </div>
          )}
          {filtered.length === 0 && query && (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-slate-500">
              「{query}」に一致する授業が見つかりません
            </div>
          )}

          {/* コースリスト */}
          {filtered.map(c => {
            const termNum  = TERM_STR_TO_NUM[c.term] ?? null
            const isTerm   = termNum != null
            const isOdd    = isTerm && termNum % 2 === 1

            return (
              <button key={`${c.class_id}|${c.academic_year ?? ''}`}
                onClick={() => setPreview(c)}
                className="w-full text-left rounded-xl px-3 py-2.5 mb-1.5 border
                           bg-gray-50 dark:bg-[#252839] border-gray-100 dark:border-white/[0.07]
                           hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:border-blue-200 dark:hover:border-blue-500/30
                           active:scale-[0.99] transition-all"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    {/* 授業名 */}
                    <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                      {c.course_name}
                    </div>
                    {/* 備考 */}
                    {c.note && (
                      <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 truncate opacity-80">📝 {c.note}</div>
                    )}
                    {/* メタ情報 */}
                    <div className="flex items-center gap-1.5 mt.0.5 flex-wrap">
                      {/* ターム or 通常バッジ */}
                      {isTerm ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          isOdd
                            ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300'
                            : 'bg-violet-50 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300'
                        }`}>
                          {c.term}
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium
                                         bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 dark:text-indigo-300">
                          通常授業
                        </span>
                      )}
                      {/* 教室 */}
                      {c.room && (
                        <span className="text-xs text-gray-400 dark:text-slate-500 truncate">{c.room}</span>
                      )}
                      {/* 担当者 */}
                      {c.intructor && (
                        <span className="text-xs text-gray-400 dark:text-slate-500 truncate">{c.intructor}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-blue-400 flex-shrink-0 font-medium">追加</span>
                </div>
              </button>
            )
          })}

          {/* ── 手動入力（私用・ゼミ・補講など） ────────────────────────── */}
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
            {customMode ? (
              <div className="space-y-2">
                {/* 授業名 */}
                <div className="flex gap-2">
                  <input
                    type="text" value={customTitle}
                    onChange={e => setCustomTitle(e.target.value)}
                    placeholder="名前を入力（ゼミ・研究室・補講 等）"
                    onKeyDown={e => e.key === 'Enter' && handleCustomAdd()}
                    className="flex-1 bg-gray-50 dark:bg-[#252839] rounded-xl px-3 py-2 text-sm
                               border border-gray-100 dark:border-white/[0.07]
                               text-gray-800 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500
                               focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button onClick={() => { setCustomMode(false); setCustomTitle(''); setCustomClassroom('') }}
                    className="text-gray-400 dark:text-slate-500 px-2 text-sm flex-shrink-0">✕</button>
                </div>

                {/* 教室（任意） */}
                <div className="relative">
                  <select
                    value={customClassroom}
                    onChange={e => setCustomClassroom(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-[#252839] rounded-xl px-3 py-2 text-sm
                               border border-gray-100 dark:border-white/[0.07]
                               text-gray-600 dark:text-slate-300
                               focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none pr-7"
                  >
                    <option value="">教室（任意）</option>
                    {Object.entries(CLASSROOM_GROUPS).map(([building, rooms]) => (
                      <optgroup key={building} label={building}>
                        {rooms.map(r => <option key={r} value={r}>{r}</option>)}
                      </optgroup>
                    ))}
                    <option value="その他">その他</option>
                  </select>
                  <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                <button
                  onClick={handleCustomAdd}
                  disabled={!customTitle.trim()}
                  className="w-full bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-slate-700
                             disabled:text-gray-400 dark:disabled:text-slate-500
                             text-white px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
                >
                  追加
                </button>
              </div>
            ) : (
              <button onClick={() => setCustomMode(true)}
                className="w-full text-center text-xs text-blue-500 font-medium py-2
                           hover:text-blue-600 transition-colors">
                ＋ 手動で授業名を入力
              </button>
            )}
          </div>

          {/* ④ 授業登録申請ショートカット */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.07]">
            {showCourseReqWarn ? (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30
                              rounded-xl px-3 py-3 space-y-2.5">
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  ※ 大学で正式に開講されている、単位を伴う授業のみ登録可能です。
                  アルバイト・私用予定・ゼミ・サークル等は登録できません。
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { onClose(); router.push('/support') }}
                    className="flex-1 bg-indigo-500 text-white rounded-xl text-xs font-bold py-2"
                  >
                    申請ページへ進む
                  </button>
                  <button
                    onClick={() => setShowCourseReqWarn(false)}
                    className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500 rounded-xl
                               hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    戻る
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCourseReqWarn(true)}
                className="w-full text-center py-2 text-xs text-gray-400 dark:text-slate-500"
              >
                🔍 見つかりませんか？{' '}
                <span className="text-indigo-400 dark:text-indigo-500 font-semibold">
                  授業の登録を申請する
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* ── 授業詳細プレビュー（CourseModal） ──────────────────────────────── */}
    {preview && (
      <CourseModal
        course={preview}
        isSelected={false}
        isConflict={false}
        toggling={false}
        onToggle={() => { handleSelectCourse(preview); setPreview(null) }}
        onClose={() => setPreview(null)}
        enrollStatus={undefined}
        enrollmentVersion="legacy"
      />
    )}
  </>
  )
}
