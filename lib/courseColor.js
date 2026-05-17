/**
 * Course color classification
 *
 * Priority (high → low):
 *  1. red    – 必修 (_MAN suffix in tags, or sub_category '必修'/'英語必修')
 *  2. blue   – 副免許系 (HIENG / KIND / LIB in tags, or raw_category '中高英語'/'幼稚園')
 *  3. green  – CA 系（必修除く）
 *  4. orange – EC 系（必修・LIB 除く）
 *  5. purple – SA 系（SA_HIENG 除く）
 *  6. yellow – 第二外国語 (CL_SEC / CL_SEC_OP)
 *  7. gray   – その他
 */

// ── Color tokens ─────────────────────────────────────────────────────────────
// card: for CourseList cards (subtle bg)
// tile: for Timetable cells (richer bg)
// sel:  selected border color class
// check: selected indicator bg
export const COURSE_COLORS = {
  red:    { card: 'bg-red-50',    tile: 'bg-red-100    border-red-300    text-red-900',    sel: 'border-red-500',    check: 'bg-red-500',    dot: 'bg-red-400'    },
  blue:   { card: 'bg-blue-50',   tile: 'bg-blue-100   border-blue-300   text-blue-900',   sel: 'border-blue-500',   check: 'bg-blue-500',   dot: 'bg-blue-400'   },
  green:  { card: 'bg-green-50',  tile: 'bg-green-100  border-green-300  text-green-900',  sel: 'border-green-500',  check: 'bg-green-500',  dot: 'bg-green-400'  },
  orange: { card: 'bg-orange-50', tile: 'bg-orange-100 border-orange-300 text-orange-900', sel: 'border-orange-500', check: 'bg-orange-500', dot: 'bg-orange-400' },
  purple: { card: 'bg-purple-50', tile: 'bg-purple-100 border-purple-300 text-purple-900', sel: 'border-purple-500', check: 'bg-purple-500', dot: 'bg-purple-400' },
  yellow: { card: 'bg-yellow-50', tile: 'bg-yellow-100 border-yellow-300 text-yellow-900', sel: 'border-yellow-500', check: 'bg-yellow-500', dot: 'bg-yellow-400' },
  gray:   { card: 'bg-gray-50',   tile: 'bg-gray-100   border-gray-300   text-gray-700',   sel: 'border-gray-500',   check: 'bg-gray-500',   dot: 'bg-gray-400'   },
}

// ── Badge tokens (degree / 資格 attribute) ────────────────────────────────────
const BADGE_CONFIG = {
  HIENG: { label: '中高英語', cls: 'bg-sky-100 text-sky-700' },
  KIND:  { label: '幼稚園',   cls: 'bg-teal-100 text-teal-700' },
  LIB:   { label: '司書',     cls: 'bg-violet-100 text-violet-700' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTags(course) {
  return (course.tags || '').split('|').map(t => t.trim()).filter(Boolean)
}

function isRequired(tags, sub) {
  // _MAN suffix = mandatory / 必修
  if (tags.some(t => t.endsWith('_MAN'))) return true
  if (sub === '必修' || sub === '英語必修') return true
  return false
}

function hasSubLicense(tags, raw) {
  if (raw === '中高英語' || raw === '幼稚園') return true
  return tags.some(t => t.includes('HIENG') || t.includes('KIND') || t.includes('LIB'))
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns one of: 'red' | 'blue' | 'green' | 'orange' | 'purple' | 'yellow' | 'gray' */
export function getCourseColorKey(course) {
  const tags = parseTags(course)
  const sub  = course.sub_category || ''
  const raw  = course.raw_category  || ''

  if (isRequired(tags, sub))        return 'red'
  if (hasSubLicense(tags, raw))     return 'blue'

  if (tags.some(t => t.startsWith('CA'))) return 'green'

  // EC: exclude LIB-related tags (those go blue)
  if (tags.some(t => t.startsWith('EC')) && !tags.some(t => t.includes('LIB'))) return 'orange'

  // SA: exclude SA_HIENG (those go blue via hasSubLicense)
  if (tags.some(t => t.startsWith('SA'))) return 'purple'

  if (tags.some(t => t === 'CL_SEC' || t === 'CL_SEC_OP')) return 'yellow'

  return 'gray'
}

/** Returns color token object from COURSE_COLORS */
export function getCourseColor(course) {
  return COURSE_COLORS[getCourseColorKey(course)]
}

/**
 * Returns an array of badge objects { label, cls } for degree/資格 attributes.
 * Only tags that indicate a specific license (HIENG / KIND / LIB) get badges.
 */
export function getCourseBadges(course) {
  const tags = parseTags(course)
  const sub  = course.sub_category || ''
  const badges = []
  const seen = new Set()

  if (tags.some(t => t.includes('HIENG')) && !seen.has('HIENG')) {
    badges.push(BADGE_CONFIG.HIENG); seen.add('HIENG')
  }
  if (tags.some(t => t.includes('KIND')) && !seen.has('KIND')) {
    badges.push(BADGE_CONFIG.KIND); seen.add('KIND')
  }
  if ((tags.some(t => t.includes('LIB')) || sub === '司書') && !seen.has('LIB')) {
    badges.push(BADGE_CONFIG.LIB); seen.add('LIB')
  }

  return badges
}
