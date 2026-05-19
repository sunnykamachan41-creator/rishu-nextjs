/**
 * lib/graduation.js
 * ─────────────────
 * Pure computation: evaluate GRADUATION_RULE against students_summary.
 * No Sheets I/O — all data is passed in as plain objects.
 *
 * Entry point: computeGraduationResults(studentRows, ruleRows, categoryFormulaRows)
 *
 * Rule structure (from GRADUATION_RULE sheet):
 *   rule_type  : GLOBAL | CLASS | SPECIAL
 *   target     : department_id to match (CLASS only; empty = all departments)
 *   category   : column name in students_summary to read
 *   condition  : comparison operator (>=, >, <=, <, =, !=)
 *   value      : numeric threshold
 *   source     : summary | category_formula | setting
 *
 * category_formula sheet structure:
 *   department_id | derived_category | source_categories | operation
 *   (source_categories is pipe-delimited; operation is SUM)
 *
 * Pipeline per student:
 *   1. Build creditMap from students_summary row (base categories)
 *   2. applyCategoryFormula() — compute derived categories and add to creditMap
 *   3. Evaluate GLOBAL / CLASS / SPECIAL rules against the enriched creditMap
 *
 * Output per student:
 *   student_id / department_id / global_status / class_status / special_status / result / failing_rules
 */

import { normalizeId } from './transform'

// ── Condition evaluator ────────────────────────────────────────────────────────

/**
 * Compare actual against threshold using the given operator.
 * Non-finite values on either side are coerced to 0.
 *
 * @param {number|string} actual
 * @param {string}        condition  '>=', '>', '<=', '<', '=', '!='
 * @param {number|string} threshold
 * @returns {boolean}
 */
export function evaluateCondition(actual, condition, required) {
  const actualNum   = Number(actual)
  const requiredNum = Number(required)

  // NFKC 正規化 + trim で全角記号・空白混入を除去
  const normalizedCondition = normalizeId(String(condition ?? '')).trim()

  console.log('[EVALUATE_CONDITION]', {
    actual,            actualNum,
    required,          requiredNum,
    condition,         normalizedCondition,
    actual_type:   typeof actual,
    required_type: typeof required,
  })

  switch (normalizedCondition) {
    case '>=': return actualNum >= requiredNum
    case '>':  return actualNum >  requiredNum
    case '<=': return actualNum <= requiredNum
    case '<':  return actualNum <  requiredNum
    case '=':
    case '==': return actualNum === requiredNum
    case '!=': return actualNum !== requiredNum
    default:
      console.warn('[UNKNOWN_CONDITION]', JSON.stringify(normalizedCondition))
      return false
  }
}

// ── Single-rule evaluator ─────────────────────────────────────────────────────

/**
 * Resolve the credit value for one rule against a student's credit map.
 * source handling:
 *   'summary' | 'category_formula' → read students_summary[category]
 *   'setting'                       → same for now; warn
 *   unknown                         → 0 with warn
 *
 * @param {{ category, condition, value, source }} rule
 * @param {Map<string, number>} creditMap  normalised category → number
 * @returns {{ pass: boolean, actual: number, rule: object }}
 */
function evalRule(rule, creditMap) {
  const cat = normalizeId(rule.category || '').toUpperCase()  // 大文字統一
  const src = normalizeId(rule.source   || '')

  // ── [RULE_CATEGORY_COMPARE] ───────────────────────────────────────────────
  console.log('[RULE_CATEGORY_COMPARE]', {
    original:   rule.category,
    normalized: cat,
    available:  Array.from(creditMap.keys()),
  })

  let actual
  if (src === 'summary' || src === 'category_formula' || src === '') {
    actual = creditMap.get(cat) ?? 0
  } else if (src === 'setting') {
    console.warn('[graduation] source=setting is not yet resolved — using creditMap value:', cat)
    actual = creditMap.get(cat) ?? 0
  } else {
    console.warn('[graduation] unknown source:', JSON.stringify(src), 'for category:', cat, '— treating as 0')
    actual = 0
  }

  const pass = evaluateCondition(actual, rule.condition, rule.value)
  return { pass, actual, rule }
}

// ── Category formula expander ─────────────────────────────────────────────────

/**
 * Expand derived categories into creditMap for one student.
 *
 * For each row in categoryFormulaRows whose department_id matches:
 *   - Split source_categories on '|'
 *   - Sum values from creditMap for each source category
 *   - Set derived_category in creditMap
 *
 * Mutates creditMap in place (each student gets a fresh Map, so this is safe).
 *
 * @param {Map<string, number>} creditMap
 * @param {object[]}            categoryFormulaRows  raw rows from category_formula sheet
 * @param {string}              departmentId         already-normalised student department
 */
export function applyCategoryFormula(creditMap, categoryFormulaRows, departmentId) {
  for (const row of categoryFormulaRows) {
    const rowDept = normalizeId(row.department_id || '')
    if (rowDept !== departmentId) continue

    const derived_category = normalizeId(row.derived_category || '').toUpperCase()  // 大文字統一
    const op               = (row.operation || 'SUM').trim().toUpperCase()

    // source_categories 全体を先に NFKC 正規化してから split
    // → 全角パイプ「｜」が混入していても確実に分割できる
    // → 各トークンも大文字統一（creditMap キーと合わせる）
    const source_categories = normalizeId(String(row.source_categories ?? ''))
      .split('|')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)

    if (!derived_category || source_categories.length === 0) {
      console.warn('[applyCategoryFormula] skipping invalid row:', {
        department_id:    rowDept,
        derived_category: derived_category || '(empty)',
        source_categories_raw: row.source_categories,
      })
      continue
    }

    // SUM: 各ソースカテゴリの値を1件ずつログに出しながら合計
    let total = 0
    for (const category of source_categories) {
      const value = Number(creditMap.get(category) ?? 0)
      console.log('[FORMULA_SUM_ITEM]', { derived_category, category, value })
      total += value
    }

    creditMap.set(derived_category, total)

    // ── ログ 1: 計算結果まとめ ───────────────────────────────────────────────
    console.log('[FORMULA_RESULT]', { derived_category, source_categories, total })

    // ── ログ 2: creditMap 書き込み確認 ───────────────────────────────────────
    console.log('[CREDIT_MAP_AFTER_SET]', {
      key:   derived_category,
      value: creditMap.get(derived_category),
    })
  }
}

// ── Rule parser ───────────────────────────────────────────────────────────────

/**
 * Normalise a raw GRADUATION_RULE row into a structured rule object.
 * Rows with empty rule_type or category are silently dropped.
 */
function parseRule(raw) {
  const rule_type = normalizeId(raw.rule_type || '').toUpperCase()
  const category  = normalizeId(raw.category  || '').toUpperCase()  // 大文字統一
  if (!rule_type || !category) return null

  const startYearRaw = (raw.start_year || '').trim()
  const endYearRaw   = (raw.end_year   || '').trim()
  const startYear    = startYearRaw ? parseInt(startYearRaw, 10) : null
  const endYear      = endYearRaw   ? parseInt(endYearRaw,   10) : null

  return {
    rule_type,
    target:     normalizeId(raw.target    || ''),  // empty = applies to all
    category,
    condition:  String(raw.condition || '>=').trim(),
    value:      Number.isFinite(Number(raw.value)) ? Number(raw.value) : 0,
    source:     normalizeId(raw.source    || ''),
    label:      String(raw.label || raw.category || '').trim(),
    // Year-range filtering (null = no restriction)
    start_year: Number.isFinite(startYear) ? startYear : null,
    end_year:   Number.isFinite(endYear)   ? endYear   : null,
  }
}

/**
 * Filter rules (or raw row objects) to those that apply to a given curriculum_year.
 *
 * Works with both parsed rule objects AND raw sheet rows.
 * Reads start_year / end_year from the object directly.
 *
 * If a rule has start_year / end_year: include only when
 *   start_year <= curriculum_year <= end_year.
 * If a rule has neither start_year nor end_year: include for all years.
 * If curriculum_year is null: include all rules (no filtering).
 *
 * @param {object[]} rules           rule objects (parsed or raw)
 * @param {number|null} curriculumYear  student's curriculum_year
 * @returns {object[]}
 */
export function filterRulesByYear(rules, curriculumYear) {
  if (curriculumYear == null) return rules
  return rules.filter(r => {
    // Parse to number — works for both parsed rule objects (already number | null)
    // and raw sheet rows (strings like "2025" or "").
    const startYear = r.start_year != null && r.start_year !== ''
      ? Number(r.start_year) : null
    const endYear = r.end_year != null && r.end_year !== ''
      ? Number(r.end_year) : null

    if (startYear == null && endYear == null) return true  // no restriction → include
    if (startYear != null && !Number.isFinite(startYear)) return true  // unparseable → include
    if (endYear   != null && !Number.isFinite(endYear))   return true
    if (startYear != null && curriculumYear < startYear) return false
    if (endYear   != null && curriculumYear > endYear)   return false
    return true
  })
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute graduation results for all students in one O(n) pass.
 *
 * Rules are parsed and partitioned once.
 * Per student:
 *   1. Build creditMap from students_summary row (base category columns)
 *   2. applyCategoryFormula() — add derived categories (S, SA, …) to creditMap
 *   3. GLOBAL rules  → must all pass (regardless of department)
 *   4. CLASS rules   → only rules whose target matches student's department_id
 *   5. SPECIAL rules → evaluated against derived categories in creditMap
 *   6. result = global_status && class_status && special_status
 *
 * Failing rules are serialised into a pipe-delimited 'failing_rules' string
 * so they are readable directly in the Sheets row.
 *
 * @param {object[]} studentRows             rows from students_summary
 * @param {object[]} ruleRows                rows from GRADUATION_RULE
 * @param {object[]} categoryFormulaRows     rows from category_formula sheet (default [])
 * @param {Map<string,number>} [curriculumYearMap]  student_id → curriculum_year (optional)
 * @returns {object[]}                       one result record per student
 */
export function computeGraduationResults(studentRows, ruleRows, categoryFormulaRows = [], curriculumYearMap = new Map()) {
  // ── Parse all rules once (filtering is per-student) ────────────────────────
  const allRules = ruleRows.map(parseRule).filter(Boolean)

  // Pre-partition by type (year filtering happens per student inside the loop)
  const globalRules  = allRules.filter(r => r.rule_type === 'GLOBAL')
  const classRules   = allRules.filter(r => r.rule_type === 'CLASS')
  const specialRules = allRules.filter(r => r.rule_type === 'SPECIAL')

  console.log('[graduation] rules loaded:', {
    total:   allRules.length,
    GLOBAL:  globalRules.length,
    CLASS:   classRules.length,
    SPECIAL: specialRules.length,
  })

  if (allRules.length === 0) {
    console.warn('[graduation] no valid rules found — all students will pass by default')
  }

  console.log('[graduation] studentRows received:', studentRows.length,
    '— first row keys:', studentRows[0] ? Object.keys(studentRows[0]) : '(none)')

  // ── 空行フィルタ（student_id / department_id が空の行を除外） ────────────
  const validStudents = studentRows.filter(row => {
    const studentId    = normalizeId(row.student_id    ?? '')
    const departmentId = normalizeId(row.department_id ?? '')
    if (studentId === '' || departmentId === '') {
      console.warn('[graduation] skipping empty row:', {
        student_id:    row.student_id,
        department_id: row.department_id,
      })
      return false
    }
    return true
  })

  console.log('[graduation] validStudents after filter:', validStudents.length,
    '(skipped:', studentRows.length - validStudents.length, ')')

  // ── One-pass evaluation ────────────────────────────────────────────────────
  const results = []

  for (let idx = 0; idx < validStudents.length; idx++) {
    const student = validStudents[idx]

    const rawStudentId    = student.student_id
    const rawDepartmentId = student.department_id

    const studentId    = normalizeId(String(rawStudentId    ?? ''))
    const departmentId = normalizeId(String(rawDepartmentId ?? ''))

    // Build creditMap: 大文字統一 category → number (base categories from students_summary)
    // normalizeId は大文字小文字を変換しないため、.toUpperCase() で統一する。
    // Undefined / missing categories default to 0 at lookup time via Map.get ?? 0
    const creditMap = new Map()
    for (const [rawKey, rawVal] of Object.entries(student)) {
      const keyNorm = normalizeId(rawKey)
      if (!keyNorm || keyNorm === 'student_id' || keyNorm === 'department_id') continue
      const num = Number(rawVal)
      creditMap.set(keyNorm.toUpperCase(), Number.isFinite(num) ? num : 0)  // 大文字統一
    }
    console.log(`[graduation] row ${idx + 2} base creditMap:`, Object.fromEntries(creditMap))

    // Resolve this student's curriculum_year for year-range rule filtering
    const curriculumYear = curriculumYearMap.get(studentId) ?? null

    // Apply year-range filtering (start_year / end_year) per student
    const studentGlobalRules  = filterRulesByYear(globalRules,  curriculumYear)
    const studentAllClassRules = filterRulesByYear(classRules,  curriculumYear)
    const studentAllSpecialRules = filterRulesByYear(specialRules, curriculumYear)

    // Expand derived categories (e.g. S = S_MAN + S_HIENG) into creditMap
    // Must run BEFORE rule evaluation so SPECIAL rules can reference derived keys
    applyCategoryFormula(creditMap, categoryFormulaRows, departmentId)

    // applyCategoryFormula 直後のスナップショット（S / SA が追加されたか確認）
    console.log('[FORMULA_APPLIED]', {
      student_id:    studentId,
      department_id: departmentId,
      curriculumYear,
      allKeysAfterFormula: [...creditMap.keys()],
    })

    // CLASS rules: empty target = applies to all departments
    const studentClassRules = studentAllClassRules.filter(
      r => !r.target || r.target === departmentId
    )

    // SPECIAL rules: must strictly match department_id (no wildcard)
    const studentSpecialRules = studentAllSpecialRules.filter(
      r => normalizeId(r.target) === departmentId
    )

    // ── ログ 3: ルール評価直前の creditMap 全体 ──────────────────────────────
    console.log('[BEFORE_RULE_EVAL]', {
      student_id:    studentId,
      department_id: departmentId,
      allCredits:    [...creditMap.entries()],
    })

    // Evaluate each group
    const globalEvals  = studentGlobalRules.map(r => ({ ...evalRule(r, creditMap), ruleType: 'GLOBAL' }))
    const classEvals   = studentClassRules.map(r => ({ ...evalRule(r, creditMap), ruleType: 'CLASS' }))

    // ── ログ 4: SPECIAL ルール評価（1件ずつ・department フィルタ済み） ────────
    const specialEvals = studentSpecialRules.map(r => {
      const evaluated = evalRule(r, creditMap)
      const normalizedCat = normalizeId(r.category || '')
      console.log('[SPECIAL_RULE_CHECK]', {
        rule_category_raw:        r.category,
        rule_category_normalized: normalizedCat,
        credit_map_keys_raw:      Array.from(creditMap.keys()),
        credit_map_keys_normalized: Array.from(creditMap.keys()).map(k => normalizeId(k)),
        actual:                   evaluated.actual,
        actual_type:              typeof evaluated.actual,
        required:                 r.value,
        required_type:            typeof r.value,
        condition:                r.condition,
        condition_repr:           JSON.stringify(r.condition),
        pass:                     evaluated.pass,
        has_exact_key:            creditMap.has(r.category),
        has_normalized_key:       creditMap.has(normalizedCat),
      })
      return { ...evaluated, ruleType: 'SPECIAL' }
    })

    // GLOBAL: 0件なら true（全学共通ルールが未設定の場合はパス扱い）
    // CLASS / SPECIAL: 0件なら false（対象ルールが存在しない = 設定不備として不合格）
    const global_status  = globalEvals.length === 0
      ? true
      : globalEvals.every(e => e.pass === true)

    const hasClassRules   = classEvals.length   > 0
    const hasSpecialRules = specialEvals.length > 0

    const class_status   = hasClassRules   && classEvals.every(e => e.pass === true)
    const special_status = hasSpecialRules && specialEvals.every(e => e.pass === true)

    const result = global_status === true && class_status === true && special_status === true

    // Collect failing rules for logging and the output column
    const allEvals = [...globalEvals, ...classEvals, ...specialEvals]
    const failing  = allEvals.filter(e => !e.pass)

    if (failing.length > 0) {
      console.log('[graduation] FAIL', studentId, {
        departmentId,
        failingRules: failing.map(e =>
          `${e.ruleType}:${e.rule.category} ${e.rule.condition}${e.rule.value} (actual=${e.actual})`
        ),
        global_status,
        class_status,
        special_status,
      })
    } else {
      console.log('[graduation] PASS', studentId, { departmentId, global_status, class_status, special_status })
    }

    // Serialise failing descriptors: "GLOBAL:CA_MAN>=20(actual=18)|CLASS:SP_LAN>=4(actual=0)"
    const failing_rules = failing
      .map(e => `${e.ruleType}:${e.rule.category}${e.rule.condition}${e.rule.value}(actual=${e.actual})`)
      .join('|')

    results.push({
      student_id:    studentId,
      department_id: departmentId,
      global_status,
      class_status,
      special_status,
      result,
      failing_rules,
    })
  }

  console.log('[graduation] evaluation complete:', {
    total:   results.length,
    passed:  results.filter(r => r.result === true).length,
    failed:  results.filter(r => r.result !== true).length,
  })

  return results
}
