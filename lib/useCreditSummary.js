'use client'
/**
 * useCreditSummary.js
 *
 * selectedIds（API）と timetable エントリ（localStorage）を統合し、
 * 以下の 4 種類の集計データを返すカスタムフック。
 *
 *   completedCourses  … 取得済み科目リスト
 *   totalCredits      … 総単位数
 *   creditsByGrade    … 学年別単位
 *   creditsByCategory … カテゴリ別単位（EB / ST / CL_ENG_OP）
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * データフロー
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  [API]
 *   selectedIds  ──────────────────────────────────────────┐
 *   courses      ──(classId, credits, tags, term)──────────┤
 *                                                          ▼
 *  [localStorage]                               completedCourses
 *   enrollmentStore[year][sem]                       │
 *   └─ entry.classId ──(grade, semester)─────────────┘
 *
 *  completedCourses ──► totalCredits
 *                   ──► creditsByGrade    { 1:N, 2:N, …, unknown:N }
 *                   ──► creditsByCategory { EB:N, ST:N, CL_ENG_OP:N }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 年度マッピングの仕組み
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  timetable エントリに classId が紐付いている場合のみ学年を特定できる。
 *  selectedIds に含まれるが timetable エントリに存在しないコース（履修登録タブ
 *  のみで登録した等）は grade: null / 'unknown' バケットに入る。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * syncKey について
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  localStorage は React の依存追跡外のため、timetable エントリが変更されても
 *  自動的には再計算されない。
 *  呼び出し元（page.jsx）で syncKey をインクリメントすることで強制再計算する。
 *
 *  推奨パターン（page.jsx）:
 *
 *    const [entrySyncKey, setEntrySyncKey] = useState(0)
 *
 *    // TimetableV2 に渡すコールバック
 *    const handleEntriesChange = useCallback(() => {
 *      setEntrySyncKey(k => k + 1)
 *    }, [])
 *
 *    // useCreditSummary 呼び出し
 *    const creditSummary = useCreditSummary({
 *      courses, selectedIds,
 *      enrollmentYear, maxGrade,
 *      syncKey: entrySyncKey,
 *    })
 *
 *  TimetableV2 では createEntry / deleteEntry / clearEntries 後に
 *  props.onEntriesChange?.() を呼ぶ。
 */

import { useMemo } from 'react'
import { loadEntries } from './enrollmentStore'
import { gradeToYear } from './periodConfig'

// ── 集計対象カテゴリタグ ──────────────────────────────────────────────────────

/**
 * creditsByCategory で集計するタグの一覧。
 * compute.js の source_groups 表記に合わせること。
 */
// CL_ENG_MAN・CL_SEC も集計対象に追加（exemption 統合で必要）
export const SUMMARY_CATEGORIES = ['EB', 'ST', 'CL_ENG_OP', 'CL_ENG_MAN', 'CL_SEC']

// ── 定数 ──────────────────────────────────────────────────────────────────────

const SEMESTERS = /** @type {const} */ (['spring', 'fall'])

// ── 型定義（JSDoc） ───────────────────────────────────────────────────────────

/**
 * @typedef {object} CompletedCourse
 * @property {string}              courseId  - 科目ID（section番号を除いた恒久ID）
 *   course_id 列が存在する場合はそちらを優先する（例: "70200200"）。
 *   同一 courseId の複数クラスは重複排除済み（1 件のみ）。
 * @property {string}              classId   - Google Sheets の class_id（表示用）
 * @property {string}              name      - 科目名
 * @property {number}              credits   - 単位数
 * @property {string|null}         term      - 学期文字列（例: '春学期', '第1ターム'）
 * @property {string[]}            tags      - タグ配列（例: ['EB', 'CA']）
 * @property {number|null}         grade     - 学年（1〜N, null=年度不明）
 * @property {'spring'|'fall'|null} semester - 学期（null=年度不明）
 */

/**
 * @typedef {object} CreditSummary
 * @property {CompletedCourse[]}         completedCourses   - 取得済み科目リスト
 * @property {number}                    totalCredits       - 総単位数
 * @property {Record<string,number>}     creditsByGrade     - 学年別単位
 *   例: { 1: 20, 2: 18, 3: 4, unknown: 2 }
 *   'unknown' = timetable 未登録で年度が特定できないもの
 * @property {Record<string,number>}     creditsByCategory  - カテゴリ別単位
 *   例: { EB: 8, ST: 6, CL_ENG_OP: 4 }
 */

// ── フック本体 ────────────────────────────────────────────────────────────────

/**
 * 履修単位の集計データを返すカスタムフック。
 *
 * @param {object}   params
 * @param {object[]} params.courses        - カタログ全件（APIから）
 * @param {string[]} params.selectedIds    - 履修済み classId 一覧（APIから）
 * @param {number}   params.enrollmentYear - 入学年度（1年生の西暦）
 * @param {number}   params.maxGrade       - 管理している最大学年
 * @param {number}  [params.syncKey=0]     - timetable 変更時にインクリメントする値
 * @param {import('./exemptionStore').Exemption[]} [params.exemptions=[]]
 *   - 単位認定データ（enrollment とは別管理）
 * @returns {CreditSummary|null}           courses / selectedIds 未ロード時は null
 */
export function useCreditSummary({
  courses,
  selectedIds,
  enrollmentYear,
  maxGrade,
  syncKey    = 0,
  exemptions = [],
}) {
  return useMemo(() => {
    if (!courses?.length || !selectedIds) return null

    // ── Step 1: classId → { grade, semester } マップ（localStorage から構築） ──

    /** @type {Map<string, { grade: number, semester: 'spring'|'fall' }>} */
    const classPlacementMap = new Map()

    for (let grade = 1; grade <= maxGrade; grade++) {
      const year = gradeToYear(grade, enrollmentYear)
      for (const sem of SEMESTERS) {
        const entries = loadEntries(year, sem)
        for (const entry of entries) {
          // 同一 classId が複数学年にある場合は最初に見つかったものを採用
          if (entry.classId && !classPlacementMap.has(entry.classId)) {
            classPlacementMap.set(entry.classId, { grade, semester: sem })
          }
        }
      }
    }

    // ── Step 2: 取得済み科目リストを構築（COURSEID 単位・重複排除）────────────
    // selectedIds を source of truth として使い、courses カタログから詳細を補完。
    //
    // 同一 courseId の複数クラス（セクション）が selectedIds に含まれていても
    // 先頭 1 件のみ採用し、単位・カテゴリを重複加算しない。
    // 採用優先度: classPlacementMap に存在する classId → それ以外の先着順

    const selectedSet = new Set(selectedIds)

    /** @type {Map<string, import('./enrollmentStore').Entry & { grade:number, semester:string }>} */
    // courseId → 確定済みエントリのキャッシュ（placement 優先選択に使用）
    const placedByCourseId = new Map()
    const unplacedByCourseId = new Map()

    for (const c of courses) {
      // composite key: class_id|academic_year で選択状態を判定
      if (!selectedSet.has(`${c.class_id}|${c.academic_year ?? ''}`)) continue

      const courseId  = c.course_id || c.class_id?.replace(/-\d+$/, '') || c.class_id
      const placement = classPlacementMap.get(c.class_id) ?? null

      if (placement) {
        // timetable に登録済み classId が見つかった → この courseId の確定候補
        if (!placedByCourseId.has(courseId)) {
          placedByCourseId.set(courseId, { c, placement })
        }
      } else {
        // timetable 未登録のもの（先着のみ保持）
        if (!unplacedByCourseId.has(courseId)) {
          unplacedByCourseId.set(courseId, { c, placement: null })
        }
      }
    }

    // placed を優先し、ない courseId は unplaced で補完
    const mergedByCourseId = new Map([...unplacedByCourseId, ...placedByCourseId])

    /** @type {CompletedCourse[]} */
    const completedCourses = []

    for (const [courseId, { c, placement }] of mergedByCourseId) {
      completedCourses.push({
        courseId,
        classId:  c.class_id,
        name:     c.course_name,
        credits:  Number(c.credits) || 0,
        term:     c.term   || null,
        tags:     c.tags
          ? String(c.tags).split('|').map(t => t.trim()).filter(Boolean)
          : [],
        grade:    placement?.grade    ?? null,
        semester: placement?.semester ?? null,
      })
    }

    // ── Step 3: 総単位 ───────────────────────────────────────────────────────────

    const totalCredits = completedCourses.reduce((sum, c) => sum + c.credits, 0)

    // ── Step 4: 学年別単位 ───────────────────────────────────────────────────────
    // 年度不明（timetable 未登録）のコースは 'unknown' バケットに集計。

    /** @type {Record<string, number>} */
    const creditsByGrade = {}
    for (let g = 1; g <= maxGrade; g++) creditsByGrade[g] = 0
    creditsByGrade['unknown'] = 0

    for (const c of completedCourses) {
      const key = c.grade != null ? String(c.grade) : 'unknown'
      creditsByGrade[key] += c.credits
    }

    // ── Step 5: カテゴリ別単位 ───────────────────────────────────────────────────

    /** @type {Record<string, number>} */
    const creditsByCategory = Object.fromEntries(
      SUMMARY_CATEGORIES.map(tag => [tag, 0])
    )

    for (const c of completedCourses) {
      for (const tag of c.tags) {
        if (Object.prototype.hasOwnProperty.call(creditsByCategory, tag)) {
          creditsByCategory[tag] += c.credits
        }
      }
    }

    // ── Step 6: 単位認定（Exemption）を統合 ──────────────────────────────────────
    // enrollment とは分離して集計する。
    //   - creditsByCategory に加算（卒業要件・実習判定に反映）
    //   - creditsByGrade には加算しない（学年情報が存在しないため）
    //   - totalCredits には加算する

    let exemptionTotal = 0
    for (const ex of exemptions) {
      for (const [cat, credits] of Object.entries(ex.categoryCredits)) {
        creditsByCategory[cat] = (creditsByCategory[cat] || 0) + credits
        exemptionTotal += credits
      }
    }

    return {
      completedCourses,
      totalCredits:      totalCredits + exemptionTotal,
      enrollmentCredits: totalCredits,    // 履修分のみ（デバッグ・UI 用）
      exemptionCredits:  exemptionTotal,  // 認定分のみ
      creditsByGrade,
      creditsByCategory,
    }

  // syncKey・exemptions を依存に含め、変更時に強制再計算する
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, selectedIds, enrollmentYear, maxGrade, syncKey, exemptions])
}
