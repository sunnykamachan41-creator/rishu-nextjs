'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import { isLeaveSemester } from '@/lib/leavePeriods'

// ── 定数 ──────────────────────────────────────────────────────────────────────

const DAYS    = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const DAY_LBL = { MON: '月', TUE: '火', WED: '水', THU: '木', FRI: '金' }

/** 学期 → [前半ターム（奇数）, 後半ターム（偶数）] */
const TERM_PAIR = { spring: [1, 2], fall: [3, 4] }

const CELL_H = 100  // 1コマのセル高さ (px) — tall モード用フォールバック
const HALF_H = 48   // 分割時の片側高さ (px)

const CELL_STYLE_KEY = 'rishu_cell_style'  // 'tall' | 'square'

const TERM_TO_NUM = { '第1ターム': 1, '第2ターム': 2, '第3ターム': 3, '第4ターム': 4 }

// ── ターム別カラー ────────────────────────────────────────────────────────────

function termColor(term) {
  if (term == null) {
    return {
      bg:   'bg-indigo-100 dark:bg-indigo-500/20',
      bd:   'border-indigo-200 dark:border-indigo-500/30',
      name: 'text-indigo-900 dark:text-indigo-300',
      pill: 'bg-indigo-500',
      del:  'text-indigo-300 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300',
    }
  }
  if (term % 2 === 1) {
    return {
      bg:   'bg-blue-100 dark:bg-blue-500/20',
      bd:   'border-blue-200 dark:border-blue-500/30',
      name: 'text-blue-900 dark:text-blue-300',
      pill: 'bg-blue-500',
      del:  'text-blue-300 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300',
    }
  }
  return {
    bg:   'bg-violet-100 dark:bg-violet-500/20',
    bd:   'border-violet-200 dark:border-violet-500/30',
    name: 'text-violet-900 dark:text-violet-300',
    pill: 'bg-violet-500',
    del:  'text-violet-300 dark:text-violet-500 hover:text-violet-600 dark:hover:text-violet-300',
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
  courses, selectedIds, enrollment, enrollmentVersion, grade, semester, semesterTerms,
  temporaryIds = new Set()
) {
  if (!courses?.length || !selectedIds?.length) return []

  // 新スキーマ: この学年・学期の履修科目のみ対象にする
  let activeSet
  if (enrollmentVersion === 'new' && enrollment?.length) {
    // composite key: class_id|academic_year — prevents cross-year display leakage
    activeSet = new Set(
      enrollment
        .filter(e =>
          (e.year === grade || e.year === null) &&
          (e.semester === semester || e.semester === null)
        )
        .map(e => `${e.class_id}|${e.academic_year ?? ''}`)
    )
  } else {
    // レガシー: selectedIds はすでに composite key 形式
    activeSet = new Set(selectedIds)
  }

  const result = []

  for (const c of courses) {
    // composite key でマッチ（年度を含めることで異年度の同 class_id を区別）
    const ck = `${c.class_id}|${c.academic_year ?? ''}`
    if (!activeSet.has(ck)) continue
    if (!semesterTerms.includes(c.term)) continue

    const nt = c.normalized_time
    if (!nt || nt === 'EXTRA' || nt === '0') continue   // 時間外は別セクション

    const termNum   = TERM_TO_NUM[c.term] ?? null
    const isTemp    = temporaryIds.has(ck)

    for (const slot of String(nt).split('|')) {
      const m = slot.trim().match(/^(MON|TUE|WED|THU|FRI)_(\d)$/)
      if (!m) continue
      result.push({
        id:           `cat_${c.class_id}_${m[1]}_${m[2]}`,
        day:          m[1],
        period:       parseInt(m[2], 10),
        term:         termNum,
        courseTitle:  c.course_name,
        classId:      c.class_id,
        academicYear: c.academic_year,   // 削除時の composite key 構築用
        room:         c.room || null,
        _catalog:     true,   // 区別フラグ（削除時の挙動分岐用）
        isTemporary:  isTemp,  // 仮登録フラグ
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
      <div className="relative w-full bg-white dark:bg-[#1f2235] rounded-t-3xl flex flex-col px-4 pt-3 pb-6 gap-4">
        <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto" />

        <div className={`rounded-2xl ${c.bg} border ${c.bd} px-4 py-3 flex flex-col gap-2`}>
          <div className={`text-base font-bold ${c.name} leading-snug`}>
            {entry.courseTitle}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">
              {DAY_LBL_DETAIL[entry.day]}曜 {entry.period}限
            </span>
            {termLabel ? (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                entry.term % 2 === 1
                  ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300'
                  : 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300'
              }`}>
                {termLabel}
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300">
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
            className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-white/[0.07]
                       text-sm text-gray-600 dark:text-slate-300 font-semibold">
            閉じる
          </button>
          <button
            onClick={() => { onRemove(entry.id); onClose() }}
            className="flex-1 py-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20
                       text-sm text-red-500 dark:text-red-400 font-semibold">
            履修解除
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CourseBlock（授業ブロック表示） ───────────────────────────────────────────

/**
 * cellH      : 計算済みセル高さ（px）— フォントサイズ・行数の判定に使用
 * isHalf     : ターム分割セルの片側（上下半分）に配置する場合 true
 * isTallStyle: true = 縦長モード（旧デザイン: 完全ボックス・丸ピル・左ストリップなし）
 *              false = 均等モード（現デザイン: 左カラーストリップ）
 */
function CourseBlock({ entry, cellH = 72, isHalf = false, isTallStyle = false, onClick, selectable = false, selected = false }) {
  const c = termColor(entry.term)
  const effectiveH  = isHalf ? Math.floor(cellH / 2) : cellH
  const maxLines    = effectiveH >= 72 ? 3 : 2
  const isTemporary = entry.isTemporary === true

  // ── 縦長モード（旧デザイン完全再現） ────────────────────────────────────────
  if (isTallStyle) {
    return (
      <div className="h-full p-0.5 cursor-pointer relative" onClick={onClick}>
        <div className={`h-full rounded-lg border-2 transition-all
                         overflow-hidden flex flex-col px-1.5 pt-1 pb-1.5
                         active:opacity-80
                         ${isTemporary ? 'border-dashed border-amber-400 bg-amber-50 dark:bg-amber-500/10 opacity-80' : `${c.bg}`}
                         ${selectable && selected
                             ? 'border-indigo-500 ring-1 ring-indigo-400'
                             : selectable
                               ? `${c.bd} opacity-70`
                               : isTemporary ? '' : c.bd}`}>
          {/* 選択チェックバッジ */}
          {selectable && (
            <div className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full border-2 flex items-center justify-center z-10
                             ${selected ? 'bg-indigo-500 border-indigo-500' : 'bg-white dark:bg-[#252839] border-gray-300 dark:border-white/20'}`}>
              {selected && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          )}
          {/* 仮登録バッジ（縦長モード） */}
          {isTemporary && (
            <div className="flex justify-center mb-0.5">
              <span className="text-[7px] font-bold bg-amber-400 text-white px-1 rounded-full">仮</span>
            </div>
          )}
          {/* 授業名（中央揃え） */}
          <div className="flex-1 flex items-start justify-center min-w-0">
            <span
              className={`font-bold leading-tight text-center ${isTemporary ? 'text-amber-800 dark:text-amber-300' : c.name}`}
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
          {/* 教室名（丸ピル・中央揃え・下端） */}
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

  // ── 均等モード（現デザイン: 左カラーストリップ） ────────────────────────────
  const isIndigo = entry.term == null
  const isOdd    = entry.term != null && entry.term % 2 === 1
  const strip    = isTemporary ? 'bg-amber-400'
                 : isIndigo ? 'bg-indigo-400' : isOdd ? 'bg-blue-500' : 'bg-violet-500'
  const cardBg   = isTemporary ? 'bg-amber-50 dark:bg-amber-500/[0.12]'
                 : isIndigo ? 'bg-indigo-50 dark:bg-indigo-500/[0.12]'
                 : isOdd    ? 'bg-blue-50 dark:bg-blue-500/[0.12]'
                 :             'bg-violet-50 dark:bg-violet-500/[0.12]'
  const titleCl  = isTemporary ? 'text-amber-800 dark:text-amber-300'
                 : isIndigo ? 'text-indigo-800 dark:text-indigo-200'
                 : isOdd    ? 'text-blue-800 dark:text-blue-200'
                 :             'text-violet-800 dark:text-violet-200'
  const fz    = effectiveH >= 80 ? 10.5 : effectiveH >= 62 ? 9.5 : 9
  const lines = effectiveH >= 72 ? 3 : 2

  return (
    <div className={`h-full p-px relative cursor-pointer ${isTemporary ? 'opacity-75' : ''}`} onClick={onClick}>
      {/* 一括選択バッジ */}
      {selectable && (
        <div className={`absolute top-1 right-1 z-10 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center
                         ${selected ? 'bg-indigo-500 border-indigo-500' : 'bg-white dark:bg-[#1f2235] border-gray-300 dark:border-white/20'}`}>
          {selected && (
            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}
      {/* 仮登録バッジ（均等モード） */}
      {isTemporary && (
        <div className="absolute top-0.5 right-0.5 z-10">
          <span className="text-[7px] font-bold bg-amber-400 text-white px-1 rounded-full leading-none" style={{ paddingTop: 1.5, paddingBottom: 1.5 }}>仮</span>
        </div>
      )}
      {/* カード */}
      <div className={`h-full rounded-[5px] overflow-hidden flex flex-row
                       active:opacity-60 transition-opacity
                       ${cardBg}
                       ${isTemporary ? 'border border-dashed border-amber-300 dark:border-amber-500/50' : ''}
                       ${selectable && selected ? 'ring-1 ring-inset ring-indigo-400' : ''}
                       ${selectable && !selected ? 'opacity-50' : ''}`}>
        {/* ターム識別ストリップ（左 3px） */}
        <div className={`w-[3px] flex-shrink-0 ${strip}`} />
        {/* テキストエリア */}
        <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5 px-1 overflow-hidden">
          <span
            className={`font-bold leading-tight ${titleCl}`}
            style={{
              fontSize: fz,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: lines,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {entry.courseTitle}
          </span>
          {entry.room && effectiveH >= 52 && (
            <span
              className={`mt-px font-bold truncate rounded-[3px] px-1 leading-none flex-shrink-0
                          ${isIndigo ? 'bg-indigo-400 text-white'
                          : isOdd   ? 'bg-blue-400 text-white'
                          :            'bg-violet-400 text-white'}`}
              style={{ fontSize: 7, paddingTop: 2, paddingBottom: 2, maxWidth: '100%' }}
            >
              {entry.room}
            </span>
          )}
        </div>
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
  // 仮登録 Set（composite key）
  temporaryIds    = new Set(),
  // Bulk-status props
  studentId        = null,   // current student_id for bulk operations
  department       = '',     // current department_id for pipeline triggers
  onBulkStatusDone = null,   // () => void — called after bulk update completes (triggers SWR revalidate)
  // [DEV] 手動再計算
  onRecalculate    = null,   // async () => void — called when 再計算 button is pressed
  // 休学期間 + 表示学年
  leaveSemesters   = [],     // GradeSemester[] — 休学学期一覧 ({ grade, semester })
  displayGrade     = null,   // number | null — 休学補正後の表示学年（ソート優先度用）
}) {
  const semester     = termFilter === '春学期' ? 'spring' : 'fall'
  const [oddT, evnT] = TERM_PAIR[semester]

  // ── 最新開講年度（仮登録判定用） ─────────────────────────────────────────────
  const latestYear = useMemo(() => {
    const max = (courses ?? []).reduce((m, c) => {
      const y = Number(c.academic_year)
      return (Number.isFinite(y) && y > m) ? y : m
    }, 0)
    return max > 0 ? max : new Date().getFullYear()
  }, [courses])

  // academicYear が latestYear を超えている = 将来年度シミュレーションモード
  const isFutureYearMode = academicYear != null && academicYear > latestYear

  // 現在の学年・学期が休学中かどうか（履修登録をロック）
  const isOnLeave = isLeaveSemester(leaveSemesters, selectedGrade, semester)

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
      selectedGrade, semester, semesterTerms, temporaryIds
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
  // 将来年度仮登録確認ダイアログ
  const [pendingTempAdd,  setPendingTempAdd]  = useState(null) // data obj from AddCourseModal
  // 年度ミスマッチ警告トースト
  const [yearWarnVisible, setYearWarnVisible] = useState(false)
  const yearWarnTimer = useRef(null)
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
      // 将来年度シミュレーションモードでは確認ダイアログを挟む
      if (isFutureYearMode) {
        setPendingTempAdd(data)
        setAddModal(null)
        return
      }
      // composite key で重複チェック（異年度の同 class_id を区別）
      // 年度一致優先、なければ任意年度で探す（カタログが古い年度のみの場合に対応）
      const addedCourse = courses?.find(c => c.class_id === data.classId && (academicYear == null || c.academic_year === academicYear))
                       ?? courses?.find(c => c.class_id === data.classId)
      const ck = `${data.classId}|${addedCourse?.academic_year ?? ''}`
      const alreadySelected = selectedIds?.includes(ck)
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
  }, [academicYear, semester, onToggleEnrollment, selectedIds, onEntriesChange, isFutureYearMode, courses])

  const handleRemove = useCallback((id) => {
    // カタログ授業（_catalog フラグあり）
    const catEntry = catalogEntries.find(e => e.id === id)
    if (catEntry?.classId) {
      // composite key で登録確認（異年度の同 class_id を区別）
      const ck = `${catEntry.classId}|${catEntry.academicYear ?? ''}`
      if (onToggleEnrollment && selectedIds?.includes(ck)) {
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
  // 新スキーマ: enrollment の year+semester で絞ることで、
  // 「1年春に登録した通年授業」が「1年秋」や「2年春」に漏れ出さないようにする。
  const extraCourses = useMemo(() => {
    if (!courses?.length || !selectedIds?.length) return []

    let activeSet
    if (enrollmentVersion === 'new' && enrollment?.length) {
      activeSet = new Set(
        enrollment
          .filter(e =>
            (e.year === selectedGrade || e.year === null) &&
            (e.semester === semester || e.semester === null)
          )
          .map(e => `${e.class_id}|${e.academic_year ?? ''}`)
      )
    } else {
      activeSet = new Set(selectedIds)
    }

    return courses.filter(c => {
      const t  = c.normalized_time
      const ck = `${c.class_id}|${c.academic_year ?? ''}`
      return (!t || t === 'EXTRA' || t === '0') &&
             semesterTerms.includes(c.term) &&
             activeSet.has(ck)
    })
  }, [courses, selectedIds, semesterTerms, enrollment, enrollmentVersion, selectedGrade, semester])

  const [extraOpen, setExtraOpen] = useState(false)

  // ── 通常授業の集計（学期グリッドに表示中の科目） ───────────────────────────
  const regularCourseSummary = useMemo(() => {
    const uniqueIds = new Set(catalogEntries.map(e => e.classId).filter(Boolean))
    const count   = uniqueIds.size + new Set(manualEntries.map(e => e.courseTitle)).size
    const credits = [...uniqueIds].reduce((sum, id) => {
      const c = courses?.find(c => c.class_id === id)
      return sum + (Number(c?.credits) || 0)
    }, 0)
    return { count, credits }
  }, [catalogEntries, manualEntries, courses])

  // ── セルスタイル（'tall' = 縦長固定・スクロール / 'square' = 均等・スクロールなし） ──
  const [cellStyle, setCellStyle] = useState(() => {
    if (typeof window === 'undefined') return 'square'
    return localStorage.getItem(CELL_STYLE_KEY) ?? 'square'
  })
  const handleCellStyleChange = useCallback((value) => {
    setCellStyle(value)
    try { localStorage.setItem(CELL_STYLE_KEY, value) } catch {}
  }, [])

  // ── セル高さを動的計算（均等・スクロールなし） ─────────────────────────────
  const rowsRef = useRef(null)
  const [cellH, setCellH] = useState(72)
  useEffect(() => {
    const el = rowsRef.current
    if (!el) return
    // 縦長・均等ともに ResizeObserver でセル高さを計算（スクロールなし）
    const compute = () => {
      const h = Math.max(48, Math.floor(el.offsetHeight / periodConfig.length))
      setCellH(h)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [periodConfig.length, cellStyle])

  const handleAddExtra = useCallback((classId) => {
    if (classId && onToggleEnrollment) {
      const course = courses?.find(c => c.class_id === classId && (academicYear == null || c.academic_year === academicYear))
      const ck = `${classId}|${course?.academic_year ?? ''}`
      if (!selectedIds?.includes(ck)) {
        onToggleEnrollment(classId)
        onEntriesChange?.()
      }
    }
    setExtraAddOpen(false)
  }, [courses, academicYear, onToggleEnrollment, selectedIds, onEntriesChange])

  const handleRemoveExtra = useCallback((classId) => {
    if (classId && onToggleEnrollment) {
      const course = courses?.find(c => c.class_id === classId && (academicYear == null || c.academic_year === academicYear))
      const ck = `${classId}|${course?.academic_year ?? ''}`
      if (selectedIds?.includes(ck)) {
        onToggleEnrollment(classId)
        onEntriesChange?.()
      }
    }
  }, [courses, academicYear, onToggleEnrollment, selectedIds, onEntriesChange])

  /**
   * エントリクリック時の振り分け:
   *   新スキーマ + カタログ授業 → CourseModal（ステータス変更可）
   *   それ以外                 → CourseDetailModal（従来の簡易モーダル）
   */
  const handleEntryClick = useCallback((entry) => {
    if (enrollmentVersion === 'new' && entry._catalog && entry.classId) {
      // academic_year が一致するコースを優先して探す（展開済みコースで同 class_id が複数年ある場合に対応）
      const course = courses.find(c => c.class_id === entry.classId && c.academic_year === entry.academicYear)
                  ?? courses.find(c => c.class_id === entry.classId)
      if (course) {
        setCatalogDetail({ course, classId: entry.classId, entry })
        return
      }
    }
    setDetailEntry(entry)
  }, [enrollmentVersion, courses])

  // 年度チェック付きモーダル開閉
  // academic_year が設定された授業が存在し、かつ現在の academicYear と一致するものが
  // ひとつもない場合は警告トーストを表示するが、モーダルは開く。
  // （カタログが古い年度のみの場合でも登録できるようにするため）
  const openModal = useCallback((day, period, lockedTerm) => {
    // 休学中は履修登録不可
    if (isOnLeave) return
    if (academicYear != null) {
      const coursesWithAY = (courses ?? []).filter(c => c.academic_year != null)
      const hasMatch = coursesWithAY.some(c => c.academic_year === academicYear)
      if (coursesWithAY.length > 0 && !hasMatch) {
        // 年度ミスマッチ → 警告トーストを表示（ただしモーダルは開く）
        setYearWarnVisible(true)
        if (yearWarnTimer.current) clearTimeout(yearWarnTimer.current)
        yearWarnTimer.current = setTimeout(() => setYearWarnVisible(false), 3500)
      }
    }
    setAddModal({ day, period, lockedTerm })
  }, [academicYear, courses, isOnLeave])

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
    // 仮登録授業はステータス変更不可のため一括選択から除外
    const gridIds  = entries.filter(e => e._catalog && e.classId && !e.isTemporary).map(e => e.classId)
    const extraIds = extraCourses
      .filter(c => !temporaryIds.has(`${c.class_id}|${c.academic_year ?? ''}`))
      .map(c => c.class_id)
    setBulkSelected(new Set([...gridIds, ...extraIds]))
  }, [entries, extraCourses, temporaryIds])

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

  // リセット: 手動エントリ削除 + 新スキーマでは当学年学期の履修を API から一括解除
  const [resetBusy, setResetBusy] = useState(false)
  async function handleReset() {
    setConfirmReset(false)

    // 1. 手動エントリ（localStorage）を削除
    clearEntries(academicYear, semester)
    setManualEntries([])
    onEntriesChange?.()

    // 2. 新スキーマ: API 経由でカタログ授業・時間外授業を一括解除
    if (enrollmentVersion === 'new') {
      const idsToRemove = [
        ...new Set([
          ...catalogEntries.map(e => e.classId).filter(Boolean),
          ...extraCourses.map(c => c.class_id).filter(Boolean),
        ])
      ]
      if (idsToRemove.length > 0) {
        setResetBusy(true)
        await Promise.all(
          idsToRemove.map(classId =>
            fetch('/api/enrollment', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ classId, status: 'REMOVE' }),
            }).catch(e => console.error('[handleReset] remove failed:', classId, e))
          )
        )
        setResetBusy(false)
        onBulkStatusDone?.()   // SWR を再検証して UI に反映
      }
    }
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
      <div className="bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-3 pt-2 pb-0 flex flex-col gap-0">

        {/* 学年ピル行 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {Array.from({ length: maxGrade }, (_, i) => i + 1).map(grade => {
            const isLast      = grade === maxGrade
            const isActive    = grade === selectedGrade
            // この学年のいずれかの学期が休学中かどうか
            const hasLeave    = isLeaveSemester(leaveSemesters, grade, 'spring') ||
                                isLeaveSemester(leaveSemesters, grade, 'fall')
            // アクティブ & 休学中の場合は紫、そうでなければ通常の色
            const activeStyle = isOnLeave && isActive
              ? 'bg-purple-500 text-white'
              : isActive
                ? 'bg-blue-500 text-white'
                : hasLeave
                  ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20'
                  : 'bg-gray-100 dark:bg-[#252839] text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-[#2a2d3f]'
            return (
              <div key={grade} className="relative flex-shrink-0">
                <button
                  onClick={() => onGradeChange(grade)}
                  className={`text-xs font-semibold rounded-xl transition-colors ${activeStyle
                  } ${isLast && maxGrade > 4 ? 'pl-3 pr-6 py-1.5' : 'px-3 py-1.5'}`}
                >
                  {grade}年生
                  {hasLeave && (
                    <span className="ml-1 text-[9px] opacity-80">🏠</span>
                  )}
                </button>
                {isLast && maxGrade > 4 && (
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
            className="flex-shrink-0 text-xs text-gray-400 dark:text-slate-500 font-medium px-3 py-1.5
                       rounded-xl border border-dashed border-gray-200 dark:border-white/[0.07]
                       hover:border-blue-300 hover:text-blue-400 transition-colors whitespace-nowrap"
          >
            ＋ 学年を追加
          </button>
        </div>

        {/* 学期タブ + 設定ボタン行 */}
        <div className="flex items-center">
          <div className="flex gap-4">
            {Object.entries(SEMESTER_LABELS).map(([key, label]) => {
              const tabIsLeave = isLeaveSemester(leaveSemesters, selectedGrade, key)
              const isActive   = termFilter === label
              return (
              <button key={key} onClick={() => onTermFilterChange(label)}
                className={`pb-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1 ${
                  isActive && tabIsLeave
                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                    : isActive
                      ? 'border-blue-500 text-blue-600'
                      : tabIsLeave
                        ? 'border-transparent text-purple-400 dark:text-purple-500'
                        : 'border-transparent text-gray-400 dark:text-slate-500'
                }`}>
                {label}
                {tabIsLeave && <span className="text-[10px]">🔒</span>}
              </button>
              )
            })}
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
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500
                         hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
              title="手動追加授業をリセット"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500
                         hover:text-gray-600 dark:hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50 dark:hover:bg-[#252839]"
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

      {/* ── 休学中バナー（グリッド上部の補足帯） ────────────────────────────── */}
      {isOnLeave && (
        <div className="mx-2 mb-1 flex-shrink-0">
          <div className="flex items-center gap-2 bg-purple-100 dark:bg-purple-500/15
                          border border-purple-200 dark:border-purple-500/30
                          rounded-xl px-3 py-1.5">
            <span className="text-sm flex-shrink-0">🏠</span>
            <p className="text-[11px] font-bold text-purple-700 dark:text-purple-300 tracking-wide uppercase">
              LEAVE OF ABSENCE — 休学中
            </p>
          </div>
        </div>
      )}

      {/* ── 将来年度シミュレーション バナー ────────────────────────────────────── */}
      {isFutureYearMode && (
        <div className="mx-2 mb-1 flex-shrink-0">
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-500/10
                          border border-amber-200 dark:border-amber-500/30
                          rounded-xl px-3.5 py-2.5">
            <span className="text-[9px] font-bold bg-amber-400 text-white px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">仮</span>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 leading-snug">
              {academicYear}年度の開講情報は未確定のため、最新の{latestYear}年度データを用いて仮登録します。
              卒業要件の集計には含まれません。
            </p>
          </div>
        </div>
      )}

      {/* ── 年度ミスマッチ警告トースト ──────────────────────────────────────── */}
      {yearWarnVisible && (
        <div className="mx-2 mb-1 flex-shrink-0">
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-500/10
                          border border-amber-200 dark:border-amber-500/30
                          rounded-xl px-3.5 py-2.5">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 leading-snug">
                {academicYear}年度の授業がありません
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5 leading-snug">
                現在の学年・入学年度設定では、この年度に開講された授業を登録できません。
              </p>
            </div>
            <button onClick={() => setYearWarnVisible(false)}
              className="text-amber-400 dark:text-amber-500 flex-shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── グリッド（ResizeObserver で均等セル高さを保証） ──────────────────── */}
      <div className="flex-1 min-h-0 px-2 pt-2 pb-1">
        <div className="relative h-full bg-white dark:bg-[#1a1d27] rounded-2xl overflow-hidden shadow-sm dark:shadow-none flex flex-col">

          {/* ── 曜日ヘッダー行 ───────────────────────────────────────────────── */}
          <div className="flex flex-shrink-0 border-b border-gray-100 dark:border-white/[0.06]">
            {/* コマ列ヘッダー（時刻列と幅を合わせる） */}
            <div className="w-10 flex-shrink-0 bg-gray-50 dark:bg-white/[0.025] rounded-tl-2xl" />
            {DAYS.map(d => (
              <div key={d} className="flex-1 py-1.5 text-center text-[11px] font-bold text-gray-500 dark:text-slate-400">
                {DAY_LBL[d]}
              </div>
            ))}
          </div>

          {/* ── コマ行コンテナ（ResizeObserver でサイズを測定・両モードともスクロールなし） */}
          <div ref={rowsRef}
            className="flex-1 min-h-0 overflow-hidden">
            {periodConfig.map(({ period, start, end }) => (
              <div key={period}
                className="flex border-b border-gray-50 dark:border-white/[0.04] last:border-0"
                style={{ height: cellH }}>

                {/* 時刻 + コマ番号（左列） */}
                <div className="w-10 flex-shrink-0 flex flex-col items-center justify-center gap-px select-none
                                bg-gray-50 dark:bg-white/[0.025]
                                border-r border-gray-100 dark:border-white/[0.06]">
                  <span className="leading-none tabular-nums text-gray-300 dark:text-slate-700" style={{ fontSize: 7 }}>
                    {start}
                  </span>
                  <span className="font-black text-gray-300 dark:text-slate-600 leading-none" style={{ fontSize: 13 }}>
                    {period}
                  </span>
                  <span className="leading-none tabular-nums text-gray-300 dark:text-slate-700" style={{ fontSize: 7 }}>
                    {end}
                  </span>
                </div>

                {/* ── 曜日セル ──────────────────────────────────────────────── */}
                {DAYS.map(d => {
                  const cell = entries.filter(e => e.day === d && e.period === period)

                  const halfEntry  = cell.find(e => e.term == null)  ?? null
                  const upperEntry = cell.find(e => e.term === oddT) ?? null
                  const lowerEntry = cell.find(e => e.term === evnT) ?? null
                  const isSplit    = upperEntry != null || lowerEntry != null

                  return (
                    <div key={d}
                      className="flex-1 border-l border-gray-50 dark:border-white/[0.04] overflow-hidden">

                      {/* CASE 1: 通常授業（セル全体） */}
                      {halfEntry && (
                        <CourseBlock
                          entry={halfEntry}
                          cellH={cellH}
                          isTallStyle={cellStyle === 'tall'}
                          onClick={() =>
                            bulkSelectMode && halfEntry.classId && halfEntry._catalog && !halfEntry.isTemporary
                              ? handleBulkToggle(halfEntry.classId)
                              : handleEntryClick(halfEntry)
                          }
                          selectable={bulkSelectMode && !!halfEntry.classId && halfEntry._catalog && !halfEntry.isTemporary}
                          selected={bulkSelected.has(halfEntry.classId)}
                        />
                      )}

                      {/* CASE 2: ターム分割（上下半分） */}
                      {!halfEntry && isSplit && (
                        <div className="h-full flex flex-col">

                          {/* 上半分 */}
                          <div className="flex-1 min-h-0 overflow-hidden">
                            {upperEntry ? (
                              <CourseBlock
                                entry={upperEntry}
                                cellH={cellH}
                                isHalf
                                isTallStyle={cellStyle === 'tall'}
                                onClick={() =>
                                  bulkSelectMode && upperEntry.classId && upperEntry._catalog && !upperEntry.isTemporary
                                    ? handleBulkToggle(upperEntry.classId)
                                    : handleEntryClick(upperEntry)
                                }
                                selectable={bulkSelectMode && !!upperEntry.classId && upperEntry._catalog && !upperEntry.isTemporary}
                                selected={bulkSelected.has(upperEntry.classId)}
                              />
                            ) : (
                              <div
                                className="h-full flex items-center justify-center cursor-pointer
                                           hover:bg-blue-50/60 dark:hover:bg-blue-500/5 transition-colors"
                                onClick={() => openModal(d, period, oddT)}
                              >
                                <span className="text-blue-200 dark:text-blue-500/30 select-none" style={{ fontSize: 11 }}>+</span>
                              </div>
                            )}
                          </div>

                          {/* 仕切り線 */}
                          <div className="h-px flex-shrink-0 bg-gray-100 dark:bg-white/[0.05]" />

                          {/* 下半分 */}
                          <div className="flex-1 min-h-0 overflow-hidden">
                            {lowerEntry ? (
                              <CourseBlock
                                entry={lowerEntry}
                                cellH={cellH}
                                isHalf
                                isTallStyle={cellStyle === 'tall'}
                                onClick={() =>
                                  bulkSelectMode && lowerEntry.classId && lowerEntry._catalog && !lowerEntry.isTemporary
                                    ? handleBulkToggle(lowerEntry.classId)
                                    : handleEntryClick(lowerEntry)
                                }
                                selectable={bulkSelectMode && !!lowerEntry.classId && lowerEntry._catalog && !lowerEntry.isTemporary}
                                selected={bulkSelected.has(lowerEntry.classId)}
                              />
                            ) : (
                              <div
                                className="h-full flex items-center justify-center cursor-pointer
                                           hover:bg-violet-50/60 dark:hover:bg-violet-500/5 transition-colors"
                                onClick={() => openModal(d, period, evnT)}
                              >
                                <span className="text-violet-200 dark:text-violet-500/30 select-none" style={{ fontSize: 11 }}>+</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* CASE 3: 空セル */}
                      {!halfEntry && !isSplit && (
                        <div
                          className="h-full flex items-center justify-center cursor-pointer
                                     hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                          onClick={() => openModal(d, period, null)}
                        >
                          <span className="text-gray-200 dark:text-white/[0.07] select-none font-light"
                            style={{ fontSize: 18 }}>
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

          {/* ── 休学中オーバーレイ ─────────────────────────────────────────── */}
          {isOnLeave && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5
                            bg-white/75 dark:bg-[#1a1d27]/80 backdrop-blur-[3px] rounded-2xl
                            pointer-events-auto select-none">

              {/* アイコンリング */}
              <div className="w-20 h-20 rounded-full
                              bg-purple-100 dark:bg-purple-500/20
                              border-2 border-purple-200 dark:border-purple-500/40
                              flex items-center justify-center shadow-lg">
                <span className="text-4xl" aria-hidden>🏠</span>
              </div>

              {/* テキスト */}
              <div className="flex flex-col items-center gap-1.5 px-8 text-center">
                <p className="text-xl font-black text-purple-800 dark:text-purple-200 tracking-tight">
                  休学中
                </p>
                <p className="text-sm font-semibold text-purple-600 dark:text-purple-300">
                  この学期は履修登録できません
                </p>
                <p className="text-[11px] text-purple-400 dark:text-purple-500 mt-1 leading-relaxed">
                  休学期間の変更は左メニュー →<br />所属 → 休学期間 から行えます
                </p>
              </div>

              {/* ロックアイコン */}
              <div className="flex items-center gap-1.5 bg-purple-100 dark:bg-purple-500/15
                              border border-purple-200 dark:border-purple-500/25
                              rounded-full px-4 py-1.5">
                <svg className="w-3 h-3 text-purple-500 dark:text-purple-400 flex-shrink-0"
                     fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd" />
                </svg>
                <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                  履修ロック中
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 通常授業 集計ライン ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-50 dark:bg-[#111318] border-t border-gray-100 dark:border-white/[0.05] px-4 py-1.5">
        <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">
          通常授業　{regularCourseSummary.count}授業 · {regularCourseSummary.credits}単位
        </span>
      </div>

      {/* ── 時間外授業パネル（折り畳み、スクロールなしで常時表示） ────────────── */}
      <div className="flex-shrink-0 px-2 pb-2">
        <div className="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-sm dark:shadow-none overflow-hidden">
          <div className="flex items-center px-4 py-3">
            <button
              onClick={() => setExtraOpen(o => !o)}
              className="flex-1 flex items-center gap-2 text-left select-none"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">時間外授業</span>
                {extraCourses.length > 0 && (
                  <span className="text-xs text-gray-400 dark:text-slate-500">
                    {extraCourses.length}授業 · {extraCourses.reduce((s, c) => s + (Number(c.credits) || 0), 0)}単位
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => !isOnLeave && setExtraAddOpen(true)}
              disabled={isOnLeave}
              className={`w-6 h-6 flex items-center justify-center rounded-lg
                         transition-colors mr-1
                         ${isOnLeave
                           ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
                           : 'text-blue-400 hover:text-blue-600 hover:bg-blue-50'}`}
              title={isOnLeave ? '休学中は履修登録できません' : '時間外授業を追加'}
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
            <div className="border-t border-gray-50 dark:border-white/[0.05] px-3 pb-3 pt-2 flex flex-col gap-1.5 max-h-[38vh] overflow-y-auto overscroll-contain">
              {extraCourses.length === 0 ? (
                <p className="text-center text-xs text-gray-300 dark:text-slate-600 py-4">
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
                    <div key={`${c.class_id}|${c.academic_year ?? ''}`}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2
                                  cursor-pointer transition-all
                                  ${isSelected
                                    ? 'bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-indigo-300 dark:ring-indigo-500/30'
                                    : isSelectable
                                      ? 'bg-gray-50 dark:bg-[#1f2235] opacity-70'
                                      : 'bg-gray-50 dark:bg-[#1f2235] active:opacity-70'}`}
                      onClick={handleClick}
                    >
                      {/* 一括選択チェックバッジ */}
                      {isSelectable && (
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                                         ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'bg-white dark:bg-[#252839] border-gray-300 dark:border-white/20'}`}>
    {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">
                          {c.course_name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${pillCls}`}>
                            {termLabel}
                          </span>
                          {c.intructor && (
                            <span className="text-xs text-gray-400 dark:text-slate-500 truncate">{c.intructor}</span>
                          )}
                          {enrollmentVersion === 'new' && statusMap?.get(`${c.class_id}|${c.academic_year ?? ''}`) && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                                             ${STATUS_CONFIG[statusMap.get(`${c.class_id}|${c.academic_year ?? ''}`) ]?.badge ?? 'bg-gray-100 text-gray-500'}`}>
                              {STATUS_CONFIG[statusMap.get(`${c.class_id}|${c.academic_year ?? ''}`) ]?.label ?? statusMap.get(`${c.class_id}|${c.academic_year ?? ''}`)}
                            </span>
                          )}
                        </div>
                      </div>
                      {c.credits && (
                        <span className="text-xs font-bold text-gray-400 dark:text-slate-500 flex-shrink-0">
                          {c.credits}単位
                        </span>
                      )}
                      {!isSelectable && (
                        <svg className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-t border-gray-100 dark:border-white/[0.07] px-3 py-3 flex flex-col gap-2.5">

          {/* 選択数 + 全選択・クリア */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              {bulkSelected.size} 件選択中
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkSelectAll}
                className="text-xs text-gray-500 dark:text-slate-400 font-medium px-2.5 py-1 rounded-lg
                           border border-gray-200 dark:border-white/[0.07] hover:bg-gray-50 dark:hover:bg-[#252839] transition-colors"
              >
                全選択
              </button>
              <button
                onClick={handleBulkClear}
                className="text-xs text-gray-500 dark:text-slate-400 font-medium px-2.5 py-1 rounded-lg
                           border border-gray-200 dark:border-white/[0.07] hover:bg-gray-50 dark:hover:bg-[#252839] transition-colors"
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
          isTemporary={temporaryIds.has(`${catalogDetail.classId}|${catalogDetail.course?.academic_year ?? ''}`)}
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
          enrollStatus={statusMap?.get(`${catalogDetail.classId}|${catalogDetail.course?.academic_year ?? ''}`)}
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
          message={enrollmentVersion === 'new'
            ? `${selectedGrade}年生・${termFilter}の授業登録をすべてリセットしますか？`
            : `手動追加した授業をリセットしますか？`}
          sub={enrollmentVersion === 'new'
            ? '時間割・時間外授業の登録を解除し、要件集計からも除外されます。'
            : 'カタログから登録した授業は「履修登録」タブから解除してください。'}
          confirmLabel="リセット"
          confirmClass="bg-red-500 text-white"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}
      {/* リセット処理中オーバーレイ */}
      {resetBusy && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.35)', maxWidth: 430, margin: '0 auto' }}>
          <div className="bg-white dark:bg-[#1f2235] rounded-2xl px-8 py-6 flex items-center gap-3 shadow-xl">
            <svg className="w-5 h-5 animate-spin text-red-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">リセット中…</span>
          </div>
        </div>
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

      {/* ── 仮登録確認ダイアログ ──────────────────────────────────────────────── */}
      {pendingTempAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.45)', maxWidth: 430, margin: '0 auto' }}
          onClick={() => setPendingTempAdd(null)}
        >
          <div className="bg-white dark:bg-[#1f2235] rounded-3xl p-6 w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold bg-amber-400 text-white px-2 py-0.5 rounded-full">仮</span>
              <span className="text-sm font-bold text-gray-800 dark:text-slate-100">仮登録として追加されます</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mb-5">
              {academicYear}年度の開講情報は未確定のため、最新の<strong className="text-gray-700 dark:text-slate-200">{latestYear}年度</strong>データを用いて仮登録します。
              仮登録は卒業要件の集計に含まれませんが、「仮登録を含む」をONにすると集計されます。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingTempAdd(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-white/[0.07]
                           text-sm text-gray-600 dark:text-slate-300 font-semibold"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  const data = pendingTempAdd
                  // latestYear の course を探す（将来年度は latestYear にクランプ済み）
                  const addedCourse = courses?.find(c => c.class_id === data.classId && c.academic_year === latestYear)
                                   ?? courses?.find(c => c.class_id === data.classId)
                  const ck = `${data.classId}|${addedCourse?.academic_year ?? ''}`
                  if (onToggleEnrollment && !selectedIds?.includes(ck)) {
                    onToggleEnrollment(data.classId)
                  }
                  setPendingTempAdd(null)
                }}
                className="flex-1 py-3 rounded-2xl bg-amber-500 text-white
                           text-sm font-bold hover:bg-amber-600 transition-colors"
              >
                仮登録する
              </button>
            </div>
          </div>
        </div>
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
          displayGrade={displayGrade ?? selectedGrade}
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
          cellStyle={cellStyle}
          onCellStyleChange={handleCellStyleChange}
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
          displayGrade={displayGrade ?? selectedGrade}
          semester={semester}
          academicYear={academicYear}
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
      <div className="relative w-full bg-white dark:bg-[#1f2235] rounded-t-3xl flex flex-col px-4 pt-3 pb-6 gap-4">
        <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto" />

        <div className={`rounded-2xl ${c.bg} border ${c.bd} px-4 py-3 flex flex-col gap-2`}>
          <div className={`text-base font-bold ${c.name} leading-snug`}>
            {course.course_name}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#252839] text-gray-500 dark:text-slate-400">
              時間外
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              termNum == null ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                : termNum % 2 === 1 ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300'
                : 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300'
            }`}>{termLabel}</span>
            {course.room && (
              <span className={`${c.pill} text-white text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
                {course.room}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            {course.intructor && <span>{course.intructor}</span>}
            {course.credits   && <span className="font-semibold">{course.credits}単位</span>}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-white/[0.07] text-sm text-gray-600 dark:text-slate-300 font-semibold">
            閉じる
          </button>
          <button
            onClick={() => { onUnenroll(course.class_id); onClose() }}
            className="flex-1 py-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-sm text-red-500 dark:text-red-400 font-semibold">
            履修解除
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AddExtraModal ─────────────────────────────────────────────────────────────

function AddExtraModal({ courses, grade, displayGrade, semester, academicYear, selectedIds, onAdd, onClose }) {
  const [query,          setQuery]          = useState('')
  const [preview,        setPreview]        = useState(null)
  const [prioritizeGrade, setPrioritizeGrade] = useState(true)  // 学年優先ソート（デフォルトON）

  // 学年・学期・開講年度の条件を満たす時間外コースのみ（授業名なしは除外）
  const extraList = useMemo(() => {
    return courses.filter(c => {
      const t = c.normalized_time
      return (!t || t === 'EXTRA' || t === '0') &&
             c.course_name?.trim() &&   // 授業名なしを除外
             isCourseEligible(c, grade, semester) &&
             (academicYear == null || c.academic_year == null || c.academic_year === academicYear)
    })
  }, [courses, grade, semester, academicYear])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    const base = q
      ? extraList.filter(c =>
          c.course_name?.toLowerCase().includes(q) ||
          c.intructor?.toLowerCase().includes(q)
        )
      : extraList

    if (!prioritizeGrade) return base
    // 表示学年（displayGrade）に一致する year の授業を優先（休学補正済み）
    const sortGrade = displayGrade ?? grade
    return [...base].sort((a, b) => {
      const aMatch = String(a.year) === String(sortGrade) ? 0 : 1
      const bMatch = String(b.year) === String(sortGrade) ? 0 : 1
      return aMatch - bMatch
    })
  }, [extraList, query, grade, displayGrade, prioritizeGrade])

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end" style={{ maxWidth: 430, margin: '0 auto' }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full bg-white dark:bg-[#1f2235] rounded-t-3xl flex flex-col" style={{ maxHeight: '80dvh' }}>

        <div className="flex-shrink-0 px-4 pt-2 pb-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mb-3" />
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-bold text-gray-900 dark:text-slate-100">時間外授業を追加</div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">集中講義・特別授業など</div>
            </div>
            <div className="flex items-center gap-2">
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

        <div className="flex-shrink-0 px-4 py-2 border-b border-gray-50 dark:border-white/[0.05]">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="授業名・担当者で検索" autoFocus
              className="w-full bg-gray-50 dark:bg-[#252839] rounded-xl pl-9 pr-8 py-2 text-sm border border-gray-100 dark:border-white/[0.07]
                         focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-slate-200" />
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
            const enrolled = selectedIds?.includes(`${c.class_id}|${c.academic_year ?? ''}`)
            const termNum  = TERM_TO_NUM[c.term] ?? null
            const isTerm   = termNum != null
            const pillCls  = isTerm
              ? (termNum % 2 === 1 ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600')
              : 'bg-indigo-50 text-indigo-500'
            return (
              <button key={`${c.class_id}|${c.academic_year ?? ''}`}
                onClick={() => !enrolled && setPreview(c)}
                disabled={enrolled}
                className={`w-full text-left rounded-xl px-3 py-2.5 mb-1.5 border transition-all
                  ${enrolled
                    ? 'bg-green-50 dark:bg-green-500/10 border-green-100 dark:border-green-500/20 opacity-60'
                    : 'bg-gray-50 dark:bg-[#252839] border-gray-100 dark:border-white/[0.07] hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:border-blue-200 dark:hover:border-blue-500/20 active:scale-[0.99]'}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">{c.course_name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${pillCls}`}>
                        {c.term || '通年'}
                      </span>
                      {c.room      && <span className="text-xs text-gray-400 dark:text-slate-500">{c.room}</span>}
                      {c.intructor && <span className="text-xs text-gray-400 dark:text-slate-500 truncate">{c.intructor}</span>}
                    </div>
                  </div>
                  {c.credits && <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">{c.credits}単位</span>}
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
      <div className="relative w-full bg-white dark:bg-[#1f2235] rounded-2xl shadow-xl dark:shadow-none p-5 flex flex-col gap-4">
        <div>
          <div className="text-sm font-bold text-gray-900 dark:text-slate-100 leading-snug">{message}</div>
          {sub && <div className="text-xs text-gray-400 dark:text-slate-500 mt-1">{sub}</div>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.07] text-sm text-gray-600 dark:text-slate-300 font-semibold">
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
