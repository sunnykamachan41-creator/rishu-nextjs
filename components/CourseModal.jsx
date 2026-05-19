'use client'
import { STATUS_CONFIG, DIRECT_STATUSES } from '@/lib/enrollmentStatus'

const TERM_COLORS = {
  '春学期': 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  '秋学期': 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300',
  '通年': 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {object}  props
 * @param {object}  props.course
 * @param {boolean} props.isSelected
 * @param {boolean} props.isConflict
 * @param {boolean} props.toggling
 * @param {()=>void} props.onToggle          - legacy toggle handler
 * @param {()=>void} props.onClose
 * @param {'COMPLETED'|'IN_PROGRESS'|'PLANNED'|'FAILED'|'AUDIT'|'RE_ENROLL'|undefined} props.enrollStatus
 *   Current enrollment status (new schema only; undefined = not enrolled / legacy)
 * @param {'new'|'legacy'} props.enrollmentVersion
 * @param {(status: string)=>void} [props.onStatusChange]
 *   Called with new status string when user changes status in new-schema mode.
 *   Called with 'REMOVE' when user removes enrollment.
 */
export default function CourseModal({
  course, isSelected, isConflict, onToggle, onClose, toggling,
  enrollStatus, enrollmentVersion = 'legacy', onStatusChange,
}) {
  const isNewSchema = enrollmentVersion === 'new' && typeof onStatusChange === 'function'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', maxWidth: 430, margin: '0 auto' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1f2235] rounded-t-3xl w-full p-5 pb-8 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mb-4" />

        {/* ── バッジ行 ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TERM_COLORS[course.term] || 'bg-gray-100 text-gray-600'}`}>
            {course.term}
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-slate-300">
            {course.raw_category}
          </span>
          {course.credits && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300">
              {course.credits}単位
            </span>
          )}
          {isConflict && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">
              ⚠ 時間割衝突
            </span>
          )}
          {/* 新スキーマ: 現在のステータスバッジ */}
          {isNewSchema && enrollStatus && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              STATUS_CONFIG[enrollStatus]?.badge ?? 'bg-gray-100 text-gray-600'
            }`}>
              {STATUS_CONFIG[enrollStatus]?.label ?? enrollStatus}
            </span>
          )}
        </div>

        {/* ── 科目名・担当者 ────────────────────────────────────────────────── */}
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 leading-snug mb-1">{course.course_name}</h2>
        <div className="text-sm text-gray-500 dark:text-slate-400 mb-4">{course.intructor}</div>

        {/* ── 詳細グリッド ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            ['曜日・時限', course.day_time || '時間外'],
            ['教室', course.room || '—'],
            ['対象年次', course.year ? `${course.year}年次` : '—'],
            ['クラス', course.class || '—'],
          ].map(([label, value]) => (
            <div key={label} className="bg-gray-50 dark:bg-[#252839] rounded-xl p-2.5">
              <div className="text-xs text-gray-400 dark:text-slate-500 mb-0.5">{label}</div>
              <div className="text-sm font-semibold text-gray-800 dark:text-slate-200">{value}</div>
            </div>
          ))}
        </div>

        {/* ── タグ ─────────────────────────────────────────────────────────── */}
        {course.tags && (
          <div className="mb-5">
            <div className="text-xs text-gray-400 dark:text-slate-500 font-semibold mb-1.5">卒業要件タグ</div>
            <div className="flex flex-wrap gap-1">
              {String(course.tags).split('|').map(t => (
                <span key={t} className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-500/20">
                  {t.trim()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── 備考 ─────────────────────────────────────────────────────────── */}
        {course.note && (
          <div className="mb-5">
            <div className="text-xs text-gray-400 dark:text-slate-500 font-semibold mb-1.5">備考</div>
            <div className="text-sm text-gray-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2.5 leading-relaxed border border-amber-100 dark:border-amber-500/20 whitespace-pre-wrap">
              {course.note}
            </div>
          </div>
        )}

        {/* ── アクションボタン ──────────────────────────────────────────────── */}

        {isNewSchema ? (
          /* 新スキーマ: ステータスピッカー */
          <div className="space-y-2">
            {enrollStatus ? (
              <>
                <div className="text-xs text-gray-400 dark:text-slate-500 font-semibold mb-2">履修ステータスを変更</div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {DIRECT_STATUSES.map(value => {
                    const cfg     = STATUS_CONFIG[value]
                    const isActive = enrollStatus === value
                    return (
                      <button
                        key={value}
                        onClick={() => onStatusChange(value)}
                        disabled={toggling}
                        className={`py-2.5 rounded-2xl text-sm font-semibold transition-all border-2 ${
                          toggling
                            ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-slate-500 border-transparent'
                            : isActive
                              ? cfg.button + ' border-transparent shadow-sm'
                              : cfg.outline + ' border'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => onStatusChange('REMOVE')}
                  disabled={toggling}
                  className={`w-full py-3 rounded-2xl text-sm font-semibold transition-all ${
                    toggling ? 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-slate-500' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
                  }`}
                >
                  {toggling ? '更新中…' : '履修を取り消す'}
                </button>
              </>
            ) : (
              <button
                onClick={() => onStatusChange('PLANNED')}
                disabled={toggling}
                className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all ${
                  toggling ? 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-slate-500' : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {toggling ? '更新中…' : '履修に追加する'}
              </button>
            )}
          </div>
        ) : (
          /* レガシー: トグルボタン */
          <button
            onClick={onToggle}
            disabled={toggling}
            className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all ${
              toggling
                ? 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-slate-500'
                : isSelected
                  ? 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-white/[0.15]'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {toggling ? '更新中…' : isSelected ? '履修を取り消す' : '履修に追加する'}
          </button>
        )}
      </div>
    </div>
  )
}
