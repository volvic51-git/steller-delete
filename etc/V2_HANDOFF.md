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

**設計はほぼ完了。今は「実測データ収集」フェーズ。** これ以上の机上設計は危険（solver実測を入れる段階）。

```
✓ データアーキテクチャ設計（七原則）
✓ solver.js 切り出し（純関数・ゲーム/Factory/解析ツールで共通）
✓ 実測ベンチ + 公開用 Board Hunter
✓ 開始モデル・生成エンジン入替の設計
▶ 密度別 保証成功率の実測 ← いまここ（ユーザーがデータ収集中）
  ↓
  BoardFormat を v1.0 に凍結
  ↓
  実装 Phase 1（js/board-gen.js 一本化）へ
```

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

1. ユーザーが密度データを収集中 → 揃ったら `etc/V2_board_density_data.csv` を集計
2. `V2_BOARD_DENSITY_FINDINGS.md`（しきい値の文章化）を作成し、`V2_GENERATION_ENGINE.md` から参照
3. 実測を反映して `docs/20-BoardFormat.md` を v1.0 に凍結
4. 実装 Phase 1（`js/board-gen.js` 一本化）に着手
5. 保留タスク：`tool/`/`tools/` 統一、未pushの解消
