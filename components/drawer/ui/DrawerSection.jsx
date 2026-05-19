/**
 * セクションラッパー
 * - ラベル（小文字大文字混在、薄グレー）
 * - 白いカード内にアイテムを縦並び
 */
export default function DrawerSection({ label, children }) {
  return (
    <div>
      {label && (
        <p className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase px-1 mb-2">
          {label}
        </p>
      )}
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100 dark:divide-slate-700">
        {children}
      </div>
    </div>
  )
}
