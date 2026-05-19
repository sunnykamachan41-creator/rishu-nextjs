/**
 * Pure functions for conflict detection and requirement evaluation.
 * Runs server-side in API routes so the client receives pre-computed results.
 *
 * Supports both legacy (class_id) and new (course_id) course schemas.
 * Uses termsAreCompatible from termCode.ts for term compatibility checks,
 * which handles both TermCode strings and legacy Japanese term strings.
 */

import { termsAreCompatible } from './termCode'

// ── Utilities ─────────────────────────────────────────────────────────────────

// ── Conflict detection ────────────────────────────────────────────────────────

/**
 * Detect time-slot conflicts among selected courses.
 *
 * @param {object[]} courses      - normalised course objects
 * @param {Set}      selectedIds  - Set of class_id values (class_id-centric)
 * @returns {Set}                  Set of conflicting class_ids
 */
export function detectConflicts(courses, selectedIds) {
  // slotMap: normalized slot string → [{ key, term }, ...]
  const slotMap = {}

  for (const c of courses) {
    // composite key: class_id|academic_year
    if (!selectedIds.has(`${c.class_id}|${c.academic_year ?? ''}`)) continue

    const t = c.normalized_time
    if (!t || t === 'EXTRA' || t === '0' || t === 0) continue

    for (const slot of String(t).split('|')) {
      const s = slot.trim()
      if (!s) continue
      if (!slotMap[s]) slotMap[s] = []
      slotMap[s].push({ key: `${c.class_id}|${c.academic_year ?? ''}`, term: c.term || '' })
    }
  }

  const conflicting = new Set()

  for (const entries of Object.values(slotMap)) {
    if (entries.length < 2) continue
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j]
        if (!termsAreCompatible(a.term, b.term)) {
          conflicting.add(a.key)
          conflicting.add(b.key)
        }
      }
    }
  }

  return conflicting
}

// ── Requirement computation ───────────────────────────────────────────────────

/**
 * Compute earned units and fulfillment status for each requirement.
 *
 * @param {object[]} courses      - normalised course objects
 * @param {Set}      selectedIds  - Set of class_id values (class_id-centric)
 * @param {object[]} requirements - raw requirement rows from Google Sheets
 */
export function computeRequirements(courses, selectedIds, requirements) {
  // 履修科目の tag 別単位合計を計算
  // selectedIds は class_id のみ。同一 course_id の複数セクションは
  // normalizeEnrollment の dedup により通常は発生しないが、
  // 万が一のため course_id 単位で dedup する
  const seenCourseIds = new Set()
  const tagUnits = {}

  for (const c of courses) {
    if (!selectedIds.has(`${c.class_id}|${c.academic_year ?? ''}`)) continue

    // course_id 単位で重複排除（複数セクション履修防止）
    const cid = c.course_id || c.class_id
    if (seenCourseIds.has(cid)) continue
    seenCourseIds.add(cid)
    if (!c.tags) continue

    for (const tag of String(c.tags).split('|')) {
      const t = tag.trim()
      if (t) tagUnits[t] = (tagUnits[t] || 0) + (Number(c.credits) || 0)
    }
  }

  return requirements.map(req => {
    const groups = req.source_groups
      ? String(req.source_groups).split(';').map(s => s.trim()).filter(Boolean)
      : []
    const earned = groups.reduce((sum, g) => sum + (tagUnits[g] || 0), 0)

    let status, shortage
    switch (req.condition_type) {
      case 'FIXED':
      case 'NON_COUNT':
        // FIXED requirements are fulfilled based on earned_units vs fixed_units.
        // The server returns 'info' here; client-side getDisplayStatus() derives
        // the real ok/short state from earned_units vs fixed_units.
        status = 'info'; shortage = 0; break
      case 'OPTIONAL':
        status = 'optional'; shortage = 0; break
      case 'MIN':
      case 'SUM':
      case 'SELECT_ONE': {
        const need = Number(req.min_units) || 0
        shortage = Math.max(0, need - earned)
        status   = shortage === 0 ? 'ok' : 'short'
        break
      }
      default:
        status = 'info'; shortage = 0
    }

    return { ...req, earned_units: earned, status, shortage }
  })
}

// ── Students summary ──────────────────────────────────────────────────────────

/**
 * Compute the full students_summary record for a single student.
 *
 * Pure function — no side effects, no Sheets access.
 *
 * Output keys:
 *   PASS_GLOBAL   — '1' | '0'  : all mandatory requirements met
 *   WANT_LICENSE  — string      : preserved from existing row (user preference)
 *   LACK_LICENSE  — '1' | '0'  : WANT_LICENSE is set but not yet passed
 *   CREDIT_<tag>  — string      : credits earned per tag (from COMPLETED courses)
 *   PASS_<degree> — '1' | '0'  : all mandatory requirements for that degree met
 *
 * PASS_GLOBAL logic:
 *   COMMON + ELE must pass. If WANT_LICENSE is set, that degree must also pass.
 *
 * @param {object[]}    courses      - normalizeCourse'd course catalog
 * @param {Set<string>} completedIds - class_ids with COMPLETED status only
 * @param {object[]}    requirements - raw requirement rows from Sheets
 * @param {string}      wantLicense  - preserved from existing summary row ('HIENG'|'KIND'|'LIB'|'')
 * @returns {Record<string, string>} flat string record, ready to write as a Sheets row
 */
export function computeStudentsSummary(courses, completedIds, requirements, wantLicense = '') {
  // ── Step 1: tag → credits from COMPLETED courses (course_id dedup) ───────────
  const seenCourseIds = new Set()
  const tagUnits      = {}

  for (const c of courses) {
    if (!completedIds.has(`${c.class_id}|${c.academic_year ?? ''}`)) continue
    const cid = c.course_id || c.class_id
    if (seenCourseIds.has(cid)) continue
    seenCourseIds.add(cid)
    if (!c.tags) continue
    for (const raw of String(c.tags).split('|')) {
      const tag = raw.trim()
      if (tag) tagUnits[tag] = (tagUnits[tag] || 0) + (Number(c.credits) || 0)
    }
  }

  // ── Step 2: CREDIT_* fields (sorted by tag name) ──────────────────────────────
  const creditFields = Object.fromEntries(
    Object.entries(tagUnits)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tag, units]) => [`CREDIT_${tag}`, String(units)])
  )

  // ── Step 3: evaluate requirements → PASS_* per degree ────────────────────────
  const computedReqs = computeRequirements(courses, completedIds, requirements)

  const degrees = [...new Set(computedReqs.map(r => r.degree).filter(Boolean))].sort()
  const passFields = {}

  for (const degree of degrees) {
    // Filter to mandatory (non-OPTIONAL) requirements for this degree
    const degReqs = computedReqs.filter(
      r => r.degree === degree && r.condition_type !== 'OPTIONAL'
    )
    // Vacuous truth: a degree with no mandatory requirements is auto-passed
    const passed = degReqs.every(r => {
      if (r.condition_type === 'FIXED' || r.condition_type === 'NON_COUNT') {
        // FIXED uses fixed_units, not min_units; status is always 'info' for these
        return Number(r.earned_units) >= Number(r.fixed_units || 0)
      }
      return r.status === 'ok'
    })
    passFields[`PASS_${degree}`] = passed ? '1' : '0'
  }

  // ── Step 4: PASS_GLOBAL ───────────────────────────────────────────────────────
  // Always require COMMON + ELE. If WANT_LICENSE is set, also require that degree.
  const requiredDegrees = ['COMMON', 'ELE', ...(wantLicense ? [wantLicense] : [])]
  const passGlobal = requiredDegrees.every(d => passFields[`PASS_${d}`] === '1')

  // ── Step 5: LACK_LICENSE ─────────────────────────────────────────────────────
  const lackLicense = Boolean(wantLicense) && passFields[`PASS_${wantLicense}`] !== '1'

  // ── Assemble ordered output ──────────────────────────────────────────────────
  // Order: PASS_GLOBAL, WANT_LICENSE, LACK_LICENSE → CREDIT_* → PASS_* (sorted)
  const sortedPassFields = Object.fromEntries(
    Object.entries(passFields).sort(([a], [b]) => a.localeCompare(b))
  )

  return {
    PASS_GLOBAL:  passGlobal  ? '1' : '0',
    WANT_LICENSE: wantLicense || '',
    LACK_LICENSE: lackLicense ? '1' : '0',
    ...creditFields,
    ...sortedPassFields,
  }
}

// ── Credit summary ────────────────────────────────────────────────────────────

export function computeSummary(courses, selectedIds, conflicts) {
  let total = 0, safe = 0
  const seenCourseIds = new Set()

  for (const c of courses) {
    if (!selectedIds.has(`${c.class_id}|${c.academic_year ?? ''}`)) continue

    // course_id 単位で重複排除
    const cid = c.course_id || c.class_id
    if (seenCourseIds.has(cid)) continue
    seenCourseIds.add(cid)

    const cr = Number(c.credits) || 0
    total += cr
    if (!conflicts.has(`${c.class_id}|${c.academic_year ?? ''}`)) safe += cr
  }

  return { totalCredits: total, safeCredits: safe }
}
