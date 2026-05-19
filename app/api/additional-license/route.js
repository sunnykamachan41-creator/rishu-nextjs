import { NextResponse } from 'next/server'
import { normalizeId } from '@/lib/transform'
import {
  fetchLicenseDisplayAll,
  fetchAdditionalLicenseUIAll,
  fetchAdditionalLicenseRulesAll,
  fetchAdditionalLicenseAvailabilityAll,
  fetchAdditionalLicenseResults,
  fetchProgressAutoForStudent,
  fetchStudentsSummaryAll,
  fetchAllSheets,
  upsertSimpleLicenseResult,
  removeLicenseResult,
} from '@/lib/sheets'
import { evaluateCondition } from '@/lib/graduation'

export const dynamic = 'force-dynamic'

// ── Normalization ─────────────────────────────────────────────────────────────
//
// normKey: trim → NFKC → toUpperCase
//   ⑩ 全比較をこの1関数に統一。
//   "A_ENG" / "a_eng" / "Ａ＿ＥＮＧ" / "  A_ENG  " がすべて一致する。
//
function normKey(v) {
  return String(v || '').trim().normalize('NFKC').toUpperCase()
}

// additional_license_rule の license 列は実際のシートに応じて複数パターンがある。
// 診断済み: 実際のヘッダーは "license_rule"
// 他パターンも念のため残す。
const getRuleLid = r =>
  normKey(r.license_rule || r.license_id || r.LICENSE_TYPE || r.license_type || '')

// condition 列の値を >=/<=/= に正規化する。
// 診断済み: 実際のシートは "SUM" が使われており、evaluateCondition が対応していない。
// SUM は「合計が required_credits 以上」= ">=" として扱う。
function normalizeCondition(cond) {
  const c = String(cond || '').trim().toUpperCase()
  if (c === 'SUM' || c === '') return '>='
  return cond  // そのまま evaluateCondition に渡す
}

const STATUS_ORDER = {
  COMPLETED: 0, IN_PROGRESS: 1, PLANNED: 2, FAILED: 3, AUDIT: 4, RE_ENROLL: 5,
}

// ── GET /api/additional-license?student_id=xxx ────────────────────────────────
//
// 設計方針（v2 シンプル版）:
//   ① 単位判定は students_summary 直参照（completedMap 廃止）
//   ② コース一覧は progress_auto を参照（表示専用・判定に使わない）
//   ③ availability は全件表示・blocked は isBlocked フラグで UI 側で disabled 表示
//   ④ status: 'TRUE' / 'FALSE' のみ（独自ステータス禁止）

export async function GET(request) {
  try {
    // ── 認証 ──────────────────────────────────────────────────────────────
    const { getServerSession } = await import('next-auth')
    const { authOptions }      = await import('@/lib/auth')
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

    const { searchParams } = new URL(request.url)
    const includeProjected = searchParams.get('include_projected') === '1'
    console.log('[additional-license GET] student_id:', studentId, '| includeProjected:', includeProjected)

    // ── 全シートを並列 fetch ──────────────────────────────────────────────
    const [
      displayRows,       // license_display
      uiRows,            // additional_license_ui
      ruleRows,          // additional_license_rule
      availabilityRows,  // additional_license_availability
      resultRows,        // additional_license_result (この student の選択済み行)
      studentSummaryRows,// students_summary (全学生)
      progressRows,      // progress_auto (コース一覧表示用)
      sheetsData,        // users シートから department_id を取得
    ] = await Promise.all([
      fetchLicenseDisplayAll(),
      fetchAdditionalLicenseUIAll(),
      fetchAdditionalLicenseRulesAll(),
      fetchAdditionalLicenseAvailabilityAll(),
      fetchAdditionalLicenseResults(studentId),
      fetchStudentsSummaryAll(),
      fetchProgressAutoForStudent(studentId),
      fetchAllSheets(studentId),
    ])

    const departmentId = normKey(sheetsData.userDepartment || '')

    // ══════════════════════════════════════════════════════════════════════
    // ⑦⑧⑨⑪ シート診断ログ — ヘッダー名・行数・全データを出力
    // ══════════════════════════════════════════════════════════════════════

    // ⑧ 行数確認
    console.log('【SHEET ROW COUNTS】', {
      uiRows:            uiRows.length,
      ruleRows:          ruleRows.length,
      availabilityRows:  availabilityRows.length,
      displayRows:       displayRows.length,
      resultRows:        resultRows.length,
      studentSummaryRows: studentSummaryRows.length,
      progressRows:      progressRows.length,
    })

    // ⑦ 実際のヘッダー名 (Object.keys) — カラム名の不一致を発見するための最重要ログ
    console.log('【HEADERS: additional_license_ui】',
      uiRows.length > 0 ? Object.keys(uiRows[0]) : '(empty — 0 rows)')
    console.log('【HEADERS: additional_license_rule】',
      ruleRows.length > 0 ? Object.keys(ruleRows[0]) : '(empty — 0 rows)')
    console.log('【HEADERS: additional_license_availability】',
      availabilityRows.length > 0 ? Object.keys(availabilityRows[0]) : '(empty — 0 rows)')
    console.log('【HEADERS: license_display】',
      displayRows.length > 0 ? Object.keys(displayRows[0]) : '(empty — 0 rows)')
    console.log('【HEADERS: additional_license_result】',
      resultRows.length > 0 ? Object.keys(resultRows[0]) : '(empty — 0 rows)')

    // ⑨ additional_license_ui 全件をそのまま出力
    console.log('【FULL: additional_license_ui】', JSON.stringify(uiRows, null, 2))

    // ⑪ additional_license_rule 全件をそのまま出力
    console.log('【FULL: additional_license_rule】', JSON.stringify(ruleRows, null, 2))

    // additional_license_availability 全件
    console.log('【FULL: additional_license_availability】',
      JSON.stringify(availabilityRows, null, 2))

    // ══════════════════════════════════════════════════════════════════════

    // ── ① Availability ────────────────────────────────────────────────────
    //
    // blocked = このdepartment で選択不可の license
    // ただし UI には全件表示し、blocked は disabled として扱う（除外しない）
    //
    console.log('[availability] studentDeptRaw:', sheetsData.userDepartment)
    console.log('[availability] studentDeptNormalized:', departmentId)
    console.log('[availability] sheet rows:', availabilityRows.length)
    if (availabilityRows.length > 0) {
      console.log('[availability] column names:', Object.keys(availabilityRows[0]))
      console.log('[availability] rows detail:', availabilityRows.map(r => ({
        deptRaw:           r.department_id,
        deptNorm:          normKey(r.department_id    || ''),
        blockedRaw:        r.blocked_license_id,
        blockedNorm:       normKey(r.blocked_license_id || ''),
        matchesDept:       normKey(r.department_id || '') === departmentId,
      })))
    }

    // 診断済み: blocked_license_id は "HI_PHE|HI_HEA" のようにパイプ区切りで複数入る場合がある
    const blockedSet = new Set(
      availabilityRows
        .filter(r => normKey(r.department_id || '') === departmentId)
        .flatMap(r =>
          String(r.blocked_license_id || '').split('|').map(s => normKey(s.trim()))
        )
        .filter(Boolean)
    )
    console.log('[availability] blocked for dept:', [...blockedSet])

    // ── ② Active set (選択済み license) ──────────────────────────────────
    const activeSet = new Set(
      resultRows.map(r => normKey(r.license_id || ''))
    )
    console.log('[additional-license GET] active:', [...activeSet])

    // ── ③ creditMap を構築 ────────────────────────────────────────────────
    //
    // 通常: students_summary 直参照
    // includeProjected: progress_auto の COMPLETED + IN_PROGRESS + PLANNED を集計
    //
    const creditMap = new Map()   // normKey(category) → number (単位数)

    if (includeProjected) {
      // 履修予定を含む: progress_auto を集計して creditMap を構築
      for (const row of progressRows) {
        const status = String(row.status ?? '').trim().toUpperCase()
        if (!['COMPLETED', 'IN_PROGRESS', 'PLANNED'].includes(status)) continue
        const cat = normKey(row.final_category ?? '')
        if (!cat) continue
        creditMap.set(cat, (creditMap.get(cat) || 0) + (Number(row.credits) || 0))
      }
      console.log('[additional-license GET] creditMap (projected) entries:',
        [...creditMap.entries()].map(([k, v]) => `${k}=${v}`))
    } else {
      const summaryRow = studentSummaryRows.find(r => r.student_id === studentId)
      if (summaryRow) {
        for (const [rawKey, rawVal] of Object.entries(summaryRow)) {
          const keyNorm = normKey(rawKey)
          if (!keyNorm || keyNorm === 'STUDENT_ID' || keyNorm === 'DEPARTMENT_ID') continue
          creditMap.set(keyNorm, Number(rawVal) || 0)
        }
        console.log('[additional-license GET] creditMap entries:',
          [...creditMap.entries()].map(([k, v]) => `${k}=${v}`))
      } else {
        console.warn('[additional-license GET] ⚠ student not found in students_summary:', studentId)
      }
    }

    // ── ④ progress_auto からコース一覧を構築（表示専用） ──────────────────
    //
    // 判定には使わない。各 category に属する COMPLETED 科目一覧をUIに表示するためだけ。
    //
    const coursesByCategory = new Map()  // normKey(category) → CourseEntry[]
    console.log('[additional-license GET] progressRows for student:', progressRows.length)

    for (const row of progressRows) {
      const cat    = normKey(row.final_category ?? '')
      const status = String(row.status ?? '').trim().toUpperCase()
      const creds  = Number(row.credits) || 0
      if (!cat) continue
      if (!coursesByCategory.has(cat)) coursesByCategory.set(cat, [])
      coursesByCategory.get(cat).push({
        class_id:    String(row.class_id    ?? '').trim(),
        course_id:   String(row.course_id   ?? '').trim(),
        course_name: String(row.course_name ?? '').trim(),
        credits:     creds,
        status,
      })
    }
    for (const [, courses] of coursesByCategory) {
      courses.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
    }

    // ── ⑤ rulesByLicense を構築 ──────────────────────────────────────────
    //
    // ヘッダー: LICENSE_TYPE | category | required_credits | condition | note
    // または:   license_id  | category | required_credits | condition | note
    // getRuleLid() がどちらにも対応する
    //
    const rulesByLicense = new Map()  // normKey(lid) → Map<normKey(cat), rule>
    for (const r of ruleRows) {
      const lid = getRuleLid(r)
      const cat = normKey(r.category || '')
      if (!lid || !cat) continue
      if (!rulesByLicense.has(lid)) rulesByLicense.set(lid, new Map())
      rulesByLicense.get(lid).set(cat, {
        required_credits: Number(r.required_credits) || 0,
        condition:        normalizeCondition(r.condition),  // "SUM" → ">=" に正規化
      })
    }
    console.log('[additional-license GET] rulesByLicense keys:', [...rulesByLicense.keys()])

    // ── ⑥ ラベルマップ ────────────────────────────────────────────────────
    const labelMap = new Map(
      displayRows.map(r => [normKey(r.license_id || ''), String(r.label || '').trim()])
    )

    // ── ⑦ allLicenses: ピッカー用・全件表示（blocked は isBlocked フラグ） ──
    const allLicenses = displayRows
      .filter(r => r.license_id)
      .map(r => ({
        license_id: normKey(r.license_id),
        label:      String(r.label || '').trim(),
        isBlocked:  blockedSet.has(normKey(r.license_id)),
        isSelected: activeSet.has(normKey(r.license_id)),
      }))

    // ── ⑧ activeLicenses: 選択済み免許ごとに UI を構築 ────────────────────
    const activeLicenses = [...activeSet].map(licenseId => {
      const lid       = normKey(licenseId)
      // 診断済み: additional_license_ui の実際のヘッダーは "LICENSE_ID"（全大文字）
      const licUiRows = uiRows.filter(r =>
        normKey(r.license_id || r.LICENSE_ID || '') === lid
      )
      const licRules  = rulesByLicense.get(lid) ?? new Map()

      console.log(`[additional-license] license: ${lid}`)
      console.log(`[additional-license]   uiRows: ${licUiRows.length} | rules: ${licRules.size}`)

      // ── No UI rows → fallback: generate items from rules ─────────────────
      if (licUiRows.length === 0) {
        const fallbackItems = []
        let order = 0
        for (const [cat, rule] of licRules) {
          const summaryCredits = creditMap.get(cat) ?? 0
          const pass = evaluateCondition(summaryCredits, rule.condition, rule.required_credits)
          console.log(`[additional-license]   [fallback] category: ${cat} | summaryCredits: ${summaryCredits} | requiredCredits: ${rule.required_credits} | passed: ${pass}`)
          fallbackItems.push({
            category:         cat,
            display_name:     cat,       // UI シートが未設定なので category 名を代用
            ui_group:         '',
            display_order:    order++,
            required:         true,
            required_credits: rule.required_credits,
            condition:        rule.condition,
            current_credits:  summaryCredits,
            pass,
            courses:          (coursesByCategory.get(cat) ?? []).slice(),
          })
        }
        const reqItems  = fallbackItems.filter(i => i.required)
        const passedF   = reqItems.filter(i => i.pass === true)
        return {
          license_id:    lid,
          label:         labelMap.get(lid) ?? lid,
          groups:        [],
          items:         fallbackItems,
          totalRequired: reqItems.length,
          totalPassed:   passedF.length,
          overallPass:   reqItems.length > 0 && passedF.length === reqItems.length,
          _fallback:     true,
        }
      }

      // ── Normal path: additional_license_ui から items を構築 ─────────────
      const groupOrder    = []
      const groupOrderSet = new Set()
      const items         = []

      for (const row of licUiRows) {
        const category     = normKey(row.category    || '')
        const uiGroup      = String(row.ui_group     || '').trim()
        const displayName  = String(row.display_name || category || '').trim()
        const displayOrder = Number(row.display_order) || 0

        if (uiGroup && !groupOrderSet.has(uiGroup)) {
          groupOrder.push(uiGroup)
          groupOrderSet.add(uiGroup)
        }

        // ルール照合: required かどうか
        const rule             = category ? licRules.get(category) : null
        const required         = !!rule
        const required_credits = required ? rule.required_credits : null
        const condition        = required ? rule.condition        : null

        // 単位: students_summary の category 列を直接読む
        const summaryCredits = creditMap.get(category) ?? 0

        const pass = required
          ? evaluateCondition(summaryCredits, condition, required_credits)
          : null

        // コース一覧: progress_auto から（表示専用）
        const courses = (coursesByCategory.get(category) ?? []).slice()

        console.log(`[additional-license]   category: ${category} | summaryCredits: ${summaryCredits} | requiredCredits: ${required_credits ?? 'n/a'} | passed: ${pass}`)

        items.push({
          category,
          display_name:     displayName,
          ui_group:         uiGroup,
          display_order:    displayOrder,
          required,
          required_credits,
          condition,
          current_credits:  summaryCredits,
          pass,
          courses,
        })
      }

      // Sort: group 出現順 → display_order
      items.sort((a, b) => {
        const gi = groupOrder.indexOf(a.ui_group) - groupOrder.indexOf(b.ui_group)
        return gi !== 0 ? gi : a.display_order - b.display_order
      })

      // ソート後に groups を再構築（first-occurrence）
      const finalGroups    = []
      const finalGroupsSet = new Set()
      for (const item of items) {
        if (item.ui_group && !finalGroupsSet.has(item.ui_group)) {
          finalGroups.push(item.ui_group)
          finalGroupsSet.add(item.ui_group)
        }
      }

      const requiredItems = items.filter(i => i.required)
      const passedItems   = requiredItems.filter(i => i.pass === true)

      return {
        license_id:    lid,
        label:         labelMap.get(lid) ?? lid,
        groups:        finalGroups,
        items,
        totalRequired: requiredItems.length,
        totalPassed:   passedItems.length,
        overallPass:   requiredItems.length > 0 && passedItems.length === requiredItems.length,
      }
    })

    return NextResponse.json({
      ok:             true,
      student_id:     studentId,
      department_id:  departmentId,
      allLicenses,    // ピッカー用: 全件 (isBlocked / isSelected フラグ付き)
      activeLicenses, // カード表示用: 選択済み × 全 UI データ
    })
  } catch (err) {
    console.error('[GET /api/additional-license]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST /api/additional-license ──────────────────────────────────────────────
//
// action=add    → additional_license_result に1行書き込む
//                 status は students_summary から計算: TRUE / FALSE のみ
// action=remove → 行を物理削除

export async function POST(request) {
  try {
    // ── 認証 ──────────────────────────────────────────────────────────────
    const { getServerSession } = await import('next-auth')
    const { authOptions }      = await import('@/lib/auth')
    const session = await getServerSession(authOptions)
    if (!session?.user?.student_id) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    }
    const studentId = session.user.student_id

    const body = await request.json()
    const { license_id, action } = body
    console.log('[additional-license POST] student_id:', studentId,
                '| license_id:', license_id, '| action:', action)

    if (!license_id) {
      return NextResponse.json({ error: 'license_id is required' }, { status: 400 })
    }
    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json(
        { error: 'action must be "add" or "remove"' },
        { status: 400 }
      )
    }

    if (action === 'remove') {
      await removeLicenseResult(studentId, normalizeId(license_id))
      console.log('[additional-license POST] removed:', { studentId, license_id })
      return NextResponse.json({
        ok: true, action: 'remove', license_id, student_id: studentId,
      })
    }

    // ── action === 'add' ──────────────────────────────────────────────────
    // 1. students_summary から creditMap を構築
    // 2. additional_license_rule でルール評価
    // 3. TRUE / FALSE を書き込む

    const [sheetsData, studentSummaryRows, ruleRows] = await Promise.all([
      fetchAllSheets(studentId),
      fetchStudentsSummaryAll(),
      fetchAdditionalLicenseRulesAll(),
    ])

    const departmentId = normKey(sheetsData.userDepartment || '')
    console.log('[additional-license POST] student_id:', studentId,
                '| department_id:', departmentId)

    // creditMap from students_summary
    const creditMap = new Map()
    const summaryRow = studentSummaryRows.find(r => r.student_id === studentId)
    if (summaryRow) {
      for (const [rawKey, rawVal] of Object.entries(summaryRow)) {
        const keyNorm = normKey(rawKey)
        if (!keyNorm || keyNorm === 'STUDENT_ID' || keyNorm === 'DEPARTMENT_ID') continue
        creditMap.set(keyNorm, Number(rawVal) || 0)
      }
    } else {
      console.warn('[additional-license POST] ⚠ student not found in students_summary:', studentId)
    }

    const lid      = normKey(license_id)
    const licRules = ruleRows.filter(r => getRuleLid(r) === lid)
    console.log('[additional-license POST] rules for license:', licRules.length)

    let allPass        = licRules.length > 0
    let totalEarned    = 0
    let totalRequired  = 0
    for (const r of licRules) {
      const cat      = normKey(r.category || '')
      const required = Number(r.required_credits) || 0
      const cond     = normalizeCondition(r.condition)   // "SUM" → ">=" に正規化
      const earned   = creditMap.get(cat) ?? 0
      const pass     = evaluateCondition(earned, cond, required)
      console.log(`[additional-license POST]   category: ${cat} | summaryCredits: ${earned} | requiredCredits: ${required} | passed: ${pass}`)
      if (!pass) allPass = false
      totalEarned   += earned
      totalRequired += required
    }

    // graduation_result 準拠: TRUE / FALSE のみ
    const status = (licRules.length > 0 && allPass) ? 'TRUE' : 'FALSE'

    await upsertSimpleLicenseResult(
      studentId,
      departmentId,
      normalizeId(license_id),
      status,
      totalEarned,
      totalRequired,
    )

    return NextResponse.json({
      ok:            true,
      action:        'add',
      license_id,
      student_id:    studentId,
      department_id: departmentId,
      status,
    })
  } catch (err) {
    console.error('[POST /api/additional-license]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
