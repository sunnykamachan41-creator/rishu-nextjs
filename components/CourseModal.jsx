'use client'
import { useState, useRef, useCallback } from 'react'
import { STATUS_CONFIG, DIRECT_STATUSES } from '@/lib/enrollmentStatus'
import AttendanceSection from './AttendanceSection'
import { useSwipeDown } from '@/lib/useSwipeDown'
import { useSheetClose } from '@/lib/useSheetClose'

const TERM_COLORS = {
  '春学期': 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  '秋学期': 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300',
  '通年': 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
}

const MEMO_MAX = 200

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
 * @param {'new'|'legacy'} props.enrollmentVersion
 * @param {(status: string)=>void} [props.onStatusChange]
 * @param {boolean} props.isTemporary
 * @param {string|null} props.enrollMemo     - 現在保存されているメモ
 * @param {(classId: string, memo: string) => void} [props.onMemoSave]
 *   メモ保存時コールバック。未登録授業（isSelected=false）では呼ばれない。
 * @param {string|null} [props.enrollmentId] - enrollment シートの id 列（UUID）。出席管理に使用。
 * @param {number|null} [props.sessionCount] - 授業コマ数。出席管理に使用。
 */
export default function CourseModal({
  course, isSelected, isConflict, onToggle, onClose, toggling,
  enrollStatus, enrollmentVersion = 'legacy', onStatusChange,
  isTemporary  = false,
  enrollMemo   = null,
  onMemoSave   = null,
  enrollmentId = null,
  sessionCount = null,
}) {
  const isNewSchema  = enrollmentVersion === 'new' && typeof onStatusChange === 'function'
  const canMemo      = isNewSchema && isSelected && typeof onMemoSave === 'function'
  const canAttendance = isNewSchema && isSelected && !!enrollmentId && !!sessionCount

  // ── スワイプページ管理 ──────────────────────────────────────────────────────
  const [activePage, setActivePage] = useState(0)
  const scrollRef   = useRef(null)

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const page = Math.round(scrollRef.current.scrollLeft / scrollRef.current.clientWidth)
    setActivePage(page)
  }, [])

  // ページドットをタップしてジャンプ
  const goToPage = useCallback((page) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTo({ left: page * scrollRef.current.clientWidth, behavior: 'smooth' })
  }, [])

  // ── メモ状態 ───────────────────────────────────────────────────────────────
  const [memoText,  setMemoText]  = useState(enrollMemo ?? '')
  const [memoState, setMemoState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [memoError, setMemoError] = useState('')

  const handleMemoSave = useCallback(async () => {
    if (!canMemo || memoState === 'saving') return
    setMemoState('saving')
    setMemoError('')
    try {
      await onMemoSave(course.class_id, memoText.slice(0, MEMO_MAX))
      setMemoState('saved')
      setTimeout(() => setMemoState('idle'), 2000)
    } catch (e) {
      setMemoError(e.message || '保存に失敗しました')
      setMemoState('error')
      setTimeout(() => setMemoState('idle'), 3000)
    }
  }, [canMemo, onMemoSave, course.class_id, memoText, memoState])

  const totalPages = (canMemo || canAttendance) ? 2 : 1
  const { closing, closeSheet } = useSheetClose(onClose)
  const { sheetRef, handleProps } = useSwipeDown(closeSheet)

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center
                  transition-opacity duration-[260ms] ${closing ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'rgba(0,0,0,0.4)', maxWidth: 430, margin: '0 auto' }}
      onClick={closeSheet}
    >
      <div
        ref={sheetRef}
        {...handleProps}
        className={`bg-white dark:bg-[#1f2235] rounded-t-3xl w-full overflow-hidden flex flex-col
                    ${closing ? 'animate-slide-down' : 'animate-slide-up'}`}
        style={{ maxHeight: '90dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── ドラッグハンドル + ページドット ───────────────────────────────── */}
        <div className="flex-shrink-0 pt-3 pb-2 flex flex-col items-center gap-2">
          <div className="w-10 h-1 bg-gray-200 dark:bg-white/10 rounded-full" />
          {totalPages > 1 && (
            <div className="flex gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => goToPage(i)}
                  className={`rounded-full transition-all ${
                    activePage === i
                      ? 'w-4 h-1.5 bg-blue-500'
                      : 'w-1.5 h-1.5 bg-gray-200 dark:bg-white/20'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── スクロール可能なページコンテナ ────────────────────────────────── */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-scroll flex-1"
          style={{
            scrollSnapType:    'x mandatory',
            scrollbarWidth:    'none',         /* Firefox */
            msOverflowStyle:   'none',         /* IE/Edge */
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* ── Page 1: 授業詳細 + ステータス ─────────────────────────────── */}
          <div
            className="min-w-full px-5 pb-6"
            style={{ scrollSnapAlign: 'start' }}
          >
            {/* バッジ行 */}
            <div className="flex flex-wrap gap-1 mb-2 pt-1">
              {isTemporary && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  仮登録
                </span>
              )}
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
              {isNewSchema && enrollStatus && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  STATUS_CONFIG[enrollStatus]?.badge ?? 'bg-gray-100 text-gray-600'
                }`}>
                  {STATUS_CONFIG[enrollStatus]?.label ?? enrollStatus}
                </span>
              )}
            </div>

            {/* 科目名・担当者 */}
            <h2 className="text-base font-bold text-gray-900 dark:text-slate-100 leading-snug mb-0.5">{course.course_name}</h2>
            <div className="text-xs text-gray-500 dark:text-slate-400 mb-3">{course.intructor}</div>

            {/* 詳細グリッド */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                ['曜日・時限', course.day_time || '時間外'],
                ['教室',       course.room    || '—'],
                ['対象年次',   course.year ? `${course.year}年次` : '—'],
                ['クラス',     course.class   || '—'],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 dark:bg-[#252839] rounded-xl p-2">
                  <div className="text-[10px] text-gray-400 dark:text-slate-500 mb-0.5">{label}</div>
                  <div className="text-xs font-semibold text-gray-800 dark:text-slate-200">{value}</div>
                </div>
              ))}
            </div>

            {/* タグ行 + メモ・出欠席ボタン（対向配置） */}
            {(course.tags || canMemo || canAttendance) && (
              <div className="flex items-center gap-3 mb-3">
                {/* 左: 卒業要件タグ */}
                <div className="flex-1 min-w-0">
                  {course.tags && (
                    <>
                      <span className="text-xs text-gray-400 dark:text-slate-500 font-semibold">卒業要件タグ</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {String(course.tags).split('|').map(t => (
                          <span key={t} className="text-[10px] bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-500/20">
                            {t.trim()}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {/* 右: 丸ボタン */}
                {(canMemo || canAttendance) && (
                  <button
                    onClick={() => goToPage(1)}
                    className={`flex-shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-full
                                transition-all active:scale-95 shadow-sm ${
                      memoText
                        ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-500 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-white/[0.08] text-gray-400 dark:text-slate-500'
                    }`}
                  >
                    <span className="text-3xl leading-none">{canAttendance ? '📋' : '📝'}</span>
                    <span className={`text-[10px] font-semibold leading-none mt-1.5 ${
                      memoText ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'
                    }`}>
                      {canAttendance ? 'メモ・出欠席' : 'メモ'}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* 備考 */}
            {course.note && (
              <div className="mb-3">
                <div className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold mb-1">備考</div>
                <div className="text-xs text-gray-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2 leading-relaxed border border-amber-100 dark:border-amber-500/20 whitespace-pre-wrap">
                  {course.note}
                </div>
              </div>
            )}

            {/* アクションボタン */}
            {isNewSchema && isTemporary ? (
              <div className="space-y-2">
                <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10
                                rounded-xl px-3 py-2 leading-relaxed border border-amber-200 dark:border-amber-500/20">
                  仮登録のため、ステータス変更はできません。卒業要件の集計には含まれません。
                </div>
                {enrollStatus && (
                  <button
                    onClick={() => onStatusChange('REMOVE')}
                    disabled={toggling}
                    className={`w-full py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                      toggling
                        ? 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-slate-500'
                        : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
                    }`}
                  >
                    {toggling ? '更新中…' : '仮登録を取り消す'}
                  </button>
                )}
              </div>
            ) : isNewSchema ? (
              <div className="space-y-2">
                {enrollStatus ? (
                  <>
                    <div className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold mb-1">履修ステータスを変更</div>
                    <div className="grid grid-cols-2 gap-2">
                      {DIRECT_STATUSES.map(value => {
                        const cfg      = STATUS_CONFIG[value]
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
                      className={`w-full py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                        toggling
                          ? 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-slate-500'
                          : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
                      }`}
                    >
                      {toggling ? '更新中…' : '履修を取り消す'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onStatusChange('PLANNED')}
                    disabled={toggling}
                    className={`w-full py-3 rounded-2xl font-semibold text-sm transition-all ${
                      toggling
                        ? 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-slate-500'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    {toggling ? '更新中…' : '履修に追加する'}
                  </button>
                )}
              </div>
            ) : onToggle ? (
              /* レガシー（onToggle がある場合のみ表示） */
              <button
                onClick={onToggle}
                disabled={toggling}
                className={`w-full py-3 rounded-2xl font-semibold text-sm transition-all ${
                  toggling
                    ? 'bg-gray-100 dark:bg-white/10 text-gray-400 dark:text-slate-500'
                    : isSelected
                      ? 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-white/[0.15]'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {toggling ? '更新中…' : isSelected ? '履修を取り消す' : '履修に追加する'}
              </button>
            ) : null}
          </div>

          {/* ── Page 2: メモ + 出席管理 ──────────────────────────────────── */}
          {(canMemo || canAttendance) && (
            <div
              className="min-w-full overflow-y-auto px-5 pb-8 flex flex-col"
              style={{ scrollSnapAlign: 'start' }}
            >
              <div className="pt-1 mb-3">
                <div className="text-sm font-bold text-gray-900 dark:text-slate-100 mb-0.5">
                  📋 メモ
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {course.course_name}
                </div>
              </div>

              {/* メモ textarea */}
              {canMemo && (
                <>
                  <textarea
                    value={memoText}
                    onChange={e => {
                      setMemoText(e.target.value.slice(0, MEMO_MAX))
                      setMemoState('idle')
                    }}
                    placeholder="授業の感想、試験対策など…"
                    rows={canAttendance ? 3 : 7}
                    className="w-full rounded-2xl border border-gray-200 dark:border-white/[0.12]
                               bg-gray-50 dark:bg-[#252839] text-sm text-gray-800 dark:text-slate-200
                               placeholder-gray-300 dark:placeholder-slate-600
                               px-4 py-3 resize-none leading-relaxed outline-none
                               focus:border-blue-400 dark:focus:border-blue-500/60
                               focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/10
                               transition-all"
                  />
                  <div className="flex justify-end mt-1 mb-3">
                    <span className={`text-xs ${
                      memoText.length >= MEMO_MAX
                        ? 'text-red-400 dark:text-red-400'
                        : 'text-gray-300 dark:text-slate-600'
                    }`}>
                      {memoText.length} / {MEMO_MAX}
                    </span>
                  </div>
                </>
              )}

              {/* 出席管理 */}
              {canAttendance && (
                <>
                  {canMemo && <div className="mb-3 border-t border-gray-100 dark:border-white/[0.08]" />}
                  <AttendanceSection
                    enrollmentId={enrollmentId}
                    sessionCount={sessionCount}
                  />
                </>
              )}

              {/* 保存ボタン（メモがある場合のみ・最下部に固定） */}
              {canMemo && (
                <div className="mt-auto pt-4">
                  {memoState === 'error' && (
                    <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                      ⚠ {memoError}
                    </div>
                  )}
                  <button
                    onClick={handleMemoSave}
                    disabled={memoState === 'saving'}
                    className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all ${
                      memoState === 'saved'
                        ? 'bg-emerald-500 text-white'
                        : memoState === 'saving'
                          ? 'bg-blue-300 dark:bg-blue-500/50 text-white cursor-not-allowed'
                          : 'bg-blue-500 hover:bg-blue-600 active:scale-[0.98] text-white'
                    }`}
                  >
                    {memoState === 'saving' ? '保存中…' : memoState === 'saved' ? '✓ 保存しました' : (canAttendance ? 'メモ・出欠席を保存する' : 'メモを保存する')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
