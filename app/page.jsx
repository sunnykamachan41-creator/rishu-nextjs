'use client'
import { useState, useCallback, useMemo, useEffect } from 'react'
import useSWR from 'swr'
import TimetableV2 from '@/components/TimetableV2'
import CourseList from '@/components/CourseList'
import Requirements from '@/components/Requirements'
import GraduationTabV2 from '@/components/GraduationTabV2'
import Dashboard from '@/components/Dashboard'
import EmptyRooms from '@/components/EmptyRooms'
// PracticeChecker は summary タブ廃止に伴い一時非表示
// import PracticeChecker from '@/components/PracticeChecker'
import ExemptionModal from '@/components/ExemptionModal'
import { DEFAULT_FILTERS } from '@/components/FilterDrawer'
import {
  loadEnrollmentYear, saveEnrollmentYear,
  loadMaxGrade, saveMaxGrade,
  gradeToYear,
} from '@/lib/periodConfig'
import { termToSemKey, isCourseEligible, logEligibilityCheck } from '@/lib/eligibility'
import { shouldShowReEnrollModal, canReEnroll } from '@/lib/enrollmentStatus'
import ReEnrollModal from '@/components/ReEnrollModal'
import OnboardingModal from '@/components/OnboardingModal'
import { buildDepartmentsMap, getDepartmentLabel } from '@/lib/departments'
import { loadEntries } from '@/lib/enrollmentStore'   // useCreditSummary の grade 配置マップ用
import { useCreditSummary } from '@/lib/useCreditSummary'
// import { evaluateAllPractices } from '@/lib/practiceEligibility'
import { loadExemptions } from '@/lib/exemptionStore'
import { useSearchParams } from 'next/navigation'


// ── SWR fetcher ───────────────────────────────────────────────────────────────

const fetcher = url => fetch(url).then(r => {
  if (!r.ok) return r.json().then(d => Promise.reject(d))
  return r.json()
})

// ── Term helpers ──────────────────────────────────────────────────────────────
// Eligibility rules (grade + semester) live in lib/eligibility.ts.
// termToSemKey / isCourseEligible are imported from there.

// ── Exemption → Requirements 補正 ────────────────────────────────────────────
/**
 * サーバー計算済みの requirements に exemption 単位を上乗せして再評価する。
 *
 * compute.js はサーバー側で selectedIds のみを参照するため exemption を知らない。
 * 各 requirement の source_groups タグに対応する exemption クレジットを earned に
 * 加算し、status / shortage を再計算する。
 */
function applyExemptionsToRequirements(requirements, exemptions) {
  if (!exemptions?.length || !requirements?.length) return requirements ?? []

  // exemption クレジットをタグ別に集計
  const bonusByTag = {}
  for (const ex of exemptions) {
    for (const [cat, credits] of Object.entries(ex.categoryCredits)) {
      bonusByTag[cat] = (bonusByTag[cat] || 0) + credits
    }
  }

  return requirements.map(req => {
    const groups = req.source_groups
      ? String(req.source_groups).split(';').map(s => s.trim()).filter(Boolean)
      : []

    const bonus = groups.reduce((sum, g) => sum + (bonusByTag[g] || 0), 0)
    if (bonus === 0) return req

    const newEarned = (Number(req.earned_units) || 0) + bonus

    // FIXED / info / optional → ステータスは変えず earned_units だけ更新
    if (req.status === 'info' || req.status === 'optional') {
      return { ...req, earned_units: newEarned }
    }

    // MIN / SUM / SELECT_ONE → earned_units + status / shortage を再計算
    const need        = Number(req.min_units) || 0
    const newShortage = Math.max(0, need - newEarned)

    return {
      ...req,
      earned_units: newEarned,
      shortage:     newShortage,
      status:       newShortage === 0 ? 'ok' : 'short',
    }
  })
}

// ── Degree helpers ────────────────────────────────────────────────────────────

const FIXED_DEGREES    = new Set(['COMMON', 'ELE'])
const OPTIONAL_DEGREES = ['HIENG', 'KIND', 'LIB']
const DEGREE_LABELS = {
  COMMON: '英語科共通必修',
  ELE:    '小学校免許必修',
  HIENG:  '中高英語免許取得',
  KIND:   '幼稚園免許取得',
  LIB:    '司書教諭取得',
}

function loadActiveDegrees() {
  if (typeof window === 'undefined') return new Set(['COMMON', 'ELE'])
  try {
    const saved = localStorage.getItem('rishu_active_degrees')
    if (saved) return new Set(JSON.parse(saved))
  } catch {}
  return new Set(['COMMON', 'ELE'])
}

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'timetable',    label: '時間割',   icon: CalendarIcon },
  { id: 'courses',      label: '履修登録', icon: BookIcon },
  { id: 'requirements', label: '卒業要件', icon: CheckIcon },
  { id: 'summary',      label: 'ダッシュボード', icon: ChartIcon },
  { id: 'emptyrooms',   label: '空き部屋', icon: DoorIcon },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Page() {
  const searchParams = useSearchParams()
  const studentId = searchParams.get('student_id') ?? 'student_001'

  const [tab, setTab] = useState('timetable')
  const [toggling, setToggling] = useState(null) // classId currently being toggled
  const [timetableTermFilter, setTimetableTermFilter] = useState('春学期')

  // 再履修・聴講モーダル
  // { classId, courseId, course } | null
  const [reEnrollModal, setReEnrollModal] = useState(null)

  // ── ユーザー専攻（オンボーディングで確定、全集計ロジックの前提情報）──────────
  // 初期値は必ず '' とし、サーバー（users シート）の値を正として useEffect で反映する。
  // localStorage は使用しない（student_id ごとに異なる値が混在するため）。
  const [department, setDepartment] = useState('')

  /**
   * department 選択確定ハンドラ。
   * 1. POST /api/users でサーバー（users シート）に書き込む
   * 2. 成功を確認してから state を更新し SWR を再検証（サーバー値で上書き）
   * 3. 失敗時は state を変更しない（モーダルは閉じない）
   *
   * localStorage は使用しない（student_id ごとに混在するため）。
   */
  const handleDepartmentSelect = useCallback(async (value) => {
    // Empty value = "change department" action: reset to re-open OnboardingModal.
    if (!value) {
      setDepartment('')
      return
    }

    try {
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ department_id: value, studentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('[handleDepartmentSelect] save failed:', err)
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      console.log('[handleDepartmentSelect] user department saved:', value)
      setDepartment(value)
      mutate()   // SWR 再検証でサーバー側の userDepartment を同期
    } catch (err) {
      console.error('[handleDepartmentSelect] network error:', err)
      throw err   // re-throw so OnboardingModal can catch and show error message
    }
  // mutate は useSWR より前に宣言されているため deps には含めない。
  // SWR の mutate は同一 key に対して参照安定であるため stale closure の問題はない。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  // 「取得予定を含む」モード（履修予定・履修中を取得済みとして卒業要件・単位集計に計上）
  const [includeProjected, setIncludeProjected] = useState(() => {
    try { return localStorage.getItem('rishu_include_projected') === '1' } catch { return false }
  })

  // 学年管理
  const [enrollmentYear, setEnrollmentYear] = useState(loadEnrollmentYear)
  const [maxGrade,       setMaxGrade]       = useState(loadMaxGrade)
  // 選択中の学年（1始まり）→ 年度に変換して内部管理
  const [selectedGrade,  setSelectedGrade]  = useState(1)
  const academicYear = gradeToYear(selectedGrade, enrollmentYear)

  const handleGradeChange = useCallback((grade) => {
    setSelectedGrade(grade)
  }, [])

  const handleAddGrade = useCallback(() => {
    const next = maxGrade + 1
    setMaxGrade(next)
    saveMaxGrade(next)
    setSelectedGrade(next)
  }, [maxGrade])

  const handleDeleteGrade = useCallback(() => {
    if (maxGrade <= 1) return
    const next = maxGrade - 1
    setMaxGrade(next)
    saveMaxGrade(next)
    if (selectedGrade > next) setSelectedGrade(next)
  }, [maxGrade, selectedGrade])

  const handleEnrollmentYearChange = useCallback((year) => {
    setEnrollmentYear(year)
    saveEnrollmentYear(year)
  }, [])

  // timetable エントリ変更時に useCreditSummary の再計算をトリガーする
  const [entrySyncKey, setEntrySyncKey] = useState(0)
  const handleEntriesChange = useCallback(() => {
    setEntrySyncKey(k => k + 1)
  }, [])

  // 単位認定（enrollment とは完全に別管理）
  const [exemptions,      setExemptions]      = useState(loadExemptions)
  const [exemptionOpen,   setExemptionOpen]   = useState(false)

  const [activeDegrees, setActiveDegrees] = useState(loadActiveDegrees)
  const [courseFilters, setCourseFilters] = useState(DEFAULT_FILTERS)
  const [courseQuery,   setCourseQuery]   = useState('')

  const handleToggleProjected = useCallback(() => {
    setIncludeProjected(prev => {
      const next = !prev
      try { localStorage.setItem('rishu_include_projected', next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  const toggleDegree = useCallback((degree) => {
    if (FIXED_DEGREES.has(degree)) return
    setActiveDegrees(prev => {
      const next = new Set(prev)
      if (next.has(degree)) next.delete(degree)
      else next.add(degree)
      try { localStorage.setItem('rishu_active_degrees', JSON.stringify([...next])) } catch {}
      return next
    })
  }, [])

  const { data, error, mutate, isLoading } = useSWR(`/api/data?student_id=${studentId}`, fetcher, {
    refreshInterval: 30_000,   // re-fetch from Sheets every 30 s
    revalidateOnFocus: true,   // re-fetch when user returns to tab
    dedupingInterval: 5_000,
  })

  // departments master から id → label マップを構築
  // ラベル解決は常にこのマップ経由（ハードコード禁止）
  const departmentsMap = useMemo(
    () => buildDepartmentsMap(data?.departments),
    [data?.departments]
  )

  // student_id が切り替わったら department を即リセット。
  // SWR のキーが変わり data が undefined になる前に '' にしておくことで、
  // 前ユーザーの department が一瞬でも表示されるのを防ぐ。
  useEffect(() => {
    setDepartment('')
  }, [studentId])

  // users シートの userDepartment を正として department state に同期する。
  // data が undefined（ロード中）の間は何もしない。
  // data がロードされたら userDepartment（null / 空文字含む）をそのまま反映する。
  // → student_id=002 が users に存在しない間は '' になり OnboardingModal が開く。
  useEffect(() => {
    if (data === undefined) return   // まだロード中
    setDepartment(data?.userDepartment || '')
  }, [data?.userDepartment, studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── New-schema: status change handler ────────────────────────────────────────
  // Used when enrollmentVersion === 'new'.
  // classId: the specific section id (primary key)
  // newStatus: 'COMPLETED' | 'IN_PROGRESS' | 'PLANNED' | 'REMOVE'
  //
  // ★ Fire-and-forget pattern:
  //   1. Optimistic update applied synchronously → UI responds instantly
  //   2. setToggling clears as soon as the write request completes (~500ms)
  //   3. Revalidation runs silently in the background after the write
  const handleStatusChange = useCallback((classId, newStatus) => {
    if (toggling) return
    setToggling(classId)

    const course         = data?.courses?.find(c => c.class_id === classId)
    const courseId       = course?.course_id ?? null
    const courseSemester = course ? termToSemKey(course.term) : null

    // ── 登録ガード（REMOVE 以外の場合にのみ適用）───────────────────────────
    // isCourseEligible は lib/eligibility の共通関数（UI・API で同一ルール）
    const isAdding = !data?.selectedIds?.includes(classId)
    if (newStatus !== 'REMOVE' && course) {
      const currentSemKey = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
      logEligibilityCheck(course, selectedGrade, currentSemKey)  // dev-only
      if (!isCourseEligible(course, selectedGrade, currentSemKey)) {
        setToggling(null)
        return
      }
    }

    // ── 再履修・聴講チェック（新規追加時のみ）───────────────────────────────
    if (newStatus !== 'REMOVE' && isAdding && course) {
      const enrollment = data?.enrollment ?? []
      if (shouldShowReEnrollModal(course.course_id, enrollment)) {
        setToggling(null)
        setReEnrollModal({ classId, courseId, course })
        return
      }
    }

    // Step 1: Apply optimistic update immediately (no network call, no await)
    mutate(current => {
      if (!current) return current
      if (newStatus === 'REMOVE') {
        const newStatusMap = { ...current.statusMap }
        delete newStatusMap[classId]
        return {
          ...current,
          selectedIds: current.selectedIds.filter(id => id !== classId),
          statusMap:   newStatusMap,
          enrollment:  (current.enrollment ?? []).filter(e => e.class_id !== classId),
        }
      }
      const alreadyIn = current.selectedIds.includes(classId)
      return {
        ...current,
        selectedIds: alreadyIn ? current.selectedIds : [...current.selectedIds, classId],
        statusMap:   { ...current.statusMap, [classId]: newStatus },
        enrollment:  alreadyIn
          ? (current.enrollment ?? []).map(e =>
              e.class_id === classId ? { ...e, status: newStatus } : e
            )
          : [
              ...(current.enrollment ?? []),
              { class_id: classId, course_id: courseId ?? classId,
                year: selectedGrade, semester: courseSemester, status: newStatus },
            ],
      }
    }, { revalidate: false })

    // Step 2: Write in background — clears toggling on completion, revalidates silently
    // semester は検証専用フィールド: 常に現在の UI 学期を送る（通年科目も含む）
    // サーバー側が course.term から保存学期を決定するため null を送ってはならない
    const validationSemester = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
    fetch('/api/enrollment', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId, courseId, status: newStatus, department, studentId,
        ...(newStatus !== 'REMOVE' && { year: selectedGrade, semester: validationSemester }),
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setToggling(null)
        mutate()  // silent revalidation after successful write
      })
      .catch(e => {
        console.error('enrollment write failed:', e)
        setToggling(null)
        mutate()  // revalidate to restore correct state on error
      })
  }, [toggling, mutate, data, selectedGrade, timetableTermFilter, department])

  // ── ReEnrollModal handler ─────────────────────────────────────────────────────
  // Called when user selects AUDIT or RE_ENROLL from the ReEnrollModal.
  // Behaves identically to handleStatusChange but skips the re-enrollment gate.
  const handleModalEnroll = useCallback((classId, courseId, status) => {
    setReEnrollModal(null)
    if (toggling) return
    setToggling(classId)

    const course         = data?.courses?.find(c => c.class_id === classId)
    const courseSemester = course ? termToSemKey(course.term) : null

    // Optimistic update
    mutate(current => {
      if (!current) return current
      const alreadyIn = current.selectedIds.includes(classId)
      return {
        ...current,
        selectedIds: alreadyIn ? current.selectedIds : [...current.selectedIds, classId],
        statusMap:   { ...current.statusMap, [classId]: status },
        enrollment: alreadyIn
          ? (current.enrollment ?? []).map(e =>
              e.class_id === classId ? { ...e, status } : e
            )
          : [
              ...(current.enrollment ?? []),
              { class_id: classId, course_id: courseId ?? classId,
                year: selectedGrade, semester: courseSemester, status },
            ],
      }
    }, { revalidate: false })

    const validationSemester = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
    fetch('/api/enrollment', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, courseId, status, department, studentId, year: selectedGrade, semester: validationSemester }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setToggling(null)
        mutate()
      })
      .catch(e => {
        console.error('modal enroll failed:', e)
        setToggling(null)
        mutate()
      })
  }, [toggling, mutate, data, selectedGrade, timetableTermFilter, department])

  // Optimistic enrollment toggle (add = PLANNED, remove = REMOVE)
  // ★ Fire-and-forget: optimistic update is instant, write + revalidation in background
  const handleToggle = useCallback((classId) => {
    if (toggling) return
    setToggling(classId)

    const course   = data?.courses?.find(c => c.class_id === classId)
    const courseId = course?.course_id ?? null

    // 学期は副作用なしで先に計算（ガード判定・学期フィルタ更新に使用）
    // termToSemKey は lib/eligibility の共通関数
    const courseSemester = course ? termToSemKey(course.term) : null

    // isAdding は現在の selectedIds から判定（SWR キャッシュと同期）
    const isAdding = !data?.selectedIds?.includes(classId)
    const status   = isAdding ? 'PLANNED' : 'REMOVE'

    // ── 登録ガード（追加時のみ適用）──────────────────────────────────────────
    // isCourseEligible は lib/eligibility の共通関数（UI・API で同一ルール）
    if (isAdding && course) {
      const currentSemKey = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
      logEligibilityCheck(course, selectedGrade, currentSemKey)  // dev-only
      if (!isCourseEligible(course, selectedGrade, currentSemKey)) {
        setToggling(null)
        return
      }
    }

    // ── 再履修・聴講チェック（追加時のみ）────────────────────────────────────
    // 同一 course_id に COMPLETED / FAILED 履歴があれば ReEnrollModal を開く
    if (isAdding && course) {
      const enrollment = data?.enrollment ?? []
      if (shouldShowReEnrollModal(course.course_id, enrollment)) {
        setToggling(null)
        setReEnrollModal({ classId, courseId, course })
        return
      }
    }

    // ガード通過後のみ学期フィルタを更新（解除時は不要）
    if (isAdding && course) {
      if (courseSemester === 'fall')   setTimetableTermFilter('秋学期')
      if (courseSemester === 'spring') setTimetableTermFilter('春学期')
    }

    // Step 1: Apply optimistic update immediately
    mutate(current => {
      if (!current) return current
      if (isAdding) {
        return {
          ...current,
          selectedIds: [...current.selectedIds, classId],
          enrollment:  [...(current.enrollment ?? []), {
            class_id: classId, course_id: courseId ?? classId,
            year: selectedGrade, semester: courseSemester, status: 'PLANNED',
          }],
        }
      }
      return {
        ...current,
        selectedIds: current.selectedIds.filter(id => id !== classId),
        enrollment:  (current.enrollment ?? []).filter(e => e.class_id !== classId),
      }
    }, { revalidate: false })

    // Step 2: Write in background
    // semester は検証専用フィールド: 常に現在の UI 学期を送る（通年科目も含む）
    // サーバー側が course.term から保存学期を決定するため null を送ってはならない
    const body = { classId, status, department, studentId }
    if (isAdding) {
      if (courseId) body.courseId = courseId
      body.year     = selectedGrade
      body.semester = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
    }

    fetch('/api/enrollment', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setToggling(null)
        mutate()  // silent revalidation
      })
      .catch(e => {
        console.error('toggle failed:', e)
        setToggling(null)
        mutate()  // revalidate to restore
      })
  }, [toggling, mutate, data, selectedGrade, timetableTermFilter, department])

  // ── New-schema: statusMap（早期 return より前で呼ぶ必要あり） ────────────────
  // data が null のときも useMemo は必ず呼ばれる（Rules of Hooks）
  const statusMap = useMemo(
    () => new Map(Object.entries(data?.statusMap ?? {})),
    [data?.statusMap]
  )

  // ── 単位・卒業要件計算用 ID セット ──────────────────────────────────────────
  // completedIds  : COMPLETED のみ（デフォルト）
  // projectedIds  : COMPLETED + IN_PROGRESS + PLANNED（取得予定を含むモード）
  // activeIds     : 現在のモードに応じて切り替え
  const completedIds = useMemo(
    () => data?.completedIds ?? data?.selectedIds ?? [],
    [data?.completedIds, data?.selectedIds],
  )
  const projectedIds = useMemo(
    () => data?.projectedIds ?? data?.selectedIds ?? [],
    [data?.projectedIds, data?.selectedIds],
  )
  const activeIds = includeProjected ? projectedIds : completedIds

  // ── 単位集計（学年別・カテゴリ別） ───────────────────────────────────────────
  // Hooks must run unconditionally — pass data?.* so it handles null gracefully.
  const creditSummary = useCreditSummary({
    courses:        data?.courses,
    selectedIds:    activeIds,   // COMPLETED only / projected に応じて切り替え
    enrollmentYear,
    maxGrade,
    syncKey:    entrySyncKey,
    exemptions,             // enrollment とは別管理。集計時のみ統合
  })

  // ── 卒業要件への exemption 補正 ──────────────────────────────────────────────
  // 「取得予定を含む」モード時は projectedRequirements を基準とする
  const baseRequirements = useMemo(
    () => includeProjected
      ? (data?.projectedRequirements ?? data?.requirements ?? [])
      : (data?.requirements ?? []),
    [includeProjected, data?.projectedRequirements, data?.requirements],
  )
  const adjustedRequirements = useMemo(
    () => applyExemptionsToRequirements(baseRequirements, exemptions),
    [baseRequirements, exemptions],
  )

  // ── 学年間重複検知 ────────────────────────────────────────────────────────────
  // 同一 courseId が複数学年のエントリに登録されている場合を重複とみなす
  const duplicateCourseIds = useMemo(() => {
    if (!creditSummary) return []
    const gradeMap = {}
    for (const c of creditSummary.completedCourses) {
      if (!c.courseId || !c.grade) continue
      if (!gradeMap[c.courseId]) gradeMap[c.courseId] = new Set()
      gradeMap[c.courseId].add(c.grade)
    }
    return Object.keys(gradeMap).filter(id => gradeMap[id].size > 1)
  }, [creditSummary])

  // ── Render states ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-lg font-bold text-gray-800 mb-2">データの取得に失敗しました</div>
        <div className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4 text-left font-mono break-all">
          {error.error || String(error)}
        </div>
        <div className="text-xs text-gray-500 mb-4">
          .env.local の GOOGLE_SERVICE_ACCOUNT_JSON と SPREADSHEET_ID を確認してください。
        </div>
        <button onClick={() => mutate()} className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
          再試行
        </button>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
        <div className="text-sm text-gray-500">Google Sheets からデータ取得中…</div>
      </div>
    )
  }

  const { courses, selectedIds, totalCredits } = data
  // New-schema fields (gracefully absent in legacy mode)
  // statusMap は上の useMemo で構築済み（Rules of Hooks のため早期 return の前に置いてある）
  const enrollmentVersion = data.enrollmentVersion ?? 'legacy'

  // active な degree の requirement のみ対象にする（exemption 補正済み）
  const filteredRequirements = adjustedRequirements.filter(r =>
    !r.degree || activeDegrees.has(r.degree)
  )

  const duplicateCount = duplicateCourseIds.length
  // FIXED requirements: server always returns status='info'; derive shortage client-side
  const shortCount = filteredRequirements.filter(r => {
    if (r.condition_type === 'FIXED') {
      const earned = Number(r.earned_units) || 0
      const need   = Number(r.fixed_units)  || 0
      return need > 0 && earned < need
    }
    return r.status === 'short'
  }).length

  // ── Main layout ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      {/* オンボーディング: department 未設定時は他の操作をロック */}
      {!department && (
        <OnboardingModal
          departments={data?.departments ?? []}
          onSelect={handleDepartmentSelect}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="text-base font-bold text-gray-900 leading-tight">履修管理</div>
          <div className="text-xs text-gray-400">
            {selectedIds.length}科目 · {totalCredits}単位
            {department && (
              <span className="ml-2 text-gray-300">|</span>
            )}
            {department && (
              <button
                onClick={() => handleDepartmentSelect('')}
                className="ml-1 text-gray-400 hover:text-blue-500 transition-colors"
                title="専攻を変更する"
              >
                {getDepartmentLabel(department, departmentsMap)}
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 items-center">
          {duplicateCount > 0 && (
            <span className="bg-orange-100 text-orange-600 text-xs font-semibold px-2.5 py-1 rounded-full">⚠ {duplicateCount}件重複</span>
          )}
          {shortCount > 0 && (
            <span className="bg-amber-100 text-amber-600 text-xs font-semibold px-2.5 py-1 rounded-full">{shortCount}件不足</span>
          )}
          {shortCount === 0 && duplicateCount === 0 && (
            <span className="bg-green-100 text-green-600 text-xs font-semibold px-2.5 py-1 rounded-full">✓ 問題なし</span>
          )}
          {/* Live indicator */}
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse ml-1" title="30秒ごとに自動更新" />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'timetable' && (
          <TimetableV2
            courses={courses}
            selectedIds={selectedIds}
            onToggleEnrollment={handleToggle}
            termFilter={timetableTermFilter} onTermFilterChange={setTimetableTermFilter}
            academicYear={academicYear}
            selectedGrade={selectedGrade}
            enrollmentYear={enrollmentYear}
            maxGrade={maxGrade}
            onGradeChange={handleGradeChange}
            onAddGrade={handleAddGrade}
            onDeleteGrade={handleDeleteGrade}
            onEnrollmentYearChange={handleEnrollmentYearChange}
            onEntriesChange={handleEntriesChange}
            syncKey={entrySyncKey}
            enrollment={data.enrollment}
            enrollmentVersion={enrollmentVersion}
            statusMap={statusMap}
            onStatusChange={enrollmentVersion === 'new' ? handleStatusChange : null}
            studentId={studentId}
            department={department}
            onBulkStatusDone={() => mutate()}
          />
        )}
        {tab === 'courses' && (
          <div className="h-full flex flex-col">
            {/* 単位認定バナー */}
            <div className="flex-shrink-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">単位認定</span>
                {exemptions.length > 0 && (
                  <span className="bg-blue-100 text-blue-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {exemptions.length}件
                  </span>
                )}
              </div>
              <button
                onClick={() => setExemptionOpen(true)}
                className="text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-full
                           hover:bg-blue-100 transition-colors"
              >
                ＋ 単位認定を管理
              </button>
            </div>
            {/* 履修登録リスト */}
            <div className="flex-1 min-h-0">
              <CourseList
                courses={courses} selectedIds={selectedIds}
                onToggle={handleToggle} toggling={toggling}
                filters={courseFilters} onFiltersChange={setCourseFilters}
                query={courseQuery} onQueryChange={setCourseQuery}
                statusMap={statusMap}
                enrollmentVersion={enrollmentVersion}
                onStatusChange={handleStatusChange}
                selectedGrade={selectedGrade}
                semesterFilter={timetableTermFilter}
              />
            </div>
            {/* 単位認定モーダル */}
            {exemptionOpen && (
              <ExemptionModal
                courses={courses}
                exemptions={exemptions}
                onExemptionsChange={setExemptions}
                onClose={() => setExemptionOpen(false)}
              />
            )}
          </div>
        )}
        {tab === 'requirements' && (
          <div className="h-full flex flex-col">
            <GraduationTabV2
              studentId={studentId}
              includeProjected={includeProjected}
              onToggleProjected={handleToggleProjected}
            />
          </div>
        )}
        {tab === 'summary' && (
          <div className="h-full flex flex-col">
            <Dashboard
              studentId={studentId}
              courses={data?.courses ?? []}
              enrollment={data?.enrollment ?? []}
              creditSummary={creditSummary}
              includeProjected={includeProjected}
              onToggleProjected={handleToggleProjected}
            />
          </div>
        )}
        {tab === 'emptyrooms' && (
          <EmptyRooms courses={courses} />
        )}
      </div>

      {/* 再履修・聴講モーダル */}
      {reEnrollModal && (
        <ReEnrollModal
          course={reEnrollModal.course}
          canReEnroll={canReEnroll(
            reEnrollModal.course.course_id,
            data?.enrollment ?? [],
          )}
          toggling={!!toggling}
          onSelect={(status) =>
            handleModalEnroll(reEnrollModal.classId, reEnrollModal.courseId, status)
          }
          onClose={() => setReEnrollModal(null)}
        />
      )}

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-100 flex-shrink-0 nav-safe-bottom">
        <div className="grid grid-cols-5">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`nav-btn flex flex-col items-center justify-center py-3 gap-1
                            transition-colors active:scale-95
                            ${active ? 'text-blue-500' : 'text-gray-400'}`}
              >
                <Icon active={active} />
                <span className={`text-[11px] font-semibold leading-none
                                  ${active ? 'text-blue-500' : 'text-gray-400'}`}>
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

// ── ProjectedToggle ───────────────────────────────────────────────────────────

/**
 * 「取得予定を含む」モード切り替えバー。
 * 卒業要件・単位集計タブのヘッダーに固定表示する。
 */
function ProjectedToggle({ active, onToggle }) {
  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-100 px-3 py-2 flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-gray-700">取得予定を含む</span>
        <span className="text-xs text-gray-400 mt-0.5">
          {active
            ? '履修予定・履修中を取得済みとして集計中'
            : '取得済みのみを集計中'}
        </span>
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                    transition-colors duration-200 focus:outline-none
                    ${active ? 'bg-blue-500' : 'bg-gray-200'}`}
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

// ── Icons ─────────────────────────────────────────────────────────────────────

function CalendarIcon({ active }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}
function BookIcon({ active }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}
function CheckIcon({ active }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function ChartIcon({ active }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
function DoorIcon({ active }) {
  return (
    <svg className={`w-6 h-6 ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}
function PracticeIcon({ active }) {  // eslint-disable-line no-unused-vars
  return (
    <svg className={`w-5 h-5 ${active ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2}
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  )
}


