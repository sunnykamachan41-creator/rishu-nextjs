@AGENTS.md

---

# YORA — プロジェクト完全引き継ぎドキュメント

> このドキュメントは新任の開発者・Claude が YORA というアプリを「ゼロから理解」できるよう書かれています。
> 技術仕様だけでなく、なぜそう作るのかという「思想」も含みます。

---

## 1. YORAとは何か

### 一言で
**東京学芸大学の学生が、自分の履修を管理するための非公式Webアプリ。**

### 背景・問題意識
東京学芸大学では、大学の公式システムが履修管理に不便で、
学生が自分の卒業要件の充足状況を把握しにくい状況がある。
YORAはそれを補う目的で作られた非公式ツール。

### 何ができるか
- **時間割**：履修している授業を曜日・時限で管理
- **卒業要件**：現在の履修で卒業・免許取得に何単位足りないかリアルタイム確認
- **ダッシュボード**：単位取得の進捗サマリー
- **空き部屋検索**：今空いている教室を探せる
- **カタログ**：開講授業の一覧・検索

### 重要な前提
- **非公式**：大学が作っているわけではない。学生・開発者が作った草の根ツール
- **無料**：完全無料。「もちろん無料です ☀️」という文言を大切にしている
- **スマホ主体**：学生はスマホで使う。PCで使うことは想定するが優先度は低い
- **PWA**：ホーム画面に追加してアプリとして使ってほしい。インストール促進が重要
- **Google Sheets がデータベース**：Supabase等の本格DBは使っていない。全データはGoogleスプレッドシートに保存

---

## 2. ユーザー像

### 主なユーザー
- 東京学芸大学の現役学生（1〜4年生）
- 主に教育学部（複数の専攻がある）
- スマートフォン（iPhone Safari, Android Chrome）で使用
- LINEやInstagramで友達にシェアする文化

### ユーザーの行動パターン
- 授業登録期間（学期初め）に集中して使う
- 日常的には空き部屋検索や単位確認に使う
- LINE/Instagramのリンクからアクセスすることが多い → **アプリ内ブラウザ問題がある**

### アプリ内ブラウザ問題
LINEやInstagramのブラウザはPWAインストールに非対応。
そのためPWAプロンプトには「Safariで開く手順」を丁寧に案内する必要がある。

---

## 3. 技術スタック

| 技術 | 用途 |
|---|---|
| Next.js (App Router) | フレームワーク |
| next-auth (Google OAuth) | 認証（Googleアカウントのみ） |
| SWR | データフェッチ・キャッシュ |
| Tailwind CSS | スタイリング |
| Google Sheets API | データベース代わり |
| Vercel | ホスティング |

### 認証フロー
1. Googleでログイン
2. `bootstrapUserIfNeeded(email)` で usersシートに行を確保
3. `student_id`（例：`student_001`）を発番してJWTに保存
4. 以降の全API呼び出しで `student_id` を使ってデータを識別

### データ構造（スプレッドシート）
```
users           : email | student_id | department_id | curriculum_year
enrollment      : student_id | class_id | course_id | status | year | semester | academic_year | is_temporary | memo | id
course          : class_id | academic_year | 曜日 | 時限 | classroom | instructor | 単位数 ...
students_summary: student_id | department_id | カテゴリ別単位数...
GRADUATION_RESULT: 卒業要件判定結果
leave_periods   : student_id | leave_start | leave_end
recognized_courses: 単位認定情報
```

---

## 4. UIデザインの思想

### 全体の世界観
**「学生の手帳」をイメージした、落ち着いたプロフェッショナルなデザイン。**
派手さよりも信頼感・使いやすさ。

### カラーパレット
```
インディゴ : #4f46e5（ブランドカラー・アクション系）
ネイビー   : #1e2d4e（テキスト・重要要素）
ホワイト   : #ffffff（背景・カード）
グレー系   : #94a3b8（サブテキスト）
ダーク背景 : #0e1120（ダークモード）
```

### フォント
- `League Spartan` : YORAブランド名・数字・英字ラベル。力強さを出す
- `Noto Sans JP`   : 本文・UI文字
- `Noto Serif JP`  : 重要な見出し（証書・アーカイブ系）

### UIコンポーネントの作り方
- **カード**：`rounded-2xl`、`border`、`shadow-sm` が基本
- **ボタン（アクション）**：インディゴ背景・白文字・`rounded-2xl`
- **シート（ボトムシート）**：`animate-slide-up` / `animate-slide-down`、ハンドル付き
- **ダークモード**：`dark:` プレフィックスで全コンポーネントに対応

### 絵文字の扱い
- 通常のUIには使わない（プロフェッショナル感を保つ）
- ただしメッセージ系（お知らせ、卒業メッセージ等）は使ってよい
- 「もちろん無料です ☀️」など感情を伝えたい場面では使う

### アニメーション
- `active:scale-[0.98]` や `active:scale-95` で押した感を出す
- `transition-all` を多用
- ボトムシートは slide-up/slide-down アニメーション

---

## 5. アーキテクチャの思想

### `page.jsx` が太い理由
メインの `app/page.jsx` に多くのロジックが集中しているのは意図的。
全タブが同一ページで状態を共有しており、タブ間でデータを渡す必要があるため。
コンポーネント分割は見た目（DrawerSection等）に留め、状態管理は page.jsx に集約。

### `latestCourseYear` の概念
`courses` の `academic_year` の最大値。
アプリ内の「現在の年度」として機能する。`new Date().getFullYear()` ではなくこれを使う。
- 仮登録判定：`academicYear > latestCourseYear` なら仮登録
- 入学年度選択肢：2023 〜 `latestCourseYear`
- 年度更新通知：`storedYear < latestCourseYear` で検出

### SWRのキャッシュ戦略
- 主要データは `/api/data` で一括取得（`fetchAllSheets`）
- enrollment 変更後は `mutate()` でキャッシュ更新
- `revalidateOnFocus: false` が多い（授業中に使うので画面切り替えで再取得しない）

---

## 6. 機能別思想

### デモモード
**思想：「全面ブロックはUXが悪い。機能を見せながら、使うにはログインが必要、という体験にする」**

- ログイン画面：Googleログイン + 「ログインせずに使う」ボタン
- デモモードで使えるタブ：空き部屋・カタログ（データは公開API）
- 時間割・卒業要件・ダッシュボードは実際の画面を表示しつつ、上部に `DemoBanner` で「ログインが必要」を促す
- `localStorage` の `rishu_demo_mode = '1'` で管理（sessionStorageではない。一度デモを選んだら次回も続きから）
- ログイン完了時にフラグを自動クリア

### シェア機能（リード獲得）
**思想：「ユーザーがSNSでシェアすることで自然に広まる」**

- ProfileDrawer 内の ShareSection（ログイン済みユーザー）
- デモモードのヘッダー右ボタン（未ログインユーザーも共有できる = リード獲得）
- Web Share API でモバイルはネイティブシート → LINE/Instagramへ直接シェア可能

### PWAインストール促進
**思想：「スマホアプリとして使ってほしい。ブラウザで使うのは体験が落ちる」**

- ログイン後・オンボーディング後に一度だけ表示
- デスクトップには表示しない
- アプリ内ブラウザ（LINE/Instagram等）を検出して「Safariで開いてください」を丁寧に案内
- iOS Chrome / Firefox も Safari 誘導

### 年度更新・仮登録
**思想：「来年度の授業を今年度中に仮登録できる。年度が変わったら確定する」**

- `is_temporary = true` の enrollment は仮登録
- `latestCourseYear` が上がると移行モーダルが表示される
- ユーザーが確定 or 取り消しを選ぶ

### セキュリティ（`bootstrapUserIfNeeded`）
**重大な教訓：APIエラー時に `.catch(() => [])` でシートを空配列と誤認し、新ユーザーを student_001 として上書きするバグがあった。修正済み。**

- APIエラー時は例外を投げて中断（絶対にシートに書かない）
- student_id の採番時はダブルチェック（二重登録防止）
- student_id 競合時は再採番

---

## 7. YORA ARCHIVE（卒業モード）— 開発中

### 思想・コンセプト
**「YORAはただの管理ツールじゃない。4年間の学びの相棒だった。卒業するときに、その軌跡を一緒に振り返ろう」**

Spotify Wrapped のように、4年間のデータをストーリー形式で振り返る体験。
数字の羅列ではなく、感情に訴えるデザイン。
「YORAと一緒に4年間歩んできた」という感覚を最後に演出する。

SNSでシェアしてもらうことで、YORAの宣伝にもなる（ユーザーが広める構造）。

### 起動タイミング
5年生になったタイミング（年度更新時）に「卒業しましたか？」を確認して起動。

### デザイン思想
- **証書感・高級感**：大学の卒業証書をモチーフにした美しいデザイン
- **クリーム × ネイビー × ゴールド**：落ち着きと格調
- **絵文字は使わない**：高級感を守る（運命の人のメッセージ内は例外）
- **YORAロゴを常に視認できる位置に**：「YORAと一緒に」という感覚を強化
  - 各スライド下部に大きめのYORAロゴ（46px）をドーンと配置
  - 総括カード（保存用）の中にもYORAロゴを入れる（保存・シェアした先でも見える）

### スライド構成（9枚）

| # | タイトル | 内容 |
|---|---|---|
| ① | イントロ | 証書スタイル。アカウント名+殿、学科、入学年度、年度範囲 |
| ② | 4年間の履修記録 | 総授業数・総取得単位数（大きな数字） |
| ③ | 単位取得率 | 円グラフ。X授業のうちY授業取得（授業数ベース。フル単時は特別メッセージ） |
| ④ | 最も過ごした時間 | 曜日×時限ヒートマップ。5限まで・水曜3限まで |
| ⑤ | 最も多く通った教室 | 教室名・通った回数・授業数×100分→日数換算 |
| ⑥ | 最も忙しかった学年 | 学年別単位数の横棒グラフ |
| ⑦ | あなたの学期タイプ | 春合計 vs 秋合計。春多→「春に燃えるタイプ」、秋多→「秋に深まるタイプ」 |
| ⑧ | 運命の人 | ランダム教員 + メッセージ。単独担当の授業を優先 |
| ⑨ | 総括カード（保存用） | 全データ + YORAロゴ + 画像保存ボタン |

### データソース
```
classroom フォーマット : N203 → N棟（先頭英字）+ 203教室（数字）
instructor 列名       : instructor（複数時は「・」「、」等で区切り）
1授業の時間          : 100分（固定仕様）
時限制約             : 5限まで。水曜は3限まで
```

### 重要な計算
- **過ごした時間**：`通い回数 × 100分` → 日数・時間に換算
  - 128回 × 100分 = 12,800分 = 8日と21時間
- **単位取得率**：授業数ベース（単位数ではない）
  - `取得した授業数 / 履修した授業数 × 100`
- **学期タイプ**：春学期合計単位 vs 秋学期合計単位

### 学期タイプのメッセージ
- **春型**：「桜の季節が来ると自然と気持ちが高まり、学びへのエンジンがかかるタイプ。春の陽気とともに、あなたの4年間は確かに動き出していました。」
- **秋型**：「澄んだ秋空の下で本領を発揮するタイプ。涼しさとともに集中力が高まり、あなたの学びは秋に深まっていました。」

### 「運命の人」のメッセージ（181件）
`lib/graduationMessages.js` に保存予定（未作成）。
`graduation_message.txt`（C:\Users\Owner\Downloads\）から取り込む。
面白くて少しズレた教員目線のメッセージ集。ランダム選択。

### 保存機能
- `#save-target` div（スライド⑨の画像化エリア）を `html2canvas` でキャプチャ
- 保存ボタン・ドットは save-target の外に置く（画像に含めない）
- `html2canvas` は未インストール → `npm install html2canvas` が必要

### デザインカンプ
- `public/graduation-preview.html` に完成済みHTMLカンプ（9スライド全部）
- `app/api/graduation-preview/route.js` でブラウザから確認可能（開発用）
- `http://localhost:3000/api/graduation-preview` でプレビュー

---

## 8. このセッションで完了した作業

### デモモード（ゲストモード）実装
- 「ログインせずに使う」ボタン追加
- `localStorage` の `rishu_demo_mode` で状態管理
- デモ用のSWR（`/api/catalog` を公開化）
- DemoBanner・GuestLockOverlay・LoginSheetコンポーネント

### セキュリティ修正（重大）
- `bootstrapUserIfNeeded` のAPIエラー時上書きバグを修正
- `student_id` 採番の競合対策

### シェア機能
- `components/drawer/sections/ShareSection.jsx` 新規作成・ProfileDrawerに追加
- デモモードヘッダーにもシェアボタン追加

### PWAプロンプト改善
- アプリ内ブラウザ（LINE/Instagram等）の検出と丁寧な手順表示
- デスクトップでは非表示

### 入学年度選択肢の修正
- 2023〜MAX(academic_year) に限定
- `maxAcademicYear` を page.jsx から EnrollmentYearModal まで伝播

### YORA ARCHIVEのデザインカンプ完成
- 9スライドのHTMLプレビュー完成
- `public/graduation-preview.html`

---

## 9. 次のセッションでやること（優先順）

1. **`lib/graduationMessages.js` 作成**
   ```js
   // graduation_message.txt（Downloads）の181件を配列に
   export const GRADUATION_MESSAGES = [
     "卒業おめでとう😊😊😊。社会人になるそうですね...",
     // ...181件
   ]
   ```

2. **`app/api/graduation-story/route.js` 作成**
   - enrollment × course JOIN で全統計を計算
   - 1レスポンスで全9スライド分のデータを返す

3. **Reactコンポーネント化**
   - `app/graduation/page.jsx` または既存ページ上のモーダル
   - `public/graduation-preview.html` のデザインを忠実にReact化

4. **html2canvas 導入**
   - `npm install html2canvas`
   - 総括カードの保存ボタン実装

5. **5年生判定・起動フロー**
   - 年度更新モーダルに「卒業しましたか？」を追加
   - Yes → YORA ARCHIVE 起動

---

## 10. 重要な注意事項（触ってはいけないこと）

- **`bootstrapUserIfNeeded` の `.catch(() => [])` は絶対に復活させない**（既存データ上書きバグの原因）
- **`latestCourseYear` が「現在の年度」**。`new Date().getFullYear()` を使わない
- **水曜は3限まで**（UIのヒートマップ・時間割で4・5限を非活性化）
- **1授業 = 100分**（固定。変更不可）
- **単位取得率は授業数ベース**（単位数の合計ではない）
- **デモモードは localStorage**（sessionStorage に変えないこと。意図的にタブを閉じても続く仕様）

---

## 11. ファイル構成（主要）

```
app/
  page.jsx                         # メインページ。全タブ・全状態管理
  api/
    catalog/route.js               # 公開（認証不要）
    data/route.js                  # 全データ一括取得
    users/route.ts                 # ユーザー情報
    enrollment/...                 # 履修登録系
    graduation-preview/route.js    # プレビューHTML配信（開発用）
    graduation-story/route.js      # ★未作成
components/
  drawer/
    ProfileDrawer.jsx
    sections/
      ShareSection.jsx             # ★新規作成済み
      AffiliationSection.jsx
      AuthSection.jsx
      SupportSection.jsx
    modals/
      EnrollmentYearModal.jsx      # ★修正済み（2023〜max）
  PwaInstallPrompt.jsx             # ★修正済み（アプリ内ブラウザ対応）
lib/
  sheets.js                        # ★bootstrapUserIfNeeded 修正済み
  graduationMessages.js            # ★未作成
public/
  graduation-preview.html          # ★完成済みデザインカンプ
  icons/icon-192.png               # YORAロゴ（ARCHIVEで使用）
```
