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
- **カタログ**：開講授業の一覧・検索（履修登録はここからではなく時間割から）

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
users              : email | student_id | department_id | curriculum_year
enrollment         : student_id | class_id | course_id | status | year | semester | academic_year | is_temporary | memo | id
course             : class_id | academic_year | normalized_time(例:MON_3) | classroom | instructor | 単位数 ...
students_summary   : student_id | department_id | カテゴリ別単位数...
GRADUATION_RESULT  : 卒業要件判定結果
leave_periods      : student_id | leave_start | leave_end
recognized_courses : student_id | course_id | academic_year | recognized_type | recognized_note | created_at
progress_auto      : student_id | class_id | course_id | ... | final_category | status（集計中間テーブル）
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

### 単位集計の二層構造
1. **クライアント集計**（`useCreditSummary`）：`selectedIds` + `recognized_courses` からリアルタイム計算。Dashboard・学年別表示に使用
2. **サーバー集計**（`progress_auto` → `students_summary`）：`updateProgressAuto` で計算・保存。卒業要件タブに使用。`/api/recalculate` で手動更新可能

---

## 6. 機能別思想

### デモモード
**思想：「全面ブロックはUXが悪い。機能を見せながら、使うにはログインが必要、という体験にする」**

- ログイン画面：Googleログイン + 「ログインせずに使う」ボタン
- デモモードで使えるタブ：空き部屋・カタログ（データは公開API）
- 時間割・卒業要件・ダッシュボードは実際の画面を表示しつつ、上部に `DemoBanner` で「ログインが必要」を促す
- `localStorage` の `rishu_demo_mode = '1'` で管理（sessionStorageではない。一度デモを選んだら次回も続きから）
- ログイン完了時にフラグを自動クリア

### カタログ（重要な制約）
**カタログは閲覧・検索のみ。履修登録はできない。**
時間割タブから授業を追加する。この原則を変えてはいけない。

### 単位認定（recognized_courses）
- `recognized_courses` シートに `course_id` で管理（class_id なし）
- クライアント集計：`useCreditSummary` の `recognizedCourses` パラメータで加算
- サーバー集計：`updateProgressAuto` の Route B で COMPLETED として `progress_auto` に追加
- **Route B のスキップ条件は「COMPLETED の enrollment がある場合のみ」**
  - AUDIT / FAILED / IN_PROGRESS は単位に含まれないためスキップしない
- 単位認定済みの授業を聴講(AUDIT)しても COMPLETED ステータスは上書きされない（`upsertEnrollment` でガード済み）
- 出席ベース統計（ヒートマップ・教室・学期タイプ等）には含めない

### 聴講・再履修の状態遷移
- COMPLETED または FAILED の履歴がある授業 → 追加時に ReEnrollModal が出現
- **単位認定済みの course_id** も同様に ReEnrollModal を表示（`shouldShowReEnrollModal` の第3引数）
- AUDIT → 単位なし、参加のみ
- RE_ENROLL → FAILED 歴が必要

### 年度更新・仮登録
**思想：「来年度の授業を今年度中に仮登録できる。年度が変わったら確定する」**

- `is_temporary = true` の enrollment は仮登録
- `latestCourseYear` が上がると移行モーダルが表示される
- ユーザーが確定 or 取り消しを選ぶ
- **入学年度変更は全履修データをリセットする**（ユーザーへ警告必須）

### セキュリティ（`bootstrapUserIfNeeded`）
**重大な教訓：APIエラー時に `.catch(() => [])` でシートを空配列と誤認し、新ユーザーを student_001 として上書きするバグがあった。修正済み。**

- APIエラー時は例外を投げて中断（絶対にシートに書かない）
- student_id の採番時はダブルチェック（二重登録防止）

---

## 7. YORA ARCHIVE — YORAの集大成

### 思想・位置づけ
**「YORAはただの管理ツールじゃない。4年間の学びの相棒だった。卒業するときに、その軌跡を一緒に振り返ろう」**

YORA ARCHIVE は単なる機能追加ではなく、**YORAというプロダクトの集大成**。
Spotify Wrapped のように、4年間のデータをストーリー形式で振り返る体験。
SNSでシェアしてもらうことで、YORAの宣伝にもなる（ユーザーが広める構造）。

### 起動フロー
1. `latestCourseYear - enrollmentYear >= 4` で5年生判定
2. 年度更新時に「卒業しましたか？」ダイアログ表示
3. Yes → `yora_archive_unlocked_${studentId}` を localStorage に保存 → ARCHIVE 起動
4. ProfileDrawer から何度でも再視聴可能（毎回 fresh fetch）
5. 運命の先生・メッセージは `yora_fated_${studentId}` にキャッシュして固定

### データ方針
| 統計 | 対象 | 除外 |
|---|---|---|
| 取得単位数・取得率（分子） | COMPLETED のみ | — |
| 総履修授業数・取得率（分母） | FAILED含む全部（非仮登録） | 単位認定 |
| ヒートマップ・教室・学期・学年 | FAILED含む全部 | **単位認定**（出席していないため） |
| 運命の人 | FAILED含む全部 | **単位認定** |

### normalized_time のフォーマット
course シートの時間情報は `MON_3`（英語略称_時限）形式。
複数コマの場合は `MON_3 WED_1` のように空白区切り。

### デザイン思想
- クリーム × ネイビー × ゴールドの証書スタイル
- 絵文字なし（高級感を守る）
- YORAロゴを常に表示（「YORAと一緒に」という感覚を強化）
- html2canvas でスライド⑨を画像保存 + Web Share API でSNS共有

### html2canvas の注意点
- `transparent` を含む gradient は 0×0 canvas を生成してクラッシュする
- 保存対象（save-target）内では `Ornament` の代わりに `SolidOrnament`（グラデーションなし）を使う
- `FadeUp`（transform アニメーション）も save-target 内では使わない

---

## 8. 重要な注意事項（触ってはいけないこと）

- **`bootstrapUserIfNeeded` の `.catch(() => [])` は絶対に復活させない**（既存データ上書きバグの原因）
- **`latestCourseYear` が「現在の年度」**。`new Date().getFullYear()` を使わない
- **水曜は3限まで**（UIのヒートマップ・時間割で4・5限を非活性化）
- **1授業 = 100分**（固定。変更不可）
- **単位取得率は授業数ベース**（単位数の合計ではない）
- **デモモードは localStorage**（sessionStorage に変えないこと。意図的にタブを閉じても続く仕様）
- **カタログからの履修登録は不可**（閲覧専用）
- **Route B の認定スキップは COMPLETED のみ**（AUDIT/FAILED でスキップしない）

---

## 9. ファイル構成（主要）

```
app/
  page.jsx                         # メインページ。全タブ・全状態管理
  api/
    catalog/route.js               # 公開（認証不要）
    data/route.js                  # 全データ一括取得
    enrollment/route.js            # 履修登録系
    graduation/ui/route.js         # 卒業要件UI用データ
    graduation-story/route.js      # YORA ARCHIVE 統計API
    recalculate/route.js           # 卒業要件再計算
    recognized-courses/route.js    # 単位認定CRUD
    users/route.ts                 # ユーザー情報
components/
  graduation/
    GraduationArchiveModal.jsx     # ARCHIVEメインモーダル
    SlideLayout.jsx                # 共通コンポーネント（Slide, Card, FadeUp等）
    slides/                        # 9枚の各スライド
    hooks/                         # useSlotCount, useSlideVisible
  drawer/
    ProfileDrawer.jsx
    sections/
      HelpSection.jsx              # 使い方ガイド（右スライドパネル）
      DataSection.jsx              # 再計算ボタン含む
      ShareSection.jsx
lib/
  sheets.js                        # Google Sheets 全操作（bootstrapUserIfNeeded修正済み）
  transform.ts                     # データ正規化
  useCreditSummary.js              # クライアント単位集計（recognized_courses 対応済み）
  enrollmentStatus.ts              # 状態遷移ルール（recognized対応済み）
  graduationMessages.js            # ARCHIVE用メッセージ181件
public/
  graduation-preview.html          # ARCHIVEデザインカンプ（HTMLスタティック版）
```
