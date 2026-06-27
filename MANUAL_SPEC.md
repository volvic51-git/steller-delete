# Stellar Delete — マニュアル／シナリオ再生エンジン 確定仕様書 V1.0

> 作成日: 2026-06-27　対象ブランチ: master　対象画面: `sphere-minesweeper.html`
> ステータス: **確定（実装未着手 / 保留中）**

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

## 4. Action 一覧

**DOM（UI）対象**

| action | 役割 |
|---|---|
| `highlight` | UI要素を強調表示（`target`=セレクタ） |
| `focus` | UI要素へカメラ／視線移動 |
| `click` | UIの左クリックを再現 |

**Canvas（盤面セル）対象 — `row`/`col` 指定**

| action | 役割 | 内部呼び出し |
|---|---|---|
| `highlightCell` | セルを強調表示 | `getCellScreenPosition` で位置取得 |
| `focusCell` | セルを画面中央やや上へカメラ移動（必要に応じ自動ズーム） | `getCellScreenPosition` |
| `dig` | セルを掘る | `digCell(row,col)` |
| `flagCell` | セルに旗を設置 | `setFlag(row,col)` |

**共通**

| action | 役割 |
|---|---|
| `message` | 説明文を表示 |
| `moveMouse` | マウス移動の演出 |
| `wait` | 一定時間待機 |
| `call` | ホワイトリスト関数の呼び出し（§5-1） |
| `next` | プレイヤーの「次へ」押下待ち |
| `condition` | 正しい操作が行われるまで待機（§5-2） |
| `finish` | シナリオ終了 |

**意味的Action（推奨）：** `dig` / `flagCell` のように、JSONはゲーム関数名でなく
**操作の意味**で書く。エンジン内部で `digCell()` 等のゲームAPIへラップする。
これによりJSONがゲームロジックに依存しすぎず、可読性が上がる。
（汎用の `call` も残すが、定型操作は意味的Actionを優先する。）

**設計方針：Actionは容易に追加できること。** 新Actionはハンドラを1つ登録するだけで動く形にする。

---

## 5. 確定した4本柱の仕様

### 5-1. `call` のホワイトリスト化（必須）

シナリオJSONから任意関数を呼べる設計は**禁止**。`window[fn]()` 形式は使わない。
呼び出し可能な関数は、あらかじめ登録した**ホワイトリスト経由のみ**で実行する。

```js
const ACTION_API = {
  digCell,            // (row, col)
  setFlag,            // (row, col)   ※ゲーム側の旗設置APIに対応
  setMode,            // ('dig' | 'flag' | 'camera')
  giveHint,           // ()
  focusNearestNumberCell, // ()
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
  "type": "leftClick",
  "target": { "type": "cell", "row": 10, "col": 8 },
  "onError": { "message": "このマスをクリックしてください", "flash": true }
}
```

| type | 待機する操作 |
|---|---|
| `leftClick` | 左クリック |
| `rightClick` | 右クリック |
| `flag` | 旗設置 |
| `doubleClick` | ダブルクリック |

**誤操作時（対象以外を操作した）の挙動 — 確定：**

- ステップは**進めない**
- 「そこではありません」等の短いメッセージを表示
- 対象を**再度点滅**させる
- **ペナルティは発生させない**（ゲージ消費・ゲームオーバー等を起こさない）

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

---

## 6. ゲーム本体に追加する連携API（最小限）

ゲームロジックは改変しないが、エンジン連携のため以下の**公開API**のみ追加する。

| API | 返り値／役割 |
|---|---|
| `isBusy()` | アニメーション中・演出中・入力禁止中なら `true` |
| `waitUntilIdle({timeout})` | idleになるまで待つ Promise（タイムアウト付き、§5-3） |
| `getCellScreenPosition(row, col)` | `{ x, y, visible, radius }` を返す。球面の裏側に回り込んだセルは `visible:false` |
| `getCellState(row, col)` | セル状態（開封済み/旗/地雷/数字 等）を返す。`condition` 判定や分岐に使用 |
| `isCellVisible(row, col)` | 可視判定のショートカット |
| `ACTION_API` | `call` 用ホワイトリスト（§5-1） |

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
| 10 | 定型操作は意味的Action（`dig`/`flagCell`）でゲームAPIをラップ | 採用 |
