# カットイン会話システム 検討書

作成日: 2026-07-12　最終更新: 2026-07-12（ユーザー回答6件＋追加要件を反映）
ステータス: **設計確定・未実装**（警告演出システム§14は設計のみ・実装は後段）
実装手順書: **`etc/V2_CUTIN_WORKORDER.md`**（Sonnet 5向け・行番号付き。実装はそちらに従う）
関連: `novel/js/novel.js`（NovelEngine） / `etc/V2_NOFLAG_WORKORDER.md`（stage-params貫通パターンの前例） /
memory [[project-novel-system]]

プレイ中のイベント発生時（時間経過・開封率閾値・ステージ開始/クリア等）に、
盤面を隠さない半透明ウィンドウ＋バストアップ立ち絵で短い会話を差し込む演出の設計案。

---

## 0. 要件（ユーザー指定・確定）

- 半透明ウィンドウを画面中央付近に表示。**盤面は見えたまま**
- 発話者に応じて左/右からバストアップ画像がスライドイン
- テキストはタイプライター表示
- 数秒表示後、キャラ退場→ウィンドウフェードアウトで終了
- **カットイン中はプレイ停止・タイムも停止**。マス開放・UI操作は不可
- **カットインを入れるステージはタイムランキング対象外**
- `CutIn.show({speaker, side, text})` 形式の独立モジュール
- 将来 `Dialogue.play("rest_notice")` のイベント駆動型へ発展させたい
  → **演出管理と会話データ管理を分離**する

### 0.1 確定事項（2026-07-12 ユーザー回答）

1. **対象ステージ = 新モード「STORY MODE 2」を新設**（§5.5）。stage1〜8のミラー全8ステージ、
   **stageID 22〜29**（22←stage1, 23←stage2, … 29←stage8）。
   - **ランキング対象**：初手前＋クリア後カットインのみのステージ（stage2〜7ミラー＝**id:23〜28**）
   - **ランキング対象外**：プレイ中にカットインが入るステージ（stage1・8ミラー＝**id:22・29**）
   - → 除外判定は「カットインの有無」ではなく**「プレイ中に発火し得るトリガーの有無」から自動導出**（§5.3改）
2. **画像素材**：命名 `cutin_<charId>_<expression>.png`・幅600px前後で採用
3. **進行方式**：「自動クローズ＋タップで早送り」ハイブリッドで採用
4. **ボイス無し** → BGMダッキング不要（検討終了）
5. **スマホ狭幅**：実機で最終判断。ただし**ウィンドウ高さはPC版の約2倍**を想定（§10改）
6. **ウィンドウ表示SE**：JSONで設定可能にする（セット単位の既定＋イベント単位の上書き、§6改）
7. **追加要件**：キャラ台詞以外に**警告演出**（画面の赤点滅＋警告音＋「警告」文字イラスト表示）の
   仕組みが欲しい → §14で設計。**実装はまだ**（会話カットインより後段）

---

## 1. 前提調査の結果（既存コードの事実）

### 1.1 novel.js をプレイ画面でそのまま動かすのは不可（結論）

`novel/js/novel.js` は「ページ全体を専有する」前提の設計：

- `document.addEventListener('click', ...)` / `keydown`（Space/Enter/→）を**document全体**に張る
  （novel.js:159-176）→ ゲームの盤面クリック・ドラッグと即衝突する
- `#start-screen` `#dialog-window` `#background-layer` 等の**固定DOM構造**を要求
- BGM管理・背景管理・END画面遷移など、カットインには不要な機能が本体と分離できない

→ **新規の軽量モジュール `js/cutin.js` を作る**のが正解。ただし novel.js で実績のある
パターン（タイプ処理・`_withCacheBust`・AudioSettings連動・portraits解決）は移植し、
**会話データの行形式は novelスクリプトのサブセット互換**にする（§6。将来
`etc/novel_editor.html` の流用や、ノベル側との台本コピペを可能にしておく）。

### 1.2 ゲーム側の関連実装（sphere-minesweeper.html、行番号は2026-07-12時点）

| 項目 | 場所 | 事実 |
|---|---|---|
| 一時停止フラグ | `gamePaused`（2118行） | 設定メニューが使用。**入力3箇所に既にガード済み**：mousedown(3073)・touchstart(3124)・handleMouseAction(3169)。ただし**タイマー/BGMは止まらない**（コメント明記） |
| ポーズ用オーバーレイ | `#pause-overlay`（687行、z-index:50） | 設定メニュー時の球体操作ブロック用。カットインでは**流用しない**（z-index50はUI(#ui=100)より下でUIボタンを塞げない） |
| 表示タイマー | `startTimer()`（4165行） | `elapsed`（整数秒）を1秒intervalで加算 |
| 精密タイム | `window._timerStartMs` / `window._loopTotalStartMs` | performance.now()基準。クリアタイム(`computeClearTimeSec` 1028行)・制限時間ゲージ(4780-4793行、毎フレーム`totalTime - (now - _timerStartMs)`で再計算)の両方が参照 |
| ランキング保存 | `showRescueScreen()` 1056-1069行 | `addRankingRecord(stageId, clearTimeSec)` の**1箇所のみ**。ここを条件分岐すれば除外完了 |
| ステージ設定 | `applyStageParam()` / `data/stage-params.json` | ステージ固有設定の注入点。noflagの`gameRule`と同じパターンでカットイン設定を追加できる |
| 中断メタ | `saveSuspend()`/`resumeSuspend()` | `?boot=resume`は`applyStageParam`を通らないため、**metaへの保存・復元が唯一の経路**（gameRuleで前例あり） |

**タイマー停止の要点**：`elapsed`のintervalを止めるだけでは不十分。
`_timerStartMs`/`_loopTotalStartMs` が performance.now() 基準のため、**ポーズ時間ぶん
両方を後ろへシフト**しないと、クリアタイム・制限時間ゲージにポーズ中の時間が乗ってしまう。

---

## 2. 推奨アーキテクチャ：3層分離

```
┌─────────────────────────────────────────────┐
│ sphere-minesweeper.html（ホスト・アダプタ層）  │ ← 約40行の追加のみ
│  - pauseGameTime()/resumeGameTime()          │
│  - GameEvents.notify(...) 発火ポイント数箇所   │
│  - ランキング除外・suspend meta               │
└───────────────┬─────────────────────────────┘
                │ notify(event)         │ hooks(onStart/onEnd)
┌───────────────▼──────────┐  ┌─────────▼──────────────────┐
│ js/cutin-dialogue.js      │  │ js/cutin.js                 │
│ Dialogue（データ・進行管理）│─▶│ CutIn（演出のみ・汎用）      │
│  - data/cutin/*.json 読込  │  │  - DOM/CSS自己注入          │
│  - トリガー判定・once管理   │  │  - show()/play() Promise    │
│  - Dialogue.play(id)      │  │  - キュー・タイプ・スライド    │
└──────────────────────────┘  └────────────────────────────┘
```

- **CutIn（演出層）**：マインスイーパーを一切知らない。DOM・CSSは自分で `<style>` ごと
  注入するので、**ホストHTMLへのタグ追加はゼロ**（保守性最優先。将来ノベル画面や
  タイトル画面でも同じファイルで動く）。ゲームとの接点は `init()` で渡される
  `hooks.onStart / hooks.onEnd` コールバックだけ。
- **Dialogue（データ・進行層）**：`data/cutin/<stageId>.json` を読み、トリガー条件
  （時間・開封率・地雷消滅数・開始/クリア）を保持。ゲームからの `notify()` を受けて
  条件成立したイベントを CutIn のキューへ流す。`once`（1回だけ）管理もここ。
- **ホスト層**：時間停止・入力封鎖・イベント通知・ランキング除外。ゲーム内部変数に
  触る処理はすべてここに閉じ込める（cutin.js/dialogue.js はゲームのグローバルを参照しない）。

この分離により、将来 `Dialogue.play("stage_clear")` のようなイベント駆動化は
**Dialogue層とJSONの拡張だけ**で済み、演出層は無改修になる。

---

## 3. ファイル構成

```
js/cutin.js               演出モジュール（新規・約300行）
js/cutin-dialogue.js      会話データ・トリガー管理（新規・約150行）
data/cutin/stage12.json   ステージ別会話データ（新規・ユーザー編集可能）
assets/images/cutin/      バストアップ画像（例: cutin_oracle_normal.png）
```

読み込みは `sphere-minesweeper.html` に `<script src="js/cutin.js">` ほか2行追加。
**カットイン定義が無いステージでは一切動かない**（fetch自体しない）ので、
既存ステージへの回帰リスクはロード2行分のみ。

---

## 4. HTML / CSS 構造（cutin.js が自己注入）

### 4.1 DOM（生成はJS。ホストHTMLには書かない）

```html
<div id="cutin-layer">                     <!-- 全画面・入力遮断。通常はdisplay:none -->
  <div id="cutin-stage">                   <!-- 中央配置用のフレックス枠 -->
    <img id="cutin-char-left"  class="cutin-char left">
    <img id="cutin-char-right" class="cutin-char right">
    <div id="cutin-window">                <!-- 半透明会話ウィンドウ -->
      <div id="cutin-name">ORACLE</div>
      <div id="cutin-text"></div>
      <div id="cutin-next">▼</div>         <!-- クリック送りが有効な行のみ表示 -->
    </div>
  </div>
</div>
```

### 4.2 z-index 設計

ゲーム内の既存値：`#pause-overlay`=50 ／ `#ui`=100 ／ `#settings-menu`=210 ／
`#rescue-screen`系=300前後 ／ `#replay-controls`=9990。

**`#cutin-layer` は z-index:150** とする。
- UI（100）より上 → タイマー・ヒント・設定ボタン等のUI操作を物理的に遮断（要件充足）
- 設定メニュー（210）より下 → 万一の競合時は設定メニューが勝つ（ただし §5.2 の通り
  カットイン中は gamePaused=true なので設定は開けない状態にはならない※後述の注意参照）
- クリア演出（300）より下 → stage_clear カットインは救出画面より**前**に完了させる設計（§7.4）

### 4.3 CSS の要点（transform/opacity のみでアニメーション）

three.js の描画ループはカットイン中も回り続ける（盤面が見えている要件のため）。
よって**レイアウトを揺らさない**ことが最重要：アニメーションは `transform` と `opacity`
に限定し（コンポジタ合成のみでreflowなし）、`will-change` は多用しない。

```css
#cutin-layer{
  position:fixed; inset:0; z-index:150; display:none;
  /* 背景は暗くしすぎない。盤面視認性維持のため薄めのビネットのみ */
  background:radial-gradient(ellipse at center, transparent 40%, rgba(0,5,20,0.35) 100%);
}
#cutin-window{
  position:relative; width:min(640px, 86vw); margin:0 auto;
  background:rgba(0,10,30,0.72); backdrop-filter:blur(4px);
  border:1px solid rgba(0,200,255,0.45); border-radius:6px;
  padding:14px 20px 18px; box-shadow:0 0 24px rgba(0,150,255,0.25);
  opacity:0; transform:translateY(14px);
  transition:opacity .28s ease, transform .28s ease;
}
#cutin-layer.show #cutin-window{ opacity:1; transform:translateY(0); }

.cutin-char{
  position:absolute; bottom:0; max-height:min(34vh, 300px); width:auto;
  opacity:0; transition:transform .32s cubic-bezier(.22,.9,.3,1), opacity .32s ease;
  pointer-events:none; filter:drop-shadow(0 0 12px rgba(0,0,0,0.5));
}
.cutin-char.left { left:2vw;  transform:translateX(-45%); }
.cutin-char.right{ right:2vw; transform:translateX(45%);  }
.cutin-char.in   { opacity:1; transform:translateX(0); }

#cutin-name{
  font-family:'Orbitron',sans-serif; font-size:12px; letter-spacing:.25em;
  color:#00ffff; margin-bottom:8px;
}
#cutin-text{
  font-size:clamp(13px, 3.4vw, 16px); line-height:1.9; color:#dde8ff;
  min-height:3.8em; /* 2行分を確保：タイプ中の高さ揺れ防止 */
}
```

（実際は cutin.js 内の文字列として `<style id="cutin-style">` で注入。
配色はゲーム内の既存トーン＝宇宙ブルー系 `rgba(0,200,255,…)` に合わせた仮値。）

---

## 5. ゲーム統合（ホスト層）— 時間停止・入力封鎖・ランキング除外

### 5.1 時間停止 `pauseGameTime()` / `resumeGameTime()`

```js
// sphere-minesweeper.html に追加（startTimer の近く）
let _timePausedAt = null;

function pauseGameTime(){
  if(_timePausedAt !== null) return;          // 二重ポーズ防止
  _timePausedAt = performance.now();
  clearInterval(timerInterval);               // elapsed の1秒加算を停止
}

function resumeGameTime(){
  if(_timePausedAt === null) return;
  const pausedMs = performance.now() - _timePausedAt;
  _timePausedAt = null;
  // performance.now() 基準の起点を全てポーズ時間ぶん後ろへシフト
  if(window._timerStartMs)      window._timerStartMs      += pausedMs;
  if(window._loopTotalStartMs)  window._loopTotalStartMs  += pausedMs;
  if(gameState === 'playing'){                // クリア/GO後は再開しない
    timerInterval = setInterval(()=>{
      elapsed++;
      document.getElementById('stat-time').textContent = formatTime(elapsed);
      updateDigitTimer(elapsed);
    },1000);
  }
}
```

**罠と対策**：
1. `animate()` の制限時間ゲージ更新（4780行）は毎フレーム `_timerStartMs` から
   再計算している → ポーズ中もゲージが減り続ける。
   **`if(timeLimitMode && gameState==='playing' && totalTime>0)` の条件に
   `&& _timePausedAt===null` を追加**（1行）。resume時に起点シフト済みなので再開後は連続。
2. `startTimer()` 内の interval 本体と resume 側で同じtick処理を書く
   → 実装時は `_timerTick()` として関数抽出して共用する（コピペ二重化しない）。
3. カットイン中に中断（設定メニュー→中断）は起きない（§5.2で設定ボタン自体が塞がる）
   ので、`saveSuspend` とポーズ状態の交差は考慮不要。

### 5.2 入力封鎖（二重ガード）

- **第1防壁**：`#cutin-layer`（z-index:150・全画面・pointer-events:auto）が
  canvas と UI(#ui=100) の**両方**への クリック/タッチ/ドラッグ/ホイール を物理遮断。
  レイヤー自身へのクリックは「タイプ中→全文表示（スキップ）／表示済み→次の行へ」に使う。
- **第2防壁**：カットイン開始時に `gamePaused = true`。既存ガード
  （mousedown 3073 / touchstart 3124 / handleMouseAction 3169）がそのまま効く。
  終了時に `false` へ戻す。
- 注意：`gamePaused` は設定メニューと共用のため、**カットイン終了時に無条件で
  false に戻すと設定メニュー中のポーズを壊す**可能性が理論上ある。
  実装は `_cutinPausing` フラグを別に持ち、`resume時に設定メニューが開いていなければ
  false に戻す`（openSettingsMenu/closeSettingsMenu 側は無改修）。
- ピンチズーム（touchstart 2本指）・ホイールズームもオーバーレイが吸うため追加対応不要。
- キーボード：ゲーム側に盤面操作のキーバインドは無い（デバッグ用のみ）ため対応不要。
  必要になったら CutIn 側で keydown を捕捉して stopPropagation する。

### 5.3 ランキング除外（2026-07-12改：トリガー種別からの自動導出）

**方針**：ランキングの公平性を壊すのは「プレイ中（初手〜クリア確定の間）に発火する
カットイン」だけ。ポーズ中もタイマーは止まるが、**盤面を眺めながら思考する時間が
無償で手に入る**ため、プレイ中カットインのあるステージは記録対象外にする。
逆に**初手前**（盤面は全closed＝情報ゼロ、タイマー未始動）と**クリア後**
（勝敗確定済み）のカットインは記録の公平性に影響しない → ランキング対象のまま。

除外フラグはステージ設定に手書きせず、**会話データのトリガー種別から自動導出**する
（手書きだとJSON編集でトリガーを足した時にフラグ更新を忘れて不整合になる）：

```js
// Dialogue.load() 完了時に算出
const IN_PLAY_TRIGGERS = new Set(['time', 'open_rate', 'mines_removed', 'manual']);
window._cutinBlocksRanking =
  _data.events.some(ev => IN_PLAY_TRIGGERS.has(ev.trigger?.type));
// stage_start（初手前）と stage_clear（勝敗確定後）だけなら false のまま
```

- `manual`（`Dialogue.play()` 用）は発火タイミングを静的に判定できないため
  **安全側に倒して in-play 扱い**とする。
- STORY MODE 2 での帰結：id:23〜28（stage_start/stage_clear のみ）→ ランキング保存、
  id:22・29（time等のプレイ中トリガーあり）→ 除外。**JSONを書くだけで自動的に
  正しく振り分けられ**、将来トリガー構成を変えても追従する。

貫通手順（noflag の `gameRule` と同じパターン）：

1. `data/stage-params.json`：カットインを入れるステージに `"cutin": "stage22"` を追加
   （値は `data/cutin/<値>.json` のファイル名。無いステージは従来通り）。
2. `applyStageParam()`：`window._cutinSet = stage.cutin || null;` を追加。
   `_cutinSet` があれば Dialogue.load() を呼ぶ（→ ロード完了時に上記フラグ算出）。
3. **`showRescueScreen()` 1058行を1行変更**：
   ```js
   if(stageId && !window._cutinBlocksRanking){  // プレイ中カットインのあるステージのみ除外
     const rank = addRankingRecord(stageId, clearTimeSec);
     ...
   } else {
     rankEl.textContent = '';
   }
   ```
   クリアタイム表示（`rescue-time`）自体は全ステージで残す（タイムは見せる）。
   ※ ポーズ中シフト（§5.1）によりこのタイムにカットイン時間は乗らない。
4. `saveSuspend()` meta に `cutinSet` と `cutinFired`（once発火済みID配列）を追加、
   `resumeSuspend()` で復元（`?boot=resume` は applyStageParam を通らないため必須。
   旧データは undefined → カットイン無し扱いで後方互換）。`_cutinBlocksRanking` は
   復元後の Dialogue.load() で毎回再算出されるため保存不要。
   **GAME_VERSION は上げない**（optionalフィールド追加のみで互換影響なし）。
5. index.html 側：除外ステージ（22・29）はランキングが保存されないので BEST TIME は
   自然に「-」のまま、RECORDSモーダルは「記録なし」表示。**無改修で整合**
   （🏆アイコン自体を除外ステージで非表示にするかはユーザー判断・任意の小修正）。

### 5.4 イベント通知の発火ポイント（追加は各1行）

| イベント | 発火場所 | 備考 |
|---|---|---|
| `stage_start` | **初手前（idle中）**：Dialogue.load 完了＋キャラデータready後に通知（`_charDataReady` 解決後） | 盤面は全closed＝情報ゼロ・タイマー未始動なのでランキング公平性に影響しない（§5.3）。pause/resume フックはタイマー未始動でも安全にno-op（§5.1の実装が `_timerStartMs` 未設定なら何もしない）。※STORY MODE 2はstage1〜8ミラー（リアルタイム生成）なのでJudge開始（Factory盤面）との競合なし。将来EX系ミラーに入れる場合はJudge演出との順序を要設計 |
| `time`（経過秒） | `startTimer` の1秒tick内から `Dialogue.notify('time', {sec: elapsed})` | ポーズ中はtick自体が止まるので二重発火なし |
| `open_rate` | `updateCharacterReveal()` 末尾から現在比率を通知 | attack=消滅ベース／noflag=開封ベースの既存 `charRevealRatio` をそのまま流用 |
| `mines_removed` | `removeMine()` 成功時に `{count: removedMines}` | |
| `stage_clear` | `checkWin()` 内・`triggerRescueSequence` の**前**（§7.4） | |

通知はすべて「Dialogueが未ロードなら即return」の空振り設計。
カットイン無しステージのオーバーヘッドは実質ゼロ。

### 5.5 STORY MODE 2（id:22〜29）の追加

noflag モード（id:12〜21）とほぼ同じ増設パターン。カットインの器となる新モード。

1. **`data/stages.json` / `data/stage-params.json`**：id:22〜29 を追加
   （22←stage1, … 29←stage8 のミラー。gameRule は付けない＝attack のまま）。
   各ブロックに `"cutin": "stage22"` 等を追加（22〜29全部に付けるかは台本次第。
   カットイン無しのステージには付けなくてよい）。
   charId/BGM/背景は元ステージのコピーで開始し、後日ユーザーがJSON編集で確定
   （stageEX2 と同じ運用）。
2. **`data/modes.json`**：SIMPLE（またはNO FLAG）の下に `"id": "story2"` カードを追加
   （label/desc/image は暫定値で実装、ユーザーがJSON編集で差し替え）。
3. **`index.html`**：noflag実装で一般化済みの `renderStageList` を流用して
   `renderStory2List`（ids 22〜29、noStr は `(id-21)` の2桁ゼロ埋め '01'〜'08'）。
   `renderModeSelect` のクリック分岐＋ `?story2=1` 直接オープンを追加。
4. **戻り導線**：STAGEボタン2箇所（updateRescueButtons / 設定メニュー）の分岐に
   story2 を追加。判定は noflag の gameRule 方式に合わせ、`data/stage-params.json` に
   `"listGroup": "story2"` を持たせて `applyStageParam` で `window._listGroup` に注入
   →戻り先URLを `?noflag=1` / `?story2=1` / `?normal=1` で出し分け
   （※既存 noflag は gameRule 判定のままでも動くが、実装時に `listGroup` へ
   統一リファクタするかは任意）。suspend meta にも `listGroup` を追加して resume 対応。
5. **ランキング**：id単位で自然分離（`stellarDeleteRanking_stage_22`〜`29`）。
   保存の可否は §5.3 の自動導出に従う（23〜28は保存される）。
6. **SIMPLE MODE ランダムキャラ選出**：STORY MODE 2 のキャラを固定にする場合は
   `_exFixedCharIds` 配列（noflag実装で配列化済み）に 22〜29 を追加するだけ。
   固定かランダムかは台本・演出の設計次第（未決§13）。

**「STORY MODE 2」の名前について**：既存 STORY MODE（EPISODES＝ノベル章立て）とは
構造が別物（ステージリスト型＋カットイン演出）。ステージ間にノベル（novelXX.html）を
挟むか・解放順を直列にするか（stage N クリアで N+1 解放）は**未決**（§13）。
直列解放にする場合は `stellarDeleteSave` に story2 用の unlocked フィールドを足す
小改修が追加で必要。

---

## 6. 会話データ形式（`data/cutin/stage12.json`）

行形式（`speaker`/`text`/`portrait`）は **novelスクリプトのサブセット互換**。

```json
{
  "se": { "open": "cutin_open.mp3" },
  "characters": {
    "oracle": { "name": "ORACLE", "side": "right",
                "portraits": { "normal": "cutin_oracle_normal.png",
                               "smile":  "cutin_oracle_smile.png" } },
    "alice":  { "name": "アリス", "side": "left",
                "portraits": { "normal": "cutin_alice_normal.png" } }
  },
  "events": [
    {
      "id": "stage_open",
      "trigger": { "type": "stage_start" },
      "once": true,
      "lines": [
        { "speaker": "oracle", "portrait": "normal",
          "text": "観測を開始します。\n星の傷を暴いてください。" }
      ]
    },
    {
      "id": "rest_notice",
      "trigger": { "type": "time", "sec": 300 },
      "once": true,
      "lines": [
        { "speaker": "oracle", "text": "5分経過しました。\n少し休憩しませんか？" }
      ]
    },
    {
      "id": "half_open",
      "trigger": { "type": "open_rate", "gte": 0.5 },
      "once": true,
      "lines": [
        { "speaker": "alice", "text": "半分まで来たよ！", "duration": 2500 },
        { "speaker": "oracle", "portrait": "smile", "text": "この調子です。" }
      ]
    },
    {
      "id": "stage_clear",
      "trigger": { "type": "stage_clear" },
      "once": true,
      "priority": 10,
      "lines": [
        { "speaker": "alice", "text": "やった……！全部見つけた！" }
      ]
    }
  ]
}
```

- `duration`（ms）省略時は**文字数から自動計算**（`1200 + text.length * 55` ms、
  上限6秒）→ タイプ完了後その時間で自動クローズ。クリック/タップで即送り。
- `once:true` はステージ内1回（RETRYでリセット、resumeでは `cutinFired` から復元）。
- 将来の `Dialogue.play("rest_notice")` は **events の id をそのまま手動発火**する
  APIとして実装済みにしておく（トリガー無し `"trigger": {"type":"manual"}` も可。
  ただし manual を含むセットはランキング除外扱いになる点に注意 §5.3）。
- **SE設定（2026-07-12確定）**：ルートの `"se": {"open": "..."}` がウィンドウ表示時の
  既定SE（省略時は無音）。イベント単位で `"se": "..."` を持てば上書き、`"se": null` で
  そのイベントだけ無音化。ファイルは `assets/audio/` から読み、`AudioSettings` の
  SE音量倍率を掛ける（novel.js の `_playSE` と同じ規約）。警告演出（§14）の
  警告音もこの仕組みに載せる（`"se"` をイベントに直接指定）。

---

## 7. JavaScript 設計

### 7.1 CutIn（js/cutin.js）— 公開API

```js
CutIn.init({
  imagePath: 'assets/images/cutin/',
  characters: {...},                  // Dialogueが load 後に渡す
  typingSpeed: 30,                    // novel.js と同じ既定値
  hooks: {
    onStart(){ /* ホストが pauseGameTime()＋gamePaused=true */ },
    onEnd(){   /* ホストが resumeGameTime()＋gamePaused復帰 */ },
  },
});

CutIn.show({ speaker:'oracle', side:'right', portrait:'normal',
             text:'5分経過しました。', duration:3000 });  // → Promise（1行だけ表示）
CutIn.play([ {...}, {...} ]);   // → Promise（複数行を連続再生。hooksは全体で1回）
CutIn.isActive();               // 再生中か
CutIn.cancel();                 // 強制終了（RETRY/画面遷移時の掃除用）
```

- `show()` は内部的に `play([line])` の糖衣。**戻り値は Promise**（stage_clear で
  「カットイン完了を待ってから救出演出」を書けるようにするため）。
- `hooks.onStart` は**キューが空→非空になった瞬間**に1回、`onEnd` は
  **キューが空になってレイヤーを閉じた瞬間**に1回だけ呼ぶ（連続イベントで
  ポーズ/再開がバタつかない）。

### 7.2 実装スケルトン（要点のみ・実装時の叩き台）

```js
const CutIn = (() => {
  let _cfg = {}, _queue = [], _running = false;
  let _typeTimer = null, _autoTimer = null, _lineResolve = null;
  let _typing = false, _currentLine = null;

  function init(cfg){ _cfg = Object.assign({typingSpeed:30}, cfg); _buildDom(); }

  function play(lines){
    return new Promise(resolve => {
      _queue.push({ lines, resolve });
      if(!_running) _runNext();
    });
  }
  const show = line => play([line]);

  async function _runNext(){
    if(_running) return;
    const job = _queue.shift();
    if(!job){ return; }
    _running = true;
    if(_queue.length === 0 && !_layerVisible()) _cfg.hooks?.onStart?.();
    _showLayer();
    for(const line of job.lines){
      await _playLine(line);            // スライドイン→タイプ→待機/クリック
    }
    job.resolve();
    if(_queue.length){ _running = false; _runNext(); return; }
    await _hideLayer();                 // キャラ退場→ウィンドウフェードアウト
    _running = false;
    _cfg.hooks?.onEnd?.();
    if(_queue.length) _runNext();       // onEnd中に積まれた分（稀）を回収
  }

  function _playLine(line){
    return new Promise(resolve => {
      _lineResolve = resolve; _currentLine = line;
      const ch = _cfg.characters[line.speaker] || {};
      _setPortrait(ch, line);           // side別のimgへ src セット＋ .in クラス
      _setName(ch.name || line.speaker);
      _startTyping(line.text || '', () => {
        const dur = line.duration ?? Math.min(6000, 1200 + (line.text||'').length*55);
        _autoTimer = setTimeout(_finishLine, dur);
        _showNextArrow(true);
      });
    });
  }
  function _finishLine(){
    clearTimeout(_autoTimer); _showNextArrow(false);
    const r = _lineResolve; _lineResolve = null;
    if(r) r();
  }

  // レイヤークリック：タイプ中→全文表示／表示済み→次へ
  function _onLayerTap(e){
    e.preventDefault(); e.stopPropagation();
    if(_typing){ _skipTyping(_currentLine); }
    else if(_lineResolve){ _finishLine(); }
  }

  function cancel(){
    clearInterval(_typeTimer); clearTimeout(_autoTimer);
    _queue.forEach(j => j.resolve());   // 待ち手をリークさせない
    _queue = []; _typing = false;
    const wasRunning = _running; _running = false;
    _hideLayerInstant();
    if(wasRunning) _cfg.hooks?.onEnd?.();
  }

  // _buildDom / _startTyping / _skipTyping は novel.js の実装を単純化して移植
  // （テキストは textNode 追記方式・\n は <br>。innerHTML への文字列連結はしない）

  return { init, show, play, cancel, isActive: () => _running };
})();
```

タイプ処理・`_withCacheBust`・SE再生（`AudioSettings` 倍率）は novel.js の
該当関数（novel.js:822-866, 453-456, 1146-1153）をほぼそのまま流用可能。

### 7.3 Dialogue（js/cutin-dialogue.js）

```js
const Dialogue = (() => {
  let _data = null, _fired = new Set();

  async function load(setName){
    const res = await fetch(`data/cutin/${setName}.json`, {cache:'no-store'});
    _data = await res.json();
    CutIn.init({ imagePath:'assets/images/cutin/', characters:_data.characters,
                 hooks: window._cutinHooks });   // ホストが用意
  }

  // ゲームからの状態通知。条件成立したイベントを再生
  function notify(type, payload = {}){
    if(!_data) return;
    for(const ev of _data.events){
      if(_fired.has(ev.id)) continue;
      if(!_match(ev.trigger, type, payload)) continue;
      _firePlay(ev);
    }
  }

  function _match(t, type, p){
    if(!t || t.type !== type) return false;
    if(type === 'time')          return p.sec >= t.sec;
    if(type === 'open_rate')     return p.rate >= t.gte;
    if(type === 'mines_removed') return p.count >= t.gte;
    return true;   // stage_start / stage_clear は型一致のみ
  }

  function play(id){                       // 手動発火（将来のイベント駆動API）
    const ev = _data?.events.find(e => e.id === id);
    return ev ? _firePlay(ev) : Promise.resolve();
  }
  function _firePlay(ev){
    if(ev.once !== false) _fired.add(ev.id);
    return CutIn.play(ev.lines);
  }

  function reset(){ _fired.clear(); CutIn.cancel(); }          // RETRY時
  function getFired(){ return [..._fired]; }                    // saveSuspend用
  function restoreFired(ids){ (ids||[]).forEach(i => _fired.add(i)); }

  return { load, notify, play, reset, getFired, restoreFired, has: id => !!_data };
})();
```

`once` 判定は**発火時に即 Set 登録**（再生完了を待たない）ので、同一tickに
複数イベントが成立しても二重登録されない。

### 7.4 stage_clear の割り込み位置

`checkWin()` の勝利確定後、`triggerRescueSequence` を呼ぶ直前で：

```js
const _goRescue = () => triggerRescueSequence(...);
if(window._cutinSet){
  Dialogue.notify('stage_clear');          // キューに積まれる（該当イベントがあれば）
  // CutIn がアクティブなら完了を待ってから救出演出へ
  (CutIn.isActive() ? new Promise(r => _waitCutinEnd(r)) : Promise.resolve())
    .then(_goRescue);
} else {
  _goRescue();
}
```

実装時は `CutIn.play()` の Promise を `Dialogue.notify` 経由でも受け取れるよう
`notify` が「発火したイベントのPromise配列」を返す形にするのが素直
（上記スケルトンをその形に微修正）。
**注意（重要な罠）**：stage_clear カットインでも **hooks（pause/resume）は必ず呼ぶ**こと。
精密クリアタイムは `showRescueScreen()` 到達時点の `performance.now() - _timerStartMs` で
算出される（computeClearTimeSec 1028行）ため、カットインで救出画面が遅れると
**その分クリアタイムが伸びてしまう**。pauseGameTime/resumeGameTime が `_timerStartMs` を
ポーズ時間ぶんシフトすることで、カットイン時間はタイムに乗らない
（これはランキング対象の id:23〜28 で特に必須。`resumeGameTime` は
`gameState==='playing'` でなければintervalを再開しない設計なので勝利後でも安全）。

---

## 8. イベントキュー・多重発生の制御

**キューは必須**。理由：1回の開封で `open_rate 50%` と `time 300s` が同時成立する、
複数行イベントの再生中に別イベントが成立する、等が普通に起きる。

制御方針（シンプル優先）：

1. **直列再生・FIFO**：CutIn は常に1本ずつ。再生中に来たものはキューへ。
2. **ポーズが二次発生を自然に抑止**：カットイン中はタイマー停止＋入力封鎖なので、
   time/open_rate/mines_removed の**新規**成立はそもそも起きない。キューに入るのは
   「同一アクションで同時成立した複数イベント」だけ → キュー上限は実用上不要。
3. **priority**：`stage_clear`（priority:10）だけ特別扱いし、キュー先頭へ割り込み＋
   **未再生の通常イベントをキューから破棄**（クリア後に「50%到達！」が出る滑稽さを防ぐ）。
   それ以外は定義順。
4. **クールダウン（任意・既定OFF）**：`"cooldownSec": 30` をJSONルートに置けるように
   しておく（頻発しすぎる場合の調整弁。時間はゲーム内時間＝ポーズ除外で計測）。
5. **RETRY/遷移時の掃除**：`restartGame()` に `Dialogue.reset()`（=`CutIn.cancel()` 込み）
   を1行追加。cancel は待機中Promiseを全てresolveしてリークさせない（§7.2）。

---

## 9. 将来拡張（会話システムへの発展）

- **`Dialogue.play(id)`**：§7.3 で最初から実装済みにする（トリガー無しの manual イベント）。
  ノベル的な「選択肢」「分岐」が欲しくなったら、events を `next` フィールドで
  チェーンする形が novelスクリプトとの互換を保ちやすい。
- **エディタ流用**：行形式が novelスクリプト互換なので、`etc/novel_editor.html` を
  ベースに「カットイン用エディタ」を派生させられる（トリガー設定UIを足すだけ）。
- **他画面への展開**：CutIn はゲーム非依存なので、タイトル画面のお知らせ演出や
  ノベル画面内のシステムメッセージにもそのまま使える。hooks を渡さなければ
  「ポーズ無しの純演出」として動く（hooks は optional）。
- **ボイス/SE**：line に `"se": "voice_alice_01.mp3"` を足し、`_playLine` 冒頭で
  再生するだけの拡張ポイントを確保（v1では未実装）。

---

## 10. モバイル考慮

1. **サイズ**：ウィンドウ `min(640px, 86vw)`、立ち絵 `max-height:min(34vh, 300px)`、
   文字 `clamp(13px, 3.4vw, 16px)`。
   **狭幅（幅600px未満）ではウィンドウ高さをPC版の約2倍にする**（2026-07-12確定）：
   PC=テキスト2行分（min-height:3.8em）→ スマホ=4行分（min-height:7.6em）。
   台本ルールは「**PC幅で全角30字×2行以内**」（スマホでは同じ文が自動的に3〜4行に
   折り返されるが、4行分の高さがあるので収まる。editorでバリデーション可能）。
2. **配置**：中央固定だが、立ち絵はウィンドウの左右**外側**下端に置くと狭幅で
   ウィンドウと重なる → 幅600px未満では立ち絵をウィンドウ**背面**に半透明で重ねる
   （`@media (max-width:600px){ .cutin-char{opacity:.55; z-index:-1;} }` 的な逃げ）
   or 立ち絵を小さくして上部に出す。**実装時に実機で選択**（2026-07-12確定：実機判断）。
3. **タッチ**：レイヤーの `touchend` で preventDefault（novel.js:165-168 と同じ
   Android Chrome 対策）。誤タップ即スキップを防ぐため、**表示後300msはタップ無視**。
4. **セーフエリア**：`padding-bottom:env(safe-area-inset-bottom)` をレイヤーに。
5. **性能**：backdrop-filter は blur(4px) 程度に抑える（既存UIで実績あり）。
   立ち絵画像はステージ開始時（Dialogue.load 直後）に `new Image()` で**先読み**
   （初回表示時のデコードjankを防ぐ。72×144等の重い盤面ではデコードもヒッチ要因）。
   画像は**幅600px程度のPNG/WebP**を推奨（バストアップならファイルサイズ小）。

---

## 11. 実装ステップ案（着手時の順序）

1. `js/cutin.js` 単体（DOM注入・show/play・タイプ・スライド・キュー・cancel。
   §14の `type:"warning"` はスキップするスタブ分岐のみ入れる）
   → デバッグ用にコンソールから `CutIn.show({...})` で目視確認
2. ホスト層：pauseGameTime/resumeGameTime＋ゲージ1行ガード＋gamePaused連携
3. `js/cutin-dialogue.js`＋`data/cutin/` 読込（applyStageParam の `_cutinSet`）＋
   `_cutinBlocksRanking` 自動導出
4. **STORY MODE 2 増設**（§5.5：stages/stage-params id:22〜29・modes.jsonカード・
   index.htmlリスト・戻り導線。noflag実装の手順をなぞる）
5. 通知5箇所＋stage_clear割り込み＋ランキング除外＋restartGameのreset
6. suspend meta（cutinSet/cutinFired/listGroup）保存・復元
7. 台本JSON（ユーザー支給 or 暫定ダミー）を `data/cutin/` に配置
8. 検証（§12）→ 実機（GitHub Pages）
9. **後段**：警告演出（§14）の本実装

工数感：中規模＋α。noflag実装（コア2ファイル＋ホスト局所変更）に
STORY MODE 2 のモード増設（こちらはnoflagで手順確立済み）が乗る。

## 12. 検証チェックリスト（実装時に使用）

1. カットイン中：盤面クリック/ドラッグ/ピンチ/UIボタン全て無効、盤面は見えている
2. タイマー：表示秒・精密クリアタイム・制限時間ゲージの3系統すべてポーズ分だけ遅れる
   （カットインを10秒眺めてもクリアタイムに乗らないこと）
3. タイプ中タップ→全文表示、再タップ→次の行、放置→duration後に自動送り
4. 複数イベント同時成立→順番に再生、stage_clear→他を破棄して優先
5. RETRY→once リセット・進行中カットインが即消える・gamePaused が正しく戻る
6. 中断→resume→once発火済みが復元され再発火しない。resume直後のstage_startも再発火しない
7. **ランキング振り分け**：id:22/29（プレイ中トリガーあり）→クリアしても未保存・
   RECORDSに出ない（タイム表示自体は出る）。id:23〜28（初手前＋クリア後のみ）→
   **保存される**うえ、stage_clearカットインを長く眺めてもクリアタイムが伸びない
   （§7.4のシフトが効いていること＝同一プレイでカットイン即スキップと放置でタイム一致）。
   **通常ステージ：回帰なし**（ランキング保存・設定メニューのポーズ挙動）
8. 制限時間モードのステージにカットインを置いた場合：ポーズ中にゲージが減らない・時間切れ判定が出ない
9. モバイル幅（375px）でレイアウト破綻なし・ウィンドウ高さ2倍・誤タップ300msガード動作
10. STORY MODE 2：MODE SELECTカード表示→リスト（01〜08表記）→各ステージ起動→
    STAGEボタンで `?story2=1` に戻る。初手前カットイン中に盤面クリックしても初手が発生しない
11. 音：検証後は必ず音停止＋サーバー停止

---

## 13. 未決事項

~~初回検討時の6件~~ → **全て確定（§0.1参照）**。残る未決は以下：

1. **STORY MODE 2 の進行仕様**：解放順を直列にするか（stage N クリアで N+1 解放。
   要 `stellarDeleteSave` 拡張）／全開放か。ステージ間にノベル（novelXX.html）を挟むか。
   MODE SELECTカードの label/desc/image（暫定値で実装開始は可能）
2. **id:22〜29 のキャラ**：charId固定（誰を出すか）かSIMPLE同様ランダムか。
   BGM/背景/stage画像もミラー値のままでよいか（後日JSON編集で確定でも可）
3. **台本**：各ステージのカットイン内容（誰が・いつ・何を言うか）。
   特に id:22/29 のプレイ中トリガー構成（time何分・open_rate何%等）
4. **警告演出（§14）の細部**：警告中に時間を止めるか（モーダルか非モーダルか）・
   赤点滅の強度（写真感受性への配慮で点滅周期は2Hz以下推奨）・警告音素材・
   「警告」文字イラスト素材（ユーザー準備）
5. **SE素材**：ウィンドウ表示SE（`cutin_open.mp3` 相当）を用意するか
   （無ければ既定無音で実装を進められる）

---

## 14. 警告演出（アラート）システム — 設計のみ・実装は後段（2026-07-12追加要件）

キャラの台詞とは別に、**警告メッセージ＋画面の赤点滅＋警告音＋専用イラスト
（「警告」と書かれた文字イラスト）**を出せる仕組み。会話カットインと同じ
イベント/トリガー基盤（Dialogue）に載せ、**演出タイプだけを分ける**。

### 14.1 データ形式（events に type を追加）

```json
{
  "id": "danger_zone",
  "type": "warning",
  "trigger": { "type": "open_rate", "gte": 0.8 },
  "once": true,
  "se": "EFE_warning.mp3",
  "image": "cutin_warning01.png",
  "text": "残存反応 増大。\n慎重に進んでください。",
  "flash": { "count": 3, "intervalMs": 500 },
  "duration": 3000
}
```

- `type` 省略時は従来の会話カットイン（`lines` 必須）。`"warning"` のときは
  `lines` の代わりに `image`/`text`/`flash` を使う（キャラ立ち絵・ネームプレート無し）。
- `flash.intervalMs` は **500ms以上（点滅2Hz以下）を既定**とする
  （高速点滅は写真感受性発作リスク。W3Cガイドラインの3Hz未満に余裕を持たせる）。

### 14.2 演出構成（CutIn に `_playWarning(ev)` を追加）

1. **赤点滅レイヤー**：`#cutin-layer` 内に `#cutin-alert-flash`
   （`inset:0; background:radial-gradient(...rgba(255,0,0,.25)...); mix-blend-mode:screen`）
   を追加し、CSS keyframes（opacity 0→1→0、`flash.count` 回）で点滅。
   transform/opacityのみ＝盤面描画に影響しない。
2. **警告イラスト**：`image` を中央上部に表示。登場はスライドではなく
   **スケールパンチイン**（`scale(1.4)→1.0` ＋ 微シェイク keyframes）で緊張感を出す。
3. **警告音**：`se` を §6 の仕組みで再生（AudioSettings SE倍率適用）。
4. **テキスト**：会話と同じウィンドウ枠を流用するが、枠色を赤系
   （`border-color:rgba(255,80,80,.6)`）に切替。タイプ速度は速め（15ms）か一括表示。
5. 終了は会話と同じ（duration自動クローズ＋タップ早送り）。

### 14.3 設計上の位置づけ

- **キュー・ポーズ・once・suspend復元はすべて会話カットインと共通**（Dialogueは
  type を見て CutIn.play() か CutIn.warn() を呼び分けるだけ）。
- ランキング除外の自動導出（§5.3）もトリガー種別ベースなのでそのまま効く
  （警告はプレイ中トリガーに付けるのが普通 → そのステージは自動的に除外側）。
- **モーダルか非モーダルか（時間を止めるか）は未決**（§13-4）。非モーダル
  （プレイを止めず画面端に出す「軽量警告」）が欲しくなった場合は、hooks を
  呼ばない＋pointer-events:none のバリアントを CutIn に足す拡張で対応可能。
- v1（会話カットイン）実装時には **`type` フィールドの分岐だけ先に入れておき**、
  `warning` が来たら console.warn でスキップする（データ形式を先に凍結し、
  後段実装で差し替え）。
