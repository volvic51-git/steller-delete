# LIMIT MODE 実装ワークオーダー（Sonnet 5 向け）

作成: 2026-07-20 / 対象実装者: Sonnet 5
設計レビュー承認済み。本書に沿って実装すること。**実装前にこの文書を最後まで読むこと。**

---

## 0. 最重要の前提（これを理解してから着手する）

**制約エンジンは既に完成している。** `sphere-minesweeper.html` の DEBUG パネルが
周回・制限時間・ORACLE数(`maxHints`)・NoFlag(`gameRule`) を**同時にライブ設定できる仕組みを
既に持っている**。LIMIT MODE の本体は「その制約群をプレイヤー向けUIで露出＋スコア/ランキング層を足す」だけ。
**ゲームエンジン（盤面・タイマー・周回）のロジックは一切変更しない。**

確認済みの重要事実:
- `timeLimitMode` + `window._customTimeLimit` + `window._loopTimeLimits=null` にすると
  **制限時間が全周通しで一本のカウントダウンになる**（`startTimer()` 4486行〜、`remainingTime` は
  `currentLoop===1` の時だけリセット、2周目以降は引き継ぐ＝4495行）。→「時間は通し」はエンジン改修不要。
- `saveSuspend`（3874行〜）は既に `loopMode/loopCount/timeLimitMode/totalTime/remainingTime/maxHints/
  gameRule/seedPoolMode/seedPoolBoard` を保存・復元済み。→ LIMIT の resume はほぼ自動で動く。
- ボード設定（diff/mines/palette/背景/charId/seedPool）は `?stage=N` → `applyStageParam()`（5223行〜）が
  全部セットアップする。LIMIT は**その後段で制約だけ上書き**する。

---

## 1. 確定仕様（ユーザー決定事項）

| 項目 | 決定 |
|---|---|
| ボード | SIMPLE の stage1〜8（id 1-8）＋ stage9（**id 31**）。**ex1(id10)は使わない**。 |
| 制限時間 | 最大3600秒、600秒刻み（3600/3000/2400/1800/1200/600）。**通し時間**。 |
| 周回数 | 整数。1〜8はボタン選択。加えて **[+10]**, **[+100]** ボタンで加算（上限は下記5-2参照）。 |
| ORACLE数 | 0〜10。少ないほど高倍率。 |
| No Flag | OFF/ON。 |
| タイム | ランキング対象外（LIMITは時間で競わない）。 |
| ランキング | **LIMIT専用の単一ランキング**。降順（高スコア＝上位）。top10。既存タイムランキングと同形式のモーダル。 |
| スコア表示 | 小さい値はカンマ区切り整数（例 `18,450`）、巨大値は日本語単位（例 `1.234 那由他`）。表示単位の**小数第3位未満は切り捨て**（四捨五入しない）。 |
| 倍率設定 | **全数値を `data/limit-config.json` で定義。コードに数値を直書き禁止。** |
| 各選択肢の表示 | 寄与を「**%**」で表示（例 `250%`）。 |
| 合計表示 | `BONUS ×N`（例 `×4.8`）。 |
| リアルタイム | 設定変更のたびに `LIMIT SCORE` と `BONUS ×N` を即時更新（数字が増えるのを見せるのが本モードの快感）。 |
| スコア型 | float64（表示重視）。BigInt不要。 |
| UI美術 | 添付モックのCSS再現。**画像の忠実再現は不要・斜線マーク等の装飾は省略可**。雰囲気重視。 |

---

## 2. スコアモデル（確定）

```
bonusMult = timeMult × loopMult × hintMult × noflagMult      // 各倍率は JSON から取得
score     = floor( baseScore(board) × bonusMult )
```

- JSON の値がそのまま倍率（例 time 1800 → 1.5）。
- **各選択肢の右の表示** = `倍率 × 100` を整数丸めして `%`（例 1.5 → `150%`、2.5 → `250%`）。
- **合計 BONUS** = `bonusMult` を小数1桁で `×`（例 `×4.8`）。
- **LIMIT SCORE** = 下記フォーマッタで整形。

### フォーマッタ仕様（`js/limit-score.js` に実装）
```
formatLimitScore(score, config):
  th = 10 ** config.unitThresholdExp          // 既定 8（億未満はカンマ表示）
  if score < th:
      return Math.floor(score).toLocaleString('en-US')     // 例 "18,450"
  else:
      units = config.units   // [{exp:8,name:"億"}, {exp:12,name:"兆"}, ... {exp:60,name:"那由他"} ...] 昇順
      u = exp が log10(score) 以下で最大のユニット
      v = Math.floor(score / 10**u.exp * 1000) / 1000        // 小数第3位まで、以下切り捨て
      return v.toFixed(3) + " " + u.name                     // 例 "1.234 那由他"
```
※ `toFixed(3)` は四捨五入するが、直前で `Math.floor(...*1000)/1000` により第3位以下を切り捨て済みなので
表示は切り捨て結果と一致する。

---

## 3. 新規ファイル

### 3-1. `data/limit-config.json`（全数値の一元管理・ユーザーが後で調整）
下記は**暫定値**。実装後ユーザーが調整する前提で「それらしい」値を入れておく。

```json
{
  "unitThresholdExp": 8,
  "units": [
    { "exp": 8,  "name": "億" },
    { "exp": 12, "name": "兆" },
    { "exp": 16, "name": "京" },
    { "exp": 20, "name": "垓" },
    { "exp": 24, "name": "秭" },
    { "exp": 28, "name": "穣" },
    { "exp": 32, "name": "溝" },
    { "exp": 36, "name": "澗" },
    { "exp": 40, "name": "正" },
    { "exp": 44, "name": "載" },
    { "exp": 48, "name": "極" },
    { "exp": 52, "name": "恒河沙" },
    { "exp": 56, "name": "阿僧祇" },
    { "exp": 60, "name": "那由他" },
    { "exp": 64, "name": "不可思議" },
    { "exp": 68, "name": "無量大数" }
  ],
  "boards": {
    "1":  { "label": "STAGE 01", "baseScore": 1000 },
    "2":  { "label": "STAGE 02", "baseScore": 1200 },
    "3":  { "label": "STAGE 03", "baseScore": 1500 },
    "4":  { "label": "STAGE 04", "baseScore": 1800 },
    "5":  { "label": "STAGE 05", "baseScore": 2200 },
    "6":  { "label": "STAGE 06", "baseScore": 2600 },
    "7":  { "label": "STAGE 07", "baseScore": 3200 },
    "8":  { "label": "STAGE 08", "baseScore": 4000 },
    "31": { "label": "STAGE 09", "baseScore": 6000 }
  },
  "time": {
    "3600": 1.0,
    "3000": 1.3,
    "2400": 1.8,
    "1800": 2.5,
    "1200": 4.0,
    "600":  8.0
  },
  "loop": {
    "table": {
      "1": 1.0, "2": 1.6, "3": 2.5, "4": 3.8,
      "5": 5.6, "6": 8.0, "7": 11.0, "8": 15.0
    },
    "perExtraLoopGrowth": 1.28
  },
  "hint": {
    "10": 1.0, "9": 1.15, "8": 1.3, "7": 1.5, "6": 1.75, "5": 2.1,
    "4": 2.6, "3": 3.3, "2": 4.5, "1": 7.0, "0": 12.0
  },
  "noflag": { "off": 1.0, "on": 4.0 },
  "difficultyStars": [
    { "min": 0,    "stars": 1 },
    { "min": 3,    "stars": 2 },
    { "min": 10,   "stars": 3 },
    { "min": 50,   "stars": 4 },
    { "min": 300,  "stars": 5 }
  ]
}
```

**周回倍率の算出規則**（`limit-config.json` の `loop`）:
- `table` に完全一致する周回数があればその値。
- 無い場合（9以上や +10/+100 で作られた値）: `table["8"] × perExtraLoopGrowth ** (loops - 8)`。
- これでコードに数値直書きせず、任意の周回数へ滑らかに対応。巨大周回で那由他級に届く。

### 3-2. `js/limit-score.js`（index と game で共用。純関数のみ）
```
window.LimitScore = {
  computeBonusMult(settings, config)   // settings={tl,lp,hint,nf(bool)} → number
  computeScore(boardId, settings, config)  // baseScore × bonusMult → number（floor前でよい。呼び出し側でfloor）
  optionPercent(mult)                  // 1.5 → "150%"
  formatBonus(mult)                    // 4.8 → "×4.8"
  formatScore(score, config)           // §2 のフォーマッタ
  difficultyStars(bonusMult, config)   // →整数（1〜5）
  factorMult(table, value, growthKey?) // 汎用ルックアップ（loopのフォールバック式もここ）
}
```
- **数値定数を一切持たないこと。** 全て config 引数から取る。
- `<script src="js/limit-score.js">` を index.html と sphere-minesweeper.html の両方に追加。

---

## 4. URL 受け渡し仕様

LIMIT開始:
```
sphere-minesweeper.html?stage=<boardId>&mode=limit&tl=<秒>&lp=<周回数>&hint=<ORACLE数>&nf=<0|1>
```
- `boardId` は `data/limit-config.json` の boards キー（1-8, 31）。
- `applyStageParam()` が `?stage` で通常どおり盤面をセットアップ → その `.then()` 末尾で LIMIT 上書き（§5-3）。

戻り先: `index.html?limit=1`（LIMIT画面を直接開く）。

---

## 5. 実装タスク（ファイル別）

### 5-1. `data/modes.json`
- `limit` の `enabled` を `true` に。`desc` を適切な説明文に更新（例:「制約を課してハイスコアを狙う挑戦モード。」）。

### 5-2. `index.html` — LIMIT画面（最大の作業）
既存の `#mode-select-modal` / `#normal-list-modal` / `.screen-overlay` / `.mode-card` の
CSS・構造を流用して新モーダル `#limit-mode-modal` を追加する。

**(a) mode-select分岐**（`renderModeSelect` 内、2256-2260行の分岐に追加）:
```js
else if(id === 'limit'){ playSelect(); modeSelectModal.classList.remove('show'); openLimitMode(); }
```

**(b) `?limit=1` 直接オープン**（既存の `?normal=1`/`?story=1` 処理と同じ場所に）。

**(c) LIMIT画面の構成**（モックのCSS再現、装飾は簡略可）:
- タイトル `LIMIT MODE` ＋サブ「SET YOUR LIMITS. CHALLENGE YOURSELF.」
- **BOARD**: `<select>`。`limit-config.json` の `boards` から `label` を選択肢に、value=id。
- **TIME LIMIT**: 6段（3600/3000/2400/1800/1200/600）のセレクトかセグメント。各選択肢の右に `%`。
- **REPLAY COUNT（周回）**: 1〜8のボタン列（選択式）＋ `[+10]` `[+100]` ボタン＋現在値表示。
  上限は `table` 最大キー(8) + 100×N で伸ばせるが、**上限368**（8+360）にクランプ。下限1。各状態で `%` 表示。
- **HINT COUNT（ORACLE）**: 0〜10のセレクト。各選択肢の右に `%`。
- **NO FLAG**: OFF/ON トグル。各状態の `%` 表示。
- **フィードバック領域**:
  ```
  LIMIT SCORE
  18,450

  BONUS ×4.8
  DIFFICULTY ★★★★☆
  ```
  設定変更のたびに `LimitScore.computeScore` → `formatScore`、`computeBonusMult` → `formatBonus`、
  `difficultyStars` を**リアルタイム更新**（onchange/click 全てにフックする1つの `updateLimitPreview()` を呼ぶ）。
- **START MISSION**: `sphere-minesweeper.html?stage=<id>&mode=limit&tl=&lp=&hint=&nf=` へ遷移
  （既存の `withDiscardConfirm` で中断確認を挟む。`_titleNavLocked` パターン踏襲）。
- **RANKINGボタン**: LIMITランキングモーダルを開く（§5-6）。
- **フッター**: MODE戻る / TITLE戻る（既存 `.screen-footer` グリッド流用）。

**(d) 各選択肢の `%` 表示**: 選択肢生成時に `LimitScore.optionPercent(config.time["1800"])` 等で算出して併記。

**(e) `openLimitMode()`**: `limit-config.json` を fetch（キャッシュ変数 `_limitConfigCache`）してから描画。
`data/*.json` は `cache:'no-store'` で取得（既存規約）。

### 5-3. `sphere-minesweeper.html` — 制約上書き（`applyStageParam` の `.then()` 末尾）
`applyStageParam()`（5223行〜）の `.then(params => { ... })` の**最後**に、以下を追加する。
既存のステージ設定を全部適用し終えた後に上書きするのが要点。

```js
// ===== LIMIT MODE 上書き =====
if(urlParams.get('mode') === 'limit'){
  const tl   = parseInt(urlParams.get('tl'),   10);
  const lp   = parseInt(urlParams.get('lp'),   10);
  const hint = parseInt(urlParams.get('hint'), 10);
  const nf   = urlParams.get('nf') === '1';

  // 制限時間: 通し（_loopTimeLimits=null で totalTime 全周一定）
  timeLimitMode = true;
  window._customTimeLimit = tl;
  window._loopTimeLimits  = null;
  // （time-limit-btn のUI状態は stage9 経路で既にON表示。stage1-8 なら下記で明示ON化）

  // 周回: lp>1 で周回モード、それ以外OFF
  if(lp > 1){ loopMode = true; window._loopMode = true; loopCount = lp; currentLoop = 1; }
  else      { loopMode = false; window._loopMode = false; }

  // ORACLE数
  maxHints = hint; window._stageMaxHints = hint;

  // NoFlag
  gameRule = nf ? 'noflag' : 'attack';

  // クリア画面用に LIMIT 情報を保持
  window._limitMode      = true;
  window._limitBoardId   = urlParams.get('stage');
  window._limitSettings  = { tl, lp, hint, nf };
}
```
**注意**:
- stage1-8 は stage-params 側で timeLimitMode/loopMode が false のため、ここでUIボタン表示（`time-limit-btn`/
  `loop-mode-btn` のテキスト・色）も ON 状態に更新すること（既存の各 toggle 関数の見た目更新コードを流用）。
- stage9(id31) は stage-params で既に loop/time ON。ここで `loopCount`/`_customTimeLimit` を上書きするので
  ユーザー選択が優先される。`loopColors` は stage9 のものがそのまま使われてよい（見た目のみ）。
- `js/limit-score.js` の config はクリア時に必要。`applyStageParam` 内で `limit-config.json` を
  `window._limitConfig` に fetch しておく（mode=limit時のみ）。

### 5-4. `showRescueScreen`（クリア画面。1154-1167行のランキング処理を分岐）
現状 `stageId && !window._cutinBlocksRanking` で `addRankingRecord(stageId, clearTimeSec)` を呼ぶ。
ここを LIMIT 分岐する:

```js
if(window._limitMode || window._resumeLimitMode){
  // タイムではなくスコアで記録
  const cfg = window._limitConfig;
  const boardId = window._limitBoardId || stageId;
  const s = window._limitSettings;  // resume時は復元済み（§5-5）
  const score = Math.floor(LimitScore.computeScore(boardId, s, cfg));
  const rank = addLimitRecord(score, boardId, s);          // §5-6（降順）
  document.getElementById('rescue-time').textContent = 'LIMIT SCORE ' + LimitScore.formatScore(score, cfg);
  // rank表示は既存の rescue-rank 流用（BEST1/更新 等）
  ...
} else if(stageId && !window._cutinBlocksRanking){
  // 既存のタイムランキング処理（そのまま）
}
```
- LIMITでは `rescue-time` に「LIMIT SCORE …」を出す（タイムは出さない）。
- スコアは float64。カンマ/日本語単位で整形して表示。

### 5-5. save / resume 統合
- `saveSuspend` の meta に追加: `limitMode: !!window._limitMode`, `limitBoardId: window._limitBoardId ?? null`,
  `limitSettings: window._limitSettings ?? null`。
- `resumeSuspend` で復元: `window._resumeLimitMode = !!m.limitMode`,
  `window._limitBoardId = m.limitBoardId`, `window._limitSettings = m.limitSettings`。
  さらに resume経路でも `window._limitConfig` を `limit-config.json` から fetch しておく
  （`?boot=resume` は applyStageParam を通らないため）。
- `restartGame()` で `window._resumeLimitMode` をリセット（RETRYで次ゲームに持ち越さないため。
  既存の `_resumeStoryMode` 等と同じ場所）。
- 制約本体（loop/time/hints/gameRule）は既存 meta で復元されるので追加不要。

### 5-6. LIMITランキング（`sphere-minesweeper.html` に保存関数、`index.html` に表示）
既存 `addRankingRecord`（昇順・stage別）は流用不可。新規に降順版を作る:
```js
function addLimitRecord(score, boardId, settings){
  const KEY = 'stellarDeleteRanking_limit';
  let recs = []; try{ recs = JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){}
  const rec = { score, board: boardId, tl: settings.tl, lp: settings.lp,
                hint: settings.hint, nf: settings.nf, ts: new Date().toISOString() };
  recs.push(rec);
  recs.sort((a,b)=> b.score - a.score);   // 降順
  recs.splice(10);                         // top10
  try{ localStorage.setItem(KEY, JSON.stringify(recs)); }catch(e){}
  const rank = recs.indexOf(rec) + 1;
  return rank > 0 ? rank : null;
}
```
- **index.html 側にLIMITランキングモーダル**（既存 `#records-modal` の構造・CSSを流用）:
  順位／スコア（`LimitScore.formatScore`）／設定（BOARD・TIME・LOOP・HINT・NF）／日時（`fmtLocalDateTime(ts)`）。
  「どう縛ったか」が見えるように設定スナップショットを表示する。空は「まだ記録がありません」。

### 5-7. `updateRescueButtons`（1182行〜）LIMIT分岐
- `isLimitMode = (URL mode==='limit') || !!window._resumeLimitMode` を追加。
- LIMIT時: RETRY（同一設定で再挑戦）＋ STAGE（`index.html?limit=1` へ）＋ TITLE を表示。
  STAGEボタンの `onclick` を `?limit=1` に差し替え（既存の isNormalMode 分岐と同じ要領）。

---

## 6. 「コード直書き禁止」の徹底（レビュー観点）
- スコア倍率・baseScore・単位・閾値・星バケット・周回成長率は**すべて `limit-config.json`**。
- `js/limit-score.js`・index.html・sphere-minesweeper.html のいずれにも**マジックナンバーを置かない**
  （唯一の例外は周回上限クランプ 368 と下限1のようなUIガードだが、これも可能なら config 化する）。
- 実装後、`limit-config.json` の値を変えるだけでスコアバランスが変わることを確認する。

---

## 7. テストチェックリスト（dev server 経由・検証後は音停止＋サーバー停止）
1. PLAY → MODE SELECT に LIMIT が有効表示され、クリックで LIMIT画面が開く。
2. 各制約を変えると LIMIT SCORE / BONUS ×N / DIFFICULTY が**即時**更新される。
3. 各選択肢の右に `%` が正しく出る（config値×100）。
4. START MISSION → `?stage=&mode=limit&tl=&lp=&hint=&nf=` でゲーム起動。盤面・制限時間・周回・ORACLE上限・
   NoFlagが設定どおり。**時間が周をまたいで通しでカウントダウン**する（回復しない）ことを実機確認。
5. クリア → `LIMIT SCORE …`（カンマ or 日本語単位、第3位以下切り捨て）が出て、LIMITランキングに降順で載る。
6. 巨大設定（高周回・0ヒント・NoFlag・600秒）で那由他級の表示になること（フォーマッタ確認）。
7. 中断 → タイトルRESUME → 制約が全部復元され、クリアで LIMIT ランキングに入る。
8. RETRY で同一設定・再挑戦。STAGEで `?limit=1` に戻る。TITLEでタイトル。
9. LIMITプレイがタイムランキング（stage別）を汚染しないこと（`stellarDeleteRanking_stage_N` に書かない）。
10. `limit-config.json` の値を1つ変えて、スコアが変わることを確認（直書きが無い証明）。

---

## 8. 注意・落とし穴
- **applyStageParam は async**。LIMIT上書きは必ず `.then()` **内の末尾**に置く（ステージ設定の後）。
- stage9(id31) は元々 loop+time ステージ。上書き順序（stageの後にLIMIT）を守れば衝突しない。
- `?boot=resume` は applyStageParam を通らない → resume経路でも `limit-config.json` を別途 fetch する
  （§5-5）。ここを忘れるとクリア画面でスコア計算が config undefined で落ちる。
- float64 精度: 那由他級で下位桁は落ちるが表示（有効4桁＋単位）には支障なし。順序比較も問題なし。
- 既存の `_cutinBlocksRanking` は LIMIT では無関係（LIMITは専用ランキングなので判定に含めない）。
- HTTPキャッシュ注意（[[feedback-preview-audio]]の申し送り）: 検証時 `js/*.js` が古いまま残ることがある。
  必要なら `?cb=<ts>` で回避（検証後に戻す）。

---

## 9. 想定コミット粒度（参考）
1. `data/limit-config.json` + `js/limit-score.js`（純関数・単体で完結）
2. `index.html` LIMIT画面 + リアルタイムスコア + ランキングモーダル
3. `sphere-minesweeper.html` LIMIT上書き + クリア分岐 + save/resume + updateRescueButtons + addLimitRecord
4. `data/modes.json` 有効化
5. 実機テスト・倍率微調整

ブランチ運用: **新規ブランチはユーザー指示があるまで作らない**（現運用ルール [[feedback-git]]）。
現ブランチ上に commit してよい。push はユーザーが行う。
