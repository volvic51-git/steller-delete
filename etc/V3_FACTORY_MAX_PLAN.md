# Factory MAX 検証ツール — 設計書（確定版）

作成日: 2026-07-18 ／ 最終更新: 2026-07-21（**実装済み**・§8受け入れテスト①〜④全て数値完全一致）
依頼書: 「Factory MAX 検証ツール 実装依頼」（既存Factory盤面に地雷を追加し guess=0 維持限界を測る研究ツール）
実装手順書: **`etc/V3_FACTORY_MAX_WORKORDER.md`**（Sonnet 5向け。§8に実測ログあり）
成果物: `tool/board/factory-max-core.js`（アルゴリズム本体）／`tool/board/factory-max.js`（CLI、climb/sweep/resilience全モード実装済み）

## 確定事項（2026-07-18 ユーザー回答）

1. **addMinePercent＝パーセントポイント方式で確定**。表示は
   `baseDensity = 20% / extraDensity = +3% / finalDensity = 23%` の3点セットで統一。
2. **開始セル3×3除外帯は守る**（Factoryの前提条件。追加候補＝既存地雷以外かつ開始セル3×3以外）。
3. **優先順位を逆転：ケースC（漸増クライム）を主役、ケースA/Bは従**。
   A/Bは+1%で成功率10%の時点でFactory+実用化の見込みが薄く、Cは24%→30.2%の実証済み。
   「ランダム地雷追加」ではなく**「探索的地雷追加」**がFactory MAX研究の本体。
4. **Node CLIを先に作る**（`node factory-max.js`）。大量実験（100/1000/10000回）は
   ブラウザUIよりCLIが回しやすい。ブラウザUI（ヒートマップ可視化等）は後段。
5. 配置は `tool/board/` で確定。ツール名は `factory-max-explorer` で確定。

**追加要件（ユーザー提案）**：
- **density climb curve の保存**（ケースCの評価指標）：クライム中の密度推移履歴
  （20.0%→22.1%→…→30.2%）を判定ごとに記録しJSON/CSVへ。
- **却下ログの保存**：どの追加候補セル(r,c)が却下されたか（＝どの1個が論理を壊したか）を
  試行番号付きで全記録。将来の「壊れやすいセル／壊れにくいセル」ヒートマップ研究の材料。
  ※これはケースCだからこそ取れるデータ（一括追加のA/Bでは致命傷の1個を特定できない）。

---

## 0. 結論サマリ（先に読む）

1. **技術的な障害はゼロ**。`isSolvable()`・`computeNeighborMines()`・`generateMineSet()` は
   すべて純関数モジュールで、ツール単独から（ブラウザでもNode.jsでも）そのまま呼べる。
   本レビュー作成時に実際にNode.jsから呼んで動作・パリティを確認済み（§2）。
2. **事前実測により、依頼書の「ケースA/B（ランダム一括追加）」は限界が低いことが判明**。
   72×144の20%ベースでは +1%（21%）で成功率約10%、+2%（22%）で0/10。
   ランダム一括追加で稼げる密度は **+0.5〜1ポイント程度** の見込み。
3. **代わりに「漸増方式（ケースC・本レビューで追加提案）」が大きく有望**。
   1個追加→isSolvable→失敗なら戻す、を繰り返す方式で、30×64の24%ベースから
   **わずか200回の判定（38秒）で30.2%に到達、なお上昇余地あり**。
   小型盤面の「27%の壁」を既に突破している。
4. 実行時間は 72×144 で **1判定 約2〜6秒**。1000試行なら単スレッド約45分、
   8並列で約6分。長時間バッチは**Node CLIで先行実装**（確定）。ブラウザUI版を作る際は
   WebWorkerプール必須（UIスレッドで2〜6秒の同期処理は不可）。

---

## 1. 実装前確認事項への回答（依頼書の5項目）

### 1-1. isSolvable() をツール単独から呼べるか → **呼べる（確認済み）**

`js/solver.js` はDOM・グローバル非依存の純関数UMDモジュール。
`<script src>`／Workerの`importScripts`／Nodeの`require`すべてで動く
（末尾の `typeof self !== 'undefined' ? self : this` で全環境対応済み）。
既に `tool/board/board-benchmark.html` が全く同じ形で単独利用している実績あり。

```js
StellerSolver.isSolvable({
  rows, cols,
  mineCount,            // ★追加後の実地雷数を渡すこと（全体制約に使われる）
  wrapCols: true, wrapRows: false,   // 円柱
  start: {r, c},        // ★プールJSONの params.start と同一にすること
  cellAt: (r,c) => ({ isMine, neighborMines })
});
```

**別実装は一切不要**。Factory判定との完全一致は構造的に保証される。

### 1-2. Factory盤面JSONの読み込み方法 → **seedプール形式＋generateMineSetで再生成**

`data/board/*.json` は **seedのみ**の形式（mines配列・hashは無い）。
盤面本体は `js/board-gen.js` の `generateMineSet({rows, cols, mineCount, start, seed})`
でその場で再生成する（ゲーム側のstageEX起動経路と同一の方法）。

現在のプール資産:

| ファイル | 盤面 | 密度 | 地雷数 | seed数 |
|---|---|---|---|---|
| 72x144_18.json | 72×144 | 18% | 1866 | 78 |
| 72x144_20.json | 72×144 | 20% | 2074 | 108 |
| 34x72_23.json  | 34×72  | 23% | 563  | 118 |
| 30x64_24.json  | 30×64  | 24% | 461  | 57 |

読み込みは dev server 経由の `fetch('../../data/board/xxx.json', {cache:'no-store'})` を基本とし、
`<input type="file">` での任意JSON投入も併設（Hunter生ログ等の実験用）。

### 1-3. neighborMines再計算関数の流用可否 → **流用可（専用関数が既にある）**

`StellerSolver.computeNeighborMines(rows, cols, isMineAt, wrapCols, wrapRows)` が
まさにこの用途（コメントに「Factory用」と明記）。実測 72×144 で **5〜25ms/回**と軽い。
「正確性優先」の方針どおり、差分更新はせず**毎試行フル再計算**でよい。

### 1-4. 1000回試行のおおよその実行時間 → **実測済み。下表**

本レビュー作成時にNode.js（このPC実機）で実測した値:

| 盤面 | isSolvable 1回 | 1000試行(単スレッド) | 1000試行(8 Worker) |
|---|---|---|---|
| 72×144 (20%+追加) | 平均2.3〜3.3秒、最大6.6秒 | **約40〜55分** | **約5〜7分** |
| 30×64 (24%+追加) | 約0.2〜0.3秒 | 約4分 | 約30秒 |

- 失敗盤面でも速くならない（詰まるまでに多パス回るため）。むしろ追加数が多いほど遅い傾向。
- neighborMines再計算・盤面生成は誤差（合計30ms未満/試行）。時間はほぼisSolvable。

### 1-5. WebWorker化が必要か → **必要（v1から入れる）**

- 1判定2〜6秒の同期処理は、チャンク実行にしてもUIが数秒単位で固まり続ける。
- `solver.js`／`board-gen.js`はWorker互換確認済み。`importScripts`で読むだけ。
- **Workerプール（`navigator.hardwareConcurrency-1`個）**で試行を分配。
  試行同士は完全独立なのでランダムスイープはほぼ線形にスケールする。
- 漸増方式（ケースC）は1本のクライムが逐次依存のため並列化不可。ただし
  「複数のbase seed／複数のaddSeedを並走」させる形でプールを活用できる。

---

## 2. 事前実測の結果（2026-07-18、Node.js v24 実機）

計測スクリプトはスクラッチ（リポジトリ外）。`js/board-gen.js`＋`js/solver.js`を
requireし、`data/board/*.json`の実seedを使用。

### 2-1. パリティ確認（ベースライン）

72x144_20.json の先頭5seedを再生成→isSolvable → **5/5 solvable=true**。
プール収録盤面がツール側でも正しく guess=0 判定される＝Factory判定との一致を実地確認。

### 2-2. ケースA/B: ランダム一括追加（72×144、20%ベース、各10試行）

| 追加 | 追加地雷数 | 到達密度 | 成功率 |
|---|---|---|---|
| +0.5% | 52 | 20.5% | 6/10 (60%) |
| +1% | 104 | 21.0% | 1/10 (10%) |
| +2% | 207 | 22.0% | 0/10 |
| +3% | 311 | 23.0% | 0/10 |

※試行数10は感触把握用。本ツールで統計を取り直すのが目的だが、
**曲線が急峻なこと自体は確度が高い**（rejection samplingの18%→20%で1/30になる
急落と同じ構造。一括追加は「当たり位置を全部同時に引く」必要があるため）。

### 2-3. ケースC: 漸増方式（30×64、24%ベース、判定予算200回）

1個追加→isSolvable→失敗なら戻す、の繰り返し（候補セルはシャッフル順）:

```
calls= 50  accepted=40  密度26.1%
calls=100  accepted=72  密度27.8%   ← 小型盤面の「27%の壁」突破
calls=150  accepted=100 密度29.2%
calls=200  accepted=119 密度30.2%   （38秒、まだ受理率38%で上昇継続中）
最終盤面の再検証: solvable=true
```

**採択率は徐々に下がるが枯れていない**。予算を増やせばさらに上がる見込み。
1個ずつなら「その1個が論理を壊さないか」だけを満たせばよいので、
一括追加と違い指数的に不利にならない。これがFactory MAXの本命ルートと考える。

---

## 3. ツール設計

### 3-1. 配置・構成（CLIファースト、確定）

```
tool/board/factory-max-core.js         … アルゴリズム本体（Node/Worker/ブラウザ共用・純関数）
tool/board/factory-max.js              … Node CLIエントリ（★最初に作る）
tool/board/factory-max-explorer.html   … ブラウザUI（後段。ヒートマップ可視化・Workerプール）
tool/board/factory-max-worker.js      … Workerエントリ（ブラウザUI用、後段）
```

- 実装順: **core → CLI → （実験が回り始めてから）ブラウザUI**。
- 依頼書の`tools/`はリポジトリ規約に合わせ **`tool/board/`** とする（tools/は過去に統合済み）。
- CLI例: `node tool/board/factory-max.js --mode climb --pool data/board/30x64_24.json
  --budget 500 --baseSeed auto --addSeed 777 --out results/`
- 依存は `js/solver.js`・`js/board-gen.js` のみ（requireでの動作は実測確認済み）。
  ゲーム本体には一切触らない。

### 3-2. モード（優先順に）

| 優先 | モード | 内容 | 対応 |
|---|---|---|---|
| ★1 | C: 漸増クライム | 1個ずつ追加で最高密度を追求。予算・停滞打ち切り条件付き。climb curve＋却下ログを全記録 | Factory MAX研究の本体 |
| 2 | A: ランダムスイープ | 追加率リスト×試行数で成功率カーブを測る（比較対照データとして） | 依頼書ケースA/B |
| 3 | B: 盤面別耐性 | base seedを固定し、seedごとの限界（クライム到達密度）を測る | 依頼書追加分析2 |

※モードBの「耐性」指標も、A方式の限界追加率ではなく**C方式のクライム到達密度**で測る方が
盤面品質の比較として意味がある（Aは天井が低すぎて差が出ない）。

### 3-3. アルゴリズム（モードA、1試行）

```
1. プールJSONからbase seedを選択（順繰り or 乱択）
2. generateMineSet(base) → ベース地雷Set（決定論）
3. addSeed = 記録付きで発行 → mulberry32(addSeed)
4. 追加数 = round(totalCells × addPercent/100) を
   「非地雷 かつ 開始セル3×3除外帯以外」からランダム選択して追加
5. computeNeighborMines フル再計算
6. isSolvable（mineCount=追加後の実数、start=プールのparams.start）
7. 統計へ集計（成功/失敗、密度、時間、追加位置）
```

**決定論の担保（重要）**: 追加地雷の選択も `mulberry32(addSeed)` による決定論とし、
選択ループの書き方を固定して `ADD_VERSION = "1"` を導入する（board-genのGEN_VERSIONと
同じ互換契約）。これにより:
- すべての試行が `(baseSeed, addSeed, addPercent)` から完全再現可能
- 将来ゲームに載せる際、Factory MAX盤面を「baseSeed + addSeed + addCount」の
  **コンパクトなseed拡張形式**で配布できる可能性が開ける（現行seedプール経路の自然な拡張）

### 3-4. 出力

- **密度表示の統一形式**: 常に `baseDensity / extraDensity / finalDensity` の3点セット
  （例 `20.0% / +3.0% / 23.0%`）。テーブル・ログ・保存JSONすべてこの形式。
- **density climb curve（モードC必須）**: 判定1回ごとに
  `{call, candidate:{r,c}, accepted, minesNow, densityNow}` を記録した全履歴配列。
  受理時点だけの縮約カーブ（20.0→22.1→…→30.2）もサマリに併載。CSV/JSON両対応。
- **却下ログ（モードC必須）**: 却下された候補セル(r,c)と試行番号の全記録
  （climb curveの`accepted:false`行がそのまま該当）。「どの1個が論理を壊したか」の
  一次データであり、将来の壊れやすさヒートマップ研究の材料。
- **成功率テーブル（モードA）**: 追加率ごとの tested / success / rate% / 平均密度 / 平均判定ms
- **CSV/JSON保存**: board-benchmark.htmlと同じ形式感（1行=1試行、seed・判定・時間）
- **最高密度盤面の保存**: 成功盤面のうち最高密度をJSON保存。形式は
  `board-gen.js`の`canonicalBoard`/`hashBoard`準拠の**mines直接収載＋hash**
  （追加後盤面はseedだけでは再現できないため事実として全収載。Immutability原則どおり）。
  metaに出自 `{baseSeed, addSeed, addVersion, addPercent, basePool}` を記録（Traceability）。
- **ヒートマップ（v1に含む）**: 144×72のcanvasに「成功試行の追加位置」「失敗試行の追加位置」
  を累積描画し、壊れにくい場所／壊れやすい場所を可視化。実装コストが低いため後回しにしない。

### 3-5. 後回しにするもの

- **失敗理由の分類**（推理不能／複数解 等）: `isSolvable()`はboolしか返さず、内部状態を
  取るには関数改修が必要。**isSolvableは認定基準そのものなので触らない**
  （genVersionパリティと同種の互換契約。[[project-high-density-boards]]の結論を踏襲）。
  依頼書も「無理なら後回し」につき対象外。将来やるなら「停滞点で止まれる別関数の追加」
  （既存関数は無改変）として別途レビュー。

---

## 4. 実行時間の目安（設計反映後）

| 作業 | 構成 | 目安 |
|---|---|---|
| 72×144 スイープ 5率×200試行 | 8 Worker | 約30〜40分 |
| 72×144 スイープ 5率×1000試行 | Node夜間バッチ | 数時間 |
| 30×64 スイープ 5率×1000試行 | 8 Worker | 約3分 |
| 漸増クライム 72×144 1本（予算1000判定） | 逐次（並列不可） | 約45〜90分 |
| 漸増クライム 30×64 1本（予算500判定） | 逐次 | 約2〜3分 |
| 漸増クライム×複数seed並走 | seedごとにWorker割当 | ほぼ線形短縮 |

進捗バー・途中停止・途中結果のCSV保存（長時間バッチの保険）を必須要件とする。

---

## 5. 実装前確認事項 → **全項目回答済み（冒頭「確定事項」参照）**

1. addMinePercentの定義 → パーセントポイント方式で**確定**（表示はbase/extra/finalの3点セット）
2. 追加地雷の除外帯 → 開始セル3×3除外を**守る**（Factory前提条件、比較実験のノイズ排除）
3. ケースC → **v1に含める、むしろ主役に逆転**（A/Bは比較対照に格下げ）
4. Node CLI → **併設どころかCLIを先に作る**
5. 対象プール → 72x144_20＋30x64_24の2本立てで着手（回答時に明示的異論なし）

---

## 6. 将来（V3ゲーム組み込み）への申し送り

- Factory MAX盤面の配布形式は2択:
  **(a)** mines+hashフル収載プール（ゲーム側に新しい`boardSource`形式対応が必要、
  [[project-high-density-boards]]の案2搬入経路と同じ）／
  **(b)** `baseSeed+addSeed+addCount`のseed拡張形式（ADD_VERSION互換契約が前提。
  現行seedプール経路の小改修で済む。漸増方式の盤面はソルバー依存のため(a)のみ可）。
- 高密度盤面はnoflagルールとの相性が良い（明白な地雷を旗る作業が消えるため）。
- ヒートマップの知見は、将来の「摂動修復方式」「事前開示セル方式」
  （50%級を狙う場合の本命、[[project-high-density-boards]]）の設計材料になる。
