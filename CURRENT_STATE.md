# YORA — 現在の実装状態

> 最終更新：2026-05-31

---

## 実装済み（本番稼働中）

### コア機能
- [x] Googleログイン / デモモード（ゲストモード）
- [x] 時間割タブ（コマ表示・授業追加・ステータス管理）
- [x] ステータス変更（個別・一括）
- [x] 卒業要件タブ（カテゴリ別・副免許・教職）
- [x] ダッシュボードタブ（進捗サマリー・グラフ）
- [x] 空き部屋検索タブ（認証不要）
- [x] カタログタブ（閲覧・検索のみ）

### 履修管理
- [x] 仮登録（来年度授業の事前登録）
- [x] 年度更新モーダル（latestCourseYear 変化時）
- [x] 聴講（AUDIT）・再履修（RE_ENROLL）
- [x] 単位認定（recognized_courses）
- [x] 単位認定済みコースの聴講UX（ReEnrollModal 流用）
- [x] 休学期間管理

### 単位集計
- [x] `useCreditSummary`：recognized_courses を含むクライアント集計
- [x] `updateProgressAuto` Route B：recognized_courses → COMPLETED で progress_auto
- [x] Route B のスキップ条件を COMPLETED のみに限定（AUDIT/FAILED はスキップしない）
- [x] AUDIT が COMPLETED を上書きしないガード（upsertEnrollment）

### ProfileDrawer
- [x] 所属・入学年度設定
- [x] 副免許登録
- [x] 単位認定（ExemptionModal）
- [x] 卒業要件再計算ボタン（DataSection）
- [x] 使い方ガイド（右スライドパネル、HelpSection）
- [x] シェア機能（ShareSection）
- [x] YORA ARCHIVE ボタン（アンロック後）

### YORA ARCHIVE
- [x] `lib/graduationMessages.js`（181件）
- [x] `/api/graduation-story/route.js`（9スライド分の統計）
- [x] `GraduationArchiveModal`（9スライド・スクロールスナップ）
- [x] 各スライドのアニメーション（スロットカウント・円グラフ・ヒートマップ・棒グラフ）
- [x] 画像保存（html2canvas）・SNSシェア（Web Share API）
- [x] 運命の先生のキャッシュ固定（localStorage）
- [x] 5年生判定・卒業確認ダイアログ
- [x] ProfileDrawer からの再視聴
- [x] 単位認定を出席ベース統計から除外
- [x] 通年授業（FULL_YEAR）を学期タイプから除外
- [x] MON_3 形式のヒートマップパース

### その他
- [x] PWAプロンプト（アプリ内ブラウザ検出・Safari/Chrome誘導）
- [x] 卒業要件 key 重複バグ修正（GraduationTabV2）

---

## 既知の課題・未対応

- [ ] ARCHIVE：実ユーザーデータでの全スライド確認（認定科目・通年授業含む）
- [ ] 画像保存の完全動作確認（SolidOrnament・FadeUp除去後）
- [ ] `graduation-preview.html` のアニメーション（プレビュー用HTMLカンプ）と Reactの差分整合

---

## 次に着手すべきタスク（優先順）

1. **YORA ARCHIVE の本番テスト**
   - 実ユーザーで全9スライドを確認
   - 画像保存・シェア動作確認
   - 単位認定・通年授業の除外が正しく機能しているか

2. **単位集計の整合性確認**
   - recognized_courses が dashboard と卒業要件タブで一致しているか
   - 聴講登録後に単位認定が維持されるか（`再計算` を実行して確認）

3. **CLAUDE.md のメンテナンス**
   - このセッションで発見した設計知見を定期的に更新

---

## テスト方法（開発者向け）

### ARCHIVE を強制起動する
```js
// ブラウザコンソールで実行
fetch('/api/data').then(r=>r.json()).then(d=>{
  localStorage.setItem(`yora_archive_unlocked_${d.studentId}`, '1')
  console.log('unlocked for', d.studentId)
})
// → リロード後、ProfileDrawer に「YORA ARCHIVE を見る」ボタンが出る
```

### 運命の先生キャッシュをリセットする
```js
// yora_fated_${studentId} を削除すると次回アクセス時に再抽選
Object.keys(localStorage).filter(k=>k.startsWith('yora_fated')).forEach(k=>localStorage.removeItem(k))
```

### 卒業確認ダイアログを再表示する
```js
// yora_archive_unlocked を削除 + last_migrated_year を古くする
fetch('/api/data').then(r=>r.json()).then(d=>{
  const sid = d.studentId
  localStorage.removeItem(`yora_archive_unlocked_${sid}`)
  localStorage.setItem(`rishu_last_migrated_year_${sid}`, '2024')
})
```
