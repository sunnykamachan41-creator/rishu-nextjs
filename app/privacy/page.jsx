'use client'
import { useRouter } from 'next/navigation'

function BackButton({ onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400
                 text-[14px] font-semibold active:opacity-60 transition-opacity">
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
      </svg>
      戻る
    </button>
  )
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-[15px] font-bold text-gray-900 dark:text-slate-100 mb-3 border-b border-gray-100 dark:border-white/[0.07] pb-2">
        {title}
      </h2>
      <div className="text-[13px] text-gray-600 dark:text-slate-400 leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPage() {
  const router = useRouter()

  return (
    <div
      className="flex flex-col bg-[#f1f5f9] dark:bg-[#111318]"
      style={{ height: '100dvh', overflow: 'hidden', maxWidth: '430px', margin: '0 auto' }}
    >
      {/* ヘッダー */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <BackButton onClick={() => router.back()} />
        <h1 className="text-[15px] font-bold text-gray-900 dark:text-slate-100">プライバシーポリシー</h1>
      </div>

      {/* 本文（スクロール可） */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 py-6">
          <div className="bg-white dark:bg-[#1a1d27] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-white/[0.07]">
            <p className="text-[12px] text-gray-400 dark:text-slate-500 mb-6">
              制定：2026年5月29日
            </p>

            <Section title="第1条　取得する情報">
              <p>本サービスは以下の情報を取得します。</p>
              <ul className="list-disc list-inside space-y-1 pl-1 mt-1">
                <li>Googleアカウント情報（メールアドレス・表示名・プロフィール画像）</li>
                <li>ユーザーが登録した履修情報（授業名・単位数・成績ステータス等）</li>
                <li>専攻・入学年度・カリキュラム年度などのプロフィール情報</li>
                <li>利用規約・プライバシーポリシーへの同意日時</li>
              </ul>
            </Section>

            <Section title="第2条　利用目的">
              <p>取得した情報は以下の目的にのみ使用します。</p>
              <ul className="list-disc list-inside space-y-1 pl-1 mt-1">
                <li>ユーザーの認証・識別</li>
                <li>履修情報・卒業要件の管理・表示</li>
                <li>サービスの改善・不具合対応</li>
              </ul>
            </Section>

            <Section title="第3条　保存方法">
              <p>情報はGoogleスプレッドシート（Google Workspace）に保存されます。Googleのセキュリティポリシーに準拠した環境で管理されます。</p>
              <p>一部の設定情報は端末のローカルストレージにも保存されます。</p>
            </Section>

            <Section title="第4条　第三者提供">
              <p>取得した個人情報を、法令に基づく開示が必要な場合を除き、第三者に提供することはありません。</p>
            </Section>

            <Section title="第5条　Cookieの利用">
              <p>本サービスはGoogleログイン（NextAuth.js）のセッション管理のためにCookieを使用します。ブラウザの設定によりCookieを無効にすることができますが、その場合ログイン機能が利用できなくなります。</p>
            </Section>

            <Section title="第6条　データの削除">
              <p>登録データの削除をご希望の場合は、以下の方法で対応します。</p>
              <ul className="list-disc list-inside space-y-1 pl-1 mt-1">
                <li>アプリ内「全データを削除」機能から、履修データを自分で削除できます</li>
                <li>アカウント情報を含む全データの削除をご希望の場合は、下記のメールアドレスまでご連絡ください。7日以内に対応します</li>
              </ul>
            </Section>

            <Section title="第7条　ポリシーの変更">
              <p>本ポリシーは必要に応じて変更することがあります。重要な変更がある場合は、アプリ内でお知らせします。</p>
            </Section>

            <Section title="第8条　問い合わせ先">
              <p>個人情報の取り扱いに関するお問い合わせは以下までご連絡ください。</p>
              <p className="mt-1">
                <a href="mailto:kamaseyou@gmail.com"
                   className="text-indigo-600 dark:text-indigo-400 underline">
                  kamaseyou@gmail.com
                </a>
              </p>
            </Section>

            <p className="text-[11px] text-gray-400 dark:text-slate-500 text-right mt-4">
              以上
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
