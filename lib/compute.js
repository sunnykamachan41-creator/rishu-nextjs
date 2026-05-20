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
