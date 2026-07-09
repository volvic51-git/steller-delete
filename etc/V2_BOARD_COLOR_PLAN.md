# V2 盤面2色化（パレット方式）実装計画書

作成日: 2026-07-09 / 対象: `sphere-minesweeper.html` + `data/stage-params.json` + `etc/stellar-delete-stage-params-editor.html`

> **ステータス: 計画のみ（未実装）**

---

## 0. ゴール

**未開封セルの色を、東西（列位置）で2色に分ける。** 全ステージに適用する（実装コストが東西2色専用でも汎用パレットでも同程度のため）。

- 今回作る仕組みは「2値（0=西色, 1=東色）」だが、**将来の「セル単位で自由に色を塗るツール」への拡張を見据えて、
  最初から汎用的な「セルごとのパレットindex」方式で設計する**（Q1確定・後述）。
- 東西2色は、この汎用パレットの上に乗る「初期パレット定義の一種」として実装する（特別扱いしない）。

---

## 1. 現状の棚卸し（関連コード）

盤面の色は `window._boardTheme`（1色のhex文字列。nullならデフォルト青）を起点に、
`buildThemeColors(hex)` が `{cell, cellEmit, border, openCell, openEmit, openBorder}` の色セットを生成し、
各所で使われている。

| 箇所 | 現状 | 備考 |
|---|---|---|
| `createCellMesh(cell)` | セルごとに`buildThemeColors(window._boardTheme)`を呼び、`material.color/emissive`に設定 | **既にセル単位で呼ばれている**（ループ外で1回にキャッシュされていない）→ 拡張しやすい |
| `buildCellBorderSegs()` / `setCellBorderColor(cell,hex)` | 統合LineSegments（頂点カラー方式・性能改善済み）。現状は全セル同じ`_bc.border`を渡している | **既にセル単位のAPI**（`setCellBorderColor`は1セル分の8頂点だけ書き換える）→ 拡張しやすい |
| `getNumberColor(idx)` | `window._boardTheme`という**単一のグローバル値**の明度(`hexLuminance`)で、数字の色セット（暗色/明色）を切り替え | セルごとのテーマを見るように改修が必要 |
| `buildCageWire()` | `window._boardTheme`で牢屋ワイヤーの色を決定 | **盤面全体で1色のまま据え置き**でよい（セルの色分けとは無関係な外側の演出のため） |
| `applyBoardColor(hex)` / デバッグメニュー「盤面色」プルダウン | 1色を選ぶUI | 2色（またはパレット）に対応した選択UIへ改修が必要 |
| `data/stage-params.json` の `boardColor` | 1色のhex文字列 | 2色対応のフィールド拡張が必要（全9ステージ分） |
| `etc/stellar-delete-stage-params-editor.html` | `boardColor`の単色ピッカーでstage-params.jsonを編集するツール | 同様に2色対応が必要 |
| 周回モード `loopColors`（配列、1周ごとに1色） | `window._boardTheme = loopColors[currentLoop-1]` | 1周ごとに「色ペア」を持たせる形に拡張が必要（対象は現状stage9のみ） |
| 中断保存 (`saveSuspend`meta.boardTheme) / リプレイ (`_replay`) / resumeSuspend | `boardTheme`を1つのhexとして保存・復元 | 後方互換を保ちつつ2色（パレット参照）を保存する形に拡張 |

---

## 2. データ形式（Q1確定：汎用パレットindex方式）

### 2.1 テーマ定義（パレット）
```jsonc
// 1ステージ分のテーマ定義（stage-params.jsonのboardColor相当を置き換え）
"boardPalette": ["#0044aa", "#006622"]   // index 0, 1, ... の色配列。既存の単色ステージは要素数1のままでよい
```
- 要素数1 → 従来通り全セル同色（後方互換）。
- 要素数2以上 → セルごとに`getCellPaletteIndex(cell)`関数の返すindexで参照。

### 2.2 セル→パレットindexの対応規則（初期実装）
```js
// 東西2分割（初期実装。将来はここを「セルごとの保存済みindex配列」に差し替え可能な形にしておく）
// 引数は(row,col)ではなく cell オブジェクト（既存の setCellBorderColor(cell,hex) / createNumberMesh(cell)
// 等と同じ慣習に合わせる）。将来 Factory盤面の cellPaletteMap と結合する際、内部実装だけ
// 差し替えれば済み、呼び出し側は無改修で済む。
function getCellPaletteIndex(cell){
  return cell.col < COLS/2 ? 0 : 1;
  // 将来: return currentBoardData.cellPaletteMap[cell.row*COLS + cell.col];
}
```
- 現時点ではロジック（列位置の閾値）で決め打ち。将来の「お絵描きツール」では、ここを
  **盤面ごとに保存されたindex配列**（`Uint8Array`相当、セル数分）に差し替えるだけで対応できる設計とする。
- 将来の自由描画に備えて、`getCellPaletteIndex`は**関数として抽象化**しておき、呼び出し側（`createCellMesh`等）は
  「今どういう規則でindexが決まっているか」を意識しない形にする（Non Goalsの原則: 描画側はルールを知らない）。
- **`getNumberColor`もこの方針に合わせる**：`getNumberColor(idx, themeHex)`ではなく
  `getNumberColor(idx, paletteIndex)`にする。hex解決（`window._boardPalette[paletteIndex]`→明度判定）は
  `getNumberColor`の内部に閉じ込め、呼び出し側は`getCellPaletteIndex(cell)`の返り値をそのまま渡すだけにする。
  こうしておけば、`cellPaletteMap`導入時も`getNumberColor`自体は無改修で済む（変更が`getCellPaletteIndex`
  1箇所に閉じる）。

### 2.3 将来（お絵描きツール）の拡張イメージ（参考・今回は実装しない）
```jsonc
// data/board/ 系のBoard JSONに追加する想定のフィールド（例）
"cellPalette": ["#0044aa","#006622","#884400", ...],       // 使う色一覧（数は自由）
"cellPaletteMap": [0,0,1,1,2,0, ...]                        // 全セル分のindex配列（row-major, r*cols+c順）
```
- 10,368セル（144×72）でも、index配列はUint8Array相当で高々10KB程度。ファイルサイズ・パース負荷とも軽微。
- ツール本体（塗るUI）は別途 `tool/` 配下に新規作成する想定（本計画の対象外）。

---

## 3. 実装ステップ（着手時の順序案）

1. **`buildThemeColors`を複数テーマ対応に**：`window._boardTheme`（単一hex or null）を、
   `window._boardPalette`（hex配列 or null）に置き換え。要素数1なら従来と完全に同じ挙動。
2. **`getCellPaletteIndex(cell)`を追加**：東西分割ロジックをここに実装（`cell`オブジェクトを引数に取る）。
3. **`createCellMesh`**：`buildThemeColors(window._boardPalette?.[getCellPaletteIndex(cell)] ?? window._boardPalette?.[0])`
   のように、セルごとに参照するテーマを切り替え。
4. **`buildCellBorderSegs`**：全セル同色で`setCellBorderColor`を呼んでいる箇所を、セルごとのパレットindexに応じた
   `border`色に変更。
5. **`getNumberColor(idx, paletteIndex)`**：シグネチャを`(idx)`→`(idx, paletteIndex)`に変更。
   hexの解決（`window._boardPalette[paletteIndex]`）と明度判定は関数内部で行う。呼び出し側は
   `getNumberColor(cell.neighborMines, getCellPaletteIndex(cell))`のように呼ぶ。
6. **`applyBoardColor` / デバッグメニュー**：2色（西色・東色）を選べるUIに変更。既存の1色プルダウンを2つに増やすか、
   簡易的に「西色」「東色」の2つのカラーピッカーにする。
7. **`data/stage-params.json`**：`boardColor`（単色）→ `boardPalette`（配列）へ全9ステージ分を移行
   （既存値をそのまま`[既存色]`として1要素配列にすれば後方互換）。stageEXにも東西色を設定。
8. **`etc/stellar-delete-stage-params-editor.html`**：`boardColor`単色ピッカーを配列編集（2色分の入力）に対応。
9. **周回モード（`loopColors`）**：1周ごとの色を「色ペアの配列」に変更（`loopPalettes = [['#0044aa','#006622'], ...]`のような形）。
   対象は現状stage9のみ。
10. **中断/リプレイの保存データ**：`meta.boardTheme`（単色）→ `meta.boardPalette`（配列）に変更。
    旧形式（文字列1つ）が来た場合は`[文字列]`として読み替えるフォールバックを入れ、後方互換を保つ。
11. テスト（§5）を実施。

---

## 4. 決定事項 / 確認済み

| # | 論点 | 決定 |
|---|------|------|
| Q1 | データ形式 | **汎用パレットindex方式**を採用。今は東西2値だが、将来の自由描画（セルごとの任意色）への拡張を見据える |
| Q2 | 対象範囲 | **全ステージに適用**（実装コストがstageEX限定でも全体でも同程度のため） |
| Q3 | 対象は未開封セルのみか | **未開封セルが対象**（開封済みセルには数字が乗るため、色分けの主眼は未開封セル） |
| Q4 | CPU/性能影響 | **問題なし**（盤面生成時に1回決まる静的な色。毎フレーム再計算されるものではないため） |

### なお未決（実装着手時に確定でよい）
| # | 論点 | 選択肢 | 備考 |
|---|------|--------|------|
| Q5 | 東西境界 | `COLS/2`固定 / ステージごとに指定可能にするか | 単純さ優先なら固定でよい |
| Q6 | 数字の色コントラスト | 西と東で明度が大きく違う配色の場合、`getNumberColor`の暗色/明色セットもセルごとに正しく切り替わるようにする（§3-5で対応） | 実装時に東西で明度差がある配色を用意してテストする |
| Q7 | cage wire（牢屋ワイヤー）の色 | 現状通り単色のまま据え置き / 将来的にどちらかのテーマ色に寄せるか | 今回は据え置き推奨 |
| Q8 | 周回モードの色ペア | 各周ごとに東西2色を手動指定 / 既存1色から自動生成（例: 明暗違いの2色を自動生成） | 手動指定の方が確実 |

---

## 5. テスト観点

1. 既存ステージ（1〜8, 9）が`boardPalette`移行後も**見た目が変わらない**こと（1要素配列＝後方互換の確認）。
2. stageEXで東西2色が正しく塗り分けられること（`COLS/2`を境に色が切り替わる）。
3. 開封済みセル・数字の見え方が東西どちらでも問題ない（コントラスト含む）こと。
4. デバッグメニューの盤面色UIから東西それぞれの色を変更できること。
5. 中断→再開、リプレイ再生で色が正しく復元されること（新旧データ形式どちらでも）。
6. 周回モード（stage9）で、周ごとの色ペア切り替えが従来通り動作すること。
7. 72×144の大盤面で、盤面生成（`initBoard`/`buildCellBorderSegs`）の所要時間が今までと有意差がないこと（§4 Q4の確認）。

---

## 6. 影響範囲まとめ（ファイル一覧）

- `sphere-minesweeper.html`：`buildThemeColors`／`cellPaletteIndex`（新規）／`createCellMesh`／`buildCellBorderSegs`／
  `setCellBorderColor`呼び出し元／`getNumberColor`／`applyBoardColor`／デバッグメニューUI／
  `saveSuspend`・`resumeSuspend`・リプレイ保存周り／`loopColors`関連
- `data/stage-params.json`：全ステージの`boardColor`→`boardPalette`移行
- `etc/stellar-delete-stage-params-editor.html`：編集UIの2色対応

---

## 7. 次のアクション

実装はまだ着手しない。次回入る場合はこの計画書の§3の順序に従う。
§4の未決事項（Q5〜Q8）は実装開始時にユーザーと確認する。
