# Stellar Delete V2 引き継ぎ書

作成日: 2026-06-30 / 最終更新: 2026-07-01
V1完成後、V2開発を進めるためのハンドオフ文書。

---

## ⚠️ 最初に読む：ブランチ構成（重要）

今セッションで **設計（docs）と実装（code）を別ブランチに分けた**。ファイルが「無い」と感じたら
まずブランチを疑うこと。

```
master
├─ feature/spec-foundation   ← 設計文書。docs/ と etc/ の設計メモ・CSV
│                               （00-Architecture / 10-DataSpec / 20-BoardFormat /
│                                 V2_GENERATION_ENGINE / 密度CSV）
└─ feature/solver-extraction ← 実装。js/solver.js / tools/board-benchmark.html /
                                dist/board-hunter/ / この引き継ぎ書
```

- **docs/ は spec-foundation にしか無い**（solver-extraction には無い）
- **tools/ と dist/ は solver-extraction にしか無い**
- 両ブランチとも **master 未マージ**
- **未push が残っている可能性**：`feature/spec-foundation` の密度CSVコミット（`59c2a28`）と
  タグ `design/data-foundation-v0.9` は未push（GitHub Desktop でブランチ切替→Push、タグは別途）

> **既知の未処理**
> - `tool/`（単数・既存）と `tools/`（複数・今回新規）が混在。将来 `tool/` に統一予定（solver-extraction上で）
> - `feature/solver-extraction` に出自不明の `d0a480d「solver.js生成」` コミットあり（`git show d0a480d --stat` で確認）

---

## いま何をしているフェーズか

**リプレイ/中断 機能を実装・実機テスト中（GitHub Pages）。** Stage1-4＋UI＋各種修正まで完了・push済み。
実機で見つかった残不具合の対応が「いまここ」（下記「実機フィードバック 未対応」参照）。

```
✓ Stage1-4（決定論生成/Border/ログ基盤/リプレイ/中断）
✓ UI-1-3（自動保存トグル/gameVersion/ゲーム内ボタン/タイトルRESUME・REPLAY/ハンドオフ）
✓ キャラ永続・replay-fidelity(hint/search)・キャラ名レース修正・背景/テーマ復元
✓ GitHub Pages公開・実機テスト（volvic51-git.github.io/steller-delete）
▶ 実機で見つかった残不具合3件 ← いまここ
```

**別トラック（未着手・保留中）:** 盤面密度の実測（etc/V2_board_density_data.csv）→ BoardFormat v1.0凍結
→ Board Factory 本体。リプレイ/中断が一段落したら戻る。

---

## ⚠️ 実機フィードバック 未対応（次セッションの最優先）

GitHub Pages 実機テストで確認。**調査途中で引っ越し。**

1. **resume で背景が出ない**（replay の背景はOK）
   - 背景は `canvas-container.style.backgroundImage`。applyStageParam(4041)と
     `applyCanvasBackground()`(2829)でのみ設定。restartGameは触らない。
   - saveSuspend は `meta.bg = getCanvasBackground()`、resumeSuspend は `applyCanvasBackground(m.bg)` を呼ぶ**はず**。
     replay(record.bg 直接)は動くのに resume(meta.bg)が出ない理由は未特定。
   - **次アクション**: 実際に `?boot=resume` で navigate して canvas-container の backgroundImage を確認
     （直接resumeSuspend呼び出しテストでは復元できていた＝boot経路 or 古いsuspendデータ疑い）。

2. **resume クリア画面に「TITLE」ボタンが無い**
   - `updateRescueButtons()`(982)は `isStageMode`(=?stageパラメータ有無)で分岐。resumeは`?boot=resume`で
     stageパラメータ無し → `!isStageMode`枝 → RETRYのみ表示・TITLE非表示。
   - **修正案**: 非stage枝でも TITLE を出す（resume/デバッグ両方に効く）。replayは`_isReplaySession`枝で対応済み。

3. **replay のカメラ追従が弱い → 1手ずつ進む/戻る UI が欲しい（replay時のみ）**
   - 現状 startReplay は setTimeout自動再生＋dig時 startAutoRotate。速くて追従が弱い。
   - **要望**: ステップUI（«前へ / 次へ»、手数カウンタ）。
   - **実装案**: `replayStepTo(index)` = 盤面を身元から再構築→actions[0..index-1]を即時再適用→
     最後の手のセルへ startAutoRotate。Next=+1 / Prev=-1（Prevは0から作り直し）。再生セッション時のみ表示するコントロールバー。

---

## 今セッションで確定した設計（要点）

詳細は各文書。ここは索引。

### データアーキテクチャ憲法（`docs/00-Architecture.md`）七原則
1. Data Responsibility（一データ一責務）
2. Identity（UUIDが真のキー、displayIdは表示専用・認定時採番）
3. Reference（所有せず参照）
4. Data Separation（仕様の能力と個体の状態を混ぜない）
5. Traceability（出自までたどれる。UUIDの目的は追跡性）
6. Immutability（Boardは不変・事実／評価は外付け）
7. Evolution（既存データを壊さない）
+ Non Goals（通信/UI/ゲームルール/ソルバー実装は規定しない）

### データ仕様
- `docs/10-StellerDataSpec.md`：共通型（Version / Identity / Reference / Provenance）。
  Board/Verification/Save/Replay/Job/Ranking/RuleSet は名前のみ予約
- `docs/20-BoardFormat.md`（v0.9）：Board は事実のみ。`identity/board/meta` で構成。
  verification も予約フィールドも持たない。`board.hash` は正規形のSHA-256（完全一致のみ）

### 開始モデル・生成エンジン入替（`etc/V2_GENERATION_ENGINE.md`）
- **ゴール：Factory盤面（事前生成・検証済み）で遊ぶ（段階B）まで見据える**
- **開始は single startCell + Judge**：盤面は事前生成・不変、開始セルは正確に1個。
  ユーザーはどこを押してもよいが、Judgeが唯一のstartCellを開く（クリックは開始合図）
  ※ Judge は Factory盤面の初手を開く機能。既存のヒント機能 ORACLE とは別物。
- **なぜ「好きな場所で初手安全」を捨てるか**：不変盤面では初手安全のための地雷移動が
  できない（hash/verification が無効化＝Immutability違反）
- **生成器を js/board-gen.js に一本化**（ゲーム=Hunter=Factory のパリティをテストで固定）

### 生成方式の振り分け（Border）
- 振り分けは **「保証あり」経路の中だけ**（保証なしは常にリアルタイムでOK）
- 判断軸は **密度**（＝リトライ上限内・許容時間内に保証盤面が出せるか）
- **Factoryに振られた瞬間、開始が Judge 方式に変わる**（リアルタイムは従来の初手安全）

### 実測でわかったこと（要・追試）
- 72×144：密度 **18%→成功率約10%**（リアルタイム保証で可）、**20%→約0.3%**（Factory必須）
- **保証なしのリアルタイム生成コストは誤差**（72×144でも生成+近傍計算 平均5.25ms、1フレーム内）
- 重いのは「保証（isSolvable）を何百回も回す」部分だけ
- データ収集用テンプレ：`etc/V2_board_density_data.csv`（列説明は同名 `_README.md`）

---

## 実装ロードマップ（`etc/V2_GENERATION_ENGINE.md §3` に詳細）

```
Phase 1  js/board-gen.js 一本化（決定論化 / seed記録 / genVersion導入 / パリティテスト）
Phase 2  Judge 開始モデル（単一startCellを開く演出）
Phase 3  Factory 盤面の Board JSON 読込（＝ゴール。既存生成はフォールバック）
Phase 4  リプレイ / 中断（seed+genVersion+params+操作ログ。startが1個なので再現がシンプル）
```

### 実装着手前に詰める未決（`V2_GENERATION_ENGINE.md §5`）
- `js/board-gen.js` の API（引数・返り値）
- `placeMines` 改修の具体範囲（呼び出し3箇所：初手/保証リトライ/デバッグ）
- Judge 開始演出の具体（visual/SE/物語フック）
- Board JSON の供給方法（data/boards同梱 / seedから都度生成 / Hunter由来の採用フロー）
- `asyncEnsureSolvable` の300回上限を密度実測に合わせて見直すか
- `verification.level=2` の厳密な合格定義（solver実測とセットで確定）

---

## すでに出来ている実装物（feature/solver-extraction）

- **`js/solver.js`**：`runSolver`（制約伝播+CSP）と `isSolvable`（完全シミュレーション）を
  純関数化。隣接ルールは `wrapCols/wrapRows` 引数。`computeNeighborMines` ユーティリティ付き。
  ゲーム側 `runSolver()/isSolvable()` は薄いアダプタ（`cellAt:(r,c)=>board[r][c]`）に変更済み
- **`tools/board-benchmark.html`**：seed再現つき実測ベンチ。盤面サイズ/密度別の保証成功率・
  solver時間を計測、CSV/JSON出力、サンプルBoard JSON（sha256付き）出力
- **`dist/board-hunter/`**：公開用（itch別公開）。全ユーザー共通キャンペーンで探索し、
  **seedのみ返す**（開発者が再生成して再検証 = trust but verify）。640×480に最適化済み

---

## V1 状態（完成済み・itch.io公開済み）

- ステージ1〜9（9はループ）全クリアタイム記録・ランキング
- HELP / CONFIG メニュー、タブ二重起動防止（`js/tab-guard.js`）、STORYアコーディオン、
  DELETEボタン（長押し800msでランキング初期化）
- **itch.io zip は必ず `System.IO.Compression` で作成**（`Compress-Archive` はパス区切り `\` で全404）

### V1盤面は seed 再現できない（重要）
- 現状 `placeMines` は `Math.random()` 直使用・seedなし。プレイ盤面は再現不可
- 再現性は新ツール（mulberry32）側にのみ存在。ゲーム側の決定論化が Phase 1

---

## Capacitor / Android APK 化（V2後）

分析：[`etc/CAPACITOR_ANALYSIS.md`](CAPACITOR_ANALYSIS.md)
主要課題：SPA化 / Three.js・Google Fonts のローカル同梱 / Androidバックボタン
事前準備：Node.js, Android Studio

---

## 参考：V1の重要な実装メモ

### ループモード cleartime
```js
// startTimer() 内
window._timerStartMs = timeLimitMode && loopMode && currentLoop > 1
  ? performance.now() - (totalTime - remainingTime) * 1000
  : performance.now();
if(currentLoop === 1) window._loopTotalStartMs = performance.now();

// showRescueScreen() 内
const clearTimeSec = loopMode && window._loopTotalStartMs
  ? Math.round(performance.now() - window._loopTotalStartMs) / 1000
  : window._timerStartMs
    ? Math.round(performance.now() - window._timerStartMs) / 1000
    : elapsed;
```

### ゲームオーバー時フラグ絵文字バグ対処
```js
// triggerGameOverSequence() 内
gameOverMistakeCell = mistakeCell || null;
if(gameOverMistakeCell && !gameOverMistakeCell.isMine){
  gameOverMistakeCell.hasFlag = false;
  gameOverMistakeCell.isOpen = true;
  updateCellVisual(gameOverMistakeCell);
}
```

---

## 次セッションの入口

**最優先: 上記「実機フィードバック 未対応」3件**（resume背景 / resume TITLEボタン / replayステップUI）。
実装は全て `sphere-minesweeper.html`（`feature/solver-extraction` ブランチ）。
実機確認は GitHub Pages（push→数分で反映、`volvic51-git.github.io/steller-delete`）。
新しいプレイヤー操作を足すときの記録フック方針は memory [[project-replay-suspend]] を参照。

**別トラック（リプレイ/中断が一段落したら）:**
1. 盤面密度データを集計（`etc/V2_board_density_data.csv`）
2. `V2_BOARD_DENSITY_FINDINGS.md`（しきい値の文章化）を作成
3. 実測を反映して `docs/20-BoardFormat.md`（spec-foundationブランチ）を v1.0 に凍結
4. Board Factory 本体

**整理系（いつでも）:** `tool/`/`tools/` 統一、`docs/10-StellerDataSpec.md`のboardHash記述をv1.0(00-Architecture)へ整合、
V2_HANDOFF.md のルート重複解消、spec-foundation側の未push（密度CSV・ORACLE→Judge・タグ）。
