# 中断再開（resume）性能改善計画 — B＋C案

作成日: 2026-07-10 / 状態: **C案 実装・検証済み（`feature/resume-perf`）／B案はテスト結果を見てユーザー判断**
対象ファイル: `sphere-minesweeper.html` のみ（保存フォーマット・他ファイルは変更しない）

## 実測結果（2026-07-10、C案のみ・デスクトップ）

同一の合成中断データ（144×72・地雷2,074・stageEX2相当）で比較：

| データ規模 | 修正前 | C案適用後 |
|---|---|---|
| 旗600＋掘削1500（2,101アクション） | **5分以上フリーズ・完了せず**（計測断念） | **1.8秒** |
| 旗1,900＋掘削6,000（7,901アクション・実後半規模） | 未計測（上記より確実に悪い） | **3.9秒** |

検証済み: 全セルの neighborMines 再計算突き合わせ0件不一致／描画整合0件不正／
実プレイ29手の中断→再開で全セル状態が完全一致／再開後のライブ操作（掘削・旗・
カスケード・消滅）正常／リプレイステップ再生（予告/確定/ジャンプ/巻き戻し）正常。
残り3.9秒の大半はB案の対象（旗ごとの全盤面 calcNeighbors/checkCascade/vanishNewZeroCells）。
`resumeSuspend` に所要時間の console.info を追加済み（恒久の診断ログ）。

---

## §0 背景・症状

- 大きい盤面（72×144等）の**後半**で中断→再開すると、復元に長時間かかる。
  スマホではメモリ急騰により**OSがタブを強制終了**（＝「落ちる」）。
- 根本原因は再開処理が **O(アクション数 × 盤面サイズ)** であること。
  後半中断ほどアクション数（特に旗＝地雷除去）が多く、急激に悪化する。

### 原因の内訳（分析済み 2026-07-10）

再開は `resumeSuspend()` が全操作ログを `_replayInstant=true` で `digCell`/`flagCell`
同期再実行して盤面を復元する。このとき地雷除去1回ごとに `removeMine()` の後処理
（instant中は即時実行）で以下の**全盤面処理**が走る：

1. `calcNeighbors()` — 全10,368セル × `getNeighbors()`（毎回配列アロケート）
2. **開封済み全セルに `updateCellVisual()`** — `createNumberMesh()` が毎回
   64×64 canvas新規作成（shadowBlur付き2重描画）＋ `CanvasTexture`／`PlaneGeometry`／
   `Material` 新規生成＋旧リソースdispose
3. `checkCascade()` ＋ `vanishNewZeroCells()` — 全盤面スキャン×2

stageEX2後半なら旗アクション約2,000件 × 開封中の数字セル数百個
→ **数十万〜百万オーダーの canvas／GPUテクスチャ生成・破棄が1フレームも描画されずに
同期一括で走る**。これがメモリスパイク＝スマホのタブキルの正体。

`digCell` の地雷踏み（NORMALゲージ消費）枝にも同一の全盤面リフレッシュがある。
さらに**通常プレイ中も**旗1本ごとに同じ処理が（400ms遅延で）1回走っており、
大盤面後半で旗を立てた瞬間のヒッチの原因にもなっている。

### 本計画の位置づけ

- **B案**: 地雷除去の後処理を「全盤面再計算」→「隣接8セルの差分更新」に変更。
  1アクションあたり O(盤面) → O(1)。**通常プレイの旗ヒッチも同時に解消**。
- **C案**: `_replayInstant` 中は描画更新を全スキップし、再構築ループ後に
  **最終状態を1パスだけ描画**。canvas/テクスチャ生成が再構築中ゼロになる。
- 根本策のA案（盤面状態スナップショット保存。O(盤面)で復元）は **Phase 4
  （リプレイ/中断再設計）で実施**。B＋Cはその前倒しの実効対策であり、
  Phase 4後もB（差分更新）はライブプレイ高速化として、C はリプレイステップ再生
  （`replaySubStepTo`）高速化として恒久的に有効。

---

## §1 変更対象の現状コード（参照）

| 関数 | 行（2026-07-10時点） | 役割 |
|---|---|---|
| `removeMine(row,col)` | 2316 | 旗→地雷除去。後処理400msで全盤面再計算 |
| `digCell` 地雷ゲージ枝 | 2226-2243 | 地雷踏み（ゲージ消費）。同じ全盤面後処理 |
| `updateCellVisual(cell)` | 2422 | セル1個の描画更新（色/枠線/数字テクスチャ） |
| `checkCascade()` | 2342 | 全盤面の開封済み0セルの隣を開く |
| `vanishNewZeroCells()` | 2333 | 全盤面の「0になった開封済みセル」を消滅 |
| `calcNeighbors()` | 1868 | 全盤面の neighborMines 再計算 |
| `resumeSuspend(rec)` | 3519 | 中断再開。操作ログをinstant再実行 |
| `replaySubStepTo(pos)` | 3285 | リプレイステップ再構築（同じくinstant再実行） |
| `initBoard()` | 1736 | 全セルメッシュ構築 |

---

## §2 B案：地雷除去の差分更新化

### 2.1 等価性の論証（なぜ局所更新で同じ結果になるか）

地雷1個の除去（`isMine=false; isRemoved=true`）で変化するのは：

- **neighborMines**: 変わるのは除去セルの**隣接8セルのみ**（それぞれ −1）。
  `calcNeighbors()` は `isMine && !isRemoved` を数えるので、全盤面再計算と
  「隣接8セルをデクリメント」は同値。
- **checkCascade の新規発火起点**: countが変わったセル（＝隣接8セル）のみ。
  それ以外の開封済み0セルは前回の除去時点で処理済み。
  隣を開く際の連鎖は `openCell()` 自身の再帰が担うので、起点を局所化しても
  到達集合は同じ。
- **vanishNewZeroCells の新規対象**: countが変わったセル（隣接8セル）と、
  カスケードで新規に開いたセル。後者は `openCell()` 内の `scheduleVanish` で
  既にカバーされるため、明示的に見るのは隣接8セルだけでよい。
- **旗の不変条件**（この局所化の前提）: 本ゲームでは旗は立てた瞬間に必ず解決する
  （地雷→除去 / 非地雷→NORMALは開封・EXはゲームオーバー）ため、
  **未開封の通常セルに旗が残留することはない**。よって「開封済み0セルなのに
  旗のせいで隣が開いていない」ケースは存在せず、全盤面 `checkCascade` が
  局所版より多く開くことはない（消滅不変条件は2026-07-08に機械検証済み・違反0件）。
- **タイミング**: 現行の後処理は `replayTimeout(...,400)`。**この遅延構造は
  変えない**（コールバックの中身だけ局所化）。ライブプレイの見た目・手触りは不変。
  instant中は現行も新実装も同期即時実行なので完全等価。

補足（ライブプレイで複数の旗が400ms窓内に重なった場合）:
現行は1回目のコールバックの `calcNeighbors()` が「その時点で除去済みの全地雷」を
先取り反映していた（2回目のコールバックは冪等）。差分方式は各コールバックが
自分の地雷の分だけ反映する。**最終盤面は一致**し、中間の演出タイミングが
最大数百ms入れ替わる可能性があるだけ（許容）。

### 2.2 実装

**新ヘルパー**（`removeMine` の近くに配置）:

```js
// 地雷1個の除去後の局所更新（旧: calcNeighbors+checkCascade+vanishNewZeroCells の全盤面走査と等価）。
// 変化が及ぶのは除去セルの隣接8セルのみ（§V2_RESUME_PERF_PLAN.md 2.1 の等価性論証を参照）。
function applyMineRemovalEffects(row, col){
  const affected = getNeighbors(row, col);
  for(const n of affected) n.neighborMines--;
  for(const n of affected){
    if(n.isOpen && !n.isRemoved){
      updateCellVisual(n);                       // 数字が変わったセルだけ再描画
      if(n.neighborMines === 0){
        getNeighbors(n.row, n.col).forEach(m => {  // 局所カスケード（連鎖はopenCellの再帰が担う）
          if(!m.isOpen && !m.hasFlag && !m.isRemoved && !m.isMine) openCell(m.row, m.col);
        });
        if(!n.animating) scheduleVanish(n);      // 0になった開封済みセルを消滅
      }
    }
  }
}
```

**`removeMine()` の後処理を差し替え**:

```js
// 変更前
replayTimeout(()=>{
  calcNeighbors();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(board[r][c].isOpen) updateCellVisual(board[r][c]);
  checkCascade();
  vanishNewZeroCells();
  updateStats(); checkWin();
  if(debugMode) runSolverDebug();
},400);

// 変更後
const epoch = _boardEpoch;                 // §2.3 リスタート跨ぎガード
replayTimeout(()=>{
  if(epoch !== _boardEpoch) return;        // 400ms窓内にRETRY等で盤面が作り直されたら何もしない
  applyMineRemovalEffects(row, col);
  updateStats(); checkWin();
  if(debugMode) runSolverDebug();
},400);
```

**`digCell` の地雷ゲージ枝**（2235-2242行）も同一パターンで差し替え
（`applyMineRemovalEffects(row, col)` を呼ぶ。row/col は踏んだ地雷セル）。

### 2.3 盤面世代ガード `_boardEpoch`（新規・重要）

現行の全盤面再計算は「400ms窓内にRETRYで盤面が作り直された」場合でも
新盤面を正しく再計算するだけで無害だった。**差分方式では、旧盤面の地雷位置を
新盤面に対してデクリメントすると counts が壊れる**。

対策: グローバル `let _boardEpoch = 0;` を追加し、`initBoard()` の先頭で
`_boardEpoch++`。地雷除去の遅延コールバックは発行時のepochを閉じ込め、
実行時に不一致なら no-op（上記コード参照）。

※ instant中はコールバックが同期実行されるためepochは必ず一致し、影響なし。

### 2.4 `checkCascade` / `vanishNewZeroCells` の扱い

呼び出し元が地雷除去の2箇所のみ（grep確認済み）なので、差し替え後は
**未使用になる**。即削除はせず「B案で未使用化（applyMineRemovalEffectsに置換済み）」
のコメントを付けて残す（等価性検証で新旧比較に使うため。検証完了後の削除は任意）。

---

## §3 C案：instant中の描画スキップ＋最終1パス描画

### 3.1 実装

**`updateCellVisual()` の冒頭に1行追加**:

```js
function updateCellVisual(cell){
  if(_replayInstant) return;   // 再構築中は描画しない（完了後にrefreshAllCellVisualsで1パス描画）
  if(!cell.mesh||cell.isRemoved) return;
  ...
}
```

安全性: `updateCellVisual` は純粋な描画関数（`isOpen`/`hasFlag` 等の状態変更は
すべて呼び出し側で完了している）。スキップしてもゲームロジックに影響しない。
消滅済みセルのメッシュ除去は従来通り `removeMeshInstant()`（instant専用経路）が担う。

**新ヘルパー `refreshAllCellVisuals()`**:

```js
// instant再構築（resume / リプレイステップ）完了後に、盤面の最終状態を1パスで描画する。
function refreshAllCellVisuals(){
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const cell = board[r][c];
    if(cell.isOpen || cell.hasFlag) updateCellVisual(cell);
  }
}
```

⚠️ **実装で発見した罠（修正済み）**: 対象は「初期状態から変化したセル（開封済み/旗）」に
**限定必須**。当初「全セルに updateCellVisual（`!mesh||isRemoved` は自身が弾く）」で実装したところ、
**未開封の地雷セルに地雷アイコンが表示される**バグが出た。`createNumberMesh` の地雷ブランチ
（`isMine && !isRemoved` → mine.png表示。本来ゲームオーバー全公開用）は `isOpen` を見ないため、
未開封の地雷に `updateCellVisual` を呼ぶと盤面が丸ごとネタバレする。未開封セルは
`initBoard`/`buildCellBorderSegs` の初期描画のままが正しく、触る必要がない。

**呼び出し箇所は2つ**:

1. `resumeSuspend()` — 再実行ループ直後、`_replayInstant=false` に戻した後:
   ```js
   for(const a of rec.actions){ ... }
   _replayMode = false; _replayInstant = false;
   refreshAllCellVisuals();   // ★追加
   ```
2. `replaySubStepTo()` — 同じくループ直後の `_replayInstant = false;`（3339行）の直後。
   ※ `isPreview` の予告ハイライト適用（3345行〜）より**前**に置くこと
   （後だとハイライトのemissiveを上書きしてしまう）。

### 3.2 効果と副次確認

- 再構築中の canvas／テクスチャ／マテリアル生成が**ゼロ**になる。
  最終パスで生成されるのは「その時点で生きている開封済み数字セル＋旗セル」分のみ
  （後半中断では大半が消滅済みなので数百個程度）。
- `replaySubStepTo` の `animateLast`（最後の一手のみ演出付き＝instant外）は
  リアルタイム描画され、直後の `refreshAllCellVisuals()` は同じ状態を冪等に
  再描画するだけ（数字テクスチャの作り直しが1回増えるが1パス限りで許容）。
- ヒントハイライト・Judgeハイライトは毎フレーム `animate()` 内で再適用されるため、
  最終パスの上書きと干渉しない（確認済み: 4458行）。

---

## §4 スコープ外（やらないこと）

- **保存フォーマット変更なし**: `formatVersion:1` のまま。既存の中断データ・
  リプレイデータはそのまま再開/再生できる。
- **A案（盤面スナップショット保存）**: Phase 4 で実施。
- `revealAllMines` / `revealAllCellsForGameOver` / デバッグ自動クリア（4297行）の
  全盤面走査: 1回限りの処理なので対象外。
- `initBoard` の二重実行（restartGame→resumeSuspendで2回走る）: 1回分≒数百msの
  無駄だが支配的でない。**任意の追加改善**として §7 に記載（今回必須ではない）。

---

## §5 検証計画

### 5.1 等価性の自動チェック（実装中のみの一時コード）

差分更新のバグは「盤面判定が静かに狂う」形で出るため、機械検証を入れる：

- `applyMineRemovalEffects()` 実行後（debugModeガード付き）、全セルの
  neighborMines を旧方式（`getNeighbors(r,c).filter(isMine&&!isRemoved).length`）で
  再計算した一時配列と突き合わせ、不一致なら `console.error` で座標を出す。
- resume全体の等価性: 修正前後で同じ中断データを再開し、全セルの
  `isOpen/hasFlag/isRemoved/neighborMines` を連結した文字列（またはそのハッシュ）を
  console出力して比較。**修正前の値の採取を先にやる**（修正後は旧コードが動かないため）。
- 検証完了後、チェックコードは削除（またはdebugMode限定で残置を判断）。

### 5.2 手動テスト（dev server経由。検証後は音停止＋サーバー停止）

| # | 項目 | 期待 |
|---|---|---|
| 1 | ライブプレイ: 旗→地雷除去→隣接数字の減少・0化セルの消滅・カスケード開封 | 従来と同じ見た目・タイミング（400ms） |
| 2 | ライブプレイ: NORMALで地雷を踏む（ゲージ消費）→ 同上の後処理 | 同上 |
| 3 | 旗除去の直後（400ms以内）にRETRY | エラーなし・新盤面の数字が正しい（epochガード） |
| 4 | 序盤で中断→再開（stage1等の小盤面） | 従来と同じ状態復元・体感即時 |
| 5 | **stageEX2後半（地雷1500+除去済み）で中断→再開** | **数秒以内に復元**・盤面/数字/旗/消滅状態が中断時と一致 |
| 6 | 再開後のメタ復元 | 経過時間/BGM/背景/キャラ/透過率/ゲージ/パレットすべて中断時と一致 |
| 7 | 再開後にそのまま続行してクリア/ゲームオーバー | 正常動作（checkWin/救出演出/ランキング） |
| 8 | 再開後に再度中断→再度再開 | 操作ログが正しく引き継がれ2回目も一致 |
| 9 | リプレイステップ再生（UIは非表示中。`?boot=replay`をデバッグで直接叩く） | ステップ前後・連打で従来と同じ挙動（回帰なし） |

スマホ実機（GitHub Pages）: #5 を実施し、落ちずに再開できることを確認。

### 5.3 性能計測

- `resumeSuspend()` を `performance.now()` で計測（一時コード）し、
  修正前後の所要時間を同一中断データで比較して記録する。
- 目安: 後半中断の再開が「数十秒〜クラッシュ」→「initBoard＋最終描画パス分の
  1〜3秒程度」になる想定（支配項が盤面メッシュ構築に移る）。

---

## §6 実装順序

1. **C案**（updateCellVisualの1行＋refreshAllCellVisuals＋呼び出し2箇所）
   — 変更が最小でクラッシュ要因（メモリスパイク）を先に除去。ここで一度検証。
2. **B案**（applyMineRemovalEffects＋_boardEpoch＋差し替え2箇所）
   — §5.1の等価性チェックを入れた状態で実装・検証。
3. §5.2/5.3 の一通り検証 → 一時コード除去 → コミット（ブランチ名案:
   `feature/resume-perf`。マージはClaude可・push/リモート操作はユーザー）。

見積り: 変更 約60〜80行・実装1セッション内。

---

## §7 任意の追加改善（今回のスコープ外・気が向いたら）

- **initBoard二重実行の解消**: `_bootMode==='resume'` 時に suspend レコードを
  restartGame より先に読んで ROWS/COLS/mineCount を確定させ、resumeSuspend 側の
  initBoard をスキップ（「restartGame直後＝盤面クリーン」が前提条件になるため
  要注意コメント必須）。効果は数百ms。
- **再開中のローディング表示**: ✅ **実装済み（2026-07-10、C案と同じブランチ）**。
  「RE-MEMBERING ＋ 進捗％・手数」を表示。実装の要点：
  - `resumeSuspend` を **async のチャンク実行**に変更（約150msごとに1フレーム譲る。
    同期一括だとラベルが一切描画されない）。表示コストとして実後半規模で 3.9s→約6.1s
    （チャンク間の3D描画 約40ms/フレーム分）。盤面が徐々に復元される様子が見える。
  - 非同期化の副作用対策2点：①チャンクの合間に入力が通るため、透明オーバーレイ
    `#resume-blocker`＋`handleCellAction` 冒頭の `_replayInstant` ガードで入力遮断
    （RETRY等で盤面を作り直されると復元が壊れる）。②`resumeSuspend` がPromiseを返すため、
    boot経路の `if(_rec && resumeSuspend(_rec))` は**常にtruthy**になり失敗時も
    中断データを消してしまう → `.then(ok=>...)` で完了を待って消費に変更。
  - ラベルDOMは `_ensureGeneratingLabel()` としてGENERATINGと共用。例外時も
    `finally` でフラグ復帰＋ラベル非表示。
  - **別ステージの球体が見えるバグ（修正済み・2回）**: `?boot=resume` はステージ指定なしの
    `restartGame()` が先に走るため、デフォルト盤面（12×24・青・ランダムキャラ）が
    RE-MEMBERING中に見えていた。対策：①正しい盤面が組み上がるまで球体を非表示
    （finallyで必ず復帰）、②キャラ・背景の復元を盤面再構築より**前**に移動
    （チャンク再構築の段階表示中も正しいステージの見た目になる）。
    ⚠️ **1回目の修正では直らなかった罠**: 隠す対象を最初 `#canvas-container` にしたが、
    これは **CSS背景画像専用**の要素で、3D球体（`renderer.domElement`）は body 直下に
    別途 insertBefore されている（1183行付近）。→ 隠すのは `renderer.domElement` が正解。
    ⚠️ **2回目の修正でも実機で再発報告 → 最終対策は「作らせない」方式（2026-07-10）**:
    boot=resume 分岐で中断レコードを **restartGame より先に読み**、ROWS/COLS/_stageMines/
    _boardPalette/_stageCharId を先に反映してから restartGame する。これで起動時に構築される
    盤面自体が中断時と同じ寸法・色・キャラになり、どのタイミングで映っても別ステージには
    見えない（隠すのは保険として継続）。あわせて：
    - **データ無しで `?boot=resume` を開いた場合は index.html へ戻す**（resume成功で
      中断データは消費されるため、F5で再訪するとデフォルト盤面が出て「別ステージの盤面」に
      見えていた可能性が高い）。
    - 診断ログ追加: `[resume] 開始 board=...`／`[restartGame] board=...`／
      `[resume] 再構築中に例外`（unhandled rejection の可視化）。
  - **再開時GUARDがOFFになるバグ（修正済み）**: `restartGame()` が `misclickGuard=false` に
    リセットするため。中断＝プレイ途中なので、`resumeSuspend` 末尾で `autoEnableMisclickGuard()`
    を呼んでON＋ラベル更新する。
- `createNumberMesh` のキャッシュ（text+color 不変なら再生成しない）:
  B＋C後は呼び出し頻度が激減するため優先度低。
