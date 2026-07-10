# 作業指示書: B案「地雷除去の差分更新化」実装（Sonnet 5向け）

作成: 2026-07-10（Fable 5による調査・設計済み）／状態: **実装・検証済み（Sonnet 5、`feature/mine-removal-diff`）**
実測はBefore/Afterとも `etc/V2_RESUME_PERF_PLAN.md` 冒頭の「B案 実測結果」に記載。
対象ファイル: `sphere-minesweeper.html` **のみ**。保存フォーマット・他ファイルは変更しない。
ブランチ: `feature/mine-removal-diff` を master から切って作業。
**commit / push はユーザーが行う**（Claudeはしない）。実装＋検証まで完了したら報告して終了。

---

## 0. 背景（これだけ読めば十分）

旗で地雷を除去するたびに `removeMine()` の400ms後処理が**全盤面を再計算し、
全開封セルの数字テクスチャを作り直している**。実測（`etc/V2_PERF_72x144_REPORT.md`）:

- 1セルあたり 0.198ms（canvas描画＋CanvasTexture＋Material＋Geometry再生成）
- 72×144盤面・進捗40%（開封4,559セル）で**旗1本 = 2,834msのフリーズ**
- これが「大盤面で進捗が進むほどカクつく」症状の正体（開封セル数に比例して悪化）
- 同じ処理が中断再開（resume）の再構築でもアクション数ぶん直列に走るため、resumeも遅い

**やること**: この全盤面処理を「除去した地雷の隣接8セルだけの差分更新」に置き換える。
1アクションあたり O(全盤面) → O(8セル)。旗ヒッチは数msになり、resumeも短縮される見込み。

設計の一次情報は `etc/V2_RESUME_PERF_PLAN.md` §2（等価性の論証を含む）。本書はその実装手順版。

## 1. スコープ外（やらないこと）

- InstancedMesh化・数字テクスチャ共有・アトラス化（C案の領域。触らない）
- 中断/リプレイの保存フォーマット変更（formatVersion:1 のまま）
- `revealAllMines` / `revealAllCellsForGameOver` / デバッグ自動クリアの全盤面走査（1回限りなので対象外）
- リファクタ・整形・コメント削除等、指示外の変更一切

## 2. 変更対象の現状把握（実装前に必ず読むこと）

`sphere-minesweeper.html` 内の以下を読む（行番号は変動するため関数名で検索）:

1. `function removeMine(row,col)` — 旗→地雷除去。**変更箇所①**
2. `function digCell(row,col)` の地雷ブランチ内、`consumeNormalGauge(2)` の後の
   「ゲージ残あり」枝（`cell.isMine=false; cell.isRemoved=true; removedMines++;` がある方）— **変更箇所②**
3. `function calcNeighbors()` / `function checkCascade()` / `function vanishNewZeroCells()` — 呼び出し元は上記2箇所のみ（grepで確認せよ）
4. `function getNeighbors(row,col)` — 円柱ラップ（列はwrap、行はwrapしない）を処理済み
5. `function openCell(row,col)` — 0セルの連鎖開封＋`scheduleVanish`
6. `function updateCellVisual(cell)` — 冒頭に `if(_replayInstant) return;` がある（C案実装済み。**消さないこと**）
7. `function initBoard()` — **変更箇所③**（_boardEpochの追加）
8. `function replayTimeout(fn, delay)` — `_replayInstant` 中は即時同期実行する点を理解すること

## 3. 実装手順

### Step 1: 盤面世代ガード `_boardEpoch`（先にやる・重要）

現行の全盤面再計算は「400ms窓内にRETRYで盤面が作り直された」場合でも新盤面を
無害に再計算するだけだった。**差分方式では旧盤面の座標で新盤面をデクリメントすると
neighborMines が静かに壊れる**。必ずガードを入れる。

- グローバルに `let _boardEpoch = 0;` を追加（`let misclickGuard = ...` 付近の変数宣言帯でよい）
- `initBoard()` の先頭に `_boardEpoch++;` を追加

### Step 2: 差分更新ヘルパーの新設

`removeMine` の直前に追加:

```js
// 地雷1個の除去後の局所更新。旧実装の calcNeighbors()＋全開封セルupdateCellVisual＋
// checkCascade()＋vanishNewZeroCells()（いずれも全盤面走査）と結果が等価（論証は
// etc/V2_RESUME_PERF_PLAN.md §2.1）。neighborMinesが変わるのは除去セルの隣接8セルのみで、
// 新たなカスケード/消滅の起点もその8セルに限られる（連鎖はopenCellの再帰が担う）。
// 前提: 本ゲームの旗は立てた瞬間に必ず解決するため、未開封の通常セルに旗が残留せず、
// 「開封済み0セルの隣が旗のせいで未開封のまま」というケースは存在しない。
function applyMineRemovalEffects(row, col){
  const affected = getNeighbors(row, col);
  for(const n of affected) n.neighborMines--;
  for(const n of affected){
    if(n.isOpen && !n.isRemoved){
      updateCellVisual(n);                             // 数字が変わったセルだけ再描画
      if(n.neighborMines === 0){
        getNeighbors(n.row, n.col).forEach(m => {      // 局所カスケード
          if(!m.isOpen && !m.hasFlag && !m.isRemoved && !m.isMine) openCell(m.row, m.col);
        });
        if(!n.animating) scheduleVanish(n);            // 0になった開封済みセルは消滅
      }
    }
  }
}
```

### Step 3: `removeMine()` の後処理を差し替え

```js
// 変更前（この塊を丸ごと置換）
replayTimeout(()=>{
  calcNeighbors();
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(board[r][c].isOpen) updateCellVisual(board[r][c]);
  checkCascade();
  vanishNewZeroCells();
  updateStats(); checkWin();
  if(debugMode) runSolverDebug();
},400);

// 変更後
const epoch = _boardEpoch;
replayTimeout(()=>{
  if(epoch !== _boardEpoch) return; // 400ms窓内にRETRY等で盤面が作り直された場合は何もしない
  applyMineRemovalEffects(row, col);
  updateStats(); checkWin();
  if(debugMode) runSolverDebug();
},400);
```

### Step 4: `digCell()` の地雷ゲージ枝も同一パターンで差し替え

同じ形の `replayTimeout(()=>{ calcNeighbors(); ... },400)` があるので、Step 3と同様に
`applyMineRemovalEffects(row, col)` へ置換（row/col は踏んだ地雷セル自身の座標）。
epochガードも同様に付ける。

### Step 5: 旧関数の扱い

`checkCascade()` と `vanishNewZeroCells()` は未使用になるが**削除しない**。
それぞれ定義の直前に
`// B案で未使用化（applyMineRemovalEffectsに置換済み・等価性検証用に残置）` を付けて残す。
`calcNeighbors()` は盤面生成時（applyBoardFromSeed/applyBoardFromFactory等）で使用中なので現状維持。

### Step 6: 等価性の自動検証（一時コード → 検証後に削除）

`applyMineRemovalEffects` の末尾に一時的に追加:

```js
// ---- 等価性検証（一時コード・検証完了後に削除）----
if(window._verifyDiff){
  let bad = 0;
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const expect = getNeighbors(r,c).filter(x=>x.isMine&&!x.isRemoved).length;
    if(board[r][c].neighborMines !== expect){ bad++; console.error('[B案検証] 不一致', r, c, board[r][c].neighborMines, expect); }
  }
  if(bad===0) console.info('[B案検証] neighborMines一致OK');
}
```

検証時に `window._verifyDiff = true` を設定して使い、**全テスト合格後にこのブロックを削除**すること。

## 4. 検証（dev server経由。全項目必須）

dev serverは `.claude/launch.json` の `static`（port 8123）。起動は許可不要。
**検証後は必ず音を止め（stopBGM()）、サーバーを停止すること。**
テストで localStorage に書いた `steller_suspend` 等は終了時に削除すること。
検証中は `audioMuted = true` を設定してよい。

### 4.1 ライブプレイの挙動一致

`?stage=10&mode=normal`（stageEX1・72×144・地雷1,866）で:
1. クリックでJudge開始（`handleCellAction(30,60,'dig')` → gameState==='playing' まで待つ）
2. `misclickGuard=false` にして、地雷セルに `handleCellAction(r,c,'flag')` →
   400ms後に (a)隣接する開封セルの数字が1減る (b)0になった開封セルが消滅する
   (c)消滅で新たに露出した隣接セルがカスケード開封される、を確認
3. `window._verifyDiff=true` の状態で旗を10本以上立て、コンソールに不一致0を確認
4. NORMALモードで地雷を踏む（ゲージ消費枝）→ 同様に正常
5. **旗除去の直後（400ms以内）に `restartGame()`** → エラーなし・新盤面の数字が正しい
   （epochガードの検証。`_verifyDiff` はここでは自動では走らないので、
   リスタート後に手で全セル再計算チェックを1回実行して不一致0を確認）

### 4.2 resume の状態一致（回帰）

1. 上記ステージで20手ほどプレイ（旗12＋掘削8）→ 400ms待ってから `saveSuspend()`
2. 全セルの `isOpen/hasFlag/isRemoved/neighborMines` を連結した文字列を保存
3. `?boot=resume` で再開 → 同じ文字列を再生成して**完全一致**を確認
   （この手順の実例は `etc/V2_RESUME_PERF_PLAN.md` 実測結果の項を参照）

### 4.3 性能の実測（Before/Afterを報告に含める）

1. **旗ヒッチ**: 進捗を進めた状態（開封4,000セル前後）で旗1本のrAF最大フレーム間隔を計測。
   Before実測値は2,834ms（`etc/V2_PERF_72x144_REPORT.md`）。After目標: **50ms以下**。
   進捗状態の作り方・計測スニペットは同報告書の手順を流用してよい
   （`_replayInstant=true` で flagCell/digCell を一括適用 → `refreshAllCellVisuals()`）。
2. **resume時間**: 実後半規模の合成中断データ（旗1,900＋掘削6,000、作り方は
   `etc/V2_RESUME_PERF_PLAN.md` 実測結果の項）で `[resume] 再構築完了` のms値を計測。
   Before実測値は約6,100ms。After目標: **2,500ms以下**（支配項がinitBoard×2に移る想定）。

### 4.4 その他回帰

- クリア直前まで進めてクリアできる（checkWinが正しく発火する）
- ゲームオーバー（EXモードで地雷を掘る）が正常
- 小盤面（`sphere-minesweeper.html` 直接起動のデフォルト盤面）でも旗・カスケード・消滅が正常

## 5. 落とし穴（過去に踏んだ罠。必読）

- **「calcNeighborsをループ後にまとめて1回」は不可**。neighborMinesは後続digの
  flood fill判定に使われるため、途中の値が狂うと盤面が分岐する。差分更新のみが等価。
- `updateCellVisual` は `_replayInstant` 中スキップされる（C案仕様）。差分更新でも
  instant中は描画されず、`refreshAllCellVisuals()` の最終1パスが拾う。**これで正しい**。
- `refreshAllCellVisuals` を全セルに広げてはいけない（未開封地雷にアイコンが出て盤面ネタバレ）。
- 演出タイミング400msは**変えない**（ライブプレイの手触り維持。instant中は同期実行）。
- `getNeighbors` は列方向のみwrap。極付近の行は隣接が8未満になるが、そのまま使えば正しい。
- SEは `playSE` 内の `_replayInstant` ガードで抑止済み。触らない。

## 6. 完了条件

- §4の全検証に合格（等価性チェック不一致0を含む）
- 一時検証コード（§3 Step 6）を削除済み
- Before/Afterの実測値（旗ヒッチ・resume時間）を最終報告に記載
- `etc/V2_RESUME_PERF_PLAN.md` の冒頭ステータスを「B案実装・検証済み」に更新
- コミットはせず、変更一覧と検証結果をユーザーに報告して終了
