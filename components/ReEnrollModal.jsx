'use client'

/**
 * ReEnrollModal
 * -------------
 * Shown when a user tries to add a course that already has COMPLETED or FAILED
 * history in their enrollment records.
 *
 * Options:
 *   AUDIT     — always available (no credit, observation only)
 *   RE_ENROLL — only shown when canReEnroll is true (requires prior FAILED)
 *   Cancel    — dismiss without any change
 *
 * @param {object}   props
 * @param {object}   props.course       - NormalizedCourse object
 * @param {boolean}  props.canReEnroll  - Whether RE_ENROLL option is available
 * @param {boolean}  props.toggling
 * @param {(status: 'AUDIT'|'RE_ENROLL') => void} props.onSelect
 * @param {() => void} props.onClose
 */
export default function ReEnrollModal({ course, canReEnroll, toggling, onSelect, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', maxWidth: 430, margin: '0 auto' }}
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1f2235] rounded-t-3xl w-full p-5 pb-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full mx-auto mb-5" />

        {/* Title */}
        <div className="text-base font-bold text-gray-900 dark:text-slate-100 mb-1">
          履修履歴があります
        </div>
        <div className="text-sm text-gray-500 dark:text-slate-400 mb-5 leading-relaxed">
          「{course.course_name}」はすでに履修履歴があります。<br />
          この授業についてどうしますか？
        </div>

        <div className="space-y-2.5">
          {/* AUDIT */}
          <button
            onClick={() => !toggling && onSelect('AUDIT')}
            disabled={toggling}
            className={`w-full rounded-2xl px-4 py-3.5 text-left transition-all border-2 ${
              toggling
                ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-white/[0.05] border-gray-100 dark:border-white/[0.07] text-gray-400 dark:text-slate-600'
                : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/20 active:scale-[0.99]'
            }`}
          >
            <div>
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">聴講</div>
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">単位取得なし・参加のみ</div>
            </div>
          </button>

          {/* RE_ENROLL */}
          {canReEnroll ? (
            <button
              onClick={() => !toggling && onSelect('RE_ENROLL')}
              disabled={toggling}
              className={`w-full rounded-2xl px-4 py-3.5 text-left transition-all border-2 ${
                toggling
                  ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-white/[0.05] border-gray-100 dark:border-white/[0.07] text-gray-400 dark:text-slate-600'
                  : 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 hover:bg-purple-100 dark:hover:bg-purple-500/20 active:scale-[0.99]'
              }`}
            >
              <div>
                <div className="text-sm font-semibold text-purple-800 dark:text-purple-300">再履修（笑）</div>
                <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">落単履歴あり・単位取得を目指す</div>
              </div>
            </button>
          ) : (
            <div className="w-full rounded-2xl px-4 py-3.5 border-2 border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-white/[0.03] opacity-60">
              <div>
                <div className="text-sm font-semibold text-gray-400 dark:text-slate-500">再履修（笑）</div>
                <div className="text-xs text-gray-400 dark:text-slate-600 mt-0.5">落単（笑）の履歴がある場合のみ選択可</div>
              </div>
            </div>
          )}

          {/* Cancel */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-500 dark:text-slate-400
                       bg-gray-100 dark:bg-[#252839] hover:bg-gray-200 dark:hover:bg-[#2a2d3f] transition-colors mt-1"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
