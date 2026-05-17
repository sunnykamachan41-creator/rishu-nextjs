/**
 * enrollmentStore.js
 *
 * 年度・学期ごとの履修エントリを管理します。
 * 現在: localStorage  →  将来: Firebase Firestore に差し替え可能
 *
 * エントリ形式:
 * {
 *   id:          string,            // crypto.randomUUID()
 *   year:        number,            // 例: 2026
 *   semester:    'spring' | 'fall',
 *   day:         'MON'|'TUE'|'WED'|'THU'|'FRI',
 *   period:      number,            // 1〜5
 *   term:        1 | 2 | 3 | 4,    // 奇数=前半, 偶数=後半
 *   courseTitle: string,
 *   classId:     string | null,     // Google Sheets の class_id（任意）
 * }
 *
 * Firebase 移行時は load/save 関数を async 化するだけ:
 *   export async function loadEntries(year, sem) {
 *     const ref = doc(db, 'users', uid, 'enrollment', `${year}-${sem}`)
 *     const snap = await getDoc(ref)
 *     return snap.exists() ? snap.data().entries : []
 *   }
 */

// ── キー生成 ──────────────────────────────────────────────────────────────────

const STORE_KEY = (year, sem) => `rishu_enrollment_${year}_${sem}`

// ── 読み書き ──────────────────────────────────────────────────────────────────

/**
 * 指定年度・学期のエントリ一覧を返す。
 * SSR 時は空配列を返す（window なし）。
 */
export function loadEntries(year, sem) {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORE_KEY(year, sem))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** 指定年度・学期のエントリ一覧を保存する。 */
function saveEntries(year, sem, entries) {
  try {
    localStorage.setItem(STORE_KEY(year, sem), JSON.stringify(entries))
  } catch {}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * エントリを追加し、更新後の配列を返す。
 * @param {number} year
 * @param {'spring'|'fall'} sem
 * @param {Omit<Entry,'id'|'year'|'semester'>} data
 * @returns {Entry[]}
 */
export function createEntry(year, sem, data) {
  const entries = loadEntries(year, sem)
  const entry = {
    ...data,
    id:       crypto.randomUUID(),
    year,
    semester: sem,
  }
  const next = [...entries, entry]
  saveEntries(year, sem, next)
  return next
}

/**
 * 指定 id のエントリを削除し、更新後の配列を返す。
 * @param {number} year
 * @param {'spring'|'fall'} sem
 * @param {string} id
 * @returns {Entry[]}
 */
export function deleteEntry(year, sem, id) {
  const entries = loadEntries(year, sem)
  const next = entries.filter(e => e.id !== id)
  saveEntries(year, sem, next)
  return next
}

/**
 * 指定年度・学期の全エントリを削除する。
 * @param {number} year
 * @param {'spring'|'fall'} sem
 */
export function clearEntries(year, sem) {
  saveEntries(year, sem, [])
}
