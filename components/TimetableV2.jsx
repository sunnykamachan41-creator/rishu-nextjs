'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { loadEntries, createEntry, deleteEntry, clearEntries } from '@/lib/enrollmentStore'
import {
  getDefaultPeriodConfig,
  loadPeriodConfig,
  savePeriodConfig,
  SEMESTER_LABELS,
} from '@/lib/periodConfig'
import AddCourseModal from './AddCourseModal'
import PeriodSettingsModal from './PeriodSettingsModal'
import CourseModal from './CourseModal'
import { isCourseEligible } from '@/lib/eligibility'
import { STATUS_CONFIG } from '@/lib/enrollmentStatus'

// ── 定数 ──────────────────────────────────────────────────────────────────────

const DAYS    = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const DAY_LBL = { MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金' }

/** 学期 → [前半ターム（奇数）, 後半ターム（偶数）] */
const TERM_PAIR = { spring: [1, 2], fall: [3, 4] }

const CELL_H = 92   // 1コマのセル高さ (px)
const HALF_H = 44   // 分割時の片側高さ (px)

const TERM_TO_NUM = { '第1ターム': 1, '第2ターム': 2, '第3ターム': 3, '第4ターム': 4 }

// ── ターム別カラー ────────────────────────────────────────────────────────────

function termColor(term) {
  if (term == null) {
    return {
      bg:   'bg-indigo-100',
      bd:   'border-indigo-200',
      name: 'text-indigo-900',
      pill: 'bg-indigo-500',
      del:  'text-indigo-300 hover:text-indigo-600',
    }
  }
  if (term % 2 === 1) {
    return {
      bg:   'bg-blue-100',
      bd:   'border-blue-200',
      name: 'text-blue-900',
      pill: 'bg-blue-500',
      del:  'text-blue-300 hover:text-blue-600',
    }
  }
  return {
    bg:   'bg-violet-100',
    bd:   'border-violet-200',
    name: 'text-violet-900',
    pill: 'bg-violet-500',
    del:  'text-violet-300 hover:text-violet-600',
  }
}

// ── enrollment から catalog entries を導出する純粋関数 ────────────────────────

/**
 * selectedIds と courses カタログから時間割グリッド用エントリを導出する。
 *
 * New-schema mode（enrollmentVersion === 'new'）:
 *   enrollment の grade + semester でフィルタして学年固有の表示を実現する。
 *   year フィールドは「学年（1〜4）」として扱う（西暦年ではない）。
 *
 * Legacy mode:
 *   selectedIds にある授業を当学期で全表示（学年区別なし）。
 *
 * @param {object[]}  courses
 * @param {string[]}  selectedIds          - class_id の配列
 * @param {object[]|undefined} enrollment  - NormalizedEnrollment[]（新スキーマのみ）
 * @param {string}    enrollmentVersion    - 'new' | 'legacy'
 * @param {number}    grade                - 現在の学年（1〜4）
 * @param {string}    semester             - 'spring' | 'fall'
 * @param {string[]}  semesterTerms        - この学期に含まれる term 文字列一覧
 * @returns {Entry[]}
 */
function deriveCatalogEntries(
  courses, selectedIds, enrollment, enrollmentVersion, grade, semester, semesterTerms
) {
  if (!courses?.length || !selectedIds?.length) return []

  // 新スキーマ: この学年・学期の履修科目のみ対象にする
  let activeSet
  if (enrollmentVersion === 'new' && enrollment?.length) {
    // year フィールドは学年（1〜4）として扱う
    // null year は「学年未設定」扱いで全学年に表示（フォールバック）
    activeSet = new Set(
      enrollment
        .filter(e =>
          (e.year === grade || e.year === null) &&
          (e.semester === semester || e.semester === null)
        )
        // class_id のみ。course_id を含めると同一科目の全セクションが表示されてしまう
        .map(e => e.class_id)
    )
  } else {
    // レガシー: selectedIds を全部使う
    activeSet = new Set(selectedIds)
  }

  const result = []

  for (const c of courses) {
    // class_id のみでマッチ（course_id チェックは不要: 全セクションが表示されてしまう）
    if (!activeSet.has(c.class_id)) continue
    if (!semesterTerms.includes(c.term)) continue

    const nt = c.normalized_time
    if (!nt || nt === 'EXTRA' || nt === '0') continue   // 時間外は別セクション

    const termNum = TERM_TO_NUM[c.term] ?? null

    for (const slot of String(nt).split('|')) {
      const m = slot.trim().match(/^(MON|TUE|WED|THU|FRI)_(\d)$/)
      if (!m) continue
      result.push({
        id:          `cat_${c.class_id}_${m[1]}_${m[2]}`,
        day:         m[1],
        period:      parseInt(m[2], 10),
        term:        termNum,
        courseTitle: c.course_name,
        classId:     c.class_id,
        room:        c.room || null,
        _catalog:    true,   // 区別フラグ（削除時の挙動分岐用）
      })
    }
  }

  return result
}

// ── CourseDetailModal（授業詳細・履修解除） ───────────────────────────────────

const TERM_NUM_TO_STR_DETAIL = { 1: '第1ターム', 2: '第2ターム', 3: '第3ターム', 4: '第4ターム' }
const DAY_LBL_DETAIL = { MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金' }

function CourseDetailModal({ entry, onRemove, onClose }) {
  const c         = termColor(entry.term)
  const termLabel = entry.term != null ? TERM_NUM_TO_STR_DETAIL[entry.term] : null

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl flex flex-col px-4 pt-3 pb-6 gap-4">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />

        <div className={`rounded-2xl ${c.bg} border ${c.bd} px-4 py-3 flex flex-col gap-2`}>
          <div className={`text-base font-bold ${c.name} leading-snug`}>
            {entry.courseTitle}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">
              {DAY_LBL_DETAIL[entry.day]}曜 {entry.period}限
            </span>
            {termLabel ? (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                entry.term % 2 === 1
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-violet-100 text-violet-600'
              }`}>
                {termLabel}
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                通常授業
              </span>
            )}
            {entry.room && (
              <span className={`${c.pill} text-white text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
                {entry.room}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-gray-200
                       text-sm text-gray-600 font-semibold">
            閉じる
          </button>
          <button
            onClick={() => { onRemove(entry.id); onClose() }}
            className="flex-1 py-3 rounded-2xl bg-red-50 border border-red-100
                       text-sm text-red-500 font-semibold">
            履修解除
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CourseBlock（授業ブロック表示） ───────────────────────────────────────────

function CourseBlock({ entry, height, onClick, selectable = false, selected = false }) {
  const c        = termColor(entry.term)
  const maxLines = height >= 80 ? 3 : 2

  return (
    <div className="p-0.5 cursor-pointer relative" style={{ height }} onClick={onClick}>
      <div className={`h-full rounded-lg ${c.bg} border-2 transition-all
                       overflow-hidden flex flex-col px-1.5 pt-1 pb-1.5
                       active:opacity-80
                       ${selectable && selected
                           ? 'border-indigo-500 ring-1 ring-indigo-400'
                           : selectable
                             ? `${c.bd} opacity-70`
                             : `${c.bd}`}`}>
        {/* 選択チェックバッジ */}
        {selectable && (
          <div className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full border-2 flex items-center justify-center z-10
                           ${selected
                               ? 'bg-indigo-500 border-indigo-500'
                               : 'bg-white border-gray-300'}`}>
            {selected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        )}
        <div className="flex-1 flex items-start justify-center min-w-0">
          <span
            className={`font-bold ${c.name} leading-tight text-center`}
            style={{
              fontSize: 9,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: maxLines,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {entry.courseTitle}
          </span>
        </div>
        {entry.room && (
          <div className="flex justify-center mt-auto pt-0.5">
            <span
              className={`${c.pill} text-white rounded-full font-semibold px-2 leading-tight
                           max-w-full truncate`}
              style={{ fontSize: 7.5, paddingTop: 2, paddingBottom: 2 }}
            >
              {entry.room}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TimetableV2 ───────────────────────────────────────────────────────────────

export default function TimetableV2({
  courses,
  selectedIds,
  onToggleEnrollment,
  academicYear,
  selectedGrade,
  enrollmentYear,
  maxGrade,
  onGradeChange,
  onAddGrade,
  onDeleteGrade,
  onEnrollmentYearChange,
  onEntriesChange,
  termFilter,   onTermFilterChange,
  syncKey = 0,
  // New-schema props (optional)
  enrollment,
  enrollmentVersion = 'legacy',
  statusMap       = null,   // Map<classId, EnrollmentStatus> | null
  onStatusChange  = null,   // (classId, status) => void | null
  // Bulk-status props
  studentId        = null,   // current student_id for bulk operations
  department       = '',     // current department_id for pipeline triggers
  onBulkStatusDone = null,   // () => void — called after bulk update completes (triggers SWR revalidate)
  // [DEV] 手動再計算
  onRecalculate    = null,   // async () => void — called when 再計算 button is pressed
}) {
  const semester     = termFilter === '春学期' ? 'spring' : 'fall'
  const [oddT, evnT] = TERM_PAIR[semester]

  const semesterTerms = useMemo(() => semester === 'spring'
    ? ['春学期', '通年', '第1ターム', '第2ターム']
    : ['秋学期', '通年', '第3ターム', '第4ターム'],
  [semester])

  // ── period config（SSR-safe） ────────────────────────────────────────────────
  const [periodConfig, setPeriodConfig] = useState(
    () => getDefaultPeriodConfig(academicYear, semester)
  )
  useEffect(() => {
    setPeriodConfig(loadPeriodConfig(academicYear, semester))
  }, [academicYear, semester])

  // ── カタログ授業エントリ（selectedIds + courses から導出。localStorage 不使用）──
  const catalogEntries = useMemo(() =>
    deriveCatalogEntries(
      courses, selectedIds, enrollment, enrollmentVersion,
      selectedGrade, semester, semesterTerms
    ),
  [courses, selectedIds, enrollment, enrollmentVersion, selectedGrade, semester, semesterTerms])

  // ── 手動追加エントリ（localStorage 管理。classId=null のもののみ） ─────────────
  // 移行: classId を持つ旧 localStorage エントリは読み込まない（catalog entries と重複するため）
  const [manualEntries, setManualEntries] = useState([])
  useEffect(() => {
    const all = loadEntries(academicYear, semester)
    // classId があるエントリはカタログ由来 → 無視（API から再導出する）
    setManualEntries(all.filter(e => !e.classId))
  }, [academicYear, semester, syncKey])

  // ── 表示用エントリ（カタログ + 手動） ────────────────────────────────────────
  const entries = useMemo(
    () => [...catalogEntries, ...manualEntries],
    [catalogEntries, manualEntries]
  )

  // ── モーダル state ─────────────────────────────────────────────────────────────
  const [addModal,        setAddModal]        = useState(null)
  const [detailEntry,     setDetailEntry]     = useState(null)
  const [catalogDetail,   setCatalogDetail]   = useState(null) // { course, classId } — CourseModal用
  const [settingsOpen,    setSettingsOpen]    = useState(false)
  const [confirmReset,    setConfirmReset]    = useState(false)
  const [confirmDelGrade, setConfirmDelGrade] = useState(false)
  const [detailExtra,     setDetailExtra]     = useState(null)
  const [extraAddOpen,    setExtraAddOpen]    = useState(false)
  // [DEV] 手動再計算
  const [recalcBusy, setRecalcBusy] = useState(false)
  const [recalcDone, setRecalcDone] = useState(false)

  // 一括ステータス変更（選択モード）
  const [bulkSelectMode,   setBulkSelectMode]   = useState(false)
  const [bulkSelected,     setBulkSelected]     = useState(new Set()) // Set<classId>
  const [bulkStatusTarget, setBulkStatusTarget] = useState('COMPLETED')
  const [bulkStatusBusy,   setBulkStatusBusy]   = useState(false)
  const [bulkStatusResult, setBulkStatusResult] = useState(null) // { updated_count } | null

  // ── ハンドラ ──────────────────────────────────────────────────────────────────

  const handleAdd = useCallback((data) => {
    if (data.classId) {
      // カタログ授業 → 履修登録 API を更新（まだ未登録の場合のみ）
      // class_id のみで重複チェック（course_id を混入させると同一科目の全セクションが
      // "登録済み" と誤判定され、新規登録がスキップされてしまう）
      const alreadySelected = selectedIds?.includes(data.classId)
      if (onToggleEnrollment && !alreadySelected) {
        onToggleEnrollment(data.classId)
      }
    } else {
      // 手動授業（授業名手入力）→ localStorage に保存
      const updated = createEntry(academicYear, semester, data)
      setManualEntries(updated.filter(e => !e.classId))
      onEntriesChange?.()
    }
    setAddModal(null)
  }, [academicYear, semester, onToggleEnrollment, selectedIds, onEntriesChange])

  const handleRemove = useCallback((id) => {
    // カタログ授業（_catalog フラグあり）
    const catEntry = catalogEntries.find(e => e.id === id)
    if (catEntry?.classId) {
      // 履修解除 → API を通じて selectedIds から削除 → catalogEntries 自動更新
      if (onToggleEnrollment && selectedIds?.includes(catEntry.classId)) {
        onToggleEnrollment(catEntry.classId)
      }
      return
    }

    // 手動授業 → localStorage から削除
    const updated = deleteEntry(academicYear, semester, id)
    setManualEntries(updated.filter(e => !e.classId))
    onEntriesChange?.()
  }, [catalogEntries, academicYear, semester, onToggleEnrollment, selectedIds, onEntriesChange])

  // ── 時間外授業 ─────────────────────────────────────────────────────────────────
  const extraCourses = useMemo(() => {
    if (!courses || !selectedIds) return []
    return courses.filter(c => {
      const t = c.normalized_time
      return (!t || t === 'EXTRA' || t === '0') &&
             semesterTerms.includes(c.term) &&
             selectedIds.includes(c.class_id)
    })
  }, [courses, selectedIds, semesterTerms])

  const [extraOpen, setExtraOpen] = useState(false)

  const handleAddExtra = useCallback((classId) => {
    if (classId && onToggleEnrollment && !selectedIds?.includes(classId)) {
      onToggleEnrollment(classId)
      onEntriesChange?.()
    }
    setExtraAddOpen(false)
  }, [onToggleEnrollment, selectedIds, onEntriesChange])

  const handleRemoveExtra = useCallback((classId) => {
    if (classId && onToggleEnrollment && selectedIds?.includes(classId)) {
      onToggleEnrollment(classId)
      onEntriesChange?.()
    }
  }, [onToggleEnrollment, selectedIds, onEntriesChange])

  /**
   * エントリクリック時の振り分け:
   *   新スキーマ + カタログ授業 → CourseModal（ステータス変更可）
   *   それ以外                 → CourseDetailModal（従来の簡易モーダル）
   */
  const handleEntryClick = useCallback((entry) => {
    if (enrollmentVersion === 'new' && entry._catalog && entry.classId) {
      const course = courses.find(c => c.class_id === entry.classId)
      if (course) {
        setCatalogDetail({ course, classId: entry.classId, entry })
        return
      }
    }
    setDetailEntry(entry)
  }, [enrollmentVersion, courses])

  const openModal = useCallback((day, period, lockedTerm) => {
    setAddModal({ day, period, lockedTerm })
  }, [])

  // 一括ステータス変更ハンドラ
  const handleBulkToggle = useCallback((classId) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId)
      else next.add(classId)
      return next
    })
  }, [])

  const handleBulkSelectAll = useCallback(() => {
    const gridIds  = entries.filter(e => e._catalog && e.classId).map(e => e.classId)
    const extraIds = extraCourses.map(c => c.class_id)
    setBulkSelected(new Set([...gridIds, ...extraIds]))
  }, [entries, extraCourses])

  const handleBulkClear = useCallback(() => setBulkSelected(new Set()), [])

  const handleBulkExit = useCallback(() => {
    setBulkSelectMode(false)
    setBulkSelected(new Set())
    setBulkStatusResult(null)
  }, [])

  const handleBulkStatusConfirm = useCallback(async () => {
    if (bulkSelected.size === 0) return
    setBulkStatusBusy(true)
    setBulkStatusResult(null)
    try {
      const res = await fetch('/api/enrollment/bulk-status', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          class_ids: [...bulkSelected],
          status:    bulkStatusTarget,
          department,
          studentId,   // student_id ごとにデータを分離するため必須
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setBulkStatusResult({ updated_count: data.updated_count })
      setBulkSelected(new Set())
      onBulkStatusDone?.()
    } catch (err) {
      console.error('[bulkStatus]', err)
      setBulkStatusResult({ error: err.message })
    } finally {
      setBulkStatusBusy(false)
    }
  }, [bulkSelected, bulkStatusTarget, department, studentId, onBulkStatusDone])

  // [DEV] 手動再計算
  const handleRecalculate = useCallback(async () => {
    setRecalcBusy(true)
    setRecalcDone(false)
    try {
      if (onRecalculate) {
        await onRecalculate()
      } else {
        const res = await fetch('/api/recalculate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          // student_id を渡すことで自分のデータのみ高速再計算。
          // 省略すると全学生を対象に処理される（管理者用途）。
          body:    JSON.stringify({ student_id: studentId }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || `HTTP ${res.status}`)
        }
      }
      setRecalcDone(true)
      setTimeout(() => setRecalcDone(false), 3000)
    } catch (err) {
      console.error('[recalculate]', err)
      alert(`再計算エラー: ${err.message}`)
    } finally {
      setRecalcBusy(false)
    }
  }, [studentId, onRecalculate])

  // リセット: 手動エントリのみ削除
  // カタログ授業の一括解除は「履修登録」タブから行う
  function handleReset() {
    clearEntries(academicYear, semester)
    setManualEntries([])
    setConfirmReset(false)
    onEntriesChange?.()
  }

  function handleDeleteGrade() {
    onDeleteGrade()
    setConfirmDelGrade(false)
  }

  const handleSaveSettings = useCallback((config) => {
    savePeriodConfig(academicYear, semester, config)
    setPeriodConfig(config)
    setSettingsOpen(false)
  }, [academicYear, semester])

  // ── レンダリング ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── ヘッダー ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-3 pt-2 pb-0 flex flex-col gap-0">

        {/* 学年ピル行 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {Array.from({ length: maxGrade }, (_, i) => i + 1).map(grade => {
            const isLast   = grade === maxGrade
            const isActive = grade === selectedGrade
            return (
              <div key={grade} className="relative flex-shrink-0">
                <button
                  onClick={() => onGradeChange(grade)}
                  className={`text-xs font-semibold rounded-xl transition-colors ${
                    isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  } ${isLast && maxGrade > 1 ? 'pl-3 pr-6 py-1.5' : 'px-3 py-1.5'}`}
                >
                  {grade}年生
                </button>
                {isLast && maxGrade > 1 && (
                  <button
                    onClick={() => setConfirmDelGrade(true)}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full
                                flex items-center justify-center text-xs leading-none transition-colors
                                ${isActive ? 'text-blue-200 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                    title={`${grade}年生を削除`}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
          <button
            onClick={onAddGrade}
            className="flex-shrink-0 text-xs text-gray-400 font-medium px-3 py-1.5
                       rounded-xl border border-dashed border-gray-200
                       hover:border-blue-300 hover:text-blue-400 transition-colors whitespace-nowrap"
          >
            ＋ 学年を追加
          </button>
        </div>

        {/* 学期タブ + 設定ボタン行 */}
        <div className="flex items-center">
          <div className="flex gap-4">
            {Object.entries(SEMESTER_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => onTermFilterChange(label)}
                className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                  termFilter === label
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-400'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto pb-2 flex items-center gap-1">
            {/* 一括変更ボタン（新スキーマのみ表示） */}
            {enrollmentVersion === 'new' && (
              bulkSelectMode ? (
                <button
                  onClick={handleBulkExit}
                  className="flex items-center gap-1 text-xs text-indigo-500 font-semibold
                             transition-colors px-2 py-1 rounded-lg bg-indigo-50"
                >
                  完了
                </button>
              ) : (
                <button
                  onClick={() => { setBulkSelectMode(true); setBulkStatusResult(null) }}
                  className="flex items-center gap-1 text-xs text-indigo-400
                             hover:text-indigo-600 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
                  title="履修を選択してステータスを一括変更"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  一括変更
                </button>
              )
            )}
            {/* [DEV] 手動再計算ボタン */}
            {enrollmentVersion === 'new' && (
              <button
                onClick={handleRecalculate}
                disabled={recalcBusy}
                className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg
                            transition-colors disabled:opacity-50
                            ${recalcDone
                              ? 'text-green-600 bg-green-50'
                              : 'text-orange-400 hover:text-orange-600 hover:bg-orange-50'}`}
                title="progress_auto / students_summary / graduation_result を再計算"
              >
                {recalcBusy ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    再計算中
                  </>
                ) : recalcDone ? (
                  <>✓ 完了</>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    再計算
                  </>
                )}
              </button>
            )}
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1 text-xs text-gray-400
                         hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
              title="手動追加授業をリセット"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1 text-xs text-gray-400
                         hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0
                     002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0
                     001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0
                     00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724
                     0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724
                     1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724
                     1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724
                     1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608
                     2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              時間設定
            </button>
          </div>
        </div>
      </div>

      {/* ── グリッド ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-2">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">

          {/* ヘッダー行 */}
          <div className="grid border-b border-gray-100"
            style={{ gridTemplateColumns: '44px repeat(5, 1fr)' }}>
            <div className="py-2" />
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-600">
                {DAY_LBL[d]}
              </div>
            ))}
          </div>

          {/* コマ行 */}
          {periodConfig.map(({ period, start, end }) => (
            <div key={period}
              className="grid border-b border-gray-50 last:border-0"
              style={{ gridTemplateColumns: '44px repeat(5, 1fr)', height: CELL_H }}>

              {/* 時刻 + コマ番号 */}
              <div className="flex flex-col items-center justify-between py-1.5 px-0.5 select-none">
                <span className="font-medium text-gray-300 leading-none" style={{ fontSize: 9 }}>
                  {start}
                </span>
                <span className="text-xs font-bold text-gray-400">{period}</span>
                <span className="font-medium text-gray-300 leading-none" style={{ fontSize: 9 }}>
                  {end}
                </span>
              </div>

              {/* ── 曜日セル ──────────────────────────────────────────────────── */}
              {DAYS.map(d => {
                const cell = entries.filter(e => e.day === d && e.period === period)

                const halfEntry  = cell.find(e => e.term == null)  ?? null
                const upperEntry = cell.find(e => e.term === oddT) ?? null
                const lowerEntry = cell.find(e => e.term === evnT) ?? null
                const isSplit    = upperEntry != null || lowerEntry != null

                return (
                  <div key={d}
                    className="border-l border-gray-50 overflow-hidden"
                    style={{ height: CELL_H }}>

                    {/* CASE 1: 通常授業（セル全体） */}
                    {halfEntry && (
                      <CourseBlock
                        entry={halfEntry}
                        height={CELL_H}
                        onClick={() =>
                          bulkSelectMode && halfEntry.classId && halfEntry._catalog
                            ? handleBulkToggle(halfEntry.classId)
                            : handleEntryClick(halfEntry)
                        }
                        selectable={bulkSelectMode && !!halfEntry.classId && halfEntry._catalog}
                        selected={bulkSelected.has(halfEntry.classId)}
                      />
                    )}

                    {/* CASE 2: ターム分割 */}
                    {!halfEntry && isSplit && (
                      <div className="flex flex-col" style={{ height: CELL_H }}>

                        {upperEntry ? (
                          <CourseBlock
                            entry={upperEntry}
                            height={HALF_H}
                            onClick={() =>
                              bulkSelectMode && upperEntry.classId && upperEntry._catalog
                                ? handleBulkToggle(upperEntry.classId)
                                : handleEntryClick(upperEntry)
                            }
                            selectable={bulkSelectMode && !!upperEntry.classId && upperEntry._catalog}
                            selected={bulkSelected.has(upperEntry.classId)}
                          />
                        ) : (
                          <div
                            className="flex items-center justify-center cursor-pointer
                                       hover:bg-blue-50 transition-colors select-none"
                            style={{ height: HALF_H }}
                            onClick={() => openModal(d, period, oddT)}
                          >
                            <span className="font-semibold text-blue-200" style={{ fontSize: 9 }}>
                              第{oddT}T +
                            </span>
                          </div>
                        )}

                        <div className="h-0.5 bg-gray-100 flex-shrink-0" />

                        {lowerEntry ? (
                          <CourseBlock
                            entry={lowerEntry}
                            height={HALF_H}
                            onClick={() =>
                              bulkSelectMode && lowerEntry.classId && lowerEntry._catalog
                                ? handleBulkToggle(lowerEntry.classId)
                                : handleEntryClick(lowerEntry)
                            }
                            selectable={bulkSelectMode && !!lowerEntry.classId && lowerEntry._catalog}
                            selected={bulkSelected.has(lowerEntry.classId)}
                          />
                        ) : (
                          <div
                            className="flex items-center justify-center cursor-pointer
                                       hover:bg-violet-50 transition-colors select-none"
                            style={{ height: HALF_H }}
                            onClick={() => openModal(d, period, evnT)}
                          >
                            <span className="font-semibold text-violet-200" style={{ fontSize: 9 }}>
                              第{evnT}T +
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CASE 3: 空セル */}
                    {!halfEntry && !isSplit && (
                      <div
                        className="h-full flex items-center justify-center
                                   cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => openModal(d, period, null)}
                      >
                        <span className="text-gray-200 font-light select-none"
                          style={{ fontSize: 20 }}>
                          +
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <p className="mt-4 text-center text-xs text-gray-200 select-none">
            セルをタップして授業を追加、または「履修登録」タブから選択してください
          </p>
        )}

        {/* ── 時間外授業パネル ────────────────────────────────────────────────── */}
        <div className="mt-2 bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => setExtraOpen(o => !o)}
              className="flex-1 flex items-center gap-2 text-left select-none"
            >
              <span className="text-xs font-semibold text-gray-600">時間外授業</span>
              {extraCourses.length > 0 && (
                <span className="bg-gray-100 text-gray-500 text-xs font-bold
                                 px-1.5 py-0.5 rounded-full leading-none">
                  {extraCourses.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setExtraAddOpen(true)}
              className="w-6 h-6 flex items-center justify-center rounded-lg
                         text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors mr-1"
              title="時間外授業を追加"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button onClick={() => setExtraOpen(o => !o)}>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${extraOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {extraOpen && (
            <div className="border-t border-gray-50 px-3 pb-3 pt-2 flex flex-col gap-1.5">
              {extraCourses.length === 0 ? (
                <p className="text-center text-xs text-gray-300 py-4">
                  この学期の時間外授業はありません
                </p>
              ) : (
                extraCourses.map(c => {
                  const termNum  = TERM_TO_NUM[c.term] ?? null
                  const isTerm   = termNum != null
                  const isOdd    = isTerm && termNum % 2 === 1
                  const pillCls  = isTerm
                    ? (isOdd ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600')
                    : 'bg-indigo-100 text-indigo-600'
                  const termLabel    = isTerm ? c.term : (c.term || '通年')
                  const isSelectable = bulkSelectMode && !!c.class_id
                  const isSelected   = bulkSelected.has(c.class_id)

                  const handleClick = () => {
                    if (isSelectable) {
                      handleBulkToggle(c.class_id)
                    } else if (enrollmentVersion === 'new' && c.class_id) {
                      // 新スキーマ: CourseModal でステータス変更
                      setCatalogDetail({ course: c, classId: c.class_id, entry: null })
                    } else {
                      setDetailExtra(c)
                    }
                  }

                  return (
                    <div key={c.class_id}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2
                                  cursor-pointer transition-all
                                  ${isSelected
                                    ? 'bg-indigo-50 ring-1 ring-indigo-300'
                                    : isSelectable
                                      ? 'bg-gray-50 opacity-70'
                                      : 'bg-gray-50 active:opacity-70'}`}
                      onClick={handleClick}
                    >
                      {/* 一括選択チェックバッジ */}
                      {isSelectable && (
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                                         ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-gray-300'}`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-800 truncate">
                          {c.course_name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${pillCls}`}>
                            {termLabel}
                          </span>
                          {c.intructor && (
                            <span className="text-xs text-gray-400 truncate">{c.intructor}</span>
                          )}
                          {enrollmentVersion === 'new' && statusMap?.get(c.class_id) && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                                             ${STATUS_CONFIG[statusMap.get(c.class_id)]?.badge ?? 'bg-gray-100 text-gray-500'}`}>
                              {STATUS_CONFIG[statusMap.get(c.class_id)]?.label ?? statusMap.get(c.class_id)}
                            </span>
                          )}
                        </div>
                      </div>
                      {c.credits && (
                        <span className="text-xs font-bold text-gray-400 flex-shrink-0">
                          {c.credits}単位
                        </span>
                      )}
                      {!isSelectable && (
                        <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 一括選択アクションバー ─────────────────────────────────────────────── */}
      {bulkSelectMode && (
        <div className="flex-shrink-0 bg-white border-t border-gray-100 px-3 py-3 flex flex-col gap-2.5">

          {/* 選択数 + 全選択・クリア */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-600">
              {bulkSelected.size} 件選択中
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkSelectAll}
                className="text-xs text-gray-500 font-medium px-2.5 py-1 rounded-lg
                           border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                全選択
              </button>
              <button
                onClick={handleBulkClear}
                className="text-xs text-gray-500 font-medium px-2.5 py-1 rounded-lg
                           border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                クリア
              </button>
            </div>
          </div>

          {/* ステータス選択ピル */}
          <div className="flex gap-1.5 flex-wrap">
            {BULK_STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setBulkStatusTarget(opt.value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
                  ${bulkStatusTarget === opt.value
                    ? opt.button
                    : `${opt.outline} border`}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 結果フィードバック */}
          {bulkStatusResult && !bulkStatusBusy && (
            bulkStatusResult.error
              ? <p className="text-xs text-red-500 px-0.5">エラー: {bulkStatusResult.error}</p>
              : <p className="text-xs text-green-600 px-0.5">✓ {bulkStatusResult.updated_count} 件更新しました</p>
          )}

          {/* 実行ボタン */}
          <button
            onClick={handleBulkStatusConfirm}
            disabled={bulkSelected.size === 0 || bulkStatusBusy}
            className="w-full py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold
                       disabled:opacity-40 flex items-center justify-center gap-2 transition-opacity"
          >
            {bulkStatusBusy ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                処理中…
              </>
            ) : `${bulkSelected.size} 件を「${BULK_STATUS_OPTIONS.find(o => o.value === bulkStatusTarget)?.label ?? bulkStatusTarget}」に変更`}
          </button>
        </div>
      )}

      {/* ── 授業詳細モーダル（手動エントリ・レガシー） ─────────────────────────── */}
      {detailEntry && (
        <CourseDetailModal
          entry={detailEntry}
          onRemove={handleRemove}
          onClose={() => setDetailEntry(null)}
        />
      )}

      {/* ── カタログ授業詳細（新スキーマ: ステータス変更付き CourseModal） ─────── */}
      {catalogDetail && (
        <CourseModal
          course={catalogDetail.course}
          isSelected={true}
          isConflict={false}
          toggling={false}
          onToggle={() => {
            // entry が null = 時間外授業から開いた場合
            if (catalogDetail.entry) {
              handleRemove(catalogDetail.entry.id)
            } else {
              handleRemoveExtra(catalogDetail.classId)
            }
            setCatalogDetail(null)
          }}
          onClose={() => setCatalogDetail(null)}
          enrollStatus={statusMap?.get(catalogDetail.classId)}
          enrollmentVersion={enrollmentVersion}
          onStatusChange={onStatusChange
            ? (status) => {
                if (status === 'REMOVE') {
                  if (catalogDetail.entry) {
                    handleRemove(catalogDetail.entry.id)
                  } else {
                    handleRemoveExtra(catalogDetail.classId)
                  }
                } else {
                  onStatusChange(catalogDetail.classId, status)
                }
                setCatalogDetail(null)
              }
            : undefined
          }
        />
      )}

      {/* ── 確認ダイアログ：リセット ───────────────────────────────────────────── */}
      {confirmReset && (
        <ConfirmDialog
          message={`手動追加した授業をリセットしますか？`}
          sub="カタログから登録した授業は「履修登録」タブから解除してください。"
          confirmLabel="リセット"
          confirmClass="bg-red-500 text-white"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {/* ── 確認ダイアログ：学年削除 ──────────────────────────────────────────── */}
      {confirmDelGrade && (
        <ConfirmDialog
          message={`${maxGrade}年生を削除しますか？`}
          sub="この学年の時間割データは残ります。"
          confirmLabel="削除"
          confirmClass="bg-red-500 text-white"
          onConfirm={handleDeleteGrade}
          onCancel={() => setConfirmDelGrade(false)}
        />
      )}

      {/* ── 授業追加モーダル ───────────────────────────────────────────────────── */}
      {addModal && (
        <AddCourseModal
          day={addModal.day}
          period={addModal.period}
          lockedTerm={addModal.lockedTerm}
          semester={semester}
          academicYear={academicYear}
          grade={selectedGrade}
          courses={courses}
          existingEntries={entries}
          onAdd={handleAdd}
          onClose={() => setAddModal(null)}
        />
      )}

      {/* ── コマ時間設定モーダル ───────────────────────────────────────────────── */}
      {settingsOpen && (
        <PeriodSettingsModal
          year={academicYear}
          semester={semester}
          periodConfig={periodConfig}
          defaultConfig={getDefaultPeriodConfig(academicYear, semester)}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* ── 時間外授業 詳細モーダル ───────────────────────────────────────────── */}
      {detailExtra && (
        <ExtraCourseDetailModal
          course={detailExtra}
          onUnenroll={handleRemoveExtra}
          onClose={() => setDetailExtra(null)}
        />
      )}

      {/* ── 時間外授業 追加モーダル ───────────────────────────────────────────── */}
      {extraAddOpen && (
        <AddExtraModal
          courses={courses}
          grade={selectedGrade}
          semester={semester}
          selectedIds={selectedIds}
          onAdd={handleAddExtra}
          onClose={() => setExtraAddOpen(false)}
        />
      )}
    </div>
  )
}

// ── ExtraCourseDetailModal ────────────────────────────────────────────────────

function ExtraCourseDetailModal({ course, onUnenroll, onClose }) {
  const termNum  = TERM_TO_NUM[course.term] ?? null
  const c        = termColor(termNum)
  const termLabel = course.term || '通年'

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl flex flex-col px-4 pt-3 pb-6 gap-4">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />

        <div className={`rounded-2xl ${c.bg} border ${c.bd} px-4 py-3 flex flex-col gap-2`}>
          <div className={`text-base font-bold ${c.name} leading-snug`}>
            {course.course_name}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              時間外
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              termNum == null ? 'bg-indigo-100 text-indigo-600'
                : termNum % 2 === 1 ? 'bg-blue-100 text-blue-600'
                : 'bg-violet-100 text-violet-600'
            }`}>{termLabel}</span>
            {course.room && (
              <span className={`${c.pill} text-white text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
                {course.room}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            {course.intructor && <span>{course.intructor}</span>}
            {course.credits   && <span className="font-semibold">{course.credits}単位</span>}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm text-gray-600 font-semibold">
            閉じる
          </button>
          <button
            onClick={() => { onUnenroll(course.class_id); onClose() }}
            className="flex-1 py-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-500 font-semibold">
            履修解除
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AddExtraModal ─────────────────────────────────────────────────────────────

function AddExtraModal({ courses, grade, semester, selectedIds, onAdd, onClose }) {
  const [query,   setQuery]   = useState('')
  const [preview, setPreview] = useState(null)  // 詳細プレビュー対象

  // 学年・学期の両条件を満たす時間外コースのみ（登録可能候補に完全一致）
  const extraList = useMemo(() => {
    return courses.filter(c => {
      const t = c.normalized_time
      return (!t || t === 'EXTRA' || t === '0') && isCourseEligible(c, grade, semester)
    })
  }, [courses, grade, semester])

  const filtered = useMemo(() => {
    if (!query) return extraList
    const q = query.toLowerCase()
    return extraList.filter(c =>
      c.course_name?.toLowerCase().includes(q) ||
      c.intructor?.toLowerCase().includes(q)
    )
  }, [extraList, query])

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: '80dvh' }}>

        <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-bold text-gray-900">時間外授業を追加</div>
              <div className="text-xs text-gray-400 mt-0.5">集中講義・特別授業など</div>
            </div>
            <button onClick={onClose} className="text-gray-400 text-xl leading-none p-1">×</button>
          </div>
        </div>

        <div className="flex-shrink-0 px-4 py-2 border-b border-gray-50">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="授業名・担当者で検索" autoFocus
              className="w-full bg-gray-50 rounded-xl pl-9 pr-8 py-2 text-sm border border-gray-100
                         focus:outline-none focus:ring-2 focus:ring-blue-300" />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">✕</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-3 py-2">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <div className="text-2xl mb-2">📭</div>
              <div className="text-sm">
                {query ? `「${query}」に一致する授業が見つかりません` : 'この学期の時間外授業がカタログにありません'}
              </div>
            </div>
          )}
          {filtered.map(c => {
            const enrolled = selectedIds?.includes(c.class_id)
            const termNum  = TERM_TO_NUM[c.term] ?? null
            const isTerm   = termNum != null
            const pillCls  = isTerm
              ? (termNum % 2 === 1 ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600')
              : 'bg-indigo-50 text-indigo-500'
            return (
              <button key={c.class_id}
                onClick={() => !enrolled && setPreview(c)}
                disabled={enrolled}
                className={`w-full text-left rounded-xl px-3 py-2.5 mb-1.5 border transition-all
                  ${enrolled
                    ? 'bg-green-50 border-green-100 opacity-60'
                    : 'bg-gray-50 border-gray-100 hover:bg-blue-50 hover:border-blue-200 active:scale-[0.99]'}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{c.course_name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${pillCls}`}>
                        {c.term || '通年'}
                      </span>
                      {c.room      && <span className="text-xs text-gray-400">{c.room}</span>}
                      {c.intructor && <span className="text-xs text-gray-400 truncate">{c.intructor}</span>}
                    </div>
                  </div>
                  {c.credits && <span className="text-xs text-gray-400 flex-shrink-0">{c.credits}単位</span>}
                  <span className={`text-xs flex-shrink-0 font-medium ${enrolled ? 'text-green-500' : 'text-blue-400'}`}>
                    {enrolled ? '登録済' : '詳細'}
                  </span>
                </div>
              </button>
            )
          })}
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
        onToggle={() => { onAdd(preview.class_id); setPreview(null) }}
        onClose={() => setPreview(null)}
        enrollStatus={undefined}
        enrollmentVersion="legacy"
      />
    )}
    </>
  )
}

// ── BulkStatusOptions（アクションバーで使用） ────────────────────────────────
// STATUS_CONFIG から生成することで label・色を enrollmentStatus.ts と一致させる

const BULK_STATUS_OPTIONS = [
  'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED',
].map(value => ({ value, ...STATUS_CONFIG[value] }))

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({ message, sub, confirmLabel, confirmClass, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full bg-white rounded-2xl shadow-xl p-5 flex flex-col gap-4">
        <div>
          <div className="text-sm font-bold text-gray-900 leading-snug">{message}</div>
          {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-semibold">
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
