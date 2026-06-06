# YORA — 意思決定ログ・変更履歴

> 「なぜその設計なのか」を残すための記録。コードのコミット履歴ではなく、設計判断の記録。

---

## 2026-05

### YORA ARCHIVE 実装

**意思決定：単位認定を出席ベース統計から除外**
- 単位認定は授業に出席せずに取得するもの
- ヒートマップ・教室・学期タイプ・運命の人は「通った事実」ベースの統計
- 認定科目を含めると「通っていない教室が最多」になる可能性がある
- → `attendedWithCourse`（認定除外）と `completedWithCourse`（全COMPLETED）を分離

**意思決定：学年別・学期タイプを授業数ベースに変更**
- 単位数ベースにすると4単位授業と2単位授業で差が出てしまい「忙しさ」を正確に反映しない
- 「どれだけ授業に出たか」という実感には授業数の方が合致する

**意思決定：通年授業を学期タイプから除外**
- 通年授業は春・秋両方にまたがるため春秋の比較に含めると不正確
- `c.term_code === 'FULL_YEAR'` で確実に除外（enrollment の semester 列依存より信頼性が高い）

**意思決定：運命の先生を完全ランダムに（頻度重み付けなし）**
- 単独担当優先案もあったが、ユーザーにとって印象的な先生が回数と一致するとは限らない
- 履修した授業からランダムに選ぶことで「縁」の意外性を演出

**意思決定：運命の先生・メッセージを localStorage にキャッシュ**
- ARCHIVE を開くたびに変わると「運命の人」という概念が崩れる
- 1人に固定することで感情的な重みが増す
- `yora_fated_${studentId}` に JSON で保存

**意思決定：保存画像に FadeUp を使わない**
- html2canvas は CSS transform（translateY等）を保存時に誤って処理する
- save-target 内の FadeUp を素の div に置き換えることで解決
- 同様に gradient の `transparent` も `rgba(250,246,239,0)` に変換が必要

**意思決定：Ornament を SolidOrnament に変更（save-target内）**
- html2canvas の既知バグ：gradient 内の `transparent` が 0×0 canvas を生成してクラッシュ
- onclone での一括置換も試みたが inline style のみ対象で class-based は補足できず
- save-target 内専用の `SolidOrnament`（solid color ライン）を作成して根本解決

---

### 単位認定バグ修正

**バグ：AUDIT が COMPLETED を上書きする（`upsertEnrollment`）**
- `upsertEnrollment` は `student_id + class_id` でupsertするため、認定済みCOMPLETED行をAUDITで上書きしていた
- 修正：`status === 'AUDIT' && existingStatus === 'COMPLETED'` の場合はステータス更新をスキップ

**バグ：AUDIT 登録で recognized_courses の単位が消える（`updateProgressAuto` Route B）**
- Route B：`!enrolledCourseIds.has(cid)` → AUDITのenrollmentがあるとRoute Bをスキップ
- AUDITはCOMPLETEDではないので `students_summary` に計上されない
- → 認定クレジットが消える
- 修正：スキップ条件を `!completedEnrolledCourseIds.has(cid)`（COMPLETEDのみ）に変更

**バグ：Dashboard に recognized_courses が反映されない（`useCreditSummary`）**
- 旧コメント「recognized=TRUE の授業は enrollment! 経由で集計」は現行アーキテクチャでは誤り
- `recognized_courses` は enrollment とは独立したシートで管理
- `useCreditSummary` が `selectedIds`（enrollment）しか参照していなかったため recognized 分が未計上
- 修正：`recognizedCourses` パラメータを追加し Step 2.5 として直接加算

---

### 聴講・単位認定の UX 統合

**意思決定：単位認定済みの授業を聴講するときは「取得→聴講」UX を流用**
- 認定済みコースに ReEnrollModal を表示（AUDIT のみ選択可、RE_ENROLL はグレーアウト）
- `shouldShowReEnrollModal` の第3引数に `recognizedCourseIds` を追加して実現
- 新しいモーダルを作るより既存UXを流用する方がユーザーへの学習コストが低い

---

### ヘルプ機能

**意思決定：ドロワー内ボタン1つ + 右スライドパネル**
- iOSの設定アプリと同じナビゲーションパターン
- ボトムシートより「別画面に進んだ感」があり、多い情報量に適している
- DrawerSection / DrawerItem と同じSVGアイコン・グレー系で統一（絵文字なし）

**意思決定：再計算ボタンを DataSection に追加**
- 「計算がおかしい」という問い合わせへの対処として
- ユーザーが自己解決できる導線を用意する

---

### 卒業要件 key 重複バグ

**バグ：同一カテゴリ名が複数存在すると React key エラー**
- `key={item.category || item.display_name}` が一意でなかった
- 修正：`key={`${item.category}_${item.display_name}_${idx}`}` に変更

---

## 設計原則（変えてはいけないもの）

1. **latestCourseYear を現在年度として使う**（`new Date().getFullYear()` を使わない）
2. **bootstrapUserIfNeeded は絶対に `.catch(() => [])` を復活させない**
3. **カタログからの履修登録は不可**（閲覧専用）
4. **デモモードは localStorage**（sessionStorage ではない）
5. **水曜は3限まで、1授業=100分**（固定仕様）
6. **Route B のスキップは COMPLETED のみ**（AUDIT 等でスキップしない）
