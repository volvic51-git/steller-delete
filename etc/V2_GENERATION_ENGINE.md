# V2 盤面生成エンジン入れ替え 設計メモ

**Status:** 設計合意（実装はまだ）
**作成日:** 2026-06-30
**関連:** [`../docs/00-Architecture.md`](../docs/00-Architecture.md) / [`../docs/20-BoardFormat.md`](../docs/20-BoardFormat.md) / `V2_HANDOFF.md`

> この文書は **ゲーム挙動とロードマップ** を扱う。データ仕様（docs/）は
> Architecture §11 Non Goals によりゲーム挙動を規定しないため、ここに分離する。

---

## 0. ゴール（確定）

**当面のゴールは「Factory が事前生成・検証した盤面で遊ぶ（段階B）」まで見据える。**

単に乱数を決定論化する（段階A）だけで止めず、最終的に

```
Board Factory ──▶ 検証済み Board JSON ──▶ sphere-minesweeper.html が読み込んで遊ぶ
```

を実現する。段階A はその通過点。

---

## 1. 現状（V1）

- 生成は **クリック後・リアクティブ**：最初に押したセルの3x3を除外して `Math.random()` で配置
  （[`sphere-minesweeper.html` `placeMines`](../sphere-minesweeper.html)）
- 乱数は `Math.random()`、**seedなし・記録なし** → 同じ盤面は二度と再現できない
- `logicGuarantee` ON 時は `asyncEnsureSolvable` が `placeMines` を最大300回やり直し、
  `isSolvable`（現在は `js/solver.js` に切り出し済み）が通るまでループ
- `placeMines` 呼び出し：初手 / 保証リトライ / デバッグの3箇所

## 2. 確定した設計判断

### 2-1. 開始モデル：single startCell + ORACLE

- **盤面は事前生成・不変（Immutable）**。検証は外付け（docs 第六条）。
- **開始セルは正確に1個**（startCells 配列の要素1個。スキーマは配列維持）。
- ユーザーは **どこを押してもよい**が、押した位置は無視され、**ORACLE が唯一の startCell を開く**。
  - クリックは「開く場所の選択」ではなく「**始める合図**」。
  - 物語的に自然：「どこに触れても ORACLE が唯一の安全座標へ導く」。

### 2-2. なぜ「好きな場所で初手安全」を捨てるのか

- 「好きな場所がそのまま開いて必ず安全」は、**事前生成・不変盤面とは原理的に両立しない**。
- 救済策（押した先が地雷なら地雷を移動）は **盤面を書き換える** ため、hash と verification が
  無効化される（Immutability 違反）。検証済み保証盤面では採れない。
- よって「事前検証された保証盤面で遊ぶ」を優先し、自由は ORACLE のジェスチャーとして残す。

### 2-3. 生成器の一本化

ソルバーを `js/solver.js` に共通化したのと同じ要領で、**生成も共通モジュールに一本化**する
（例：`js/board-gen.js`）。ゲーム・Board Hunter・Factory が同じ `generateBoard(seed, params)` を呼ぶ。

- 現状ゲームの `placeMines` と Hunter の `generateMines` は **除外ロジック・配置順が既に一致**しており、
  違いは乱数（`Math.random` vs `mulberry32`）のみ。一本化すれば実装ドリフトが構造的に消える。
- **パリティ要件**：同 `seed + genVersion + params` で、ゲーム・Hunter・Factory が**完全に同一の盤面**を生成すること。これをテストで固定する。

---

## 3. 段階プラン

```
Phase 1  決定論化（段階A）
         ├ js/board-gen.js を新設し generateBoard(seed, params) を一本化
         ├ placeMines を「seed発行 → 共通関数呼び出し」の薄いアダプタに
         ├ 新規ゲームごとにランダム seed を発行・記録（UX不変、再現性を獲得）
         ├ genVersion を導入（生成ロジック変更時に必ず +1）
         └ パリティテスト：同seed+params で ゲーム == Hunter == Factory

Phase 2  ORACLE 開始モデル
         ├ 盤面に単一 startCell を持たせる
         └ 初手は位置を無視し ORACLE が startCell を開く（演出付き）

Phase 3  Factory 盤面の読み込み（段階B / ゴール）
         ├ sphere-minesweeper.html が Board JSON（mines[] / startCells）を読んで初期化
         ├ 既存の generateBoard はフォールバック（JSONが無いとき）として残す
         └ Factory/Hunter が検証した保証盤面をそのまま遊べる

Phase 4  リプレイ / 中断（当初の出発点）
         └ seed + genVersion + params + 操作ログ で再現・復元
            （startCell が1個なので「選んだ入口」の記録は不要 → 再現条件がシンプル）
```

---

## 4. 注意点・落とし穴

- **seed単体では再現できない**：`seed + genVersion + params(rows,cols,mineCount,wrap,start)` が
  揃って初めて再現。生成ロジックを1行でも変えたら `genVersion` を上げる（Traceability）。
- **保証リトライの扱い**：`logicGuarantee` のループは「**通った seed を盤面の身元として保存**」する
  形になる（300回試して当たった seed が記録対象）。
- **検証済み盤面は触らない**：読み込んだ Factory 盤面に対し、初手安全のための地雷移動などの
  後付け改変をしてはならない（Immutability / verification 無効化）。
- **フォールバック条件の明確化**：Phase 3 で「JSONが無い／読込失敗のとき」だけ generateBoard に
  落ちる、という条件を定義する（docs の v0.9 で未決事項として残っている）。

---

## 5. 未決（実装着手前に詰める）

- `js/board-gen.js` の API（`generateBoard(seed, params)` の引数・返り値）
- `placeMines` 改修の具体範囲（3呼び出し箇所の差し替え方）
- ORACLE 開始演出の具体（visual / SE / 物語フック）
- Board JSON の供給方法（`data/boards/` 同梱 / seed から都度生成 / Hunter 由来の採用フロー）
