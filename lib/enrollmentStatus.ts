/**
 * enrollmentStatus.ts
 * -------------------
 * Enrollment status config and state-transition helpers.
 *
 * Status taxonomy:
 *   DIRECT statuses  — selectable directly from the CourseModal picker
 *   MODAL_ONLY       — settable only through ReEnrollModal (AUDIT / RE_ENROLL)
 *
 * State-transition rules:
 *   RE_ENROLL requires at least one prior FAILED entry for the same course_id.
 *   AUDIT / RE_ENROLL are never shown as picker buttons; they appear only in
 *   the ReEnrollModal that opens when a course already has COMPLETED/FAILED history.
 */

import type { EnrollmentStatus } from './termCode'

// ── Status metadata ───────────────────────────────────────────────────────────

export interface StatusConfig {
  label:   string   // Japanese display label
  badge:   string   // Tailwind classes for read-only badge chip
  button:  string   // Tailwind classes for the active (selected) picker button
  outline: string   // Tailwind classes for the inactive picker button
  emoji:   string
}

export const STATUS_CONFIG: Record<EnrollmentStatus, StatusConfig> = {
  PLANNED:     { label: '履修予定',    emoji: '', badge: 'bg-gray-100 text-gray-600',    button: 'bg-gray-500 text-white',    outline: 'border-gray-200 text-gray-500 bg-gray-50'     },
  IN_PROGRESS: { label: '履修中',      emoji: '', badge: 'bg-blue-100 text-blue-700',    button: 'bg-blue-500 text-white',    outline: 'border-blue-300 text-blue-600 bg-blue-50'     },
  COMPLETED:   { label: '取得済み',    emoji: '', badge: 'bg-green-100 text-green-700',  button: 'bg-green-500 text-white',   outline: 'border-green-300 text-green-600 bg-green-50'  },
  FAILED:      { label: '落単（笑）',  emoji: '', badge: 'bg-red-100 text-red-600',      button: 'bg-red-500 text-white',     outline: 'border-red-300 text-red-500 bg-red-50'        },
  AUDIT:       { label: '聴講',        emoji: '', badge: 'bg-amber-100 text-amber-700',  button: 'bg-amber-500 text-white',   outline: 'border-amber-300 text-amber-600 bg-amber-50'  },
  RE_ENROLL:   { label: '再履修（笑）', emoji: '', badge: 'bg-purple-100 text-purple-700', button: 'bg-purple-500 text-white', outline: 'border-purple-300 text-purple-600 bg-purple-50' },
}

// ── Status groups ─────────────────────────────────────────────────────────────

/** Statuses directly selectable from the CourseModal picker. */
export const DIRECT_STATUSES: EnrollmentStatus[] = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED']

/** Statuses that can only be set through ReEnrollModal. */
export const MODAL_ONLY_STATUSES: EnrollmentStatus[] = ['AUDIT', 'RE_ENROLL']

// ── State-transition guards ───────────────────────────────────────────────────

/**
 * Returns true when adding this course should trigger the ReEnrollModal instead
 * of directly enrolling.
 *
 * Triggered when:
 *   - the same course_id already has a COMPLETED or FAILED record in enrollment, OR
 *   - the course_id is in recognizedCourseIds（単位認定済み → 聴講UXを流用）
 */
export function shouldShowReEnrollModal(
  courseId: string,
  enrollment: Array<{ course_id: string; status: EnrollmentStatus }>,
  recognizedCourseIds: Set<string> = new Set(),
): boolean {
  if (recognizedCourseIds.has(courseId)) return true
  return enrollment.some(
    e => e.course_id === courseId &&
         (e.status === 'COMPLETED' || e.status === 'FAILED'),
  )
}

/**
 * Returns true when RE_ENROLL is available as an option in ReEnrollModal.
 * Requires at least one prior FAILED entry for the same course_id.
 */
export function canReEnroll(
  courseId: string,
  enrollment: Array<{ course_id: string; status: EnrollmentStatus }>,
): boolean {
  return enrollment.some(
    e => e.course_id === courseId && e.status === 'FAILED',
  )
}
