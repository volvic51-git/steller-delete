# V2 Phase 3 — Factory 盤面 実装計画書

作成日: 2026-07-04 / 対象: `sphere-minesweeper.html` + `tool/board-factory.html`
前提: [[etc/V2_HANDOFF.md]] のロードマップ Phase 3。Board Hunter → Board Factory の生成パイプは完成済み。

> **ステータス: ✅ 実装完了（2026-07-08、feature/factory-board）**
> Step 1〜4＋テスト（§6）実施済み。Step 5（リプレイ整合）は計画どおり対象外のまま。
> 実装時の差分: mineCount は `window._stageMines` 経由で渡す（restartGame が再計算するため
> §4 Step 2 の直接代入では上書きされる）／`applyBoardFromFactory` は boot 時ではなく
> idle枝（クリック時）に毎回呼ぶ（RETRY の initBoard で地雷が消えるため）。
> 詳細は memory [[project-factory-board]] と `etc/V2_HANDOFF.md` を参照。

---

## 0. ゴール

**Factory盤面（事前生成・検証済みの Board JSON）を読み込んで実際にプレイできる**ようにする。
既存のリアルタイム生成（`placeMines`/`asyncEnsureSolvable`）はフォールバックとして残す。

- 盤面は**不変**（immutable）。地雷は Board JSON の `mines[]` をそのまま使う。
- 開始は **Judge モデル**：startCell は正確に1個。プレイヤーはどこを押してもよいが、
  Judge が唯一の startCell を開く（クリック＝開始合図）。
- **初手安全のための地雷移動をしない**（不変盤面では hash/verification が無効化するため）。

---

## 1. 現状の棚卸し（実装済み / 未実装）

### すでに入っているもの
- `tool/board-factory.html`：boardhunter JSON → Board JSON（seedから盤面生成・SHA-256・solver再検証）。
- `sphere-minesweeper.html` L1568–1580 `applyBoardFromFactory(fb)`：
  Board JSON の `mines[]` を `board[][]` に反映し `window._boardGen` に身元記録するところまで**実装済み**。
  ※ ただしまだ**どこからも呼ばれていない**（起動導線・Judge・dims設定が未接続）。

### 未実装（本計画で作る）
1. Factory盤面をゲームに渡す**ブリッジ**（localStorage）
2. `?boot=factory` の**起動導線**（dims/mineCount 設定 → restartGame）
3. **Judge 開始モデル**（handleCellAction idle枝の分岐）
4. **hash 再検証**（改竄/バージョン不一致の検出とフォールバック）
5. `board-factory.html` に「▶ プレイ」ボタン
6. リプレイ/中断との整合（後述・要判断）

---

## 2. データの流れ

```
board-factory.html                     sphere-minesweeper.html
  [▶ プレイ] ボタン                        ?boot=factory で起動
    │ Board JSON を                          │ localStorage から Board JSON 読込
    │ localStorage['steller_factory_board']  │ dims/mineCount を board JSON から設定
    └──────────────────────────────────────▶ │ restartGame() → initBoard()
                                              │ applyBoardFromFactory(fb)
                                              │ hash 再検証（NGならフォールバック）
                                              │ クリック → Judge が startCell を開く
```

- キー名: `steller_factory_board`（既存の `steller_suspend`/`steller_replays` と同じ命名規則）。
- ブリッジ方式を採る理由：URLに盤面(数千セル)は載らない。localStorage共有は中断/リプレイで実績あり。

---

## 3. Board JSON フォーマット（board-factory.html の出力・現行）

```jsonc
{
  "identity": { "campaignId": "C1-72x144-18", "genVersion": "1", "seed": 1660274253 },
  "board": {
    "rows": 72, "cols": 144, "mineCount": 1866,
    "wrap": "cyl",
    "startCell": { "r": 36, "c": 72 },
    "mines": [ { "r":0, "c":5 }, ... ],   // 座標リスト
    "hash": "<SHA-256 of 正規形>"
  },
  "meta": { "createdAt": "...", "reporter": "volcic", "verified": true }
}
```

- `applyBoardFromFactory` は既にこの形を前提に分解している（`fb.board.mines` 等）。
- **決定事項**: v1.0 で `board` に verification を持たせない（Immutability原則）。verified は meta の外付け。

---

## 4. 実装ステップ（コード変更箇所）

### Step 1. ブリッジ書き込み（`tool/board-factory.html`）
- seed行 / 全件行に「▶ プレイ」ボタンを追加。
- 押下時: `localStorage.setItem('steller_factory_board', JSON.stringify(board))` →
  `window.open('../sphere-minesweeper.html?boot=factory','_blank')`。
  ※ board-factory.html は `tool/` 配下なので相対パスは `../`。
  ※ ゲームは通常ルート直下で動くので、**ローカルで同一オリジンから開く**必要がある
    （file:// では localStorage がオリジン単位で分離＝別ディレクトリと共有されない可能性）。
    → **要判断**: dev server（launch.json `static`）経由で開く運用にするか。

### Step 2. 起動導線（`sphere-minesweeper.html` L4395付近 `_charDataReady.finally`）
- `_bootMode === 'factory'` の枝を追加。`resume`/`replay` と並列。
- **restartGame より前に** dims を確定させる（initBoard が ROWS/COLS を参照するため）:
  ```
  const fb = JSON.parse(localStorage['steller_factory_board']);
  ROWS = fb.board.rows; COLS = fb.board.cols; mineCount = fb.board.mineCount;
  window._factoryBoard = fb;         // idle枝・Judgeで参照
  window._factoryMode  = true;
  restartGame();                     // initBoard で空盤面を作る
  applyBoardFromFactory(fb);         // 地雷を流し込む
  calcTotalNonMineCells();           // 進捗率の分母
  ```
- **hash 再検証**（Step 4）をここで実施。NGなら `_factoryMode=false` にしてフォールバック
  （通常のリアルタイム生成に戻す or エラー表示）。

### Step 3. Judge 開始モデル（`handleCellAction` idle枝 L3268–3301）
- 現状: idle で `placeMines(row,col)` → Border振り分け → 初手を実行。
- Factory時: **placeMines も Border もスキップ**。盤面はもう確定している。
  ```
  if(gameState==='idle'){
    if(window._factoryMode){
      gameState='playing';
      replayReset();                 // 身元は applyBoardFromFactory で記録済み
      startTimer(); calcTotalNonMineCells(); autoEnableMisclickGuard();
      const s = window._factoryBoard.board.startCell;
      // Judge: クリック位置は無視し、startCell を開く（＝開始合図）
      replayRecord('dig', s.r, s.c); digCell(s.r, s.c);
      updateStats();
      return;
    }
    ... 既存のリアルタイム経路 ...
  }
  ```
- **Judge演出（確定=visual+SE）**: startCell を開く直前に「Judgeがそのセルを選ぶ」演出を入れる。
  - visual: startCell を一瞬ハイライト（emissiveパルス）→ カメラをそのセルへ寄せる → 開く。
  - SE: 専用効果音（既存 `SND.bell1` 等の流用 or 新規1音）。
  - `showReplayPreviewHighlight` に近い静的ハイライトが流用可能。演出後に `digCell(s.r,s.c)`。
  - 実装は「digCellの直前に短い演出関数 `judgeReveal(s)` を挟む」形（400〜600ms程度）。

### Step 4. hash 再検証（改竄・genVersion不一致の検出）
- ロード時に Board JSON の `mines` から正規形を再構築 → SHA-256 → `board.hash` と比較。
- 一致しない or `identity.genVersion` がゲームの `StellerBoardGen.GEN_VERSION` と不一致 → フォールバック。
- board-factory.html の `sha256(canonical)` と**同一の正規形定義**を game 側にも置く必要がある
  （現状 game には無い）。→ 共通化は `js/board-gen.js` に `canonicalBoard()`/`hashBoard()` を追加するのが筋。

### Step 5. リプレイ/中断との整合（Phase 3対象外）

**方針変更（2026-07-05確定）**: リプレイ機能は現在性能改善中のため、本フェーズでは対象外とする。

- REPLAYボタンはタイトル・クリア画面から非表示化済み（2026-07-05実施）。
- REPLAY AUTO SAVEスイッチも非表示化済み。
- Factory盤面のプレイ完成を最優先とする。
- リプレイ方式（seed再生成・差分更新・Renderer改善を含む）はFactory完成後に腰を据えて再設計する。
- **スコープ膨張防止**: Factory実装中にリプレイ整合を「ついでに直す」対象にしない。

---

## 5. 決定事項 / 未決事項

### 確定済み（2026-07-04 ユーザー判断）
| # | 論点 | 決定 |
|---|------|------|
| Q1 | ブリッジのオリジン問題 | **dev server 経由で検証**（launch.json `static`）。同一オリジンで localStorage 共有を保証 |
| Q2 | Judge 開始演出 | **visual+SE 付き**（startCell が開く瞬間に光る演出＋効果音）。初版から実装 |
| Q3 | リプレイ復元方式 | **Phase 3対象外**。REPLAYボタン非表示化済み。Factory完成後に再設計 |

### なお未決（実装中に確定でよい）
| # | 論点 | 選択肢 | 暫定案 |
|---|------|--------|--------|
| Q4 | hash正規形の共通化 | game側に再実装 / board-gen.jsへ集約 | board-gen.jsへ集約 |
| Q5 | フォールバック挙動 | エラー停止 / 通常生成に自動フォールバック | 自動フォールバック＋console警告 |
| Q6 | 背景/キャラ/BGM | factory盤面にステージ情報を持たせるか | 初版は既定（無指定）で開始 |

### Q3（seed再生成A）採用に伴う整合メモ
- factory盤面の身元 `window._boardGen` には既に `seed`+`genVersion` が入る（`applyBoardFromFactory` 実装済み）。
- リプレイ保存時は既存 `replayReset()` がそのまま `_boardGen` を拾うので**追加改修は最小**。
- 復元時（`?boot=replay`）は既存 L3024 `applyBoardFromSeed(b.seed, b.start.r, b.start.c)` が働く。
  → **要検証**: factory時の startCell を `b.start` として正しく保存/復元できるか
    （Judge の startCell = board.startCell を replay record の start に載せる必要がある）。
- **前提リスク**: seed→`generateMineSet` の結果が board-factory.html の `generateMines` と
  **完全一致**していること（genVersion=1 のパリティ）。不一致だとリプレイ盤面がズレる。
  → パリティテスト（Hunter/Factory/game の generateMineSet 一致）を別途固めるのが望ましい。

---

## 6. テスト観点

1. board-factory.html で seed から Board JSON を生成 → 「▶ プレイ」→ ゲームが同一盤面で起動。
2. クリック位置に関わらず startCell が開く（Judge）。
3. `board.hash` を1文字書き換え → フォールバック（or エラー）に落ちる。
4. `identity.genVersion` を "999" に改竄 → フォールバック。
5. 進捗率(RESCUE PROGRESS)の分母が正しい（calcTotalNonMineCells）。
6. クリア/ゲームオーバーが正常（不変盤面なので初手で地雷を踏む可能性＝Judge startCellは安全である前提を検証）。
   ※ startCell が安全（非地雷）であることは Factory生成時に保証済みか要確認。
7. （リプレイ対応する場合）保存→再生で盤面・結果が一致。

---

## 7. スコープ提案（初版）

- **含める**:
  - Step 1〜4（ブリッジ / 起動 / Judge / hash検証＋フォールバック）
  - **Judge演出（visual+SE）**（Q2確定）
  - 検証は **dev server 経由**（Q1確定）
- **含めない（後続）**: リプレイ整合（Q3: Phase 3対象外）、物語フック、mines直保存(B)、
  ステージ情報（背景/キャラ/BGM）、複数盤面のキャンペーン供給（data/boards 同梱）、
  Hunter/Factory/game のパリティ自動テスト。
- これで「Factoryで生成した1枚を、その場でプレイ・リプレイ保存でき、改竄は弾ける」状態になる。

## 7.5 実装順（着手時）
1. `board-factory.html`「▶ プレイ」ボタン（+ dev server 前提の相対パス/新規タブ）
2. `?boot=factory` 起動枝（dims設定→restartGame→applyBoardFromFactory→calcTotalNonMineCells）
3. hash再検証 + フォールバック（正規形hashを board-gen.js に集約）
4. Judge分岐（handleCellAction idle枝）+ `judgeReveal()` 演出（visual+SE）
5. リプレイ整合（startCellをrecordのstartに載せる。seed復元経路の確認）
6. テスト（§6）を dev server で通す

---

## 8. 参考：既存の関連コード位置（sphere-minesweeper.html）

- `let COLS=24, ROWS=12;` L769 / `let mineCount=30;` L789
- `applyBoardFromFactory` L1568 / `applyBoardFromSeed` L1584 / `placeMines` L1563
- `GUARANTEE_SKIP_DENSITY=0.22` L1837（Border 振り分けしきい値）
- `handleCellAction` idle枝 L3268–3301（Judge挿入点）
- `replayReset` L2838（`window._boardGen` を固定）
- 起動ハンドオフ `_charDataReady.finally` L4398（factory枝の追加点）
- `applyStageParam` L4205（ステージ情報の適用・factoryでは基本スキップ）
