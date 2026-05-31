'use client'
import { useState }  from 'react'
import DrawerSection from '../ui/DrawerSection'
import DrawerItem    from '../ui/DrawerItem'

// ── セクションアイコン ─────────────────────────────────────────────────────
const Icons = {
  Help: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10"/>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
      <circle cx="12" cy="17" r=".5" fill="currentColor"/>
    </svg>
  ),
  Start: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    </svg>
  ),
  Timetable: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  ),
  Graduation: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
    </svg>
  ),
  Catalog: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8"/>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/>
    </svg>
  ),
  Room: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m4-10h2m4 0h2M9 7h2m4 0h2"/>
    </svg>
  ),
  FAQ: () => (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
    </svg>
  ),
  ChevronDown: ({ open }) => (
    <svg viewBox="0 0 24 24" fill="none" className={`w-3.5 h-3.5 flex-shrink-0 text-gray-300 dark:text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/>
    </svg>
  ),
}

// ── コンテンツ定義 ─────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'start', label: 'はじめかた', Icon: Icons.Start,
    items: [
      {
        q: '入学年度・学科の設定',
        a: 'ここを間違えると卒業要件の計算がずれます。プロフィール（左上アバター）→「所属・入学年度」から変更できます。\n\n注意：入学年度を変更すると、登録済みの全履修データがリセットされます。変更前に必ずご確認ください。',
      },
      {
        q: 'ホーム画面への追加（iPhone）',
        a: 'Safariで開いて、画面下の共有ボタン →「ホーム画面に追加」。\n\nLINEやInstagramのブラウザからは追加できません。右上メニュー →「Safariで開く」を選んでから操作してください。',
      },
      {
        q: 'ホーム画面への追加（Android）',
        a: 'Chromeで開いて、右上のメニュー →「ホーム画面に追加」または「アプリをインストール」。\n\n機種によって表示が異なる場合があります。アドレスバー右端にインストールアイコンが表示されることもあります。',
      },
    ],
  },
  {
    id: 'timetable', label: '時間割・履修登録', Icon: Icons.Timetable,
    items: [
      {
        q: '授業の追加方法',
        a: '時間割タブの「+」ボタンまたは空きコマをタップして授業を検索・追加します。\n\nカタログタブは授業の閲覧・検索専用です。カタログから直接履修登録はできません。',
      },
      {
        q: 'ステータスの変更（個別）',
        a: '時間割の授業コマをタップ → 詳細画面でステータスを選択します。\n\n・履修予定：これから受ける予定\n・履修中：現在受講中\n・取得済み：単位取得（卒業要件に反映）\n・落単（笑）：単位未取得\n・聴講：単位なしで参加のみ\n・再履修（笑）：落単済みの授業を再度受ける',
      },
      {
        q: 'ステータスの一括変更',
        a: '時間割タブ右上の「一括変更」ボタンから、複数の授業のステータスをまとめて変更できます。学期末に「履修中 → 取得済み」へまとめて更新するときに便利です。',
      },
      {
        q: '仮登録とは',
        a: '来年度の授業を今のうちに登録しておける機能です。年度が切り替わると「確定しますか？」の確認が出ます。仮登録中の授業は卒業要件の計算に含まれません。',
      },
    ],
  },
  {
    id: 'graduation', label: '卒業要件・単位計算', Icon: Icons.Graduation,
    items: [
      {
        q: '単位が反映されない・計算がおかしい',
        a: 'ステータスが「取得済み」になっているか確認してください。「履修中」「履修予定」は卒業要件に反映されません。\n\n変更後も画面が古い場合は、プロフィール →「データ」→「卒業要件を再計算」を実行してください。',
      },
      {
        q: '再計算ボタンとは',
        a: 'サーバー側で卒業要件の集計をやり直す機能です。ステータスを変えても数字が更新されない場合に使います。通常は自動更新されるため頻繁に使う必要はありません。',
      },
      {
        q: '単位認定の入力方法',
        a: '他大学等で取得した単位を認定してもらった場合、プロフィール →「単位認定」、またはカタログ上部の「単位認定」から登録できます。\n\n登録した授業は「取得済み」として卒業要件に含まれますが、時間割・ヒートマップ等の出席ベース統計には含まれません。',
      },
      {
        q: '副免許の登録・切り替え',
        a: '副免許の登録・変更はプロフィール →「所属・入学年度」→「副免許」から行えます。卒業要件タブ上部のタブで表示を切り替えられます。',
      },
    ],
  },
  {
    id: 'catalog', label: 'カタログ', Icon: Icons.Catalog,
    items: [
      {
        q: 'カタログでできること・できないこと',
        a: 'カタログは授業の検索・詳細確認専用です。カタログから直接履修登録はできません。授業を時間割に追加したい場合は、時間割タブから追加してください。',
      },
      {
        q: '授業が見つからない',
        a: '年度フィルタを確認してください。前年度や今年度で授業名・担当者が異なる場合があります。',
      },
    ],
  },
  {
    id: 'emptyroom', label: '空き部屋検索', Icon: Icons.Room,
    items: [
      {
        q: '今空いている教室を探す',
        a: '「空き部屋」タブで曜日・時限を選ぶと、現在空いている教室の一覧が表示されます。ログイン不要で使えます。',
      },
    ],
  },
  {
    id: 'faq', label: 'よくある質問', Icon: Icons.FAQ,
    items: [
      {
        q: 'データが消えた・ログインしたら空になった',
        a: 'YORAはGoogleアカウントにデータを紐づけています。別のGoogleアカウントでログインしていないか確認してください。同じアカウントで再ログインすればデータは戻ります。',
      },
      {
        q: 'LINEから開いたらPWAインストールできない',
        a: 'LINEのブラウザはPWAに対応していません。\n\niPhone：右上メニュー →「Safariで開く」→ 共有ボタン →「ホーム画面に追加」\nAndroid：右上メニュー →「外部ブラウザで開く」→ Chromeのメニュー →「ホーム画面に追加」',
      },
      {
        q: '入学年度を間違えた',
        a: 'プロフィール →「所属・入学年度」から変更できます。\n\n注意：変更すると全履修データがリセットされるため、変更前に必ず確認してください。',
      },
      {
        q: '卒業要件の数字がおかしい',
        a: 'プロフィール →「データ」→「卒業要件を再計算」を実行してみてください。それでも解決しない場合はお問い合わせください。',
      },
      {
        q: '表示されている教室が実際と違う',
        a: '授業の教室情報は大学の公式データをもとにしていますが、変更が反映されていない場合があります。\n\nお手数ですが、プロフィール →「お問い合わせ」から授業名・正しい教室名をご報告ください。確認のうえ修正します。',
      },
      {
        q: '授業がどうしても見つからない',
        a: 'まず以下をご確認ください。\n\n・カタログの年度フィルタが正しいか\n・単位を伴う正規授業かどうか（一部の授業・特別講義等は未掲載の場合があります）\n\n上記を確認してもなお見つからない場合は、プロフィール →「お問い合わせ」から授業名・開講年度をご報告ください。対応を検討します。',
      },
    ],
  },
]

// ── アコーディオンアイテム ─────────────────────────────────────────────────
function SectionAccordion({ section }) {
  const [open, setOpen]   = useState(false)
  const [openQ, setOpenQ] = useState(null)
  const { Icon } = section

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm">
      {/* セクションヘッダー */}
      <button
        onClick={() => { setOpen(v => !v); setOpenQ(null) }}
        className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-slate-700 transition-colors"
      >
        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
          <Icon />
        </span>
        <span className="flex-1 text-[14px] font-medium text-gray-800 dark:text-slate-100">
          {section.label}
        </span>
        <Icons.ChevronDown open={open} />
      </button>

      {/* Q&Aリスト */}
      {open && (
        <div className="divide-y divide-gray-100 dark:divide-slate-700">
          {section.items.map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenQ(openQ === i ? null : i)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-gray-50 dark:active:bg-slate-700 transition-colors"
              >
                <span className="flex-1 text-[13px] font-medium text-gray-700 dark:text-slate-300 leading-snug pt-0.5">
                  {item.q}
                </span>
                <Icons.ChevronDown open={openQ === i} />
              </button>
              {openQ === i && (
                <div className="px-4 pb-4 text-[12px] text-gray-500 dark:text-slate-400 leading-loose whitespace-pre-line bg-gray-50 dark:bg-slate-700/30">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 右スライドパネル（iOSの設定アプリ風）────────────────────────────────────
function HelpPanel({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-[80] bg-gray-50 dark:bg-[#14161f] flex flex-col"
      style={{ animation: 'helpSlideIn .25s cubic-bezier(0.4,0,0.2,1) both' }}
    >
      <style>{`
        @keyframes helpSlideIn {
          from { transform: translateX(100%) }
          to   { transform: translateX(0) }
        }
        @keyframes helpSlideOut {
          from { transform: translateX(0) }
          to   { transform: translateX(100%) }
        }
      `}</style>

      {/* ナビゲーションバー */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-white/[0.07]">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 active:opacity-60 transition-opacity"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-[14px] font-medium">戻る</span>
        </button>
        <h1 className="flex-1 text-center text-[15px] font-semibold text-gray-900 dark:text-white pr-12">
          使い方ガイド
        </h1>
      </div>

      {/* スクロールエリア */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {SECTIONS.map(section => (
          <SectionAccordion key={section.id} section={section} />
        ))}
        <p className="text-center text-[11px] text-gray-400 dark:text-slate-600 pt-1 pb-4">
          解決しない場合はお問い合わせください
        </p>
      </div>
    </div>
  )
}

// ── エントリ（ドロワー内） ────────────────────────────────────────────────
export default function HelpSection() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <DrawerSection label="ヘルプ">
        <DrawerItem
          icon={<Icons.Help />}
          label="使い方ガイド"
          sublabel="機能説明・よくある質問"
          chevron
          onPress={() => setOpen(true)}
        />
      </DrawerSection>

      {open && <HelpPanel onClose={() => setOpen(false)} />}
    </>
  )
}
