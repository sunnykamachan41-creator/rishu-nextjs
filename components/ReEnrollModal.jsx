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
        className="bg-white rounded-t-3xl w-full p-5 pb-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        {/* Title */}
        <div className="text-base font-bold text-gray-900 mb-1">
          履修履歴があります
        </div>
        <div className="text-sm text-gray-500 mb-5 leading-relaxed">
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
                ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100 text-gray-400'
                : 'bg-amber-50 border-amber-200 hover:bg-amber-100 active:scale-[0.99]'
            }`}
          >
            <div>
              <div className="text-sm font-semibold text-amber-800">聴講</div>
              <div className="text-xs text-amber-600 mt-0.5">単位取得なし・参加のみ</div>
            </div>
          </button>

          {/* RE_ENROLL */}
          {canReEnroll ? (
            <button
              onClick={() => !toggling && onSelect('RE_ENROLL')}
              disabled={toggling}
              className={`w-full rounded-2xl px-4 py-3.5 text-left transition-all border-2 ${
                toggling
                  ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100 text-gray-400'
                  : 'bg-purple-50 border-purple-200 hover:bg-purple-100 active:scale-[0.99]'
              }`}
            >
              <div>
                <div className="text-sm font-semibold text-purple-800">再履修（笑）</div>
                <div className="text-xs text-purple-600 mt-0.5">落単履歴あり・単位取得を目指す</div>
              </div>
            </button>
          ) : (
            <div className="w-full rounded-2xl px-4 py-3.5 border-2 border-gray-100 bg-gray-50 opacity-60">
              <div>
                <div className="text-sm font-semibold text-gray-400">再履修（笑）</div>
                <div className="text-xs text-gray-400 mt-0.5">落単（笑）の履歴がある場合のみ選択可</div>
              </div>
            </div>
          )}

          {/* Cancel */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-500
                       bg-gray-100 hover:bg-gray-200 transition-colors mt-1"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
