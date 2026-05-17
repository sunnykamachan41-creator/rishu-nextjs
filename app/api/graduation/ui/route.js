import { NextResponse } from 'next/server'
import { normalizeId } from '@/lib/transform'
import {
  fetchGraduationUIAll,
  fetchGraduationRuleAll,
  fetchStudentsSummaryAll,
  fetchCategoryFormulaAll,
  fetchProgressAutoForStudent,
  fetchAllSheets,
} from '@/lib/sheets'
import { evaluateCondition, applyCategoryFormula } from '@/lib/graduation'

/**
 * GET /api/graduation/ui
 * ──────────────────────
 * Returns a fully-resolved, display-ready graduation requirements list for the
 * current student, combining three data sources:
 *
 *   graduation_ui     — what to display and how (display_name, ui_group, order)
 *   graduation_rules  — which items are required and with what threshold
 *   students_summary  — current credit totals per category
 *
 * No hardcoded department logic lives in React — everything is derived here.
 *
 * Response shape:
 * {
 *   ok:         boolean,
 *   department: string,          // normalised department_id of current user
 *   groups:     string[],        // ui_group names in sheet order (first-occurrence)
 *   items: [{
 *     category:         string,
 *     display_name:     string,
 *     ui_group:         string,
 *     display_order:    number,
 *     required:         boolean, // true if graduation_rule exists for this user
 *     required_credits: number|null,
 *     condition:        string|null,  // '>=', '>', etc.
 *     current_credits:  number,
 *     pass:             boolean|null, // null = not required
 *   }]
 * }
 */

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    // ── Category normalization helper ───────────────────────────────────────
    // normalizeId は NFKC のみで大文字小文字を変換しない。
    // Sheets の入力値（"S" / "s" / "SA" / "sa" 混在）を case-insensitive に
    // 扱うため、category 比較は必ず大文字に統一する。
    const normCat = s => normalizeId(String(s || '')).toUpperCase()

    // ── Parallel fetch ──────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url)
    const studentId = normalizeId(searchParams.get('student_id') || process.env.STUDENT_ID || 'student_001')

    const [uiRows, ruleRows, studentRows, categoryFormulaRows, progressRows, sheetsData] = await Promise.all([
      fetchGraduationUIAll(),
      fetchGraduationRuleAll(),
      fetchStudentsSummaryAll(),
      fetchCategoryFormulaAll(),
      fetchProgressAutoForStudent(studentId),
      fetchAllSheets(studentId),
    ])

    const departmentId = normalizeId(sheetsData.userDepartment || '')

    if (uiRows.length === 0) {
      console.warn('[GET /api/graduation/ui] graduation_ui sheet is empty or missing')
      return NextResponse.json({ ok: true, department: departmentId, groups: [], items: [] })
    }

    // ── Build credit map for current student ────────────────────────────────
    // students_summary row → { normalizedCategory: creditValue }
    const creditMap = new Map()
    const studentRow = studentRows.find(r => r.student_id === studentId)
    if (studentRow) {
      for (const [rawKey, rawVal] of Object.entries(studentRow)) {
        const keyNorm = normalizeId(rawKey)
        if (!keyNorm || keyNorm === 'student_id' || keyNorm === 'department_id') continue
        creditMap.set(keyNorm.toUpperCase(), Number(rawVal) || 0)  // 大文字統一
      }
    } else {
      console.warn('[GET /api/graduation/ui] student not found in students_summary:', studentId)
    }

    // ── category_formula を適用して派生カテゴリを creditMap に追加 ───────────
    // S / SA 等は直接 students_summary に存在せず、category_formula で定義された
    // 派生カテゴリ（例: S = S_MAN + S_HIENG）のため、ここで展開が必要。
    // graduation.js の computeGraduationResults と同じロジックを適用する。
    applyCategoryFormula(creditMap, categoryFormulaRows, departmentId)

    console.log('[CREDIT_DEBUG] S:', creditMap.get('S') ?? 0, '/ SA:', creditMap.get('SA') ?? 0)

    // ── Build per-category course map from progress_auto ───────────────────
    // coursesByCategory: normalizedCategory → CourseEntry[]
    // All statuses are included so the UI can show IN_PROGRESS / PLANNED too.
    const coursesByCategory = new Map()
    for (const row of progressRows) {
      const cat = normCat(row.final_category ?? '')   // 大文字統一
      if (!cat) continue

      if (!coursesByCategory.has(cat)) coursesByCategory.set(cat, [])
      coursesByCategory.get(cat).push({
        class_id:    String(row.class_id    ?? '').trim(),
        course_id:   String(row.course_id   ?? '').trim(),
        course_name: String(row.course_name ?? '').trim(),
        credits:     Number(row.credits)  || 0,
        status:      String(row.status    ?? '').trim().toUpperCase(),
        term:        String(row.term      ?? '').trim(),
        year:        Number(row.year)     || null,
        semester:    String(row.semester  ?? '').trim(),
      })
    }

    // ── category_formula の派生カテゴリ分のコースも集約 ────────────────────
    // creditMap と同様に、S / SA などの派生カテゴリは progress_auto に直接
    // 存在しない（S_MAN / S_HIENG 等の source カテゴリとして記録される）。
    // formula 定義に従い source カテゴリのコースをマージして派生キーに登録する。
    const STATUS_ORDER_FORMULA = { COMPLETED: 0, IN_PROGRESS: 1, PLANNED: 2, FAILED: 3, AUDIT: 4, RE_ENROLL: 5 }
    for (const row of categoryFormulaRows) {
      const rowDept = normalizeId(row.department_id || '')
      if (rowDept !== departmentId) continue

      const derived  = normCat(row.derived_category || '')
      const sources  = normalizeId(String(row.source_categories ?? ''))
        .split('|')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)

      if (!derived || sources.length === 0) continue

      // source カテゴリのコースを全て集約
      const aggregated = []
      for (const src of sources) {
        for (const course of (coursesByCategory.get(src) ?? [])) {
          aggregated.push(course)
        }
      }

      if (aggregated.length > 0) {
        aggregated.sort((a, b) =>
          (STATUS_ORDER_FORMULA[a.status] ?? 9) - (STATUS_ORDER_FORMULA[b.status] ?? 9)
        )
        coursesByCategory.set(derived, aggregated)
      }
    }

    // ── Build applicable rules lookup ───────────────────────────────────────
    // required 判定の正しい条件:
    //   category 一致 + rule_type/target が現在ユーザーに適用される
    //
    // S / SA のような汎用カテゴリは複数学科で共有されるため、
    // category 名だけでなく rule_type + target も含めて判定する。
    //
    // 優先順位: 学科固有ルール (CLASS/SPECIAL + matchesDept) > GLOBAL/wildcard
    const applicableRules = new Map()  // normalizedCategory → { condition, value, isDeptSpecific, rule_type, target }
    for (const rule of ruleRows) {
      const ruleType   = normalizeId(rule.rule_type || '').toUpperCase()
      const ruleTarget = normalizeId(rule.target    || '')
      const category   = normCat(rule.category || '')   // 大文字統一
      if (!category) continue

      const isGlobal       = ruleType === 'GLOBAL' || ruleTarget === '' || ruleTarget === 'all'
      const matchesDept    = ruleTarget === departmentId
      const isDeptSpecific = matchesDept && !isGlobal

      // このユーザーに適用されないルールはスキップ
      if (!isGlobal && !matchesDept) continue

      const existing = applicableRules.get(category)
      // 未登録 OR 既存がグローバルで今回が学科固有（より具体的）なら上書き
      if (!existing || (isDeptSpecific && !existing.isDeptSpecific)) {
        applicableRules.set(category, {
          condition:      String(rule.condition || '>=').trim(),
          value:          Number.isFinite(Number(rule.value)) ? Number(rule.value) : 0,
          isDeptSpecific,
          rule_type:      ruleType,
          target:         ruleTarget,
        })
      }
    }

    // ── Filter + enrich graduation_ui rows ──────────────────────────────────
    // Preserve group order (first-occurrence in sheet = intended display order)
    const groupOrder    = []
    const groupOrderSet = new Set()
    const items         = []

    for (const row of uiRows) {
      const rowTarget  = normalizeId(row.target    || '')
      const uiRuleType = normalizeId(row.rule_type || '').toUpperCase() || 'GLOBAL'

      // GLOBAL rule_type → 学科問わず全員に表示。
      // CLASS / SPECIAL → target が空/all か、現在ユーザーの学科と一致する行のみ表示。
      const isGlobalRule = uiRuleType === 'GLOBAL'
      const isForAll     = isGlobalRule || rowTarget === '' || rowTarget === 'all'
      const isForDept    = rowTarget === departmentId
      if (!isForAll && !isForDept) continue

      const category     = normCat(row.category || '')   // 大文字統一
      const uiGroup      = (row.ui_group     || '').trim()
      const displayName  = (row.display_name || category || '').trim()
      const displayOrder = Number(row.display_order) || 0

      // Record group order
      if (uiGroup && !groupOrderSet.has(uiGroup)) {
        groupOrder.push(uiGroup)
        groupOrderSet.add(uiGroup)
      }

      // Required = category + rule_type + target すべてが現在ユーザーに一致する
      //            graduation_rule が存在するか（category 単独比較は不十分）
      const rule             = category ? applicableRules.get(category) : null
      const required         = !!rule
      const required_credits = required ? rule.value    : null
      const condition        = required ? rule.condition : null

      // Courses contributing to this category (all statuses, sorted: COMPLETED first)
      const STATUS_ORDER = { COMPLETED: 0, IN_PROGRESS: 1, PLANNED: 2, FAILED: 3, AUDIT: 4, RE_ENROLL: 5 }
      const courses = (coursesByCategory.get(category) ?? [])
        .slice()
        .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))

      // current_credits: students_summary (creditMap) が優先。
      // students_summary に該当カテゴリの列が無い場合（FREE 等のユーザー定義カテゴリ）は
      // progress_auto の COMPLETED 授業を直接集計して代替する。
      // これにより students_summary への手動列追加なしで単位数が正しく表示される。
      const summaryCredits  = category ? (creditMap.get(category) ?? 0) : 0
      const courseCredits   = courses
        .filter(c => c.status === 'COMPLETED')
        .reduce((s, c) => s + c.credits, 0)
      const current_credits = summaryCredits > 0 ? summaryCredits : courseCredits

      // Pass evaluation: null when not required (no pass/fail concept)
      const pass = required
        ? evaluateCondition(current_credits, condition, required_credits)
        : null

      items.push({
        category,
        display_name:     displayName,
        ui_group:         uiGroup,
        ui_rule_type:     uiRuleType,
        display_order:    displayOrder,
        required,
        required_credits,
        condition,
        current_credits,
        pass,
        courses,          // CourseEntry[] — courses contributing to this category
      })
    }

    // Sort: GLOBAL 全員表示を先頭に、CLASS/SPECIAL を後ろに。
    // 同一 rule_type 内はシートの group 出現順 → display_order の順を維持。
    const RULE_TYPE_PRIORITY = { GLOBAL: 0, CLASS: 1, SPECIAL: 1 }
    items.sort((a, b) => {
      const rp = (RULE_TYPE_PRIORITY[a.ui_rule_type] ?? 1) - (RULE_TYPE_PRIORITY[b.ui_rule_type] ?? 1)
      if (rp !== 0) return rp
      const gi = groupOrder.indexOf(a.ui_group) - groupOrder.indexOf(b.ui_group)
      if (gi !== 0) return gi
      return a.display_order - b.display_order
    })

    // ソート後の並びに合わせてグループ順を再構築（first-occurrence）
    const finalGroups    = []
    const finalGroupsSet = new Set()
    for (const item of items) {
      if (item.ui_group && !finalGroupsSet.has(item.ui_group)) {
        finalGroups.push(item.ui_group)
        finalGroupsSet.add(item.ui_group)
      }
    }

    console.log('[GET /api/graduation/ui]', {
      department:   departmentId,
      ui_rows:      uiRows.length,
      items_shown:  items.length,
      groups:       finalGroups,
    })

    return NextResponse.json({
      ok:         true,
      department: departmentId,
      groups:     finalGroups,
      items,
    })
  } catch (err) {
    console.error('[GET /api/graduation/ui]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
