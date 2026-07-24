# ルール表示HUD 実行計画書（カットイン第二段）

作成日: 2026-07-23 / 対象実装者: Sonnet 5 への引き継ぎ
ステータス: **設計確定・未実装**（第一段＝警告バナー/衝突/シェイク/立ち絵即時表示/吹き出し左右寄せは実装・コミット済み）

---

## 0. これは何か

プレイ画面の**左上バー（`#expose-bar-wrap` = RESCUE PROGRESS）の真下**に、
その盤面で有効な「ルール」をテキストで**縦積み表示**する常設HUD。
カットインの「警告パネル」演出と**同じトリガーに並べて**発火させ、ルールを追加/除外する。

**最重要要件：中断（suspend）→再開（resume）と RETRY で必ず正しく復元されること。**
理由と実現方法は §3 に詳述（ここが本タスクの肝）。

### ユーザー確定事項（2026-07-23）
1. **積み方向**：最新ルールを**最上段（バー直下）に挿入**し、既存は一段ずつ下へずれる。
   除外時は、そのルールがその段で左へスライドして消え、**下のルールが上へ繰り上がる**。
2. **警告との関係**：警告パネルとルール追加は**別イベント**にする
   （同一トリガーに `warning` イベントと `rule/add` イベントを並べる）。エディタにルール型を追加する。
3. **見た目**：**テキストのみ**（アイコン無し）。
4. **エディタのプレビュー**：ルール型は**プレビュー省略**（「このタイプはゲーム画面でのみ確認可」の注記を出す）。
5. **上限/あふれ対策**：不要（多数時の省略・スクロール等は作らない）。

---

## 1. データモデル

### 1.1 ランタイムのルール状態
- アクティブルール = `{ ruleId: string, label: string }` の配列。
- **配列の並び順 = 表示順（先頭=最上段=バー直下）**。
- `ruleId` は安定キー（add で生成、remove で対象を指す）。**イベント `id` とは別物**。
  同じ `ruleId` を二重 add した場合は無視（既存を保持）、存在しない `ruleId` の remove も無視。

### 1.2 JSON スキーマ（`data/cutin/*.json` の events に新タイプ追加）
```json
{ "id": "add_noflag", "type": "rule", "action": "add",
  "ruleId": "noflag", "label": "旗禁止",
  "trigger": { "type": "open_rate", "gte": 0.5 }, "once": true }

{ "id": "rm_noflag", "type": "rule", "action": "remove",
  "ruleId": "noflag",
  "trigger": { "type": "mines_removed", "gte": 30 }, "once": true }
```
- `type:"rule"` / `action:"add"|"remove"` / `ruleId`（必須）/ `label`（add時のみ必須）。
- 会話・警告・衝突・シェイクと同じイベント基盤（trigger/once）に乗る。
- **警告と並べる例**（同一トリガーに2イベント）：
  ```json
  { "id":"warn_noflag", "type":"warning", "variant":"orangeRTL", "se":"...",
    "trigger":{"type":"open_rate","gte":0.5}, "once":true },
  { "id":"rule_noflag", "type":"rule", "action":"add", "ruleId":"noflag", "label":"旗禁止",
    "trigger":{"type":"open_rate","gte":0.5}, "once":true }
  ```
  発火順は events 配列の並び順（`notify` が上から順に `_fire`）。警告→ルールの順に書けばその順で処理される。

---

## 2. アーキテクチャ全体像

| 層 | 置き場所 | 役割 |
|---|---|---|
| HUD本体（DOM・状態・アニメ） | **`sphere-minesweeper.html`**（新規 `RuleHud` モジュール） | 常設ゲームUI。cutin.js には持たせない |
| ディスパッチ | `js/cutin-dialogue.js` の `_fire` | `type:"rule"` を検出しゲーム登録ハンドラへ委譲 |
| オーサリング | `tool/cutin-editor.html` | ルール型の編集UI・書き出し・検証・読込（プレビューは省略注記） |

**設計方針**：ルールHUDは「常設ゲームHUD」であり、カットインオーバーレイ（`#cutin-layer`, 普段`display:none`）の
演出ではない。よって警告バナー/衝突/シェイクを `js/cutin.js` に集約したのとは**扱いを分け**、
HUDはゲーム側に置く。cutin.js/cutin-dialogue.js は「ゲーム非依存」を保ち、`_fire` は
**ゲームが登録したコールバック**を呼ぶだけにする。

---

## 3. ★中断/RETRY 復元（本タスクの肝・必ずこの通りに）

### 3.1 なぜイベント再生で復元できないか
- **resume時**：`resumeSuspend()` が操作ログを `_replayInstant=true` で再適用する間、
  `cutinNotify()` は先頭ガード `if(_replayMode || _replayInstant || _isReplaySession) return [];`
  （`sphere-minesweeper.html` の `cutinNotify`）で**発火抑止**される。
  さらに再開処理は `cutinFired`（発火済みイベントID集合）を復元する（下記3.3）。
  → ルール add/remove イベントは**再開中も再開後も再発火しない**。
- **結論**：ルール一覧を中断metaに**直接保存**し、resume時に**直接描画（アニメ無し）**する以外に手段は無い。

### 3.2 3つのフック（実装箇所）
※行番号は 2026-07-23 時点。ズレることがあるので周辺の文言で位置を特定すること。

**(A) 保存**：`saveSuspend()` の `meta` オブジェクト（`cutinFired: Dialogue.getFired()` の隣、≈L3833）に追加：
```js
cutinFired: Dialogue.getFired(),
activeRules: RuleHud.serialize()      // ← 追加。[{ruleId,label}, ...] 表示順
```

**(B) 復元**：`resumeSuspend()` 内、`window._cutinSet` 復元＋`Dialogue.load().then(restoreFired)` の
ブロック（≈L3941-3946）の**直後**に追加：
```js
RuleHud.restore(m.activeRules || []);  // ← アニメ無しで即描画（順序そのまま）
```
> `Dialogue.load(...).then()` は非同期だが、`RuleHud.restore` は cutinFired と独立に
> meta の配列だけで完結するので **await 不要**・同期でよい（DOMを直接組む）。

**(C) リセット**：`restartGame()` 先頭の `Dialogue.reset();`（≈L4885）の直後に追加：
```js
RuleHud.reset();   // ← HUDを空に。以降イベント再発火でアニメ付き再蓄積される
```

### 3.3 boot=resume の順序（既存の作りに乗る）
`?boot=resume` は `restartGame()` → `resumeSuspend(_rec).then(...)` の順（≈L5605-5606）。
つまり **(C)で空 → (B)で復元** の順に自然に走るので、追加の順序制御は不要。

### 3.4 一貫性の担保
- ルール add/remove は通常 `once:true`。中断時、発火済みは `cutinFired` に入り、ルールは `activeRules` に入る。
  resume で両方復元されるので、**発火済みイベントは二度と発火せず・ルールは直接復元**され整合する。
- `activeRules` は表示順の配列なので、resume で**縦の順序まで完全一致**する。

---

## 4. 実装ステップ

### Step 1. `RuleHud` モジュール（`sphere-minesweeper.html`）
`<script>` 内、カットイン関連（`window._cutinHooks` 定義付近）の近くに新規モジュールを追加。

**DOM**：`#expose-bar-wrap`（L662-668）の**最終子要素**としてルール用コンテナを内包する
（バー高さが可変でも自動で真下に流れる。`#expose-bar-wrap` は `pointer-events:none` なので
ルールは表示専用で問題なし）。初期HTMLに空コンテナを1つ足すか、`RuleHud` 初期化時にJSで append。
```html
<!-- #expose-bar-wrap の末尾に追加 -->
<div id="rule-hud"></div>
```

**CSS**（`<style>` に追加）：
```css
#rule-hud{ display:flex; flex-direction:column; gap:6px; margin-top:10px;
  align-items:flex-start; pointer-events:none; }
.rule-item{
  font-family:'Share Tech Mono',monospace; font-size:14px; letter-spacing:1px;
  color:#aa66cc;                                   /* expose-label と同系のトーン */
  background:rgba(20,0,40,0.55); border:1px solid rgba(150,50,255,0.4);
  border-radius:4px; padding:3px 10px; white-space:nowrap;
  /* 左からスライドイン */
  transform:translateX(-120%); opacity:0;
  transition:transform .35s cubic-bezier(.22,.9,.3,1), opacity .35s ease;
}
.rule-item.in{ transform:translateX(0); opacity:1; }
.rule-item.out{ transform:translateX(-120%); opacity:0; }  /* 左へスライドアウト */
```
> 段の繰り上がり/繰り下がりは flex column なので、要素の追加/削除で**自動的に再フロー**する。
> 「一段下がる／繰り上がる」動きは、追加/削除される要素のスライドと flex 再配置で表現される。
> よりなめらかにしたい場合のみ FLIP（追加/削除前後の各行 top を測って transform で補間）を
> 検討（任意・後回しでよい）。まずは flex 再フロー＋当該行のスライドで実装する。

**JS API**（`RuleHud`）：
- `add(ruleId, label, {animate=true})`：
  既に同 `ruleId` があれば無視。要素を生成し**コンテナ先頭に `prepend`**（最上段＝バー直下）。
  内部配列 `_rules` の**先頭に** `{ruleId,label,el}` を unshift。
  `animate` なら `requestAnimationFrame` で `.in` を付与してスライドイン。
  `animate:false`（resume用）なら生成時から `.in` を付けて即表示（トランジション無し）。
- `remove(ruleId, {animate=true})`：
  配列から該当を探す。`animate` なら `.out` を付け `transitionend`（+保険 setTimeout 400ms）で
  DOM除去＆配列除去。`animate:false` なら即除去。除去後は flex 再フローで下の行が上へ繰り上がる。
- `reset()`：コンテナを空に（`innerHTML=''`）、`_rules=[]`。
- `serialize()`：`_rules.map(r => ({ruleId:r.ruleId, label:r.label}))`（el は除く）。
- `restore(arr)`：`reset()` してから、**配列の末尾から先頭へ** `add(..., {animate:false})` で
  積み直す（先頭 prepend 方式なので、末尾から入れると元の順序に一致する）。
  ※順序を取り違えないこと。テストで serialize→restore→serialize が一致するか確認。

**保険タイマー必須**：第一段で学んだ通り、`transitionend` は非表示タブ（コンポジット停止）で
発火しないことがある。`remove` のアニメ完了は必ず `setTimeout` フォールバックで確定させる
（付けっぱなし・消え残りを防ぐ）。

### Step 2. ディスパッチ（`js/cutin-dialogue.js`）
`_fire` に分岐を追加（`shake` 分岐の後、`return CutIn.play(...)` の前）：
```js
if(ev.type === 'rule'){
  if(_ruleHandler) _ruleHandler(ev);   // { action, ruleId, label }
  return Promise.resolve();            // HUD操作は非同期待ちしない（会話キューをブロックしない）
}
```
モジュール上部に `let _ruleHandler = null;` を追加、`setRuleHandler(fn){ _ruleHandler = fn; }` を定義、
`return { ... }` に `setRuleHandler` を追加（現状 `return { load, notify, play, reset, getFired, restoreFired };` → 末尾に足す）。

**ランキング除外の注意**：`IN_PLAY_TRIGGERS`（`time/open_rate/mines_removed/manual`）ベースの
`window._cutinBlocksRanking` 判定（`load()` 内）は**トリガー種別だけ**を見るので、ルール型を足しても
自動で正しく効く（プレイ中トリガーに付いたルールのステージは自動的にランキング対象外）。**変更不要**。

### Step 3. ゲーム側でハンドラ登録（`sphere-minesweeper.html`）
`RuleHud` 定義後・`CutIn.init(...)` 付近で：
```js
Dialogue.setRuleHandler(function(ev){
  if(ev.action === 'remove') RuleHud.remove(ev.ruleId);
  else                       RuleHud.add(ev.ruleId, ev.label);
});
```
※ここは常にアニメ有り（通常プレイ・RETRY再蓄積時）。resume の無アニメ復元は §3.2(B) の
`RuleHud.restore` が別途担うので、ハンドラ側で resume を気にする必要はない。

### Step 4. エディタ（`tool/cutin-editor.html`）
第一段で作った type 分岐に `rule` を追加する。

- `EVENT_TYPES`（≈L371）に追加：`rule: 'ルール表示（左バー下・追加/除外）'`。
- 本文ビルダー `ruleBodyHtml(ei, ev)` を新規作成（`shakeBodyHtml` 等に倣う）：
  - `action` セレクト（add/remove）、`ruleId` テキスト、`label` テキスト（action=remove時は label 欄を
    無効化 or 非表示にしてよい）。
  - 末尾に注記：`<div class="trig-note">※ルール表示はゲーム画面でのみ確認できます（このエディタのプレビュー対象外）。警告パネルと一緒に出す場合は、同じトリガーで warning イベントも別途追加してください。</div>`
- `renderEvents` の body 振り分けに `type==='rule' ? ruleBodyHtml(ei,ev) : ...` を追加。
- 入力/変更ハンドラ：`rule-action`（select）→`ev.action`、`rule-id`（text）→`ev.ruleId`、
  `rule-label`（text）→`ev.label` を追加（既存の input/change リスナ内の else 節に分岐追加）。
- `btn-add-event` の初期オブジェクトに `action:'add', ruleId:'', label:''` を追加
  （他タイプ切替で消えないよう最初から持たせる、既存踏襲）。
- `ev-type` 切替ハンドラで、rule 用フィールド未定義時の補完を追加（`if(ev.action==null) ev.action='add';` 等）。
- **書き出し** `buildExportObject`：`type==='rule'` 分岐を追加
  ```js
  } else if(type === 'rule'){
    out.action = ev.action || 'add';
    out.ruleId = ev.ruleId || '';
    if((ev.action||'add') === 'add' && ev.label) out.label = ev.label;
  }
  ```
- **検証** `validateForExport`：`type==='rule'` で `ruleId` 必須、`action==='add'` なら `label` 必須。
- **読込** load（data/cutin形式パース）：`type==='rule'` 分岐で `action/ruleId/label` を復元。
- **プレビュー** `previewEvent`：`type==='rule'` は `alert` か status 表示で
  「ルール型はゲーム画面でのみ確認できます」と出して**何もしない**（CutIn は呼ばない）。

### Step 5. 検証（dev server 経由・必須）
`[[feedback-preview-audio]]` の作法（起動許可不要／検証後は音停止＋サーバー停止）。
⚠️ `js/*.js`（cutin-dialogue.js）の変更はブラウザに強くキャッシュされる。検証時は
`<script src>` に一時クエリ（`?v=xxx`）を付けて確実に新版を読ませ、**検証後に必ず外す**
（第一段で実際に踏んだ罠。ページHTML自体もキャッシュされるので URL に `?nc=` を付けて再ナビゲートする）。

1. **表示・積み方向**：`data/cutin/` にテスト用セットを作り（stage_start で add を複数、
   mines_removed で1つ remove）、実プレイで最上段挿入・下方シフト・除外時の繰り上がりを確認。
2. **★suspend→resume**：ルールを2〜3個出した状態で中断→タイトル→RESUME。
   **一覧・順序が完全一致で即表示（スライド無し）** されること。コンソールエラー無し。
3. **★RETRY**：ルールが出た状態で設定メニュー→RESTART。**HUDが空に戻り**、再度トリガーで
   アニメ付きに再蓄積されること。
4. **除外の消え残り**：remove 直後にRETRY等を挟んでも `.out` 要素が残らないこと（保険タイマー確認）。
5. **エディタ**：4種＋rule を作って書き出しJSONが本仕様と一致・検証エラー0・
   ルール型プレビューが注記表示のみで CutIn を呼ばないこと。
6. **回帰**：既存の stage22〜29（会話/警告なし・特殊ルール告知）が従来通り動くこと。

---

## 5. 罠・注意（第一段の教訓含む）

- **restore の順序**：`add` は先頭 prepend。`restore(arr)` は **arr を末尾→先頭の順**に add すること
  （逆にすると縦順が反転する）。serialize→restore→serialize の一致テストで必ず確認。
- **transitionend 非発火**：非表示タブ等でコンポジットが止まると発火しない。remove のDOM除去は
  **必ず setTimeout フォールバック**を併用。
- **cutin.js には触らない**：ルールHUDはゲーム側。`CutIn.warn/animate` の並びに `rule` を足さないこと
  （常設HUDと一過性オーバーレイの責務を混ぜない）。
- **once とルールの整合**：ルールイベントは基本 `once:true`。`once:false` にするとトリガー成立の度に
  add が呼ばれるが、同 `ruleId` 二重 add は無視するので実害は無い（設計通り）。
- **ランキング判定は変更不要**（§Step2）。トリガー種別ベースなので自動で効く。
- **キャッシュ**：検証時の `?v=`／`?nc=` は**必ず外して**からコミット（第一段で実際にやった）。

---

## 6. 触るファイル一覧
- `sphere-minesweeper.html`：`RuleHud` モジュール新規／CSS `.rule-item` 等／`#rule-hud` DOM／
  `saveSuspend` meta／`resumeSuspend` restore／`restartGame` reset／`Dialogue.setRuleHandler` 登録。
- `js/cutin-dialogue.js`：`_ruleHandler`＋`setRuleHandler`＋`_fire` の `type:"rule"` 分岐＋export追加。
- `tool/cutin-editor.html`：`EVENT_TYPES`／`ruleBodyHtml`／renderEvents振り分け／入力・変更ハンドラ／
  add-event初期値／ev-type補完／buildExportObject／validateForExport／load／previewEvent。
- （任意）`data/cutin/*.json`：テスト用・本番用のルールイベント追記はユーザー/別途。

## 7. 参考
- 第一段の実装（警告バナー=`CutIn.warn`、衝突/シェイク=`CutIn.animate`、吹き出し左右寄せ）は
  `js/cutin.js` / `js/cutin-dialogue.js` に実装済み・コミット済み。ルール型はその隣に足す形。
- 設計の元要件・§14警告演出の当初案は `etc/V2_CUTIN_PLAN.md`。
- memory: [[project-cutin-plan]] / [[feedback-dev]] / [[feedback-preview-audio]] / [[project-replay-suspend]]。
