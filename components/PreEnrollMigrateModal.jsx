'use client'

/**
 * PreEnrollMigrateModal
 * ─────────────────────
 * 年度更新時に仮登録授業を新年度の本登録へ移行するかどうかをユーザーに確認するモーダル。
 *
 * 内部ロジック:
 *   各仮登録エントリについて「新年度 (newLatestYear) に同じ class_id の授業が存在するか」を
 *   courses から検索し、移行可能 / 廃止 に振り分ける。
 *
 * Props:
 *   courses        NormalizedCourse[]        — 全コース一覧（/api/data から）
 *   tempEnrollments NormalizedEnrollment[]   — is_temporary=true のエントリ一覧
 *   newLatestYear  number                    — 移行先の academic_year
 *   oldLatestYear  number                    — 移行元の academic_year（表示用）
 *   onConfirm      (classIds: string[]) => void  — 移行実行
 *   onSkip         () => void               — スキップ（移行しない）
 *   migrating      boolean                  — API 呼び出し中フラグ
 */
export default function PreEnrollMigrateModal({
  courses        = [],
  tempEnrollments = [],
  newLatestYear,
  oldLatestYear,
  onConfirm,
  onSkip,
  migrating = false,
}) {
  // 移行可能 / 廃止 に振り分ける
  const items = tempEnrollments.map(e => {
    const newCourse = courses.find(
      c => c.class_id === e.class_id && c.academic_year === newLatestYear,
    )
    // 旧年度コースのメタ情報（名前・単位数などの表示用）
    const oldCourse = courses.find(c => c.class_id === e.class_id) // どの年度でも OK
    return { enrollment: e, newCourse, oldCourse, migratable: !!newCourse }
  })

  const migratableItems  = items.filter(i => i.migratable)
  const unavailableItems = items.filter(i => !i.migratable)

  function handleConfirm() {
    if (migrating) return
    onConfirm(migratableItems.map(i => i.enrollment.class_id))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', maxWidth: 430, margin: '0 auto' }}
    >
      <div
        className="bg-white dark:bg-[#1f2235] rounded-t-3xl w-full pb-8 max-h-[85dvh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* drag handle */}
        <div className="flex-shrink-0 pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full" />
        </div>

        {/* header */}
        <div className="flex-shrink-0 px-5 pb-4 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎓</span>
            <span className="text-base font-bold text-gray-900 dark:text-slate-100">
              年度更新：仮登録の移行
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
            {oldLatestYear}年度 → <strong className="text-gray-700 dark:text-slate-200">{newLatestYear}年度</strong>{' '}
            に更新されました。仮登録していた授業を新年度の本登録に移行できます。
          </p>
        </div>

        {/* scrollable list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">

          {/* ── 移行可能 ── */}
          {migratableItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
                  移行可能
                </span>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {migratableItems.length}件 — {newLatestYear}年度に開講されています
                </span>
              </div>
              <div className="space-y-2">
                {migratableItems.map(({ enrollment, newCourse, oldCourse }) => {
                  const c = newCourse ?? oldCourse
                  return (
                    <CourseRow
                      key={enrollment.class_id}
                      course={c}
                      badge={<span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">✓</span>}
                      borderClass="border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5"
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 廃止 / 開講なし ── */}
          {unavailableItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] font-bold bg-gray-400 dark:bg-slate-500 text-white px-1.5 py-0.5 rounded-full">
                  移行不可
                </span>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {unavailableItems.length}件 — 今年度では開講されていません
                </span>
              </div>
              <div className="space-y-2 opacity-60">
                {unavailableItems.map(({ enrollment, oldCourse }) => (
                  <CourseRow
                    key={enrollment.class_id}
                    course={oldCourse}
                    classId={enrollment.class_id}
                    badge={<span className="text-[9px] text-gray-400 dark:text-slate-500">✕</span>}
                    borderClass="border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-white/[0.02]"
                    unavailable
                  />
                ))}
              </div>
            </div>
          )}

          {items.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">
              仮登録中の授業はありません
            </p>
          )}
        </div>

        {/* actions */}
        <div className="flex-shrink-0 px-5 pt-3 space-y-2.5 border-t border-gray-100 dark:border-white/[0.07]">
          {migratableItems.length > 0 ? (
            <button
              onClick={handleConfirm}
              disabled={migrating}
              className="w-full py-3.5 rounded-2xl bg-blue-500 hover:bg-blue-600
                         text-sm font-bold text-white transition-colors
                         disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {migrating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  移行中…
                </>
              ) : (
                `${migratableItems.length}件を${newLatestYear}年度へ移行する`
              )}
            </button>
          ) : (
            <div className="w-full py-3.5 rounded-2xl bg-gray-100 dark:bg-white/[0.05]
                            text-sm font-medium text-gray-400 dark:text-slate-500 text-center">
              移行できる授業がありません
            </div>
          )}

          <button
            onClick={onSkip}
            disabled={migrating}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-500 dark:text-slate-400
                       bg-gray-100 dark:bg-[#252839] hover:bg-gray-200 dark:hover:bg-[#2a2d3f]
                       transition-colors disabled:opacity-50"
          >
            スキップ（移行しない）
          </button>
        </div>
      </div>
    </div>
  )
}

// ── サブコンポーネント: 授業行 ──────────────────────────────────────────────────

function CourseRow({ course, classId, badge, borderClass, unavailable = false }) {
  const name    = course?.course_name || classId || '不明な授業'
  const credits = course?.credits     ?? '—'
  const term    = course?.term        || ''
  const time    = course?.day_time    || course?.normalized_time || ''
  const cat     = course?.raw_category || ''

  return (
    <div className={`rounded-xl px-3 py-2.5 border flex items-start gap-2.5 ${borderClass}`}>
      <div className="flex-shrink-0 w-5 h-5 rounded-full border border-current flex items-center justify-center mt-0.5
                      text-gray-400 dark:text-slate-500">
        {badge}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold leading-snug truncate ${
          unavailable ? 'text-gray-400 dark:text-slate-500' : 'text-gray-800 dark:text-slate-100'
        }`}>
          {name}
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
          {credits !== '—' && (
            <span className="text-[10px] text-gray-500 dark:text-slate-400">{credits}単位</span>
          )}
          {term && (
            <span className="text-[10px] text-gray-500 dark:text-slate-400">{term}</span>
          )}
          {time && (
            <span className="text-[10px] text-gray-500 dark:text-slate-400">{time}</span>
          )}
          {cat && (
            <span className="text-[10px] text-gray-400 dark:text-slate-500 truncate max-w-[120px]">{cat}</span>
          )}
        </div>
      </div>
    </div>
  )
}
