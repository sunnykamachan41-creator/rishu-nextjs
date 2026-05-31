'use client'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import useSWR from 'swr'
import { useSession, signIn } from 'next-auth/react'
import SplashScreen from '@/components/SplashScreen'
import TimetableV2 from '@/components/TimetableV2'
import CourseList from '@/components/CourseList'
import GraduationTabV2 from '@/components/GraduationTabV2'
import Dashboard from '@/components/Dashboard'
import EmptyRooms from '@/components/EmptyRooms'
import ProfileDrawer from '@/components/drawer/ProfileDrawer'
import ExemptionModal from '@/components/ExemptionModal'
import CatalogTab from '@/components/CatalogTab'
import { DEFAULT_FILTERS } from '@/components/FilterDrawer'
import {
  loadEnrollmentYear, saveEnrollmentYear,
  loadMaxGrade, saveMaxGrade,
  loadSelectedGrade, saveSelectedGrade,
  loadTimetableTermFilter, saveTimetableTermFilter,
  gradeToYear,
} from '@/lib/periodConfig'
import { termToSemKey } from '@/lib/eligibility'
import { shouldShowReEnrollModal, canReEnroll } from '@/lib/enrollmentStatus'
import ReEnrollModal from '@/components/ReEnrollModal'
import OnboardingModal from '@/components/OnboardingModal'
import { buildDepartmentsMap, getDepartmentLabel } from '@/lib/departments'
import { loadEntries } from '@/lib/enrollmentStore'
import { useCreditSummary } from '@/lib/useCreditSummary'
import { loadExemptions, saveExemptions } from '@/lib/exemptionStore'
import CurriculumYearChangeModal from '@/components/CurriculumYearChangeModal'
import { calculateDisplayGrade } from '@/lib/leavePeriods'
import { useLeavePeriods } from '@/lib/useLeavePeriods'
import PreEnrollMigrateModal  from '@/components/PreEnrollMigrateModal'
import NotificationBell       from '@/components/NotificationBell'
import PwaInstallPrompt       from '@/components/PwaInstallPrompt'
import GraduationArchiveModal from '@/components/graduation/GraduationArchiveModal'

// ── SWR fetcher ───────────────────────────────────────────────────────────────

const fetcher = url => fetch(url).then(r => {
  if (!r.ok) return r.json().then(d => Promise.reject(d))
  return r.json()
})

// ── Term helpers ──────────────────────────────────────────────────────────────
// Eligibility rules (grade + semester) live in lib/eligibility.ts.
// termToSemKey / isCourseEligible are imported from there.

// ── Tab config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'timetable',    label: '時間割',   icon: CalendarIcon },
  { id: 'courses',      label: 'カタログ', icon: BookIcon },
  { id: 'requirements', label: '卒業要件', icon: CheckIcon },
  { id: 'summary',      label: 'ダッシュボード', icon: ChartIcon },
  { id: 'emptyrooms',   label: '空き部屋', icon: DoorIcon },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Page() {
  // ── 認証 ─────────────────────────────────────────────────────────────────
  const { data: session, status: sessionStatus } = useSession()
  // JWT callback で採番・格納された student_id（例: student_001）を使う
  const studentId  = session?.user?.student_id ?? ''

  // ── スプラッシュスクリーン制御 ────────────────────────────────────────────────
  const [splashExiting, setSplashExiting] = useState(false)
  const [splashDone,    setSplashDone]    = useState(false)

const [tab, setTab] = useState('timetable')
  const [toggling, setToggling] = useState(null) // classId currently being toggled
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 卒業要件タブの初期モード（'graduation' | 'license'）。
  // ドロワーの副免許ボタンから直接 ② 副免許・資格へ飛ぶために使用。
  const [requirementsMode, setRequirementsMode] = useState('graduation')

  // ── 左端スワイプでDrawerを開く ────────────────────────────────────────────
  const edgeSwipeStartX = useRef(null)
  const edgeSwipeStartY = useRef(null)
  const handleEdgeTouchStart = useCallback((e) => {
    const bodyLeft = document.body.getBoundingClientRect().left
    if (e.touches[0].clientX - bodyLeft < 30) {
      edgeSwipeStartX.current = e.touches[0].clientX
      edgeSwipeStartY.current = e.touches[0].clientY
    }
  }, [])
  const handleEdgeTouchEnd = useCallback((e) => {
    if (edgeSwipeStartX.current === null) return
    const dx = e.changedTouches[0].clientX - edgeSwipeStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - (edgeSwipeStartY.current ?? 0))
    if (dx > 60 && dy < 80 && !drawerOpen) setDrawerOpen(true)
    edgeSwipeStartX.current = null
    edgeSwipeStartY.current = null
  }, [drawerOpen])
  // 学科変更キャンセル用：変更開始前の department_id を退避しておく
  const [prevDepartment, setPrevDepartment] = useState('')
  const [timetableTermFilter, setTimetableTermFilter] = useState(loadTimetableTermFilter)

  // 再履修・聴講モーダル
  // { classId, courseId, course } | null
  const [reEnrollModal, setReEnrollModal] = useState(null)

  // ── ユーザー専攻（オンボーディングで確定、全集計ロジックの前提情報）──────────
  // 初期値は必ず '' とし、サーバー（users シート）の値を正として useEffect で反映する。
  // localStorage は使用しない（student_id ごとに異なる値が混在するため）。
  const [department, setDepartment] = useState('')

  // ── PWA インストール案内（オンボーディング完了後に一度だけ表示） ────────────────
  const [showPwaPrompt,  setShowPwaPrompt]  = useState(false)
  const [showLoginSheet, setShowLoginSheet] = useState(false)

  // ── デモモード ────────────────────────────────────────────────────────────────
  // ログインせずに使う を選択したユーザーはデモモードで入場。localStorage で永続化。
  const [demoMode, setDemoMode] = useState(() => {
    try { return localStorage.getItem('rishu_demo_mode') === '1' } catch { return false }
  })
  // 画面描画コンテキストでの「ゲスト状態」= 未認証 かつ デモモード選択済み
  const isDemoMode = sessionStatus === 'unauthenticated' && demoMode

  const pwaPromptCheckedRef = useRef(false)

  // 学年管理（handleDepartmentSelect が enrollmentYear を参照するため、先に宣言する）
  const [enrollmentYear, setEnrollmentYear] = useState(loadEnrollmentYear)
  const [maxGrade,       setMaxGrade]       = useState(loadMaxGrade)
  const [selectedGrade,  setSelectedGrade]  = useState(() => {
    const max   = loadMaxGrade()
    const saved = loadSelectedGrade()
    return Math.min(Math.max(1, saved), max)
  })
  const academicYear = gradeToYear(selectedGrade, enrollmentYear)

  /**
   * department 選択確定ハンドラ。
   * 1. POST /api/users でサーバー（users シート）に書き込む
   * 2. 成功を確認してから state を更新し SWR を再検証（サーバー値で上書き）
   * 3. 失敗時は state を変更しない（モーダルは閉じない）
   *
   * localStorage は使用しない（student_id ごとに混在するため）。
   */
  const handleDepartmentSelect = useCallback(async (value, enrollmentYearOverride) => {
    // Empty value = "change department" action: reset to re-open OnboardingModal.
    if (!value) {
      setDepartment('')
      return
    }

    try {
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          department_id:   value,
          // 入学年度（curriculum_year）: 常に送信（変更時も現在の入学年度を保持）
          curriculum_year: enrollmentYearOverride ?? enrollmentYear,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('[handleDepartmentSelect] save failed:', err)
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      console.log('[handleDepartmentSelect] user department saved:', value)
      setDepartment(value)

      // 初回オンボーディングで入学年度が選択された場合は保存する
      if (enrollmentYearOverride) {
        setEnrollmentYear(enrollmentYearOverride)
        saveEnrollmentYear(enrollmentYearOverride)
        // プロフィールAPIにも反映（エラーは無視して続行）
        fetch('/api/profile', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ enrollment_year: enrollmentYearOverride }),
        }).catch(() => {})
      }

      mutate()   // SWR 再検証でサーバー側の userDepartment を同期
    } catch (err) {
      console.error('[handleDepartmentSelect] network error:', err)
      throw err   // re-throw so OnboardingModal can catch and show error message
    }
  // mutate は useSWR より前に宣言されているため deps には含めない。
  // SWR の mutate は同一 key に対して参照安定であるため stale closure の問題はない。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, enrollmentYear])

  // 「取得予定を含む」モード（履修予定・履修中を取得済みとして卒業要件・単位集計に計上）
  const [includeProjected, setIncludeProjected] = useState(() => {
    try { return localStorage.getItem('rishu_include_projected') === '1' } catch { return false }
  })

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
    if (maxGrade <= 4) return
    const next = maxGrade - 1
    setMaxGrade(next)
    saveMaxGrade(next)
    if (selectedGrade > next) setSelectedGrade(next)
  }, [maxGrade, selectedGrade])

  // 学年・学期フィルタを localStorage に永続化（変更のたびに保存）
  useEffect(() => { saveSelectedGrade(selectedGrade) }, [selectedGrade])
  useEffect(() => { saveTimetableTermFilter(timetableTermFilter) }, [timetableTermFilter])

  // curriculum_year 変更安全処理: 変更前の年度確認モーダル用 state
  const [pendingEnrollmentYear,       setPendingEnrollmentYear]       = useState(null)
  const [showCurriculumChangeModal,   setShowCurriculumChangeModal]   = useState(false)

  // curriculum_year を実際に適用する（モーダル確認後・初回セット双方から呼ぶ）
  const applyEnrollmentYear = useCallback((year) => {
    setEnrollmentYear(year)
    saveEnrollmentYear(year)
    // users シートにも反映（curriculum_year を更新）
    if (department) {
      fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ department_id: department, curriculum_year: year }),
      }).catch(err => console.error('[applyEnrollmentYear] save failed:', err))
    }
  }, [department])

  // 入学年度変更ハンドラ:
  //   - 既存の年度がある場合 → 安全確認モーダルを表示してから変更
  //   - 初回セット（enrollmentYear=0/未設定）→ 直接適用
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleEnrollmentYearChange = useCallback((year) => {
    if (enrollmentYear && year !== enrollmentYear) {
      // 変更検知: データ削除が必要なため確認モーダルを表示
      setPendingEnrollmentYear(year)
      setShowCurriculumChangeModal(true)
      return
    }
    applyEnrollmentYear(year)
  }, [enrollmentYear, applyEnrollmentYear])

  // curriculum_year 変更: 確定ハンドラ（curriculum_year 依存データを全削除 → 年度を変更）
  const handleConfirmCurriculumChange = useCallback(async () => {
    setShowCurriculumChangeModal(false)
    if (pendingEnrollmentYear == null) return
    const year = pendingEnrollmentYear
    setPendingEnrollmentYear(null)

    // 1. Sheets 上の curriculum_year 依存データを全削除
    //    対象: enrollment / progress_auto / students_summary / GRADUATION_RESULT / additional_license_result
    try {
      const res = await fetch('/api/enrollment/clear-all', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      console.error('[handleConfirmCurriculumChange] curriculum reset failed:', e)
      // エラーでも年度変更は続行（削除失敗はリカバリ可能）
    }

    // 2. 内部 state を curriculum_year 基準でリセット
    //    時間割・集計・フィルタ・認定免除など、すべて新しいカリキュラム前提で再スタート
    setSelectedGrade(1)               // 学年選択を1年にリセット
    setTab('timetable')               // メインタブに戻す
    setEntrySyncKey(k => k + 1)       // 時間割エントリの強制再レンダー
    setIncludeTemporary(false)        // 仮登録フラグをリセット
    setCourseFilters(DEFAULT_FILTERS) // コースフィルタをリセット
    setCourseQuery('')                // 検索クエリをリセット
    // 単位認定（exemptions）は curriculum_year 依存のカテゴリマッピングを持つためリセット
    saveExemptions([])
    setExemptions([])

    // 3. 年度を適用
    applyEnrollmentYear(year)

    // 4. 未保存変更を破棄（curriculum_year 変更でデータがリセットされるため）
    setPendingChanges(new Map())
    setSaveError(null)

    // 5. SWR を再検証して UI に反映
    // mutate は useSWR より前に宣言されているため deps に含めない（参照安定）
    mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEnrollmentYear, applyEnrollmentYear])

  const handleCancelCurriculumChange = useCallback(() => {
    setShowCurriculumChangeModal(false)
    setPendingEnrollmentYear(null)
  }, [])

  // timetable エントリ変更時に useCreditSummary の再計算をトリガーする
  const [entrySyncKey, setEntrySyncKey] = useState(0)
  const handleEntriesChange = useCallback(() => {
    setEntrySyncKey(k => k + 1)
  }, [])

  // 単位認定（enrollment とは完全に別管理）
  const [exemptions,      setExemptions]      = useState(loadExemptions)
  const [exemptionOpen,   setExemptionOpen]   = useState(false)

  // カタログタブ: 表示年度モード（初期値は現在年度）
  const currentRealYear = new Date().getFullYear()
  const [catalogYear, setCatalogYear] = useState(currentRealYear)

  // 仮登録を含む: 卒業要件・ダッシュボードに仮登録を加算するかどうか
  const [includeTemporary, setIncludeTemporary] = useState(false)
  const handleToggleTemporary = useCallback(() => {
    setIncludeTemporary(prev => !prev)
  }, [])

  const [courseFilters, setCourseFilters] = useState(DEFAULT_FILTERS)
  const [courseQuery,   setCourseQuery]   = useState('')

  const handleToggleProjected = useCallback(() => {
    setIncludeProjected(prev => {
      const next = !prev
      try { localStorage.setItem('rishu_include_projected', next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  // ── 未保存の変更管理 ──────────────────────────────────────────────────────────
  // Map<compositeKey, { op: 'upsert'|'remove', classId, courseId, year, semester,
  //                     status, academic_year, is_temporary }>
  // 授業追加・削除・ステータス変更時にローカルに追積し、「保存」押下時に一括送信する。
  const [pendingChanges,  setPendingChanges]  = useState(() => new Map())
  const [saveBusy,        setSaveBusy]        = useState(false)
  const [saveError,       setSaveError]       = useState(null)
  const hasPendingChanges = pendingChanges.size > 0

  // ── 再集計フラグ ──────────────────────────────────────────────────────────────
  // 保存完了後に true にセット → 卒業要件・ダッシュボードタブで案内バナーを表示。
  // 再集計完了後に false にリセット。
  const [needsRecalc,  setNeedsRecalc]  = useState(false)
  const [recalcBusy,   setRecalcBusy]   = useState(false)
  const [recalcError,  setRecalcError]  = useState(null)

  // ── 仮登録移行モーダル ──────────────────────────────────────────────────────────
  // year 更新検知: localStorage で前回確認年度を保存し、増加時に is_temporary 行を確認する。
  // { oldYear: number, newYear: number, tempEnrollments: NormalizedEnrollment[] } | null
  const [migrateModalData, setMigrateModalData] = useState(null)
  const [migrating,        setMigrating]        = useState(false)
  // スキップ後にバナーから再開できるよう、最後に検知した移行情報を保持
  const [migrateAvailable, setMigrateAvailable] = useState(null)
  // 同一 studentId+latestYear の組み合わせで重複チェックを防ぐ ref
  const migrateLastChecked = useRef('')

  // ── YORA ARCHIVE ─────────────────────────────────────────────────────────────
  const [showArchive,         setShowArchive]         = useState(false)
  const [showGradConfirm,     setShowGradConfirm]     = useState(false)

  // studentId が変わったらチェック済みフラグをリセット
  useEffect(() => {
    migrateLastChecked.current = ''
  }, [studentId])

  // studentId（email）が確定するまで fetch しない（null キーは SWR をスキップ）
  // 未保存の変更がある間は自動 refresh を停止して楽観的 UI を保護する
  const swrKey = studentId ? '/api/data' : null
  const { data, error, mutate, isLoading } = useSWR(swrKey, fetcher, {
    refreshInterval:   hasPendingChanges ? 0 : 5 * 60_000,
    revalidateOnFocus: !hasPendingChanges,
    dedupingInterval:  5_000,
  })

  // デモモード専用: 空き部屋タブ用の公開コースデータ（認証不要）
  const { data: guestCatalogData } = useSWR(
    isDemoMode ? '/api/catalog' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  )
  const guestCoursesAll = guestCatalogData?.courses ?? []

  // ── スプラッシュ終了トリガー ────────────────────────────────────────────────
  // 認証確定 + データ取得完了 / 未ログイン / エラー のいずれかで退場アニメーションを開始する。
  // ※ 2 つの Effect に分離: タイマーが setSplashExiting 起因の再レンダーでキャンセルされるのを防ぐ
  const splashStartedRef = useRef(false)
  useEffect(() => {
    const ready =
      (sessionStatus === 'authenticated' && !isLoading && !!data) ||
      sessionStatus === 'unauthenticated' ||
      !!error
    if (!ready || splashStartedRef.current) return
    splashStartedRef.current = true
    setSplashExiting(true)
  }, [sessionStatus, isLoading, data, error])

  // splashExiting が true になったら 550ms 後（progress→100% + フェードアウト完了）に done にする
  useEffect(() => {
    if (!splashExiting) return
    const t = setTimeout(() => setSplashDone(true), 550)
    return () => clearTimeout(t)
  }, [splashExiting])

  // ── enrollment id バックフィル ────────────────────────────────────────────
  // 実装前に登録された既存行に UUID を自動付与する（id列が空の行のみ対象）。
  // データロード後に一度だけ実行し、更新があれば SWR を再検証する。
  const backfillDoneRef = useRef(false)
  useEffect(() => {
    if (!data?.enrollment || backfillDoneRef.current) return
    const hasBlankId = data.enrollment.some(e => !e.enrollment_id)
    if (!hasBlankId) return
    backfillDoneRef.current = true
    fetch('/api/enrollment/backfill-ids', { method: 'POST' })
      .then(r => r.json())
      .then(({ updated }) => { if (updated > 0) mutate() })
      .catch(() => {})
  }, [data?.enrollment, mutate])

  // departments master から id → label マップを構築
  // ラベル解決は常にこのマップ経由（ハードコード禁止）
  const departmentsMap = useMemo(
    () => buildDepartmentsMap(data?.departments),
    [data?.departments]
  )

  // 表示用ラベル（Drawer・ヘッダーで使用）
  const departmentLabel = getDepartmentLabel(department, departmentsMap)

  // ドロワーから学科変更を開始するハンドラ
  // 変更前の department_id を退避しておき、キャンセル時に復元できるようにする
  // デモモード用シェア
  const handleDemoShare = useCallback(async () => {
    const url  = window.location.origin
    const text = '東京学芸大学の履修管理アプリ「YORA」📚 時間割・卒業要件をスマートに管理できます！'
    if (navigator.share) {
      try { await navigator.share({ title: 'YORA', text, url }); return } catch {}
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {}
  }, [])

  const handleStartDepartmentChange = useCallback(() => {
    setPrevDepartment(department)  // 現在値を退避
    setDepartment('')              // '' にセット → OnboardingModal が開く
  }, [department])

  // 学科変更キャンセル：退避しておいた前の値に戻す（API 呼び出しなし）
  const handleCancelDepartmentChange = useCallback(() => {
    setDepartment(prevDepartment)
    setPrevDepartment('')
  }, [prevDepartment])

  // student_id が切り替わったら department を即リセット。
  // SWR のキーが変わり data が undefined になる前に '' にしておくことで、
  // 前ユーザーの department が一瞬でも表示されるのを防ぐ。
  useEffect(() => {
    setDepartment('')
  }, [studentId])

  // ログインが完了したらデモモードフラグをクリアする
  useEffect(() => {
    if (sessionStatus === 'authenticated' && demoMode) {
      try { localStorage.removeItem('rishu_demo_mode') } catch {}
      setDemoMode(false)
    }
  }, [sessionStatus, demoMode])

  // デモモード: PWA インストール案内を表示
  useEffect(() => {
    if (!isDemoMode || pwaPromptCheckedRef.current) return
    pwaPromptCheckedRef.current = true
    const isMobile = /iPhone|iPad|iPod|Android/.test(navigator.userAgent)
    if (!isMobile) return  // デスクトップは非表示
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (isStandalone) return
    setShowPwaPrompt(true)
  }, [isDemoMode])

  // PWA インストール案内: スタンドアロン（PWA）でない限り毎回表示する（ログイン済み）
  useEffect(() => {
    if (!department || pwaPromptCheckedRef.current) return
    pwaPromptCheckedRef.current = true
    const isMobile = /iPhone|iPad|iPod|Android/.test(navigator.userAgent)
    if (!isMobile) return  // デスクトップは非表示
    // すでにスタンドアローン（インストール済み）なら表示しない
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (isStandalone) return
    setShowPwaPrompt(true)
  }, [department])

  // users シートの userDepartment を正として department state に同期する。
  // data が undefined（ロード中）の間は何もしない。
  // data がロードされたら userDepartment（null / 空文字含む）をそのまま反映する。
  // → student_id=002 が users に存在しない間は '' になり OnboardingModal が開く。
  useEffect(() => {
    if (data === undefined) return   // まだロード中
    setDepartment(data?.userDepartment || '')
  }, [data?.userDepartment, studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // users シートの userCurriculumYear を正として enrollmentYear state に同期する。
  // サーバー側に値があればそちらを優先し、localStorage も更新して以後のロードで一致させる。
  // 値がない場合は既存の localStorage 値（または currentAcademicYear）をそのまま使う。
  useEffect(() => {
    if (data === undefined) return   // まだロード中
    const serverYear = data?.userCurriculumYear
    if (serverYear != null && Number.isFinite(serverYear)) {
      setEnrollmentYear(serverYear)
      saveEnrollmentYear(serverYear)   // localStorage も更新
    }
  }, [data?.userCurriculumYear, studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 最新開講年度（courses の academic_year 最大値）
  // EmptyRooms の課題年度フィルタ・カタログ初期年度設定に使用する
  const latestCourseYear = useMemo(() => {
    return (data?.courses ?? []).reduce((max, c) => {
      const y = Number(c.academic_year)
      return (Number.isFinite(y) && y > max) ? y : max
    }, 0)
  }, [data?.courses])

  // ゲスト用最新年度（公開カタログから計算）
  const guestLatestYear = useMemo(() => {
    return guestCoursesAll.reduce((max, c) => {
      const y = Number(c.academic_year)
      return (Number.isFinite(y) && y > max) ? y : max
    }, 0)
  }, [guestCoursesAll])

  // カタログタブの初期年度を最新開講年度に設定する。
  const catalogYearInitialized = useRef(false)
  useEffect(() => {
    if (!latestCourseYear || catalogYearInitialized.current) return
    catalogYearInitialized.current = true
    setCatalogYear(latestCourseYear)
  }, [latestCourseYear])

  // ── 年度更新検知: 仮登録移行モーダルを表示するか判定 ────────────────────────────
  // 初回訪問時は storedYear を latestCourseYear に設定してスキップ（移行対象なし）。
  // storedYear < latestCourseYear かつ is_temporary エントリが存在する場合にモーダル表示。
  useEffect(() => {
    if (!latestCourseYear || !studentId || !data) return
    const checkKey = `${studentId}:${latestCourseYear}`
    if (migrateLastChecked.current === checkKey) return
    migrateLastChecked.current = checkKey

    const lsKey = `rishu_last_migrated_year_${studentId}`
    let storedYear = 0
    try { storedYear = parseInt(localStorage.getItem(lsKey) || '0', 10) || 0 } catch {}

    // 初回訪問 → 現在年度を記録してスキップ
    if (storedYear === 0) {
      try { localStorage.setItem(lsKey, String(latestCourseYear)) } catch {}
      return
    }

    // 年度が上がった
    if (latestCourseYear > storedYear) {
      const tempEnrollments = (data.enrollment ?? []).filter(e => e.is_temporary)
      if (tempEnrollments.length > 0) {
        const info = { oldYear: storedYear, newYear: latestCourseYear, tempEnrollments }
        // モーダル表示（localStorage 更新はユーザーアクション後）
        setMigrateModalData(info)
        setMigrateAvailable(info)  // バナーからの再開用
      } else {
        // 仮登録なし → 即座に年度更新を記録
        try { localStorage.setItem(lsKey, String(latestCourseYear)) } catch {}
      }

      // ── 5年生判定: 卒業確認モーダルを表示 ──────────────────────────────────
      // enrollmentYear = 入学年度（例:2021）、latestCourseYear = 最新開講年度（例:2025）
      // 差が4以上 = 4年間終了 → 卒業の可能性
      const archiveKey = `yora_archive_unlocked_${studentId}`
      const alreadyUnlocked = (() => { try { return !!localStorage.getItem(archiveKey) } catch { return false } })()
      if (!alreadyUnlocked && enrollmentYear && latestCourseYear - enrollmentYear >= 4) {
        setShowGradConfirm(true)
      }
    }
  }, [latestCourseYear, studentId, data, enrollmentYear]) // eslint-disable-line react-hooks/exhaustive-deps

  // 移行確定: API 呼び出し → localStorage 更新 → SWR revalidate
  const handleMigrateConfirm = useCallback(async (migrableClassIds) => {
    if (migrating || !migrateModalData) return
    setMigrating(true)
    try {
      const res = await fetch('/api/pre-enrollment/migrate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          classIds:      migrableClassIds,
          newLatestYear: migrateModalData.newYear,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      // 成功: localStorage 更新 → 再集計フラグ → モーダルを閉じる → SWR 再検証
      try { localStorage.setItem(`rishu_last_migrated_year_${studentId}`, String(migrateModalData.newYear)) } catch {}
      setMigrateModalData(null)
      setNeedsRecalc(true)
      mutate()
    } catch (e) {
      console.error('[handleMigrateConfirm]', e)
    } finally {
      setMigrating(false)
    }
  }, [migrating, migrateModalData, studentId, mutate])

  // 移行スキップ: この年度遷移はスキップ済みとして記録
  const handleMigrateSkip = useCallback(() => {
    try { localStorage.setItem(`rishu_last_migrated_year_${studentId}`, String(migrateModalData?.newYear ?? latestCourseYear)) } catch {}
    setMigrateModalData(null)
  }, [migrateModalData, studentId, latestCourseYear])

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
    // 年度コンテキストを考慮して正しい年度のコースを取得
    const course         = data?.courses?.find(c => c.class_id === classId && (academicYear == null || c.academic_year === academicYear))
                        ?? data?.courses?.find(c => c.class_id === classId)
    const courseId       = course?.course_id ?? null
    const courseSemester = course ? termToSemKey(course.term) : null
    // composite key: class_id|academic_year
    const ck = `${classId}|${course?.academic_year ?? ''}`

    const isAdding = !data?.selectedIds?.includes(ck)

    // ── 再履修・聴講チェック（新規追加時のみ）───────────────────────────────
    if (newStatus !== 'REMOVE' && isAdding && course) {
      const enrollment = data?.enrollment ?? []
      if (shouldShowReEnrollModal(course.course_id, enrollment, recognizedCourseIdSet)) {
        setReEnrollModal({ classId, courseId, course })
        return
      }
    }

    // Step 1: 楽観的 UI 更新（ネットワーク呼び出しなし・即時反映）
    mutate(current => {
      if (!current) return current
      if (newStatus === 'REMOVE') {
        const newStatusMap = { ...current.statusMap }
        delete newStatusMap[ck]
        return {
          ...current,
          selectedIds: current.selectedIds.filter(id => id !== ck),
          statusMap:   newStatusMap,
          enrollment:  (current.enrollment ?? []).filter(e => !(e.class_id === classId && (course?.academic_year == null || e.academic_year === course.academic_year))),
        }
      }
      const alreadyIn = current.selectedIds.includes(ck)
      return {
        ...current,
        selectedIds: alreadyIn ? current.selectedIds : [...current.selectedIds, ck],
        statusMap:   { ...current.statusMap, [ck]: newStatus },
        enrollment:  alreadyIn
          ? (current.enrollment ?? []).map(e =>
              e.class_id === classId ? { ...e, status: newStatus } : e
            )
          : [
              ...(current.enrollment ?? []),
              { class_id: classId, course_id: courseId ?? classId,
                year: selectedGrade, semester: courseSemester, status: newStatus,
                academic_year: course?.academic_year ?? null },
            ],
      }
    }, { revalidate: false })

    // Step 2: 未保存変更リストを更新（Sheets API は呼ばない）
    const saveSemester    = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
    const saveIsTemp       = latestCourseYear > 0 && academicYear > latestCourseYear
    // 仮登録は latestYear のコースデータが実体なので academic_year を latestYear にクランプする。
    // そうしないと composite key（class_id|academic_year）がサーバーとクライアントで
    // ズレて、リロード後に選択済みと認識されなくなる。
    const saveAcademicYear = saveIsTemp ? latestCourseYear : academicYear
    setPendingChanges(prev => {
      const next = new Map(prev)
      if (newStatus === 'REMOVE') {
        // ローカルで追加したものを取り消す場合はエントリを削除（サーバーには送らない）
        if (next.get(ck)?.op === 'upsert') {
          next.delete(ck)
        } else {
          next.set(ck, { op: 'remove', classId, academic_year: saveAcademicYear })
        }
      } else {
        next.set(ck, {
          op: 'upsert', classId, courseId, year: selectedGrade,
          semester: saveSemester, status: newStatus,
          academic_year: saveAcademicYear, is_temporary: saveIsTemp,
        })
      }
      return next
    })
  }, [mutate, data, selectedGrade, academicYear, timetableTermFilter, latestCourseYear])

  // ── ReEnrollModal handler ─────────────────────────────────────────────────────
  // Called when user selects AUDIT or RE_ENROLL from the ReEnrollModal.
  // Behaves identically to handleStatusChange but skips the re-enrollment gate.
  const handleModalEnroll = useCallback((classId, courseId, status) => {
    setReEnrollModal(null)

    const course         = data?.courses?.find(c => c.class_id === classId && (academicYear == null || c.academic_year === academicYear))
                        ?? data?.courses?.find(c => c.class_id === classId)
    const courseSemester = course ? termToSemKey(course.term) : null
    const ck = `${classId}|${course?.academic_year ?? ''}`

    // 楽観的 UI 更新
    mutate(current => {
      if (!current) return current
      const alreadyIn = current.selectedIds.includes(ck)
      return {
        ...current,
        selectedIds: alreadyIn ? current.selectedIds : [...current.selectedIds, ck],
        statusMap:   { ...current.statusMap, [ck]: status },
        enrollment: alreadyIn
          ? (current.enrollment ?? []).map(e =>
              e.class_id === classId ? { ...e, status } : e
            )
          : [
              ...(current.enrollment ?? []),
              { class_id: classId, course_id: courseId ?? classId,
                year: selectedGrade, semester: courseSemester, status,
                academic_year: course?.academic_year ?? null },
            ],
      }
    }, { revalidate: false })

    // 未保存変更リストを更新
    const saveSemester     = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
    const saveIsTemp       = latestCourseYear > 0 && academicYear > latestCourseYear
    // 仮登録は latestYear のコースデータが実体なので academic_year を latestYear にクランプする。
    // そうしないと composite key（class_id|academic_year）がサーバーとクライアントで
    // ズレて、リロード後に選択済みと認識されなくなる。
    const saveAcademicYear = saveIsTemp ? latestCourseYear : academicYear
    setPendingChanges(prev => {
      const next = new Map(prev)
      next.set(ck, {
        op: 'upsert', classId, courseId, year: selectedGrade,
        semester: saveSemester, status,
        academic_year: saveAcademicYear, is_temporary: saveIsTemp,
      })
      return next
    })
  }, [mutate, data, selectedGrade, academicYear, timetableTermFilter, latestCourseYear])

  // recognized course_id の Set（CourseList の「単位認定」バッジ表示に使用）
  const recognizedCourseIdSet = useMemo(
    () => new Set((data?.recognizedCourses ?? []).map(r => r.course_id).filter(Boolean)),
    [data?.recognizedCourses],
  )

  // ── 単位認定: recognized_courses シート書き込み後のコールバック ────────────────
  // ExemptionModal が recognized_courses API 呼び出し完了後に呼ぶ。
  // SWR を再検証して UI を最新化する（recalculate は別途手動で実行）。
  const handleRecognitionChange = useCallback(() => {
    mutate()
  }, [mutate])

  // Optimistic enrollment toggle (add = PLANNED, remove = REMOVE)
  // ★ ローカル state のみ更新・Sheets API は呼ばない（保存ボタンで一括保存）
  const handleToggle = useCallback((classId) => {
    const course   = data?.courses?.find(c => c.class_id === classId && (academicYear == null || c.academic_year === academicYear))
                  ?? data?.courses?.find(c => c.class_id === classId)
    const courseId = course?.course_id ?? null
    const ck = `${classId}|${course?.academic_year ?? ''}`

    // 学期は副作用なしで先に計算（学期フィルタ更新に使用）
    const courseSemester = course ? termToSemKey(course.term) : null

    // isAdding は composite key で判定（異年度の同 class_id を区別）
    const isAdding = !data?.selectedIds?.includes(ck)
    const status   = isAdding ? 'PLANNED' : 'REMOVE'

    // ── 再履修・聴講チェック（追加時のみ）────────────────────────────────────
    if (isAdding && course) {
      const enrollment = data?.enrollment ?? []
      if (shouldShowReEnrollModal(course.course_id, enrollment, recognizedCourseIdSet)) {
        setReEnrollModal({ classId, courseId, course })
        return
      }
    }

    // ガード通過後のみ学期フィルタを更新（解除時は不要）
    if (isAdding && course) {
      if (courseSemester === 'fall')   setTimetableTermFilter('秋学期')
      if (courseSemester === 'spring') setTimetableTermFilter('春学期')
    }

    // Step 1: 楽観的 UI 更新（即時反映）
    mutate(current => {
      if (!current) return current
      if (isAdding) {
        const newStatusMap = { ...current.statusMap, [ck]: 'PLANNED' }
        return {
          ...current,
          selectedIds: [...current.selectedIds, ck],
          statusMap:   newStatusMap,
          enrollment:  [...(current.enrollment ?? []), {
            class_id: classId, course_id: courseId ?? classId,
            year: selectedGrade, semester: courseSemester, status: 'PLANNED',
            academic_year: course?.academic_year ?? null,
          }],
        }
      }
      const newStatusMap = { ...current.statusMap }
      delete newStatusMap[ck]
      return {
        ...current,
        selectedIds: current.selectedIds.filter(id => id !== ck),
        statusMap:   newStatusMap,
        enrollment:  (current.enrollment ?? []).filter(e => !(e.class_id === classId && (course?.academic_year == null || e.academic_year === course.academic_year))),
      }
    }, { revalidate: false })

    // Step 2: 未保存変更リストを更新（Sheets API は呼ばない）
    const saveSemester     = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
    const saveIsTemp       = latestCourseYear > 0 && academicYear > latestCourseYear
    // 仮登録は latestYear のコースデータが実体なので academic_year を latestYear にクランプする。
    // そうしないと composite key（class_id|academic_year）がサーバーとクライアントで
    // ズレて、リロード後に選択済みと認識されなくなる。
    const saveAcademicYear = saveIsTemp ? latestCourseYear : academicYear
    setPendingChanges(prev => {
      const next = new Map(prev)
      if (isAdding) {
        next.set(ck, {
          op: 'upsert', classId, courseId, year: selectedGrade,
          semester: saveSemester, status: 'PLANNED',
          academic_year: saveAcademicYear, is_temporary: saveIsTemp,
        })
      } else {
        // ローカルで追加したものを取り消す場合 → エントリ削除（サーバーには送らない）
        if (next.get(ck)?.op === 'upsert') {
          next.delete(ck)
        } else {
          next.set(ck, { op: 'remove', classId, academic_year: saveAcademicYear })
        }
      }
      return next
    })
  }, [mutate, data, selectedGrade, academicYear, timetableTermFilter, latestCourseYear])

  // ── 一括保存 ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!hasPendingChanges || saveBusy) return
    setSaveBusy(true)
    setSaveError(null)
    try {
      const changes = [...pendingChanges.values()]
      const res = await fetch('/api/enrollment/batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ changes }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      // 保存成功 → 未保存リストをクリア、再集計フラグをセット、SWR 再検証
      setPendingChanges(new Map())
      setNeedsRecalc(true)
      mutate()
    } catch (e) {
      console.error('[handleSave]', e)
      setSaveError(e.message)
    } finally {
      setSaveBusy(false)
    }
  }, [hasPendingChanges, saveBusy, pendingChanges, mutate])

  const handleDiscard = useCallback(() => {
    setPendingChanges(new Map())
    setSaveError(null)
    mutate()  // サーバー値に戻す
  }, [mutate])

  // ── ページを閉じる・リロード時に未保存変更を警告 ──────────────────────────────
  useEffect(() => {
    if (!hasPendingChanges) return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''   // Chrome requires returnValue to be set
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasPendingChanges])

  // ── ドロワー → タブナビゲーション ────────────────────────────────────────────
  // 副免許ボタン: ドロワーを閉じて卒業要件タブの ② 副免許・資格へ
  const handleOpenMinorSection = useCallback(() => {
    setDrawerOpen(false)
    setRequirementsMode('license')
    setTab('requirements')
  }, [])

  // 単位認定ボタン: ドロワーを閉じてカタログタブの単位認定モーダルを開く
  const handleOpenExemption = useCallback(() => {
    setDrawerOpen(false)
    setTab('courses')
    // タブ切り替えアニメーション後にモーダルを開く
    setTimeout(() => setExemptionOpen(true), 50)
  }, [])

  // ── メモ保存 ──────────────────────────────────────────────────────────────────
  // CourseModal から「メモを保存する」を押したとき呼ばれる。
  // PATCH /api/enrollment/memo を直接叩いて即時保存。pendingChanges を経由しない。
  // 成功時は楽観的 UI 更新で SWR キャッシュに反映。
  // 失敗時は Error をスロー（CourseModal 側でキャッチして表示）。
  const handleMemoSave = useCallback(async (classId, memo) => {
    // 楽観的 UI 更新（先に反映しておく）
    mutate(current => {
      if (!current) return current
      return {
        ...current,
        enrollment: (current.enrollment ?? []).map(e =>
          e.class_id === classId ? { ...e, memo } : e
        ),
      }
    }, { revalidate: false })

    const res = await fetch('/api/enrollment/memo', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ classId, memo }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      // 楽観的更新をロールバック
      mutate()
      throw new Error(d.error || `HTTP ${res.status}`)
    }
  }, [mutate])

  // タブ切替: 時間割タブから離れるとき未保存があれば自動保存（fire-and-forget）
  // ※ hasPendingChanges / saveBusy / handleSave が確定した後に定義する（TDZ 回避）
  const handleTabChange = useCallback((newTab) => {
    if (newTab === tab) return
    if (tab === 'timetable' && hasPendingChanges && !saveBusy) {
      handleSave()  // バックグラウンドで保存（タブ切替はブロックしない）
    }
    setTab(newTab)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hasPendingChanges, saveBusy, handleSave])

  const handleRecalculate = useCallback(async () => {
    if (recalcBusy) return
    setRecalcBusy(true)
    setRecalcError(null)
    try {
      const res = await fetch('/api/recalculate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ student_id: studentId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      setNeedsRecalc(false)
    } catch (e) {
      console.error('[handleRecalculate]', e)
      setRecalcError(e.message)
    } finally {
      setRecalcBusy(false)
    }
  }, [recalcBusy, studentId])

  // ── 休学期間（leaveSemesters / rawLeavePeriods） ────────────────────────────
  // 専用の SWR フック経由で取得。/api/leave-periods を直接読む（キャッシュなし）。
  // 保存・削除後は mutateLeavePeriods() だけで全コンシューマーに反映される。
  const {
    leaveSemesters,
    rawLeavePeriods,
    mutateLeavePeriods,
  } = useLeavePeriods()

  // displayGrade: 休学補正後の表示学年（ソート優先度にのみ使用。実データは不変）
  // 現在表示中の学期を GradeSemKey に変換し、休学後のみオフセットを適用する
  const currentSemesterKey = timetableTermFilter === '秋学期' ? 'fall' : 'spring'
  const displayGrade = calculateDisplayGrade(selectedGrade, currentSemesterKey, leaveSemesters)

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
  const temporaryIds = useMemo(
    () => new Set(data?.temporaryIds ?? []),
    [data?.temporaryIds],
  )

  // activeIds: includeProjected と includeTemporary を組み合わせて計算
  const baseIds = includeProjected ? projectedIds : completedIds
  const activeIds = useMemo(() => {
    if (!includeTemporary) return baseIds
    // 仮登録を含む: temporaryIds も加算
    const tempArr = data?.temporaryIds ?? []
    return [...new Set([...baseIds, ...tempArr])]
  }, [baseIds, includeTemporary, data?.temporaryIds])

  // ── 単位集計（学年別・カテゴリ別） ───────────────────────────────────────────
  // Hooks must run unconditionally — pass data?.* so it handles null gracefully.
  const creditSummary = useCreditSummary({
    courses:          data?.courses,
    selectedIds:      activeIds,   // COMPLETED only / projected に応じて切り替え
    enrollmentYear,
    maxGrade,
    syncKey:          entrySyncKey,
    exemptions,                    // enrollment とは別管理。集計時のみ統合
    recognizedCourses: data?.recognizedCourses ?? [],  // 単位認定（recognized_courses）
  })

  // ── Render states ─────────────────────────────────────────────────────────

  // ── 起動ローディング（認証確認中・データ取得中）────────────────────────────
  if (!splashDone) return <SplashScreen exiting={splashExiting} />

  // ── 未ログイン（デモモード未選択）→ ログイン画面 ─────────────────────────────
  if (sessionStatus === 'unauthenticated' && !demoMode) {
    const handleEnterDemo = () => {
      try { localStorage.setItem('rishu_demo_mode', '1') } catch {}
      setDemoMode(true)
    }
    return (
      <div className="h-full bg-white dark:bg-[#0b0c12] overflow-auto">
        <div className="flex flex-col items-center px-8 pt-12 pb-8 gap-8">

          {/* ロゴ */}
          <div className="flex flex-col items-center gap-8 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/icon-512.png" alt="YORA" width={80} height={80}
              style={{ borderRadius: 18, boxShadow: '0 16px 48px rgba(79,70,229,0.25), 0 4px 12px rgba(79,70,229,0.15)', display: 'block' }}
            />
            <div className="flex flex-col items-center gap-1.5">
              <p className="font-semibold text-slate-900 dark:text-white" style={{ fontSize: 28, letterSpacing: '0.14em' }}>YORA</p>
              <p className="text-[11px] font-light text-slate-400 dark:text-slate-600" style={{ letterSpacing: '0.08em' }}>学芸が苦行を、学芸学業に。</p>
            </div>

            {/* ボタン群 */}
            <div className="w-full flex flex-col items-center gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                Google アカウントでサインインして<br />履修情報を管理しましょう
              </p>
              <button
                onClick={() => signIn('google')}
                className="w-full flex items-center justify-center gap-3
                           bg-white dark:bg-[#1a1d27] border border-slate-200 dark:border-white/[0.08]
                           shadow-md dark:shadow-none rounded-2xl px-6 py-4
                           text-sm font-semibold text-slate-700 dark:text-slate-200
                           hover:bg-slate-50 dark:hover:bg-white/[0.06] active:scale-[0.98] transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google でログイン
              </button>

              {/* ─── ログインせずに使う ─── */}
              <div className="relative w-full flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.06]" />
                <span className="text-[11px] text-slate-300 dark:text-slate-600 flex-shrink-0">または</span>
                <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.06]" />
              </div>
              <button
                onClick={handleEnterDemo}
                className="w-full text-sm font-medium text-slate-500 dark:text-slate-400 py-3 px-4
                           rounded-2xl border border-slate-100 dark:border-white/[0.06]
                           hover:bg-slate-50 dark:hover:bg-white/[0.04]
                           active:scale-[0.98] transition-all"
              >
                ログインせずに使う
              </button>
            </div>
          </div>

          {/* 公式PV */}
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3 justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <defs>
                  <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f09433"/><stop offset="25%" stopColor="#e6683c"/>
                    <stop offset="50%" stopColor="#dc2743"/><stop offset="75%" stopColor="#cc2366"/>
                    <stop offset="100%" stopColor="#bc1888"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="url(#ig-grad)"/>
                <circle cx="12" cy="12" r="4.5" fill="none" stroke="white" strokeWidth="1.8"/>
                <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
              </svg>
              <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">公式PV</p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/[0.06] shadow-sm bg-slate-50 dark:bg-[#1a1d27]">
              <iframe
                src="https://www.instagram.com/reel/DYzAPu8IRAw/embed/"
                width="100%" height="480"
                style={{ border: 'none', display: 'block' }}
                loading="lazy" scrolling="no" allowtransparency="true"
                title="YORA 公式PV"
              />
            </div>
            <p className="text-[10px] text-slate-300 dark:text-slate-600 text-center mt-2">
              表示されない場合は
              <a href="https://www.instagram.com/reel/DYzAPu8IRAw/" target="_blank" rel="noopener noreferrer"
                 className="text-indigo-400 dark:text-indigo-500 underline ml-0.5">こちら</a>
            </p>
          </div>

          {/* 注意書き */}
          <div className="w-full flex flex-col gap-1.5">
            {[
              '非公式アプリです。大学・学部とは無関係です。',
              'シラバス・開講情報・免許要件は公式情報を必ずご確認ください。',
              '不具合・誤りは設定のお問い合わせからご連絡ください。',
            ].map((text, i) => (
              <p key={i} className="text-[10px] leading-snug text-slate-400 dark:text-slate-600" style={{ letterSpacing: '0.02em' }}>
                <span className="text-slate-300 dark:text-slate-700 mr-1">•</span>{text}
              </p>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── データ取得エラー（ログイン済みのみ） ──────────────────────────────────────
  if (!isDemoMode && error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-2">データの取得に失敗しました</div>
        <div className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 rounded-xl px-4 py-3 mb-4 text-left font-mono break-all">
          {error.error || String(error)}
        </div>
        <div className="text-xs text-gray-500 dark:text-slate-400 mb-4">
          .env.local の GOOGLE_SERVICE_ACCOUNT_JSON と SPREADSHEET_ID を確認してください。
        </div>
        <button onClick={() => mutate()} className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
          再試行
        </button>
      </div>
    )
  }

  // splashDone になった時点でログイン済みなら data は必ず存在するが、念のためガード
  if (!isDemoMode && !data) return null

  const courses      = data?.courses      ?? []
  const selectedIds  = data?.selectedIds  ?? []
  const totalCredits = data?.totalCredits ?? 0
  // New-schema fields (gracefully absent in legacy mode)
  // statusMap は上の useMemo で構築済み（Rules of Hooks のため早期 return の前に置いてある）
  const enrollmentVersion = data?.enrollmentVersion ?? 'legacy'

  // ── Main layout ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#f1f5f9] dark:bg-[#111318]"
      onTouchStart={handleEdgeTouchStart}
      onTouchEnd={handleEdgeTouchEnd}
    >
      {/* ── プロフィールDrawer（ログイン済みのみ） ─────────────────── */}
      {!isDemoMode && (
        <ProfileDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          departmentLabel={departmentLabel}
          enrollmentYear={enrollmentYear}
          onEnrollmentYearChange={handleEnrollmentYearChange}
          onChangeDepartment={handleStartDepartmentChange}
          rawLeavePeriods={rawLeavePeriods}
          onLeavePeriodChange={mutateLeavePeriods}
          onOpenMinorSection={handleOpenMinorSection}
          onOpenExemption={handleOpenExemption}
          exemptionCount={exemptions.length}
          maxAcademicYear={latestCourseYear}
          onOpenArchive={() => setShowArchive(true)}
          onRecalculate={handleRecalculate}
          recalcBusy={recalcBusy}
        />
      )}

      {/* ── アプリヘッダー ──────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] flex-shrink-0 relative flex items-center px-3 py-2">
        {/* 左：アバター → Drawer 開く / デモ → ログインシートを開く */}
        {isDemoMode ? (
          <button
            onClick={() => setShowLoginSheet(true)}
            aria-label="ログイン"
            className="w-8 h-8 rounded-full ring-2 ring-gray-100 dark:ring-white/10 shadow-sm
                       active:scale-90 transition-transform flex-shrink-0
                       bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center"
          >
            <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </button>
        ) : (
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="プロフィール・設定を開く"
            className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-100 dark:ring-white/10 shadow-sm active:scale-90 transition-transform flex-shrink-0"
          >
            {session?.user?.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={session.user.image} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-indigo-400 flex items-center justify-center text-white text-xs font-bold">
                {session?.user?.name?.[0] ?? '?'}
              </div>
            )}
          </button>
        )}

        {/* 中央：タブ名（absolute で常に正確に中央） */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-bold text-gray-800 dark:text-slate-100">
            {TABS.find(t => t.id === tab)?.label ?? ''}
          </span>
        </div>

        {/* 右：通知ベル / デモはシェアボタン */}
        {isDemoMode ? (
          <button
            onClick={handleDemoShare}
            aria-label="シェア"
            className="w-8 h-8 flex-shrink-0 ml-auto rounded-full flex items-center justify-center
                       text-gray-500 dark:text-slate-400
                       hover:bg-gray-100 dark:hover:bg-white/[0.06] active:scale-90 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        ) : (
          <div className="ml-auto">
            <NotificationBell />
          </div>
        )}
      </div>

      {/* オンボーディング: department 未設定時は他の操作をロック（ゲストは対象外） */}
      {!department && !isDemoMode && (
        <OnboardingModal
          departments={data?.departments ?? []}
          onSelect={handleDepartmentSelect}
          onCancel={prevDepartment ? handleCancelDepartmentChange : undefined}
        />
      )}

      {/* curriculum_year 変更確認モーダル */}
      {showCurriculumChangeModal && (
        <CurriculumYearChangeModal
          fromYear={enrollmentYear}
          toYear={pendingEnrollmentYear}
          onConfirm={handleConfirmCurriculumChange}
          onCancel={handleCancelCurriculumChange}
        />
      )}

      {/* ── 未保存バナー ─────────────────────────────────────────────────── */}
      {hasPendingChanges && (
        <div className="flex-shrink-0 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-500/30 px-3 py-2 flex items-center gap-2">
          <span className="flex-1 text-xs font-medium text-amber-700 dark:text-amber-400 truncate">
            {saveError
              ? `保存エラー: ${saveError}`
              : `未保存の変更があります（${pendingChanges.size}件）`}
          </span>
          <button
            onClick={handleDiscard}
            disabled={saveBusy}
            className="text-xs font-semibold text-gray-500 dark:text-slate-400 px-2.5 py-1 rounded-lg
                       hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-40 transition-colors flex-shrink-0"
          >
            破棄
          </button>
          <button
            onClick={handleSave}
            disabled={saveBusy}
            className="text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600
                       px-3 py-1 rounded-lg disabled:opacity-50 transition-colors flex-shrink-0
                       flex items-center gap-1"
          >
            {saveBusy ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                保存中…
              </>
            ) : '保存'}
          </button>
        </div>
      )}


      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'timetable' && (
          isDemoMode ? (
            <div className="h-full flex flex-col">
              <DemoBanner
                message="時間割を保存・管理するにはログインが必要です"
                onLogin={() => setShowLoginSheet(true)}
              />
              <div className="flex-1 min-h-0">
                <TimetableV2
                  courses={[]}
                  selectedIds={[]}
                  onToggleEnrollment={() => setShowLoginSheet(true)}
                  termFilter={timetableTermFilter}
                  onTermFilterChange={setTimetableTermFilter}
                  academicYear={new Date().getFullYear()}
                  selectedGrade={1}
                  enrollmentYear={new Date().getFullYear()}
                  maxGrade={4}
                  onGradeChange={() => {}}
                  onAddGrade={() => {}}
                  onDeleteGrade={() => {}}
                  onEnrollmentYearChange={() => {}}
                  onEntriesChange={() => {}}
                  syncKey={0}
                  enrollment={[]}
                  enrollmentVersion="new"
                  statusMap={new Map()}
                  onStatusChange={() => setShowLoginSheet(true)}
                  temporaryIds={new Set()}
                  studentId=""
                  department=""
                  onBulkStatusDone={() => {}}
                  onMemoSave={async () => {}}
                  leaveSemesters={[]}
                  displayGrade={1}
                />
              </div>
            </div>
          ) : (
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
              temporaryIds={temporaryIds}
              studentId={studentId}
              department={department}
              onBulkStatusDone={() => mutate()}
              onMemoSave={handleMemoSave}
              leaveSemesters={leaveSemesters}
              displayGrade={displayGrade}
            />
          )
        )}
        {/* カタログタブ: 常時マウント（タブ切替でもフィルタ・検索・年度状態を保持）
            hidden クラスで display:none にするだけで React state は維持される */}
        <div className={`h-full flex-col ${tab === 'courses' ? 'flex' : 'hidden'}`}>
          {/* 単位認定バナー（ゲストは非表示） */}
          {!isDemoMode && (
            <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">単位認定</span>
                {exemptions.length > 0 && (
                  <span className="bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {exemptions.length}件
                  </span>
                )}
              </div>
              <button
                onClick={() => setExemptionOpen(true)}
                className="text-xs font-semibold text-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 px-3 py-1.5 rounded-full
                           hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
              >
                ＋ 単位認定を管理
              </button>
            </div>
          )}

          {/* カタログタブ（年度モード・raw_category 横断表示） */}
          <div className="flex-1 min-h-0">
            <CatalogTab
              catalogYear={catalogYear}
              onYearChange={setCatalogYear}
              enrollmentYear={data?.userCurriculumYear ?? enrollmentYear}
              currentRealYear={currentRealYear}
              selectedIds={selectedIds}
              statusMap={statusMap}
              temporaryIds={temporaryIds}
              recognizedCourseIds={recognizedCourseIdSet}
            />
          </div>

          {/* 単位認定モーダル */}
          {exemptionOpen && (
            <ExemptionModal
              courses={courses}
              exemptions={exemptions}
              onExemptionsChange={setExemptions}
              onClose={() => setExemptionOpen(false)}
              onRecognitionChange={handleRecognitionChange}
              academicYear={academicYear}
            />
          )}
        </div>
        {tab === 'requirements' && (
          <div className="relative h-full flex flex-col">
            {isDemoMode ? (
              <GuestLockOverlay
                title="卒業要件を確認しよう"
                message="履修状況にもとづいて、卒業・免許取得の進捗をリアルタイムで確認できます。"
                onLogin={() => setShowLoginSheet(true)}
              />
            ) : (
              <GraduationTabV2
                studentId={studentId}
                includeProjected={includeProjected}
                onToggleProjected={handleToggleProjected}
                includeTemporary={includeTemporary}
                onToggleTemporary={handleToggleTemporary}
                needsRecalc={needsRecalc}
                onRecalculate={handleRecalculate}
                recalcBusy={recalcBusy}
                recalcError={recalcError}
                initialMode={requirementsMode}
                onModeChange={setRequirementsMode}
              />
            )}
          </div>
        )}
        {tab === 'summary' && (
          <div className="h-full flex flex-col">
            {isDemoMode ? (
              <>
                <DemoBanner
                  message="ログインして単位の取得状況を管理しましょう"
                  onLogin={() => setShowLoginSheet(true)}
                />
                <div className="flex-1 min-h-0 flex flex-col">
                  <Dashboard
                    studentId=""
                    courses={[]}
                    enrollment={[]}
                    creditSummary={creditSummary}
                    includeProjected={false}
                    onToggleProjected={() => {}}
                    includeTemporary={false}
                    onToggleTemporary={() => {}}
                    needsRecalc={false}
                    onRecalculate={() => setShowLoginSheet(true)}
                    recalcBusy={false}
                    recalcError={null}
                    selectedGrade={1}
                    timetableTermFilter="春学期"
                    academicYear={new Date().getFullYear()}
                  />
                </div>
              </>
            ) : (
              <Dashboard
                studentId={studentId}
                courses={data?.courses ?? []}
                enrollment={data?.enrollment ?? []}
                creditSummary={creditSummary}
                includeProjected={includeProjected}
                onToggleProjected={handleToggleProjected}
                includeTemporary={includeTemporary}
                onToggleTemporary={handleToggleTemporary}
                needsRecalc={needsRecalc}
                onRecalculate={handleRecalculate}
                recalcBusy={recalcBusy}
                recalcError={recalcError}
                selectedGrade={selectedGrade}
                timetableTermFilter={timetableTermFilter}
                academicYear={academicYear}
              />
            )}
          </div>
        )}
        {tab === 'emptyrooms' && (
          <EmptyRooms courses={
            isDemoMode
              ? (guestLatestYear > 0 ? guestCoursesAll.filter(c => c.academic_year === guestLatestYear) : guestCoursesAll)
              : (latestCourseYear > 0 ? courses.filter(c => c.academic_year === latestCourseYear) : courses)
          } />
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
      <nav className="bg-white dark:bg-[#1a1d27] border-t border-gray-100 dark:border-white/[0.07] flex-shrink-0 nav-safe-bottom">
        <div className="relative grid grid-cols-5">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <motion.button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                whileTap={{ scale: 0.93 }}
                transition={{ duration: 0.12, ease: [0.25, 0, 0, 1] }}
                className="relative flex flex-col items-center justify-center py-3 gap-1 outline-none"
              >
                {/* スライドするピル背景 — layoutId により隣タブへ滑らかに移動 */}
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute inset-x-1 inset-y-1 rounded-[14px]
                               bg-blue-50 dark:bg-blue-500/[0.09]"
                    style={{ zIndex: 0 }}
                    transition={{ type: 'tween', duration: 0.22, ease: [0.25, 0, 0, 1] }}
                  />
                )}
                {/* アイコン */}
                <span className={`relative transition-colors duration-[180ms]
                                  ${active ? 'text-blue-500' : 'text-gray-400 dark:text-slate-500'}`}
                      style={{ zIndex: 1 }}>
                  <Icon active={active} />
                </span>
                {/* ラベル */}
                <span className={`relative text-[11px] font-semibold leading-none
                                  transition-colors duration-[180ms]
                                  ${active ? 'text-blue-500' : 'text-gray-400 dark:text-slate-500'}`}
                      style={{ zIndex: 1 }}>
                  {t.label}
                </span>
              </motion.button>
            )
          })}
        </div>
      </nav>

      {/* ── PWA インストール案内（初回のみ） ─────────────────────────────────────── */}
      {showPwaPrompt && (
        <PwaInstallPrompt
          onClose={() => setShowPwaPrompt(false)}
        />
      )}

      {/* ── 仮登録移行モーダル ──────────────────────────────────────────────────── */}
      {migrateModalData && (
        <PreEnrollMigrateModal
          courses={data?.courses ?? []}
          tempEnrollments={migrateModalData.tempEnrollments}
          newLatestYear={migrateModalData.newYear}
          oldLatestYear={migrateModalData.oldYear}
          onConfirm={handleMigrateConfirm}
          onSkip={handleMigrateSkip}
          migrating={migrating}
        />
      )}

      {/* ── ゲストログインシート ──────────────────────────────────────────────── */}
      {showLoginSheet && (
        <LoginSheet onClose={() => setShowLoginSheet(false)} />
      )}

      {/* ── 卒業確認ダイアログ ────────────────────────────────────────────────── */}
      {showGradConfirm && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40" style={{ backdropFilter: 'blur(2px)' }}>
          <div className="w-full max-w-sm mx-auto bg-white rounded-t-3xl px-6 pt-6 pb-10 flex flex-col items-center gap-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mb-1" />
            <img src="/icons/icon-192.png" className="w-14 h-14 rounded-2xl" alt="YORA" />
            <div className="text-center">
              <div className="text-[#1e2d4e] font-bold text-lg" style={{ fontFamily: "'Noto Serif JP', serif" }}>
                卒業しましたか？
              </div>
              <div className="text-[#8a8a7a] text-sm mt-1 leading-relaxed">
                4年間のあなたの記録を<br />YORA ARCHIVEで振り返りませんか。
              </div>
            </div>
            <button
              onClick={() => {
                const archiveKey = `yora_archive_unlocked_${studentId}`
                try { localStorage.setItem(archiveKey, '1') } catch {}
                setShowGradConfirm(false)
                setShowArchive(true)
              }}
              className="w-full py-3 rounded-2xl text-white font-bold text-sm"
              style={{ background: '#1e2d4e' }}
            >
              YORA ARCHIVE を見る
            </button>
            <button
              onClick={() => setShowGradConfirm(false)}
              className="text-[#8a8a7a] text-sm"
            >
              あとで
            </button>
          </div>
        </div>
      )}

      {/* ── YORA ARCHIVE モーダル ─────────────────────────────────────────────── */}
      <GraduationArchiveModal
        open={showArchive}
        onClose={() => setShowArchive(false)}
      />
    </div>
  )
}

// ── DemoBanner ────────────────────────────────────────────────────────────────
// デモモード中のタブ上部に表示するスリムなログイン促進バナー

function DemoBanner({ message, onLogin }) {
  return (
    <div className="flex-shrink-0 bg-indigo-50 dark:bg-indigo-500/10
                    border-b border-indigo-100 dark:border-indigo-500/20
                    px-4 py-2.5 flex items-center gap-3">
      <span className="flex-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 leading-snug">
        {message}
      </span>
      <button
        onClick={onLogin}
        className="flex-shrink-0 text-xs font-semibold text-white
                   bg-indigo-500 hover:bg-indigo-600 active:scale-95
                   px-3.5 py-1.5 rounded-full transition-colors"
      >
        ログイン
      </button>
    </div>
  )
}

// ── LoginSheet ────────────────────────────────────────────────────────────────
// ゲストがログインするためのボトムシート

function LoginSheet({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ left: 'max(0px, calc((100vw - 430px) / 2))', right: 'max(0px, calc((100vw - 430px) / 2))' }}
    >
      {/* バックドロップ */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* シート本体 */}
      <div className="relative bg-white dark:bg-[#0b0c12] rounded-t-3xl overflow-auto max-h-[90dvh] shadow-2xl">
        {/* ドラッグハンドル */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-white/20" />
        </div>

        <div className="flex flex-col items-center px-8 pt-4 pb-10 gap-6">
          {/* アイコン */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-512.png"
            alt="YORA"
            width={64}
            height={64}
            style={{
              borderRadius: 16,
              boxShadow: '0 12px 36px rgba(79,70,229,0.22), 0 4px 10px rgba(79,70,229,0.12)',
              display: 'block',
            }}
          />

          {/* ブランド */}
          <div className="flex flex-col items-center gap-1">
            <p className="font-semibold text-slate-900 dark:text-white"
               style={{ fontSize: 24, letterSpacing: '0.14em' }}>
              YORA
            </p>
            <p className="text-[11px] font-light text-slate-400 dark:text-slate-600"
               style={{ letterSpacing: '0.08em' }}>
              学芸が苦行を、学芸学業に。
            </p>
          </div>

          {/* ログインセクション */}
          <div className="w-full flex flex-col items-center gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              時間割を保存したり、卒業要件を<br />確認するにはログインが必要です
            </p>
            <p className="text-xs font-medium text-indigo-400 dark:text-indigo-500">
              もちろん無料です ☀️
            </p>
            <button
              onClick={() => signIn('google')}
              className="w-full flex items-center justify-center gap-3
                         bg-white dark:bg-[#1a1d27]
                         border border-slate-200 dark:border-white/[0.08]
                         shadow-md dark:shadow-none
                         rounded-2xl px-6 py-4
                         text-sm font-semibold text-slate-700 dark:text-slate-200
                         hover:bg-slate-50 dark:hover:bg-white/[0.06]
                         active:scale-[0.98] transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google でログイン
            </button>
          </div>

          {/* 公式PV */}
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3 justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <defs>
                  <linearGradient id="ig-login" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#f09433"/>
                    <stop offset="50%"  stopColor="#dc2743"/>
                    <stop offset="100%" stopColor="#bc1888"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="url(#ig-login)"/>
                <circle cx="12" cy="12" r="4.5" fill="none" stroke="white" strokeWidth="1.8"/>
                <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
              </svg>
              <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                公式PV
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/[0.06] shadow-sm bg-slate-50 dark:bg-[#1a1d27]">
              <iframe
                src="https://www.instagram.com/reel/DYzAPu8IRAw/embed/"
                width="100%"
                height="480"
                style={{ border: 'none', display: 'block' }}
                loading="lazy"
                scrolling="no"
                allowtransparency="true"
                title="YORA 公式PV"
              />
            </div>
            <p className="text-[10px] text-slate-300 dark:text-slate-600 text-center mt-2">
              表示されない場合は
              <a href="https://www.instagram.com/reel/DYzAPu8IRAw/"
                 target="_blank" rel="noopener noreferrer"
                 className="text-indigo-400 dark:text-indigo-500 underline ml-0.5">
                こちら
              </a>
            </p>
          </div>

          {/* 注意書き */}
          <div className="w-full flex flex-col gap-1.5">
            {[
              '非公式アプリです。大学・学部とは無関係です。',
              'シラバス・開講情報・免許要件は公式情報を必ずご確認ください。',
              '不具合・誤りは設定のお問い合わせからご連絡ください。',
            ].map((text, i) => (
              <p key={i} className="text-[10px] leading-snug text-slate-400 dark:text-slate-600"
                 style={{ letterSpacing: '0.02em' }}>
                <span className="text-slate-300 dark:text-slate-700 mr-1">•</span>
                {text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── GuestLockOverlay ──────────────────────────────────────────────────────────
// ゲスト向け: ログインが必要な機能にかぶせるオーバーレイ

function GuestLockOverlay({ title, message, onLogin }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center
                    bg-[#f1f5f9]/88 dark:bg-[#111318]/88 backdrop-blur-[3px]">
      <div className="flex flex-col items-center gap-5 px-10 text-center max-w-[280px]">
        {/* 鍵アイコン */}
        <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#1a1d27] shadow-sm
                        flex items-center justify-center">
          <svg className="w-7 h-7 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>

        {/* テキスト */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px] font-semibold text-gray-800 dark:text-slate-100">{title}</p>
          {message && (
            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">{message}</p>
          )}
          <p className="text-xs font-medium text-indigo-400 dark:text-indigo-500 mt-0.5">
            もちろん無料です ☀️
          </p>
        </div>

        {/* ログインボタン */}
        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center gap-2.5
                     bg-white dark:bg-[#1a1d27]
                     border border-slate-200 dark:border-white/[0.08]
                     shadow-sm rounded-2xl px-6 py-3.5
                     text-sm font-semibold text-slate-700 dark:text-slate-200
                     hover:bg-slate-50 dark:hover:bg-white/[0.06]
                     active:scale-[0.98] transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google でログイン
        </button>
      </div>
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
    <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-3 py-2 flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">取得予定を含む</span>
        <span className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          {active
            ? '履修予定・履修中を取得済みとして集計中'
            : '取得済みのみを集計中'}
        </span>
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                    transition-colors duration-200 focus:outline-none
                    ${active ? 'bg-blue-500' : 'bg-gray-200 dark:bg-slate-600'}`}
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


