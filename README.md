# YORA — 東京学芸大学 履修管理アプリ

> 学芸が苦行を、学芸学業に。

**YORA** は東京学芸大学の学生が履修を管理するための非公式Webアプリです。
もちろん無料です ☀️

---

## このアプリが解決すること

大学の公式システムでは卒業要件の充足状況が把握しにくい。
YORAは学生が「あと何単位で卒業できるか」をリアルタイムで確認できるようにします。

---

## 主な機能

| 機能 | 説明 |
|---|---|
| 時間割 | 授業を曜日・時限で管理。ステータス（取得済み・落単等）を管理 |
| 卒業要件 | カテゴリ別に単位充足状況をリアルタイム確認。副免許・教職対応 |
| ダッシュボード | 取得単位の進捗サマリー |
| 空き部屋検索 | 今空いている教室を検索（ログイン不要） |
| カタログ | 開講授業の一覧・検索（閲覧専用。履修登録は時間割から） |
| **YORA ARCHIVE** | 卒業時に4年間の履修データをSpotify Wrapped風に振り返る |

---

## 技術スタック

- **Next.js** (App Router) + **TypeScript/JavaScript**
- **next-auth** (Google OAuth)
- **SWR** (データフェッチ・キャッシュ)
- **Tailwind CSS**
- **Google Sheets API** (データベース代替)
- **Vercel** (ホスティング)

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | **設計思想・開発ルール・機能別方針**（最重要） |
| `ARCHITECTURE.md` | システム構成・データフロー・API一覧・シート定義 |
| `CURRENT_STATE.md` | 実装済み機能・既知課題・次タスク |
| `CHANGELOG.md` | 重要な意思決定と変更理由 |

**新しい開発者は `CLAUDE.md` から読んでください。**

---

## 重要な設計原則（短縮版）

- `latestCourseYear`（courses の最大 academic_year）が「現在の年度」
- `bootstrapUserIfNeeded` に `.catch(() => [])` を書いてはいけない
- カタログから履修登録はできない（閲覧専用）
- 単位認定（recognized_courses）は enrollment とは独立した別シートで管理
- YORA ARCHIVE は単なる機能ではなく、YORAの集大成

---

## YORA ARCHIVE について

卒業ユーザーに提供する特別体験。4年間の履修データをストーリー形式で振り返ります。

- 起動条件：`latestCourseYear - enrollmentYear >= 4`（5年生判定）
- 再視聴：ProfileDrawer の「YORA ARCHIVE を見る」ボタン
- データ：`/api/graduation-story` で9スライド分を一括取得
- 保存・シェア：html2canvas で画像化 → Web Share API でSNS共有

---

## 開発環境

```bash
npm install
npm run dev
# → http://localhost:3000
```

環境変数（`.env.local`）:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_SERVICE_ACCOUNT_JSON=...
SPREADSHEET_ID=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

---

*非公式アプリです。大学との公式な関係はありません。*

---

## Getting Started (original)

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
