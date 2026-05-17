/**
 * departments.js
 * ──────────────
 * Utility functions for the departments master.
 *
 * Master data lives in the `departments` Google Sheet:
 *   department_id  |  label
 *   ───────────────┼─────────────
 *   HIENG          |  英語教育専攻
 *   KIND           |  幼児教育専攻
 *   LIB            |  司書教諭専攻
 *
 * The sheet is fetched via fetchAllSheets() → /api/data → data.departments.
 * All UI label lookups must go through the departmentsMap built from that data.
 * Never hardcode department labels in application code.
 */

/**
 * Build an O(1) id → label lookup map from the departments array returned by /api/data.
 *
 * @param {Array<{department_id: string, label: string}>} departments
 * @returns {Record<string, string>}
 */
export function buildDepartmentsMap(departments) {
  return Object.fromEntries(
    (departments ?? []).map(d => [d.department_id, d.label])
  )
}

/**
 * Resolve a display label for a department_id.
 * Falls back to the raw id if the map has no entry (e.g. during initial load).
 *
 * @param {string} departmentId
 * @param {Record<string, string>} departmentsMap
 * @returns {string}
 */
export function getDepartmentLabel(departmentId, departmentsMap) {
  if (!departmentId) return ''
  return departmentsMap?.[departmentId] ?? departmentId
}
