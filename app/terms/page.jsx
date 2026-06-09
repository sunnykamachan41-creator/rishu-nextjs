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

export default function TermsPage() {
  const router = useRouter()

  return (
    <div
      className="flex flex-col bg-[#f1f5f9] dark:bg-[#111318]"
      style={{ height: '100dvh', overflow: 'hidden', maxWidth: '430px', margin: '0 auto' }}
    >
      {/* ヘッダー */}
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1d27] border-b border-gray-100 dark:border-white/[0.07] px-4 py-3 flex items-center gap-3">
        <BackButton onClick={() => router.back()} />
        <h1 className="text-[15px] font-bold text-gray-900 dark:text-slate-100">利用規約</h1>
      </div>

      {/* 本文（スクロール可） */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 py-6">
          <div className="bg-white dark:bg-[#1a1d27] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-white/[0.07]">
            <p className="text-[12px] text-gray-400 dark:text-slate-500 mb-6">
              制定：2026年5月29日
            </p>

            <Section title="第1条　本サービスについて">
              <p>YORA（以下「本サービス」）は、東京学芸大学の学生が履修状況や卒業要件の充足状況を管理するための非公式Webアプリケーションです。</p>
              <p>本サービスは東京学芸大学とは一切関係がなく、個人が開発・運営する草の根プロジェクトです。</p>
            </Section>

            <Section title="第2条　免責事項">
              <p>本サービスが提供する卒業要件の判定・履修計画・単位数の集計はすべて参考情報です。</p>
              <p>最終的な履修登録・卒業要件の確認は、必ず大学の公式システムおよび指導教員にご確認ください。</p>
              <p>本サービスの情報を参考にした結果生じたいかなる損害についても、開発者は責任を負いません。</p>
            </Section>

            <Section title="第3条　サービスの変更・停止">
              <p>本サービスは予告なく仕様を変更し、または提供を停止することがあります。</p>
              <p>個人開発のため、継続的な運用を保証するものではありません。</p>
            </Section>

            <Section title="第4条　禁止事項">
              <p>以下の行為を禁止します。</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li>本サービスへの不正アクセス・過度な負荷をかける行為</li>
                <li>他者のアカウントを利用する行為</li>
                <li>本サービスを利用した商業目的の活動</li>
                <li>その他、法令または公序良俗に反する行為</li>
              </ul>
            </Section>

            <Section title="第5条　知的財産権">
              <p>本サービスのデザイン・コードに関する権利は開発者に帰属します。無断での複製・再配布を禁じます。</p>
            </Section>

            <Section title="第6条　規約の変更">
              <p>本規約は必要に応じて変更することがあります。重要な変更がある場合は、アプリ内でお知らせします。</p>
            </Section>

            <Section title="第7条　問い合わせ先">
              <p>本規約に関するお問い合わせは以下までご連絡ください。</p>
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
