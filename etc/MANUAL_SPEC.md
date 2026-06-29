# Stellar Delete — マニュアル／シナリオ再生エンジン 確定仕様書 V1.0

> 作成日: 2026-06-27　対象ブランチ: master　対象画面: `sphere-minesweeper.html`
> ステータス: **V1.0 実装済み（2026-06-29）**

## 実装ファイル

| ファイル | 役割 |
|---|---|
| `manual/game-bridge.js` | ゲーム側アダプタ。`window.GameBridge` を公開（§6）。ゲーム内部に触れてよい唯一の層。`handleCellAction` を非侵襲ラップして `onCellAction`/`setInputMode` を実現（ゲーム本体は無改変） |
| `manual/scenario-engine.js` | シナリオ再生エンジン。`window.ScenarioPlayer.play()/playUrl()`。3層Action・dispose・Atomic・ゲート式condition・自動再生・デバッグパネル |
| `manual/manual.css` | Overlay（DOM）+ Canvas + UI Animation のスタイル |
| `manual/scenarios/tutorial01.json` | サンプル（基本操作 14ステップ） |
| `sphere-minesweeper.html` | `❓`ボタン＋`startManual()`、CSS/JS読み込みのみ追加 |

検証：プレビューでフル再生確認済み（盤面プリセット注入／focusCell回転＋ズーム／セル追従ハイライト・矢印／
condition の誤操作ノーペナルティ＆誤スキップ防止／call+uiEffectでgiveHint実行 hintCount 0→1／finish時dispose）。

---

## 0. 目的

現在のゲーム画面（`sphere-minesweeper.html`）を**そのまま使って**、本物のプレイを再現しながらチュートリアル・マニュアルを表示する。
画像による疑似画面ではなく、ゲーム本体の関数を直接呼び出して説明する。

将来的にデモプレイ・ストーリー演出・リプレイ・イベントシーンにも流用できるよう、
マニュアル専用ではなく汎用の **「シナリオ再生エンジン」** として実装する。

---

## 1. 基本構成

マニュアルは次の4要素で構成する。

| 要素 | 実装レイヤー |
|---|---|
| ゲーム画面 | 既存のゲーム本体（**変更しない**） |
| 説明ウィンドウ／操作ボタン | **DOM Overlay**（UI専用） |
| ハイライト・矢印・円・点滅 | **透明Canvas**（描画専用） |
| 自動操作 | ゲーム内部APIの直接呼び出し |

**原則：ゲーム本体（`sphere-minesweeper.html` のゲームロジック）は改変しない。**
エンジンが必要とする最小限の連携API（§6）のみ追加する。

---

## 2. ⚠️ 重要：盤面はCanvas／UIはDOM という二元構造

`sphere-minesweeper.html` の実態を踏まえ、**セルとUIを同じものとして扱わない。**
ターゲットの種類が違うので、**Action自体を分ける**（同一Actionに `type` 分岐を持たせない）。

### 2-1. 盤面のセル — Canvas（球面投影）

- 盤面は `#canvas-container` 内の Canvas に **3D球面投影**で描画される。
- セルは DOM 要素ではなく `board[row][col]`（JSオブジェクト）として存在する。
- **したがって `#cell-10-8` のようなCSSセレクタはセルには存在しない。**
- セルを指す場合は **行・列** で指定し、**セル専用Action**（`highlightCell` 等）を使う。

```json
{ "action": "highlightCell", "row": 10, "col": 8 }
```

- セルのスクリーン座標・半径・可視性は、エンジンが**ゲーム側の投影API**で取得する
  （§6 `getCellScreenPosition`）。マニュアル側は座標計算を一切持たない。

### 2-2. UIボタン類 — DOM

- `#hint-btn-outer`, `#focus-btn-outer`, `#settings-btn`, `#float-btn-toggle`,
  `#btn-dig`, `#btn-flag`, `#btn-camera` 等は通常のDOM要素。
- これらは **CSSセレクタ**で指定し、`getBoundingClientRect()` で位置・サイズ・中心を取得する。

```json
{ "action": "highlight", "target": "#hint-btn-outer" }
```

### 2-3. セル用Action と DOM用Action は別物

| 対象 | Action例 | 指定方法 |
|---|---|---|
| 盤面セル（Canvas） | `highlightCell`, `focusCell`, `dig`, `flagCell` | `row` / `col` |
| UI（DOM） | `highlight`, `focus`, `click` | `target`（CSSセレクタ） |

### 2-4. 座標は固定値禁止

セル・UIともに **座標をJSONに固定値で持たせない。**
毎回 `getBoundingClientRect()`（DOM）または投影API `getCellScreenPosition()`（セル）で
動的取得し、レスポンシブ・端末サイズ変更・カメラ回転に追従する。

---

## 3. シナリオ方式

シナリオは Action オブジェクトの配列。各ステップを順番に実行する。

```json
[
  { "action": "message", "text": "まずはマスを掘ってみましょう" },
  { "action": "highlight", "target": { "type": "cell", "row": 10, "col": 8 } },
  { "action": "focus",     "target": { "type": "cell", "row": 10, "col": 8 } },
  {
    "action": "condition", "type": "leftClick",
    "target": { "type": "cell", "row": 10, "col": 8 },
    "onError": { "message": "このマスをクリックしてください", "flash": true }
  },
  { "action": "wait", "time": 800 }
]
```

シナリオはゲームコードと分離し、JSONとして外部ファイルで管理する
（例: `tutorial01.json`, `tutorial02.json`, `story.json`）。
ゲームコードを書き換えずに追加できる構造とする。

---

## 4. Action 一覧 — 3層構造（責務で分類）

Actionは「実装方法」ではなく**「責務（何を変えるか）」**で3層に分類する。
この分類が、後述の **dispose（§5-5）** と **Atomic（§5-6）** の挙動をそのまま決める。

| 層 | 何を変えるか | dispose時 |
|---|---|---|
| ① Gameplay Action | **ゲーム状態を変える唯一の層** | 戻さない |
| ② Visual Action | ゲーム状態は変えない（盤面/カメラ上の強調） | dispose で消す |
| ③ UI Animation | UIだけ動かす（副作用ゼロ） | dispose で消す |

### ① Gameplay Action（状態変更・Atomic）

ゲーム状態を変更できるのはこの層だけ。各Actionは **Atomic（§5-6）** = 途中状態を見せない1トランザクション。

| action | 役割 | 内部呼び出し |
|---|---|---|
| `digCell` | セルを掘る | `digCell(row,col)` ★実在 |
| `flagCell` | セルに旗を設置 | `flagCell(row,col)` ★実在（※`setFlag` ではない） |
| `call` | ホワイトリスト関数の呼び出し（§5-1）。`uiEffect` 同梱可 | `ACTION_API[fn]` |

`row`/`col` で指定。`call` は `fn`/`args` で指定。
**Gameplay Action は `uiEffect` を任意で同梱できる**（押下演出→実行→復帰を原子的に。§5-7）。

### ② Visual Action（状態を変えない強調・カメラ）

| action | 役割 | 内部 |
|---|---|---|
| `highlightCell` | セルを強調（毎フレーム追従） | `getCellScreenPosition` |
| `highlightUI` | UI要素を強調（`target`=セレクタ） | `getBoundingClientRect` |
| `focusCell` | セルを画面中央やや上へ：**回転→ズーム→idle まで内部完結** | 🔨新規作成（`focusNearestNumberCell` は別物） |
| `arrow` | 矢印ガイドを描画 | — |
| `camera` / `zoom` | カメラ移動・ズーム | — |

### ③ UI Animation（UIのみ・副作用ゼロ）

ゲーム状態を**一切変更しない**。「ここにこのボタンがあります」と見せるだけ。

| action | 役割 |
|---|---|
| `pressButton` | ボタンが押し込まれる演出（**設定画面等は開かない**） |
| `pulseButton` | ボタンを脈動 |
| `shakeButton` | ボタンを振動 |
| `flashButton` | ボタンを点滅 |

> 「実行を伴う押下」は Gameplay Action に `uiEffect:{animation:"press"}` を同梱する（§5-7）。
> `pressButton` 単体は**演出のみ**（実行を伴わないデモ）に使う。

### 共通（制御フロー）

| action | 役割 |
|---|---|
| `message` | 説明文を表示 |
| `moveMouse` | マウス移動の演出 |
| `wait` | 一定時間待機 |
| `next` | プレイヤーの「次へ」押下待ち |
| `condition` | 正しい操作が行われるまで待機（§5-2） |
| `finish` | シナリオ終了 |

### 廃止したAction

`click` / `rightClick` / `doubleClick` は**廃止**。
DOMイベント名を連想させ、入力方法（PC/タッチ/将来のゲームパッド）に依存するため。
意味Action（`digCell`/`flagCell`）＝入力方法はゲーム側が吸収、UI演出＝`pressButton` 系、に統一する。

### Future Gameplay Action（将来追加候補）

| action | 条件 |
|---|---|
| `chordCell` | **未実装・実装予定なし（2026-06-27 確認）。** 操作ディスパッチ `handleCellAction` は `dig`/`flag` のみで chord概念が存在しない。必要になった時点でゲーム側に新規実装してから昇格する |

**設計方針：Actionは容易に追加できること。** 新Actionはハンドラを1つ登録するだけで動く形にする。

---

## 5. 確定仕様

### 5-1. `call` のホワイトリスト化（必須）

シナリオJSONから任意関数を呼べる設計は**禁止**。`window[fn]()` 形式は使わない。
呼び出し可能な関数は、あらかじめ登録した**ホワイトリスト経由のみ**で実行する。

```js
const ACTION_API = {
  digCell,            // (row, col)   ★実在: sphere-minesweeper.html:1935
  flagCell,           // (row, col)   ★実在: :2007（旗設置。※setFlag は存在しない）
  setMode,            // ('dig' | 'flag' | 'camera')  ★実在: :2941
  giveHint,           // ()           ★実在: :2592
  focusNearestNumberCell, // ()        ★実在: :2639
  playSE,             // (name)
  openSettingsMenu,   // ()
  // …必要に応じて追加
};
```

```json
{ "action": "call", "fn": "digCell", "args": [10, 8] }
{ "action": "call", "fn": "giveHint", "args": [] }
```

- `fn` を `ACTION_API` へディスパッチするだけの構造にする。
- **存在しない関数名**が指定された場合：エラーをログ出力し、そのステップを停止する。

### 5-2. `condition`（プレイヤー操作待ち）

正しい操作が行われるまで次へ進まない。誤操作時の挙動を以下に確定する。

```json
{
  "action": "condition",
  "type": "dig",
  "row": 10, "col": 8,
  "inputMode": "guided",
  "onError": { "message": "このマスをクリックしてください", "flash": true }
}
```

`type` は**意味（操作の種類）**で指定する。入力方法（左/右クリック・タップ）はゲーム側が吸収。

| type | 待機する操作 |
|---|---|
| `dig` | セルを掘る |
| `flag` | 旗設置 |
| `chord` | 一括処理（※ゲーム側に実装済みの場合のみ） |

検知は §6 のイベントAPI `onCellAction({row,col,type})` 経由で行う
（`board[][]` のポーリングは §6-A により禁止）。

**誤操作時（対象以外を操作した）の挙動 — 確定：**

- ステップは**進めない**
- 「そこではありません」等の短いメッセージを表示
- 対象を**再度点滅**させる
- **ペナルティは発生させない**（ゲージ消費・ゲームオーバー等を起こさない）

**入力ゲート `inputMode`（§6 と連動）：** `condition` 中は通常 `guided`（対象セルのみ許可）。
`LOCK`（全禁止）／`GUIDED`（指定セルのみ）／`FREE`（全許可）の3モードで入力を制御する。

### 5-3. `waitUntilIdle()` のタイムアウト（必須）

各Actionの実行は、ゲームの入力受付状態を尊重する。

```
waitUntilIdle({ timeout: 5000 })
        ↓
   Action 実行
        ↓
waitUntilIdle({ timeout: 5000 })
```

の順で進める。アニメーション中・演出中・入力禁止中は次のActionを実行しない。

**タイムアウト（既定 5000ms）時の挙動 — 確定：**

- エラーログを出力
- 現在のActionを**スキップ**
- **デバッグモード**：詳細（待機していた状態・経過時間・対象Action）を表示
- **通常モード**：「マニュアルを続行できませんでした」と表示して終了

### 5-4. 演出レイヤーの分離（推奨・採用）

Action固有のプロパティ（`target` / `fn` / `args`）と、全Action共通の**演出オプション**を分離する。
演出は `effect` オブジェクトに集約し、すべてのActionで共有する。

```json
{
  "action": "highlight",
  "target": { "type": "dom", "selector": "#hint-btn-outer" },
  "effect": { "duration": 800, "easing": "easeOut", "pulse": true, "color": "yellow" }
}
```

```json
{
  "action": "call",
  "fn": "digCell",
  "args": [10, 8],
  "effect": { "waitAfter": 500, "flash": true }
}
```

| effect プロパティ | 意味 |
|---|---|
| `duration` | 演出時間(ms) |
| `easing` | イージング（`easeOut` 等） |
| `pulse` / `flash` | パルス・点滅 |
| `color` | `yellow` / `cyan` / `red` / `green` |
| `waitAfter` | Action実行後の追加待機(ms) |
| `skippable` | スキップ可否 |

**利点：** 後から演出を足しても各Actionの仕様を増やさずに済む。
パーサは `action.effect` をそのまま演出ハンドラへ渡すだけでよい。

### 5-5. `cleanup()` / `dispose()`（採用・エンジン側スコープ自動回収）

「戻る」「スキップ」「チャプター変更」を許す以上、状態の後始末を必須とする。
無いと、ハイライト残留・カメラ復帰不能・`condition` リスナの多重登録などが蓄積する。

**設計確定：cleanupを各Actionに手書きさせない。エンジンがステップ単位スコープで自動回収する。**

- 各Actionは実行中に確保したリソース（ハイライトDOM/Canvas描画、イベントリスナ、タイマー、
  カメラ退避値）の**後始末関数をスコープに登録するだけ**にする。

```js
scope.add(() => clearHighlight());
scope.add(() => removeListener());
scope.add(() => restoreCamera(savedTransform));
```

- ステップを抜ける／戻る／スキップする際、エンジンが登録済みの後始末を**一括 dispose** する。
- これにより新Action追加者がcleanupを書き忘れても、登録さえあれば自動回収される。

**dispose時に確実に行うこと：** ハイライト解除・フォーカス解除・カメラ位置復元・タイマー停止・リスナ解除。

**層によって dispose の扱いが決まる（§4 の3層分類と直結）：**

| 層 | dispose時 | 理由 |
|---|---|---|
| ① Gameplay（`digCell` 等） | **戻さない** | 掘ったマスを巻き戻すとゲームが壊れる。永続状態は維持 |
| ② Visual（`highlightCell`/`camera` 等） | **dispose で消す** | 画面に残骸を残すため |
| ③ UI Animation（`pressButton` 等） | **dispose で消す** | 同上 |

### 5-6. Gameplay Action は Atomic（途中状態を見せない）

Gameplay Action（`uiEffect` 同梱を含む）は、**途中で止められない1トランザクション**として扱う。
これにより「停止できる境界はAction間だけ」となり、スキップ／デバッグジャンプ／オート再生／
エラー復帰の挙動がすべて単純化される。

- **Atomic Action の途中ではスキップ・ジャンプを受け付けない。**
  要求はそのActionの**完了境界まで保留**し、境界に達してから実行する（中断ではなく「次の境界で止まる」）。
- これにより `giveHint()` が半端に走った状態で飛ぶ、といった事故を防ぐ。
- `pressButton + wait + call` のように**3 Actionに分けて書けば**、各Action間で
  ステップ送り・スキップ・デバッグジャンプの途中停止が可能になる
  （＝止めたい箇所はAction境界として明示的に分割する）。
- **タイムアウト（§5-3）と整合：** Atomic Action がタイムアウトした場合は
  「完了境界に達していない異常終了」として扱い、通常モードは「続行できませんでした」で終了する。

### 5-6b. Gameplay APIは戻り値なし → 結果は `getCellState` で検証（2026-06-27 確認）

確認の結果、`digCell` / `flagCell` / `giveHint` は**いずれも戻り値を返さない（`undefined`）**。
さらに **fire-and-forget**で、関数が返った後に `setTimeout(…,300〜400ms)` で
カスケード消滅・アニメ・`checkWin` 等が非同期に走る（例：`flagCell`→`removeMine`→400ms後に後処理）。

したがって制御フローは**戻り値判定を使わない**：

```
× 戻り値判定 → waitUntilIdle      （戻り値が無いので不可能）
○ Action実行 → waitUntilIdle → （必要なら getCellState で結果検証）→ 次へ
```

1. Action実行（fire-and-forget）
2. `waitUntilIdle()` で**非同期の演出（カスケード消滅・後処理など）が完了するまで待つ**
3. 成否・結果の確認が必要なら `getCellState(row,col)` で**状態を読んで判定**（§6-A：API経由のみ）

#### `isBusy`/`waitUntilIdle` は **BusyCounter方式**で実装する（確定）

`setTimeout` を数える実装は**禁止**（analytics等の無関係なタイマーまで巻き込み、
「待つべきもの」と「単に存在するタイマー」を取り違えるため）。
代わりに、ゲーム側が**演出の開始/終了で明示的にカウント**する。

```js
let busyCounter = 0;

// 演出の開始〜終了を必ず対で囲う
busyCounter++;
removeMineAnimation(() => { busyCounter--; });

function isBusy(){ return busyCounter > 0; }
// waitUntilIdle は busyCounter===0 になるまで待つだけ
```

- アニメ・カスケード・球回転・ズームを**すべて同じ契約**（`busy++ … busy--`）に乗せる。
- エンジンは中身を知らず `busyCounter===0` だけを見る。新しい演出を足してもエンジンは無改修。
- 待機条件を「何を待つか」から切り離せるのが本質。

#### 設計の根幹：ゲームは Promise でなく fire-and-forget＋内部非同期

今回の確認で判明した**最重要事実**：ゲームAPIは戻り値も完了Promiseも返さず、
内部で非同期に演出を進める。したがってエンジンは各APIの完了形を個別に知る必要がなく、
**同期ポイントを `waitUntilIdle()` の一点に集約**できる。

```
Gameplay API → 状態変更 → Busy管理(++/--) → Canvas描画 → 完了 → waitUntilIdle解除
```

エンジンが知るのは `execute → waitUntilIdle → 次` のみ。これが本仕様の単純さの源泉。

### 5-7. `uiEffect`（Gameplay Action への押下演出同梱）

「ボタンを押す演出 → ゲーム処理 → ボタンが戻る」を**1つのAtomicトランザクション**にしたい場合、
Gameplay Action に `uiEffect` を同梱する。

```json
{
  "action": "call",
  "fn": "giveHint",
  "uiEffect": { "target": "#hint-btn-outer", "animation": "press" }
}
```

実行順（この間は中断不可）：

```
ボタン押下アニメ開始 → ゲーム処理実行 → ボタン復帰 → 完了
```

- シナリオ側は途中状態を意識しなくてよい。
- **演出のみ（実行を伴わない）デモ**には Gameplay Action を使わず、③ UI Animation の
  `pressButton` 単体を使う。これは副作用ゼロ（設定画面等を開かない）。

---

## 6. ゲーム本体に追加する連携API（最小限）

ゲームロジックは改変しないが、エンジン連携のため以下の**公開API**のみ追加する。

| API | 返り値／役割 |
|---|---|
| `isBusy()` | `busyCounter > 0` を返す（**BusyCounter方式**、§5-6b）。setTimeout計数は禁止 |
| `waitUntilIdle({timeout})` | `busyCounter===0` になるまで待つ Promise（タイムアウト付き、§5-3） |
| `getCellScreenPosition(row, col)` | `{ x, y, visible, radius }` を返す。球面の裏側に回り込んだセルは `visible:false` |
| `getCellState(row, col)` | セル状態（開封済み/旗/地雷/数字 等）を返す。`condition` 判定や分岐に使用 |
| `isCellVisible(row, col)` | 可視判定のショートカット |
| `loadScenarioBoard(name)` | **固定盤面を名前で注入**（例 `"basic01"` / `"oracle"`）。seedより差し替えやすい。チュートリアルの `digCell(r,c)` を毎回成立させるため必須 |
| `onCellAction(cb)` | プレイヤー操作をエンジンへ通知。`cb({row,col,type})`（`type`=`dig`/`flag`）。`condition` の検知に使用（§5-2）。**実装ポイント：中央ディスパッチャ `handleCellAction(row,col,action)`（:2897）に1行フックを足すのが最確実** |
| `setInputMode(mode)` | 入力ゲート。`LOCK`（全禁止）/`GUIDED`（指定セルのみ）/`FREE`（全許可）（§5-2） |
| `ACTION_API` | `call` 用ホワイトリスト（§5-1） |

**`loadScenarioBoard` が「重要発見①」への回答：** 盤面はランダム生成のため、シナリオが
「(10,8) を掘る」と書いても実盤面で地雷かもしれない。チュートリアルは固定盤面を名前で注入して
前提を保証する。`focusCell` の回転→ズーム→idle や、ゲームオーバー抑制も、固定盤面前提なら基本不要。

マニュアルは `getCellScreenPosition()` の結果（`x` / `y` / `visible` / `radius`）だけを使って、
ハイライト・矢印・フォーカス・説明位置を決める。
**球体の投影方法やカメラ計算を将来変更しても、マニュアル側は一切修正不要**であること。

UI（DOM）側の座標取得はAPI不要。エンジンが `getBoundingClientRect()` を使う。

---

## 6-A. 【最重要原則】公開API限定 — ゲーム内部への直接アクセス禁止

**シナリオエンジンは、ゲームの内部データ構造・描画状態へ直接アクセスしてはならない。**
操作・取得はすべて、ゲームが公開するAPI経由で行う。

| | |
|---|---|
| ❌ 禁止 | `board[row][col]` を直接読む |
| ❌ 禁止 | Canvasの内部状態・描画バッファを直接参照する |
| ❌ 禁止 | ゲーム内部のグローバル変数を直接書き換える |
| ✅ 許可 | `digCell()` / `setFlag()` 等の操作API |
| ✅ 許可 | `getCellScreenPosition()` / `getCellState()` / `isCellVisible()` 等の取得API |

これにより、ゲーム本体とマニュアルが**疎結合**になり、将来のリファクタリング
（球面投影方式の変更、盤面データ構造の変更、Canvas描画の刷新）に強い設計になる。

> 本仕様は「DOMベースのマニュアル」ではなく、
> **「ゲームの公開APIを利用したシナリオ再生エンジン」** として定義する。

---

## 7. Overlay 構成（役割の完全分離）

| レイヤー | 用途 |
|---|---|
| **Canvas（描画専用）** | 円・四角・矢印・パルス・点滅・ガイドライン |
| **DOM Overlay（UI専用）** | 説明ウィンドウ・次へ／戻る／スキップ・STEP表示・フォーカス情報 |

Canvasは描画のみ、DOMはUIのみ。混在させない。
Canvasはゲーム画面の最前面（既存 `radar-canvas` 等の z-index と整合する層）に重ねる。

### ハイライト表現

- 形状：円 / 四角 / 点滅 / 矢印
- 色：黄 / シアン / 赤 / 緑

### フォーカス（カメラ）

- 対象を**画面中央より少し上**に表示する（下部の説明ウィンドウと重ならないため）。
- ズーム対応。対象が小さい場合は自動ズーム。**終了時は元の倍率へ戻す**（カメラ退避値は§5-5でdispose）。

---

## 8. 進行表示（STEP／チャプター）

**「ページ」概念は持たない。ステップ番号で管理する。**

```
STEP 3 / 18
```

チャプターを導入する場合は「チャプター名 + ステップ番号」で表示する。

```
基本操作 3 / 18
オラクル 2 / 7
```

---

## 9. 説明ウィンドウ（DOM Overlay）

画面下部に表示。内容：

- タイトル
- 本文
- STEP表示（§8）
- 戻る / 次へ / スキップ / 自動再生 ボタン

---

## 10. デバッグ機能

- 現在ステップ表示
- 前へ / 次へ
- 任意ステップへジャンプ
- 現在フォーカス対象表示
- 対象座標表示
- 現在ズーム倍率表示

---

## 11. 将来拡張

本エンジンはマニュアル専用ではなく汎用シナリオ再生エンジンとして、
ストーリー演出・イベント・デモプレイ・リプレイへ流用する。
Actionの追加が容易であること、拡張性・保守性を最優先とする。

---

## 付録A. 確定した設計判断まとめ

| # | 判断 | 区分 |
|---|---|---|
| 1 | `call` はホワイトリスト `ACTION_API` 経由のみ。未登録fnはエラー＋停止 | 必須 |
| 2 | `waitUntilIdle({timeout:5000})` をAction前後に。超過時はスキップ／終了 | 必須 |
| 3 | 演出は `effect` オブジェクトに分離し全Action共通 | 採用 |
| 4 | cleanupはエンジンのステップ単位スコープが自動 dispose | 採用 |
| 5 | セル=Canvas/球面投影（row,col指定）、UI=DOM（selector指定）の二元。**Action自体を分ける** | 確定 |
| 6 | 座標は固定値禁止。常に動的取得 | 確定 |
| 7 | 進行は「ページ」でなく STEP / チャプター | 確定 |
| 8 | **公開API限定の原則**：`board[][]`・Canvas内部へ直接アクセス禁止。API経由のみ（§6-A） | 確定・最重要 |
| 9 | 座標計算はゲーム側 `getCellScreenPosition()`→`{x,y,visible,radius}`。マニュアルは結果だけ使う | 確定 |
| 10 | 定型操作は意味的Action（`digCell`/`flagCell`）でゲームAPIをラップ | 採用 |
| 11 | Actionは**3層構造**（① Gameplay／② Visual／③ UI Animation）。責務で分類（§4） | 確定 |
| 12 | `click`/`rightClick`/`doubleClick` は**廃止**。入力方法に依存しない意味Actionへ統一 | 確定 |
| 13 | `pressButton` 系は**副作用ゼロの演出専用**。実行を伴う押下は Gameplay に `uiEffect` 同梱（§5-7） | 確定 |
| 14 | **Gameplay Action は Atomic**。スキップ/ジャンプは完了境界まで保留（§5-6） | 確定 |
| 15 | dispose の扱いは層で決まる：Gameplay=戻さない／Visual・UI=消す（§5-5） | 確定 |
| 16 | 固定盤面 `loadScenarioBoard(name)` を注入し、シナリオの前提を保証（重要発見①） | 確定・必須 |
| 17 | `condition` 検知は `onCellAction({row,col,type})` イベント経由（ポーリング禁止） | 確定・必須 |
| 18 | 入力ゲート `inputMode` = LOCK / GUIDED / FREE（§5-2） | 確定 |
| 19 | `chordCell` は Future Gameplay Action。ゲーム側実装確認後に昇格 | 保留 |
| 20 | ゲームAPIは戻り値なし・fire-and-forget。**同期点は `waitUntilIdle` 一点**、結果検証は `getCellState`（§5-6b） | 確定・根幹 |
| 21 | `isBusy`/`waitUntilIdle` は **BusyCounter方式**（busy++/--）。setTimeout計数は禁止（§5-6b） | 確定 |

---

## 付録B. ゲームAPI実在確認（2026-06-27 実施）

`sphere-minesweeper.html` を確認し、Gameplay Action 対応APIを確定した。

| 必要API | 確認結果 | 対応 |
|---|---|---|
| `digCell(row,col)` | ✅ 実在（:1935） | そのまま採用 |
| 旗設置 | ⚠️ `setFlag` は**不在**。実態は `flagCell(row,col)`（:2007） | 仕様を `flagCell` に修正済み |
| `chordCell` | ❌ 不在・概念なし。`handleCellAction` は `dig`/`flag` のみ | Future（実装予定なし）に確定 |
| `focusCell()` | ❌ 不在（`focusNearestNumberCell`:2639 は別物） | 🔨 新規作成（Visual Action） |
| `giveHint()` | ✅ 実在（:2592） | そのまま採用 |
| 操作通知フック | 💡 `handleCellAction(row,col,action)`（:2897）が中央ディスパッチャ | `onCellAction` はここにフック |

### 残作業 → V1.0で対応済み

- [x] **新規作成APIの実装**：`focusCell`（`startAutoRotate`流用＋上オフセット＋ズーム）、`isBusy`/`waitUntilIdle`（観測ベースBusyCounter：autoRotating/zoom未収束/cell.animating/vanishキュー）、`getCellScreenPosition`（mesh world座標→投影＋法線で可視判定）、`loadScenarioBoard`（地雷座標プリセット注入）、`onCellAction`（handleCellActionラップ）、`setInputMode`
- [x] 固定盤面：`BOARD_PRESETS`（地雷座標配列）。`basic01` 登録済み
- [x] ハイライト追従：Canvasの毎フレームループで `getCellScreenPosition` を都度解決（回転・リサイズに追従）

### 今後の拡張余地（V1.1+）

- BusyCounterの本格化：現状は観測ベース。ゲーム演出を明示的に `busy++/--` で囲うとより厳密（§5-6b理想形）
- `chordCell`：ゲーム側にchord実装が入れば昇格
- シナリオ追加：`tutorial02.json` 以降、`story.json` 等
