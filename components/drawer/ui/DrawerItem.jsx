'use client'

/**
 * 汎用ドロワーアイテム
 *
 * Props:
 *   icon      — SVGアイコン要素
 *   label     — メインラベル
 *   value     — 右側の値テキスト（省略可）
 *   sublabel  — ラベル下の補足テキスト（省略可）
 *   chevron   — 右矢印を表示する（onPress があるとき）
 *   onPress   — タップ時のコールバック
 *   danger    — 赤色スタイル
 *   disabled  — 非活性
 *   right     — 右側に任意のReact要素を置く（toggleなど）
 */
export default function DrawerItem({
  icon,
  label,
  value,
  sublabel,
  chevron = false,
  onPress,
  danger = false,
  disabled = false,
  right,
}) {
  const base = `flex items-center gap-3.5 px-4 py-3.5 w-full text-left
    transition-colors min-h-[52px]
    ${disabled ? 'opacity-40 pointer-events-none' : ''}
    ${onPress && !disabled ? 'active:bg-gray-50 dark:active:bg-slate-700 cursor-pointer' : ''}`

  const content = (
    <>
      {/* アイコン */}
      {icon && (
        <span className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl
          ${danger ? 'bg-red-100 dark:bg-red-900/30 text-red-500' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
          {icon}
        </span>
      )}

      {/* ラベル + サブラベル */}
      <div className="flex-1 min-w-0">
        <span className={`block text-[14px] font-medium leading-tight
          ${danger ? 'text-red-500' : 'text-gray-800 dark:text-slate-100'}`}>
          {label}
        </span>
        {sublabel && (
          <span className="block text-[12px] text-gray-400 dark:text-slate-400 mt-0.5 truncate">
            {sublabel}
          </span>
        )}
      </div>

      {/* 右側: value / custom right / chevron */}
      {right ?? (
        <>
          {value && (
            <span className="text-[13px] text-gray-400 dark:text-slate-400 truncate max-w-[120px]">
              {value}
            </span>
          )}
          {chevron && (
            <svg className="w-4 h-4 text-gray-300 dark:text-slate-500 flex-shrink-0" fill="none"
              viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </>
      )}
    </>
  )

  if (onPress) {
    return (
      <button type="button" onClick={onPress} className={base}>
        {content}
      </button>
    )
  }

  return <div className={base}>{content}</div>
}

/** iOS風トグルスイッチ */
export function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[30px] w-[52px] flex-shrink-0 items-center rounded-full
        transition-colors duration-200 focus:outline-none
        ${checked ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-slate-600'}`}
    >
      <span
        className={`inline-block h-[24px] w-[24px] rounded-full bg-white shadow-md
          transform transition-transform duration-200
          ${checked ? 'translate-x-[24px]' : 'translate-x-[3px]'}`}
      />
    </button>
  )
}
