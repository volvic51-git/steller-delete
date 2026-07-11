# ノーフラッグモード 実装手順書（Sonnet 5 向け）

作成日: 2026-07-11　ステータス: **実装済み（検証完了）** ※ブランチ `feature/noflag-mode`、未マージ
検討書: `etc/V2_NOFLAG_CLASSIC_PLAN.md`（仕様の背景・可解性の論証はこちら）
memory: [[project-no-flag-mode]]

## 実装結果サマリ（2026-07-11）

Step 1〜10すべて実装完了。dev server上で検証チェックリスト14項目すべてPASS。

**実測結果（Step 5の最大懸念点）**：EX2ミラー（id:21、144×72・地雷2,074個）で
全非地雷セル開封→クリア確定→地雷一括消滅を実測。**地雷2,074個の`isRemoved`確定は
同期的に即座（0ms）**——`removeMine()`/`applyMineRemovalEffects()`を呼ばない設計により、
懸念していた「差分更新×2,000個で44秒」問題は構造的に回避された。視覚演出（千鳥消滅・
最長1.2秒スタガー）→救出画面表示までフリーズなくスムーズに進行。

**実装中に見つかった軽微な追加対応**（手順書には無かったが必要だった変更）:
- ランダムキャラ選出の除外リストを配列化（`_exFixedCharIds = [10,11,20,21]`）。
  手順書の想定どおり、id:20/21を追加しないとEXミラーのcharId固定が効かなかった。
- `openCell()`内の`openedNonMine++`に加えて、`digCell`側で`updateCharacterReveal()`を
  **同期直後**に呼ぶ形にした（手順書は300ms遅延コールバック内を提案していたが、
  同期呼び出しの方が単純かつ即時反映されるため採用）。
- debug切替タイル（Step 10）は`toggleGameRule()`として`toggleStMode()`の隣に実装
  （ATTACK⇔NO FLAGトグル、`#game-rule-btn`）。

**保留（ユーザー判断待ち・完了時にやることSection参照）**:
- `assets/audio/EFE_13_judge.mp3` 未配置（ユーザー準備待ち。無くても`.catch(()=>{})`で
  無音のまま落ちない設計のため動作に支障なし）
- `data/modes.json`のnoflagカード（label/desc/image）は暫定値
- `data/stages.json`のid:12〜21 description は元ステージのコピーのまま

---

## 0. 前提・運用

- **ブランチ**: `feature/noflag-mode` を `master` から切って作業する。
- **git**: commit / push はユーザーが行う。マージはClaude実行可（ワーキングツリーがクリーンなことを確認してから）。
- **検証**: dev server 経由（`.claude/launch.json` の `static`＝`python -m http.server 8123`）。
  起動は許可不要。**検証後は必ず音を止めてサーバー停止**。
  ブラウザHTTPキャッシュで `data/*.json` の更新が反映されないことがある →
  `?cb=<timestamp>` 付きで再ナビゲーションするか `cache:'no-store'` で回避。
- 主対象ファイル: `sphere-minesweeper.html`（ゲーム本体）/ `index.html`（タイトル・リスト）/
  `data/modes.json` / `data/stages.json` / `data/stage-params.json`
- 行番号は 2026-07-11 時点の master のもの。ズレていたら記載のシンボル名で検索すること。

## 1. 仕様サマリ（ユーザー確定済み・変更禁止）

- 新モード「ノーフラッグ」: **旗（地雷除去）を一切使えない。開封のみ**。
- **クリア条件 = 非地雷セルの全開封**（現行の「地雷全除去」ではない）。
  開封率100%に達したら**自動で**クリア成立（手動トリガーなし）。
- クリア成立時: SE `EFE_13_judge.mp3` を鳴らし、**残存地雷を一括消滅演出**で消してから
  既存の救出演出（`triggerRescueSequence`）へ。
- 左上の進捗（バー・%・キャラ透過）は**開封率ベース**に切替（このモードのみ）。
- JUDGEアイコン（旧サーチボタン）は**転用しない**。ノーフラッグ中は常時グレーアウト。
- 入口: MODE SELECT の「SIMPLE MODE」の下に専用カード。ステージは stage1〜8＋EX1/EX2 の
  ミラーで**新stageID採番**（→ランキングはID単位なので自然に分離）。
- `GAME_VERSION` は `"1"` → `"1.1"`（"2"にはしない）。
  ※副作用として既存の中断データは非互換になる（ユーザー了承済み）。
- クラシックモード（旗＝メモ）は**今回のスコープ外**。ただし下記のモード変数は
  将来 `'classic'` を足せる3値設計にしておく。

---

## 2. 実装ステップ

### Step 1: モード変数 `gameRule` の導入

`sphere-minesweeper.html` のゲームルール変数群（`let exMode = true;` 付近、2108-2115行）に追加:

```js
let gameRule = 'attack'; // 'attack'=現行ルール（旗=攻撃） / 'noflag'=旗禁止 / （将来:'classic'）
```

- **boolean 2つではなく排他な3値1変数**にする（保存・復元・分岐が単純になる）。
- `restartGame()` ではリセット**しない**（ステージに紐づく設定。RETRYで持ち越す。
  `exMode`/`loopMode` と同じ扱い）。

`applyStageParam()`（4790行付近、`exMode 適用` ブロックの近く）に追加:

```js
// gameRule 適用（stage-params.json連携）
gameRule = (stage.gameRule === 'noflag') ? 'noflag' : 'attack';
```

### Step 2: データ追加（新stageID = 12〜21）

**`data/stages.json`**: id:12〜21 を追加。内容は以下のミラー
（12←1, 13←2, … 19←8, 20←10(EX1), 21←11(EX2)）。
`name`/`image`/`grid_col`/`grid_row`/`mines`/`difficulty` は元をコピー。
`description` は元のまま（後日ユーザーがJSON編集で差し替え可能）。

**`data/stage-params.json`**: 同様に id:12〜21 を追加し、各ブロックに
`"gameRule": "noflag"` を1フィールド足す。それ以外は元idの値をコピー
（id:20 は id:10 の、id:21 は id:11 のミラー。`boardSource`/`diff`/`charId`/`bgm`/
`background`/`boardPalette` 等すべて含む）。

⚠️ **罠**: `applyStageParam` の SIMPLE MODE ランダムキャラ選出の除外条件（4867行）
`Number(stage.id) !== 10 && Number(stage.id) !== 11` に **20/21 も追加**すること
（EXミラーはcharId固定。追加しないとランダムキャラで上書きされる）。

`DIFF_PRESETS` は既存キー（s1〜h2, ex1, ex2）をそのまま参照するので追加不要。

### Step 3: 開封カウンタ `openedNonMine`

- 宣言: `let vanishedNonMine = 0;`（948行）の隣に `let openedNonMine = 0;`
- インクリメント: `openCell()`（2294行）の `cell.isOpen=true;`（2297行）直後に
  `openedNonMine++;`。
  ※ `openCell` は入口で `isMine` を弾くので、ここに来るのは必ず非地雷セル。
  地雷を掘った時の `cell.isOpen=true`（digCell 2267/2270/2286行）は `openCell` を
  通らないのでカウントされない＝正しい。
- リセット: `calcTotalNonMineCells()`（1002行）内の `vanishedNonMine = 0;` の隣に
  `openedNonMine = 0;`。
  `triggerLoopReplay()`（2737行の `vanishedNonMine = 0;`）にも同様に追加
  （noflagに周回ステージは無いが整合性のため）。
- resume/リプレイ再構築は内部で `digCell`→`openCell` を再実行するため、
  カウンタは自然に再構築される。**特別な復元処理は不要**。

### Step 4: 勝利条件の分岐（`checkWin`）

`checkWin()`（2677行）の先頭ガードをモード分岐にする:

```js
function checkWin(){
  if(gameRule === 'noflag'){
    if(totalNonMineCells === 0 || openedNonMine < totalNonMineCells) return;
  } else {
    if(removedMines !== mineCount) return;
  }
  if(gameState !== 'playing') return;
  ...
```

**新しい呼び出しトリガーは不要**。`checkWin` は既に
- `digCell` の通常開封後（2290行、300ms遅延）
- `digCell` 地雷ゲージ枝の除去後（2280行）
- `flagCell` ゲージ枝（2395行）※noflagでは通らない

で呼ばれており、noflag の開封はすべて `digCell` 経由なので網羅されている。

⚠️ attack 側の挙動はビット単位で不変に保つこと（既存9ステージ＋EX1/EX2の回帰厳禁）。

### Step 5: クリア演出 — 残存地雷の一括消滅＋SE

`checkWin()` の setTimeout 内（2684行〜、既存の「残存数字セル一括消滅」ループの場所）に
noflag 分岐を追加する。既存ループはそのまま生かし、**その前に**地雷消滅を差し込む:

```js
setTimeout(()=>{
  let pending=0;
  if(gameRule === 'noflag'){
    playSE('judge');                       // 審判の音（消滅開始の合図）
    const epoch = _boardEpoch;
    let idx = 0;
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const cell=board[r][c];
      if(cell.isMine && !cell.isRemoved){
        pending++;
        cell.isRemoved = true;
        const delay = Math.min(idx * 2, 1200);   // 千鳥消滅・最長1.2秒に収める
        idx++;
        replayTimeout(()=>{
          if(epoch !== _boardEpoch) return;      // RETRY等で盤面再構築済みならno-op
          triggerVanishAnimation(cell);
        }, delay);
      }
    }
  }
  // （以下、既存の「開封済み数字セルの一括消滅」ループはそのまま）
```

**絶対に守ること（罠）**:
1. 地雷の消滅に `scheduleVanish()` / `vanishZeroCell()` を**使わない**。
   `vanishZeroCell` は `onNonMineCellVanished()`（非地雷カウンタ）と `destroy` SE を
   発火してしまう。`triggerVanishAnimation(cell)` を直接呼ぶ。
2. `removeMine()` / `applyMineRemovalEffects()` を**呼ばない**。勝敗確定後に隣接数字の
   再計算は不要。これを守ることで「2,074地雷×差分更新21.9ms≒44秒」問題を回避する
   （検討書§2）。`removedMines` カウンタも触らない（noflagのクリア判定に無関係）。
3. 遅延コールバックには**`_boardEpoch` ガード必須**（`initBoard` で世代が上がる。
   既存パターン: digCell 2276-2283行）。
4. `triggerVanishAnimation` は `_replayInstant` 中は `removeMeshInstant` で即時除去される
   （既存実装）ので、resume再構築との干渉はない。
5. 既存の `triggerRescueSequence` 呼び出し（2699行）の遅延 `pending>0?700:150` は、
   地雷消滅の完了（最長1200ms＋演出時間）を待つよう noflag 時のみ延長する
   （例: `gameRule==='noflag' ? 2000 : (pending>0?700:150)`。手触りは実測で調整可）。

**SE登録**: `const SND = {...}`（847行）に
`judge: new Audio('assets/audio/EFE_13_judge.mp3'),` を追加し、
音量設定行（868行付近）に `SND.judge.volume=0.7;` を追加。
⚠️ **必ず `_baseVolume` スナップショットループ（874行）より前に定義する**こと
（後から足すとBGM/SE音量スライダーが効かない）。SEグループ（`playSE`）扱いで正しい。
※ 音源ファイル `assets/audio/EFE_13_judge.mp3` はユーザーが準備する。実装時点で
未配置なら `.play().catch(()=>{})` で無音のまま落ちない（既存規約どおり）ことを確認。

### Step 6: 旗入力の無効化

1. `flagCell()`（2377行）の入口に追加: `if(gameRule === 'noflag') return;`
   （これが最終防壁。右クリック・長押し・リプレイ経由すべてここを通る）
2. `setMode()`（3870行）: noflag 中は `m==='flag'` を `'dig'` に読み替える
   （`if(gameRule==='noflag' && m==='flag') m='dig';` を先頭に）。
   フロートトグル（`float-btn-toggle` / `float-btn-toggle2`、⛏/🚩切替）は
   これで🚩に切り替わらなくなる。トグル自体を非表示にはしない（⛏固定で表示）。
3. カーソルインジケーター文言（3891-3892行）: noflag 時は「右クリック=旗」を出さない。
4. JUDGEアイコン: `refreshSearchAvailability()`（1895行）の先頭に
   `if(gameRule === 'noflag'){ _searchAvailable=false; updateSearchButton(); return; }`
   （常時グレーアウト。サーチ機能自体は温存＝コード削除禁止）。

**仕様ノート（実装判断）**: 地雷を誤って掘った時の挙動は `exMode` にそのまま従う
（stage-params ミラーの値のまま。exMode:false ならヒントゲージ消費で地雷が除去される
救済が働く——「地雷を消さない」原則の例外だが、ペナルティ済みの救済であり
クリア判定にも影響しない（判定は openedNonMine のみ参照）ので許容。
ユーザーが後日 stage-params.json の該当 id の exMode を変えるだけで調整できる）。

### Step 7: 進捗表示の開封率ベース化

`updateCharacterReveal()`（973行）の比率計算を分岐:

```js
const total = totalNonMineCells || 1;
charRevealRatio = gameRule === 'noflag'
  ? Math.min(1.0, openedNonMine / total)
  : Math.min(1.0, vanishedNonMine / total);
```

- 呼び出しタイミングの追加: `openCell()` で開封のたびに反映させたいが、
  フラッド中に毎セル呼ぶとDOM書き込みが無駄に走る。**`digCell` の
  `replayTimeout(()=>{ updateStats(); checkWin(); },300)`（2290行）に
  `updateCharacterReveal();` を足す**のが簡潔（1操作1回で十分。既存の
  消滅ベース更新も残るため attack 側は変化なし）。
- `#expose-mines`（地雷 n/N 表示）はそのまま（noflagでは除去が起きないので 0/N のまま。
  違和感があればユーザーと相談して非表示化——今回は触らない）。

### Step 8: 保存・リプレイへの貫通＋GAME_VERSION

1. `GAME_VERSION`（3296行）: `"1"` → `"1.1"`。
2. `saveSuspend()` の `meta`（3579行〜）に `gameRule,` を追加。
3. `resumeSuspend()` のメタ復元部（3694-3696行、`exMode`/`stMode` 復元の隣）に
   `gameRule = (m.gameRule === 'noflag') ? 'noflag' : 'attack';` を追加
   （旧データは undefined → 'attack' フォールバック＝後方互換）。
4. `replayReset()`（3257行）の `_replay` オブジェクトに `gameRule,` を追加
   （リプレイUIは非表示中だが記録形式は先に対応しておく）。
5. リプレイ/中断の復元系で `restartGame()` を経由する箇所があっても、Step 1 のとおり
   `gameRule` はリセットされないので追加処理不要。ただし `?boot=resume` は
   `applyStageParam` を通らない → **3 の meta 復元が唯一の設定経路**であることに注意。

### Step 9: index.html — モードカード＋ステージリスト＋戻り導線

1. **`data/modes.json`**: `normal` と `limit` の間に挿入:
```json
{
  "id": "noflag",
  "label": "NO FLAG MODE",
  "desc": "旗は使えない。\n開封だけで星の傷を暴き切れ。",
  "image": "assets/images/etc/mod01.png",
  "color": "blue",
  "enabled": true
}
```
   （label/desc/image は暫定。ユーザーがJSON編集で差し替え可能な旨をコメント不要・
   完了報告に記載）
2. **`renderModeSelect()`**（index.html 2171-2179行）のクリック分岐に
   `else if(id === 'noflag'){ playSelect(); modeSelectModal.classList.remove('show'); openNoflagList(); }` を追加。
3. **ステージリスト**: `renderNormalList()`（2190行）を流用できるよう一般化する。
   推奨: `renderStageList(stages, idFilter, noStrFn)` に内部化し、
   `renderNormalList` = ids `[1..8,10,11]`、新設 `renderNoflagList` = ids `[12..19,20,21]`
   （noStr は 20→'EX1', 21→'EX2', その他は `(id-11)` を2桁ゼロ埋め＝'01'〜'08' 表示）。
   モーダルは `normal-list-modal` を共用してよい（開くたびに innerHTML を作り直す設計
   なので混線しない）。見出しテキストの切替だけ対応する。
   行クリックの遷移は従来同様 `'sphere-minesweeper.html?stage=' + id + '&mode=normal'`
   （**mode=normal のまま**。noflag の実体は stage-params の `gameRule` が担う。
   これにより isNormalMode 系の既存分岐＝クリア画面ボタン構成などがそのまま正しく働く）。
4. **`?noflag=1` 直接オープン**（2306-2310行の自己実行関数）:
   `if(p.get('noflag') === '1') openNoflagList();` を追加。
5. **戻り導線（sphere-minesweeper.html側）**: STAGEボタンが `index.html?normal=1` へ戻る
   2箇所（1083行 `updateRescueButtons` / 3220行 設定メニュー）を、
   `gameRule==='noflag'` なら `index.html?noflag=1` に分岐。
   ※ resume経由でも Step 8-3 で gameRule が復元済みなので判定に使える。
6. RECORDS（🏆）・BEST TIME は stageId ベース（`stellarDeleteRanking_stage_12` 等）で
   **無改修で自然に分離**される。`openRecordsModal` の見出し `'STAGE ' + padStart(2,'0')`
   が noflag では「STAGE 12」のような内部ID表示になる点だけ、noStrFn を通した表示名に
   直す（小修正）。

### Step 10: debug切替（動作確認用）

debugメニュー（`#debug-menu`、331行〜。現在ボタン非表示だが機能は温存）に
gameRule 切替タイルを1個追加（`attack`/`noflag` のトグル。`checkWin` 条件と
旗ガードが即座に切り替わることの確認用）。コンソールから `gameRule='noflag'` でも
切り替え可能だが、タイルがあるとユーザーの実機確認が楽。

---

## 3. 検証チェックリスト（dev server・全項目必須）

**noflag 新規経路**:
1. タイトル→PLAY→MODE SELECT に「NO FLAG MODE」カードが SIMPLE の下に出る
2. `?stage=12&mode=normal` 起動: 16×8・12地雷・gameRule='noflag' で開始
3. 右クリック/フロートトグルで旗が立てられない（トグルは⛏のまま）
4. 全非地雷セル開封 → SE→地雷一括消滅→救出演出→クリア画面（RETRY/STAGE/TITLE構成）
5. クリア画面 STAGE → `index.html?noflag=1` の noflag リストに戻る
6. ランキング: `stellarDeleteRanking_stage_12` に保存され、SIMPLE stage1 の記録と混ざらない
7. RETRY → gameRule 維持・カウンタリセット・再クリア可能
8. 中断→RESUME → gameRule/進捗が復元され、開封率表示が正しい。resume→RESTART→初手正常
   （[[project-resume-perf]]の既知バグの回帰確認）
9. JUDGEアイコンが常時グレーアウト
10. **EX2ミラー（id:21、144×72・2,074地雷）で 2〜4 をフル確認し、一括消滅時の
    フレームヒッチを実測**（`performance.now()` プローブは検証後に撤去）。
    ヒッチが体感される場合は千鳥間隔（`idx*2ms`）と上限1200msを調整

**attack 回帰**:
11. SIMPLE stage1: 従来どおり旗で地雷除去→全除去でクリア。進捗%が消滅ベースのまま
12. stage9（周回）: 周回遷移正常
13. STORY 1ステージ: クリア画面ボタン構成（NEXT等）不変
14. 中断データ: 旧バージョン（gameVersion:"1"）の中断が「非互換で再開不可」の
    警告ログを出して静かに落ちる（クラッシュしない）こと

**音**: 検証後は必ず音停止＋サーバー停止。

---

## 4. 完了時にやること

- 本手順書のステータスを「実装済み」に更新（実測値・調整した定数を追記）
- `etc/V2_NOFLAG_CLASSIC_PLAN.md` の該当項目を実装済みに更新
- `etc/V2_HANDOFF.md` に作業サマリを追記
- 暫定のまま残る項目（modes.json の label/desc/image、stages.json の description、
  EFE_13_judge.mp3 未配置なら差し替え待ち、expose-mines の 0/N 表示の是非）を
  完了報告に明記してユーザー判断を仰ぐ
