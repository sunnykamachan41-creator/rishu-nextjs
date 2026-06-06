# YORA — アーキテクチャドキュメント

---

## システム全体像

```
[ユーザー（スマホ）]
      │ HTTPS
      ▼
[Vercel / Next.js App Router]
      │
      ├── /app/page.jsx          ← SPA本体（全タブ共有状態）
      ├── /app/api/*             ← APIルート群
      │
      ▼
[Google Sheets API]              ← データベース代替
      │
      └── スプレッドシート（複数シート）
```

---

## データフロー

### 通常の画面表示
```
page.jsx
  └─ useSWR('/api/data')
       └─ fetchAllSheets(studentId)     ← enrollment, courses, users等を一括取得
            └─ Google Sheets API
```

### 履修登録
```
ユーザー操作
  └─ handleStatusChange()          ← page.jsx
       ├─ mutate(optimistic update) ← SWR楽観更新（即座にUI反映）
       └─ POST /api/enrollment
            └─ upsertEnrollment()   ← sheets.js（class_id ベースのupsert）
                 └─ Google Sheets API
```

### 単位認定登録
```
ExemptionModal
  └─ POST /api/recognized-courses (action: 'add')
       ├─ upsertRecognizedCourse()
       ├─ updateProgressAuto()      ← Route A（enrollment）+ Route B（recognized）
       ├─ updateStudentsSummary()   ← progress_auto → students_summary
       └─ recalculateGraduation()
```

### 卒業要件表示
```
GraduationTabV2
  └─ useSWR('/api/graduation/ui')
       └─ fetchStudentsSummaryAll()  ← students_summary シートから取得
            ※ updateProgressAuto 実行後に最新化される
```

### Dashboard単位集計
```
Dashboard
  └─ creditSummary（props）
       └─ useCreditSummary({
            courses,            ← /api/data から
            selectedIds,        ← enrollment（COMPLETED）
            recognizedCourses,  ← /api/data から（recognized_courses）
          })
```

---

## スプレッドシート一覧

| シート名 | 役割 | 主なカラム |
|---|---|---|
| `users` | ユーザー登録・学生ID管理 | email, student_id, department_id, curriculum_year |
| `enrollment` | 履修登録（メインデータ） | student_id, class_id, course_id, status, year, semester, academic_year, is_temporary, memo, id |
| `course` | 授業マスタ | class_id, academic_year, normalized_time(MON_3形式), room, class(教室), intructor, credits, term, tags, ... |
| `recognized_courses` | 単位認定 | student_id, course_id, academic_year, recognized_type, recognized_note |
| `progress_auto` | 集計中間テーブル | student_id, class_id, course_id, final_category, status, credits, ... |
| `students_summary` | 卒業要件用集計結果 | student_id, department_id, カテゴリ別単位数 |
| `GRADUATION_RESULT` | 卒業判定結果 | — |
| `leave_periods` | 休学期間 | student_id, leave_start, leave_end |
| `curriculum_mapping` | カリキュラム対応表 | — |
| `graduation_ui` | 卒業要件UI定義 | display_name, ui_group, order |
| `graduation_rules` | 卒業要件ルール | category, required_credits, condition |

### courseシートの注意点
- `normalized_time` カラムが時間情報。形式は `MON_3`（英語略称_時限）
- 複数コマは `MON_3 WED_1` のように空白区切り
- `曜日`・`時限` の独立列は存在しない（旧仕様の名残でフィールドが散在）
- `intructor`（typo）が正式カラム名（instructor も fallback で読む）

---

## APIルート一覧

| エンドポイント | メソッド | 認証 | 説明 |
|---|---|---|---|
| `/api/data` | GET | 必要 | 全データ一括取得（courses, enrollment, users等） |
| `/api/enrollment` | POST | 必要 | 履修登録・ステータス変更・削除 |
| `/api/enrollment/batch` | POST | 必要 | 一括ステータス変更 |
| `/api/enrollment/bulk-status` | POST | 必要 | 複数授業の一括操作 |
| `/api/catalog` | GET | **不要** | 授業カタログ（公開） |
| `/api/recognized-courses` | GET/POST | 必要 | 単位認定CRUD |
| `/api/graduation/ui` | GET | 必要 | 卒業要件UI用データ |
| `/api/graduation/recalculate` | POST | 必要 | 卒業要件再計算 |
| `/api/recalculate` | POST | 必要 | progress_auto → students_summary 再計算 |
| `/api/graduation-story` | GET | 必要 | YORA ARCHIVE 統計データ（9スライド分） |
| `/api/users` | GET/POST | 必要 | ユーザー情報取得・更新 |
| `/api/profile` | GET/POST | 必要 | プロフィール操作 |
| `/api/attendance` | GET/POST | 必要 | 出席管理 |
| `/api/leave-periods` | GET/POST | 必要 | 休学期間管理 |
| `/api/pre-enrollment/migrate` | POST | 必要 | 仮登録→本登録移行 |
| `/api/graduation-preview` | GET | **不要** | ARCHIVEデザインカンプHTML（開発用） |

---

## 重要な集計ロジック

### `updateProgressAuto` の Route A / Route B

```
Route A: enrollment × course JOIN
  → 全enrollment行を progress_auto に書き込み（ステータスそのまま）

Route B: recognized_courses
  → COMPLETEDのenrollmentに同一course_idがある場合のみスキップ
  → それ以外（AUDIT/FAILED/未登録）は progress_auto に status='COMPLETED' で追加
  → 二重計上防止はCOMPLETEDのみが対象（AUDIT等はスキップしない）
```

### `useCreditSummary` のデータソース
```
1. enrollment の COMPLETED → selectedIds → courses カタログで補完
2. recognized_courses → courseMapById で credits を補完
3. 両者を course_id でデデュープして合算
```

### YORA ARCHIVE の統計対象
```
allReal         = enrollment（非仮登録・全ステータス）
completed       = enrollment（COMPLETED のみ）
attendedWithCourse     = allReal - 単位認定科目（ヒートマップ・教室・学期に使用）
completedAttendedWithCourse = completed - 単位認定科目（学年別・学期タイプに使用）
```

---

## LocalStorage キー一覧

| キー | 内容 |
|---|---|
| `rishu_demo_mode` | デモモードフラグ（'1'） |
| `rishu_enrollment_year` | 入学年度 |
| `rishu_last_migrated_year_${studentId}` | 年度更新チェック用 |
| `yora_archive_unlocked_${studentId}` | YORA ARCHIVEアンロックフラグ |
| `yora_fated_${studentId}` | ARCHIVE：運命の人キャッシュ（JSON） |
| `rishu_enrollment_entries_${year}_${sem}` | 時間割エントリ（localStorage） |
