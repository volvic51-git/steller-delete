# Factory MAX 検証ツール — 実装ワークオーダー（Sonnet 5向け）

作成日: 2026-07-18 ／ 最終更新: 2026-07-21（**実装済み**。§8受け入れテスト全て完全一致、§11に実施結果）
設計書: `etc/V3_FACTORY_MAX_PLAN.md`（設計確定済み。本書とセットで読むこと）

この文書は単独セッションで実装を完遂できるよう自己完結で書いてある。
不明点が出たら推測で進めず、設計書→本書の順で該当箇所を再読すること。

---

## 0. ゴールと絶対制約

**作るもの**: 既存Factory盤面（seedプール）に地雷を1個ずつ探索的に追加し、
guess=0（論理のみで全クリア可能）を維持したままどこまで密度を上げられるかを
測定する**Node CLIツール**。ゲーム本体には一切組み込まない研究用オフラインツール。

**絶対制約（違反したら成果物ごと無効）**:
1. **`js/solver.js`・`js/board-gen.js` は1文字も変更しない**。solver は認定基準そのもの、
   board-gen は GEN_VERSION 互換契約下にある。ソルバー・生成器・ハッシュのロジックを
   ツール内に再実装（コピペ含む）することも禁止。必ず `require` して使う。
2. 判定は `StellerSolver.isSolvable()` **のみ**。Factory判定と完全一致させるため。
3. 追加地雷の選択は決定論（`mulberry32(addSeed)`）とし、本書 §4 のアルゴリズムを
   **一字一句この通りに**実装する（`ADD_VERSION = "1"` の互換契約。§8の再現テストで
   数値が完全一致しなければ実装が仕様から逸脱している＝合格にしない）。
4. ブラウザUI・WebWorker・失敗理由分類・ゲーム側組み込みは**本ワークオーダーの対象外**。

**動作確認済みの前提**（2026-07-18、このPCで実測済み）:
- Node.js v24.16.0。`require('js/solver.js')`・`require('js/board-gen.js')` は動く（UMD）。
- `globalThis.crypto.subtle`（hashBoard用）・`performance.now()` はNodeグローバルで利用可。
- 72×144の isSolvable は1回2〜6秒、30×64は0.2〜0.3秒。

---

## 1. Git 手順

1. `master` から作業ブランチを切る: `git checkout master && git checkout -b feature/factory-max-explorer`
   （**現在のカレントが `debug/noflag-72x144-check` 等でも、必ずmasterから切る**）
2. commit・branch操作は許可なしで実行してよい。**pushはしない**（ユーザーが行う）。
3. 実装完了後、本書と `etc/V3_FACTORY_MAX_PLAN.md` のステータス行を「実装済み」に更新して
   同ブランチにcommitする（プロジェクトの慣例）。マージはユーザーの動作確認後。

---

## 2. 成果物（新規ファイル3つ＋.gitignore）

```
tool/board/factory-max-core.js   … アルゴリズム本体。純関数・UMD（solver.jsと同じ様式）
tool/board/factory-max.js        … Node CLIエントリ
.gitignore                       … 新規作成。「tool/board/results/」1行を入れる
```

結果出力先は `tool/board/results/`（CLIが `fs.mkdirSync(..., {recursive:true})` で作る）。
リポジトリには含めない（.gitignore対象）。

**core のUMDひな形**（solver.js末尾と同じ方式にする）:
```js
(function (global) {
  'use strict';
  const ADD_VERSION = "1";
  // Node では require、ブラウザでは事前に <script> 読込済みの global を使う
  const BoardGen = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('../../js/board-gen.js') : global.StellerBoardGen;
  const Solver = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('../../js/solver.js') : global.StellerSolver;
  // ... 本体 ...
  const FactoryMaxCore = { ADD_VERSION, buildBase, checkSolvable, addMinesBulk,
    runSweepTrial, runClimb, buildBoardJson };
  if (typeof module !== 'undefined' && module.exports) module.exports = FactoryMaxCore;
  global.FactoryMaxCore = FactoryMaxCore;
})(typeof self !== 'undefined' ? self : this);
```
※ requireの相対パスはmodule解決基準（このファイルの場所）なので `../../js/` で正しい。
CLI側では `path.join(__dirname, ...)` を使い、カレントディレクトリに依存させないこと。

---

## 3. 入力データの仕様（実在ファイルで確認済み）

`data/board/*.json` は **seedプール形式**（mines配列・hashは無い）:

```json
{
  "campaignId": "C1-72x144-20",
  "genVersion": "1",
  "params": { "rows": 72, "cols": 144, "density": 0.2, "mineCount": 2074,
              "wrap": "cyl", "start": { "r": 36, "c": 72 } },
  "boards": [ { "seed": 3562185, "reporter": null }, ... ]
}
```

| ファイル | 盤面 | 密度 | mineCount | seed数 |
|---|---|---|---|---|
| data/board/72x144_18.json | 72×144 | 18% | 1866 | 78 |
| data/board/72x144_20.json | 72×144 | 20% | 2074 | 108 |
| data/board/34x72_23.json  | 34×72  | 23% | 563  | 118 |
| data/board/30x64_24.json  | 30×64  | 24% | 461  | 57 |

- `wrap:"cyl"` → `wrapCols=true, wrapRows=false`（本プールは全てcyl。他値が来たらエラーで停止）
- `genVersion` がプールとBoardGen.GEN_VERSIONで不一致ならエラーで停止（黙って続行しない）
- 盤面本体は毎回 `BoardGen.generateMineSet({rows, cols, mineCount, start, seed, wrapCols, wrapRows})`
  で再生成する（返り値は `Set<number>`、キーは `r*cols+c`）
- **地雷数は以後必ず `mineSet.size` を使う**（generateMineSetはmineCountをクランプすることがある）

---

## 4. core の関数仕様（決定論の核心。この通りに書く）

### 4-1. buildBase({pool, seed})

プールJSONオブジェクトとseedから基礎データを組み立てて返す:
```js
{ rows, cols, start, wrapCols, wrapRows, totalCells,
  exclude,          // BoardGen.excludeZone(rows, cols, start.r, start.c, wrapCols, wrapRows)
  mineSet,          // generateMineSet の結果（Set<number>）
  baseMines,        // mineSet.size
  baseDensity }     // baseMines / totalCells
```

### 4-2. checkSolvable({rows, cols, mineSet, start, wrapCols, wrapRows})

neighborMinesフル再計算→isSolvable のラッパ。**毎回フル再計算（差分更新禁止・正確性優先）**:
```js
function checkSolvable(o) {
  const nm = Solver.computeNeighborMines(o.rows, o.cols,
    (r, c) => o.mineSet.has(r * o.cols + c), o.wrapCols, o.wrapRows);
  const t0 = performance.now();
  const solvable = Solver.isSolvable({
    rows: o.rows, cols: o.cols,
    mineCount: o.mineSet.size,        // ★追加後の実数。o外から渡さない
    wrapCols: o.wrapCols, wrapRows: o.wrapRows,
    start: o.start,
    cellAt: (r, c) => {
      const k = r * o.cols + c;
      return { isMine: o.mineSet.has(k), neighborMines: nm.get(k) };
    }
  });
  return { solvable, ms: performance.now() - t0 };
}
```

### 4-3. addMinesBulk({baseSet, count, addSeed, rows, cols, exclude}) — モードA用

generateMineSetの配置ループと同じ様式（while + floor(rng*rows/cols)）。**この形で固定**:
```js
function addMinesBulk(o) {
  const rng = BoardGen.mulberry32(o.addSeed);
  const out = new Set(o.baseSet);
  let placed = 0, guard = 0;
  const guardMax = o.count * 1000 + 100000;
  while (placed < o.count && guard < guardMax) {
    guard++;
    const r = Math.floor(rng() * o.rows);
    const c = Math.floor(rng() * o.cols);
    const k = r * o.cols + c;
    if (!out.has(k) && !o.exclude.has(k)) { out.add(k); placed++; }
  }
  return out;
}
```

### 4-4. runClimb({pool, baseSeed, addSeed, budget, onProgress}) — モードC（主役）

**候補列の構築（決定論・この順序で固定）**:
```js
// 1. 候補: k=0..totalCells-1 の昇順で「非地雷 かつ 除外帯以外」を配列に積む
const rng = BoardGen.mulberry32(addSeed);
const candidates = [];
for (let k = 0; k < totalCells; k++)
  if (!mineSet.has(k) && !exclude.has(k)) candidates.push(k);
// 2. Fisher–Yates シャッフル（この向き・この式で固定）
for (let i = candidates.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
}
```

**クライム本体**: シャッフル順に候補を1個ずつ試す。
```
for k of candidates:
  budget尽きたら終了
  mineSet.add(k) → checkSolvable
  history.push({ call, candidate:{r:floor(k/cols), c:k%cols}, accepted, minesNow, densityNow, ms })
  失敗なら mineSet.delete(k)（★却下候補の再試行はしない。決定論維持のため）
  onProgress があれば適宜呼ぶ（CLIの進捗表示用）
```
- historyの`accepted:false`行がそのまま「却下ログ」（どの1個が論理を壊したか）になる。
- 返り値: `{ history, accepted, rejected, calls, finalMineSet, base情報, elapsed }`
- **注意**: 開始前に必ずベースライン `checkSolvable` を1回実行し、falseなら
  「プール盤面が不正」としてエラー停止（実測では全seed trueのはず）。

### 4-5. buildBoardJson({base, mineSet, meta}) — 成功盤面の保存

`tool/board/board-factory.html` の出力形式に合わせた **mines直接収載＋hash** のBoard JSON。
boardブロックは `canonicalBoard` が期待するキー構成
（`{rows, cols, mineCount, wrap, startCell, mines:[{r,c}...]}`、wrapは`"cyl"`文字列、
minesは r昇順→c昇順）で組み、`hash = await BoardGen.hashBoard(board)` を付与する。
**hashBoardはasyncなのでCLI側でawaitを忘れない。**
metaに出自を必ず記録: `{ tool:"factory-max-explorer", addVersion:ADD_VERSION, mode,
basePool, baseSeed, addSeed, budget, baseDensity, extraDensity, finalDensity, createdAt }`
（Traceability原則。追加後盤面はseedからは再現できないため事実の全収載が必須）。

---

## 5. CLI 仕様（tool/board/factory-max.js）

```
node tool/board/factory-max.js --mode climb --pool data/board/30x64_24.json \
  --baseSeed index:0 --addSeed 777 --budget 200 --out tool/board/results
```

| 引数 | 既定 | 説明 |
|---|---|---|
| --mode | climb | climb / sweep / resilience |
| --pool | （必須） | プールJSONパス |
| --baseSeed | index:0 | `index:i`（boards[i]）/ 数値（seed直指定）/ `all`（resilience用） |
| --addSeed | ランダム発行して**必ず表示** | 決定論シード |
| --budget | 500 | climb: isSolvable呼び出し回数上限 |
| --percents | 0.5,1,2,3 | sweep: 追加率リスト（パーセントポイント） |
| --trials | 100 | sweep: 各追加率の試行数 |
| --out | tool/board/results | 出力ディレクトリ |

- **mode=sweep（モードA）**: 各pctについて `addCount = Math.round(totalCells * pct / 100)`。
  試行tは `base = boards[t % boards.length]`・`addSeed = addSeedBase + t` で決定論化
  （addSeedBaseは--addSeedの値）。addMinesBulk→checkSolvableで成功率を集計。
- **mode=resilience（モードB）**: プールの各seed（--baseSeed all）に対して同一budgetの
  climbを実行し、到達finalDensityでseedをランク付けする（＝盤面品質の比較）。
  seed数×budget×判定時間が総時間になるので、実行前に見積りを表示して確認を促す。
- **進捗表示**: 10判定ごとに `calls / accepted / density(base/extra/final) / 経過秒 / ETA` を1行出力。
- **SIGINT（Ctrl+C）処理**: `process.on('SIGINT')` で「その時点までの結果を保存してから」
  終了する（長時間バッチの保険。必須要件）。
- **密度表示は常に3点セット**: `base 24.0% / extra +6.2% / final 30.2%` の形式で統一。

**出力ファイル**（`--out`配下、ファイル名 `factory-max_<mode>_<pool名>_<baseSeed>_<addSeed>.*`）:
1. `*_summary.json` … 実行条件（全引数・ADD_VERSION・GEN_VERSION）＋統計＋縮約climb curve
   （受理時点のみの密度列）
2. `*_history.csv` … 判定1行ずつ: `call,r,c,accepted,minesNow,densityNow,ms`（却下ログ兼用）
3. `*_best-board.json` … §4-5形式の最高密度成功盤面（climb/resilience時）

---

## 6. 実装順（この順で。各ステップでcommit）

1. `.gitignore` 新規作成（`tool/board/results/`）
2. `factory-max-core.js`（buildBase / checkSolvable / addMinesBulk / runClimb / buildBoardJson）
3. `factory-max.js`（引数パース→climbモードのみ先に動かす→§8の再現テスト①②を通す）
4. sweep・resilienceモード追加（§8の再現テスト③）
5. ドキュメントのステータス更新（本書＋設計書）

---

## 7. 既知の罠（実測・コードリーディングで確認済みのもの）

- **mineCountクランプ**: generateMineSetは除外帯ぶんをクランプする。地雷数は常に`mineSet.size`。
- **startはプールのparams.start**を使う（72x144は{r:36,c:72}、勝手に中央計算しない）。
- **excludeZoneは列ラップあり**（円柱）。自前でSetを組まずBoardGen.excludeZoneを呼ぶ。
- **isSolvableは同期で2〜6秒/回（72×144）**。Nodeなので問題ないが、「遅いから」と
  solver側を最適化・改変するのは絶対禁止（絶対制約1）。
- **失敗盤面でも速くならない**（詰まるまで多パス回る）。ETA計算は実測移動平均で出す。
- **hashBoardはasync**（crypto.subtle）。トップレベルでは `(async()=>{...})()` で包む。
- パスに日本語（`D:\コード\...`）を含む。`__dirname`基準の`path.join`で組めば問題ない。
- CSV/JSONの書き出しは `fs.writeFileSync(p, s)`（Node既定UTF-8。PowerShellの
  UTF-16問題はNode内では無関係）。

---

## 8. 受け入れテスト（数値の完全一致が合格条件）

2026-07-18に同一アルゴリズムのスクラッチ実装で実測済みの値。決定論なので、
仕様どおりに実装できていれば**完全一致**する（±1でも不一致なら§4の実装が仕様と違う）。

**① ベースラインパリティ**（climbの前提確認）:
`72x144_20.json` の先頭5seed（3562185, 16079222, 39551234, 42729962, 72554818）を
生成→checkSolvable → **5つ全て solvable=true**（1回あたり約1.9〜2.4秒）。

**② climb再現テスト（最重要）**:
```
--mode climb --pool data/board/30x64_24.json --baseSeed index:0 --addSeed 777 --budget 200
```
期待値（完全一致すること）:
```
base: seed=37784552, mines=461, density 24.0%
baseline solvable=true
calls= 50: accepted=40,  density 26.09%
calls=100: accepted=72,  density 27.76%
calls=150: accepted=100, density 29.22%
calls=200: accepted=119, density 30.21%
final: accepted=119 rejected=81, mines=580, final 30.21%
最終盤面の再checkSolvable → true
```
実行時間目安: 約40秒。

**③ sweep再現テスト**:
```
--mode sweep --pool data/board/72x144_20.json --addSeed 1000 --percents 0.5,1,2,3 --trials 10
```
期待値（試行スキームを§5どおり `boards[t%len]`・`addSeed=1000+t` にすれば完全一致）:
`+0.5%→6/10、+1%→1/10、+2%→0/10、+3%→0/10`。実行時間目安: 約2分。

**④ 保存盤面の検証**: ②の `*_best-board.json` を読み戻し、mines配列から
Setを再構成→checkSolvable=true、かつ `hashBoard(board)===hash` を確認する
一時スクリプトを流す（スクリプト自体はコミット不要）。

---

## 9. 完了報告に含めること

- §8①〜④の実測ログ（数値そのまま貼る。丸め・要約で書き換えない）
- 変更ファイル一覧とcommit一覧
- `js/solver.js`・`js/board-gen.js` に差分が無いことの明示（`git diff --stat master -- js/`）
- 気づいた設計上の疑問点（あれば。勝手に仕様変更して解決しないこと）

---

## 10. 完了報告（実施結果、2026-07-21）

### 成果物
- `tool/board/factory-max-core.js`（新規）：buildBase / checkSolvable / addMinesBulk /
  runSweepTrial / runClimb / buildBoardJson / formatDensity3。UMD純関数、solver.js/board-gen.js
  はrequireのみ。
- `tool/board/factory-max.js`（新規）：CLI。climb / sweep / resilience 全3モード実装済み
  （§6実装順の4「sweep・resilienceモード追加」まで完了。ブラウザUIは未着手＝計画通り後段）。
- `.gitignore`（新規）：`tool/board/results/` を除外対象に追加。

### §8 受け入れテスト結果（実測ログそのまま）

**①ベースラインパリティ**（72x144_20.json 先頭5seed）:
```
seed=3562185  solvable=true ms=2749
seed=16079222 solvable=true ms=2226
seed=39551234 solvable=true ms=2034
seed=42729962 solvable=true ms=3348
seed=72554818 solvable=true ms=2981
```
5/5 solvable=true → 合格。

**②climb再現テスト**（`--mode climb --pool data/board/30x64_24.json --baseSeed index:0 --addSeed 777 --budget 200`）:
```
calls=200/200 accepted=119 density=24.0% / +6.2% / 30.3%（表示丸め。summary.json内部値は下記）
完了: calls=200 accepted=119 rejected=81
density: 24.0% / +6.2% / 30.2%
```
summary.jsonの生数値: `baseDensity=24.0104 extraDensity=6.1979 finalDensity=30.2083`
（=30.21%。期待値`accepted=119 rejected=81 mines=580 final 30.21%`と**完全一致**）→ 合格。

**③sweep再現テスト**（`--mode sweep --pool data/board/72x144_20.json --addSeed 1000 --percents 0.5,1,2,3 --trials 10`）:
```
+0.5% (add 52): 6/10 success (60.0%)
+1% (add 104): 1/10 success (10.0%)
+2% (add 207): 0/10 success (0.0%)
+3% (add 311): 0/10 success (0.0%)
```
期待値と**完全一致**→ 合格。

**④保存盤面の検証**: climb・sweep両方の`*_best-board.json`で実施。
- climb版（30x64、baseSeed=37784552, addSeed=777）: `hash match: true` / `re-verify isSolvable: true`
- sweep版（72x144、baseSeed=16079222, addSeed=1001, addCount=104）: `hash match: true` / `re-verify isSolvable: true`
両方合格。

**追加スモークテスト（§8外）**: resilienceモードを30x64_24.json全57seed・budget=5で実行し
エラーなく完走、ranking.csv/summary.json/best-board.json全て正しく出力されることを確認
（最高耐性seed=37784552: 24.0% / +0.3% / 24.3%）。

### `js/solver.js`・`js/board-gen.js` の差分
```
git diff --stat -- js/solver.js js/board-gen.js
→ 出力なし（差分ゼロ）
```
絶対制約①（solver/board-gen非改変）を遵守。

### 設計からの逸脱点（1件・要ユーザー確認）

**`core.runClimb` を同期関数→非同期関数（Promise返却）に変更した。**
理由: WORKORDER §5で必須要件とした「SIGINT（Ctrl+C）で判定完了後に結果を保存して終了する」は、
Node.jsでは同期forループのままでは実現不可能（シグナルはイベントループに制御が戻った時にしか
処理されず、isSolvableが2〜6秒かかる同期ループ中は一切割り込めないため）。そこで各判定後に
`await setTimeout(resolve, 0)`で1tickだけイベントループへ制御を戻し、`checkCancelled`
コールバックで中断フラグを見る方式にした。

**影響範囲の確認**：候補列の構築・シャッフル・採否判定のロジック自体（§4-4のアルゴリズム）は
1文字も変えていない。非同期化は実行タイミングの都合のみで、計算結果には無関係
（§8②の再現テストで元の同期版スクラッチ実装と数値が完全一致することを確認済み＝実質的な
決定論契約は保たれている）。ただし字面上「§4-4の擬似コードは同期forループとして書かれている」
という前提からは外れるため、設計変更として明示する。ADD_VERSIONは据え置き（アルゴリズムの
決定論自体は変わっていないため）。ユーザーが同期のままでよい（SIGINT要件を落とす）と判断する
場合はこの変更を差し戻し可能。
