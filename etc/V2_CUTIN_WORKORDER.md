# カットイン会話システム＋STORY MODE 2 実装手順書（Sonnet 5 向け）

作成日: 2026-07-12　最終更新: 2026-07-12　ステータス: **実装済み（dev server検証済み・未マージ）**
ブランチ: `feature/cutin-story2`
検討書: `etc/V2_CUTIN_PLAN.md`（設計の背景・確定事項はこちら。本書と食い違ったら本書優先で、
食い違い自体を完了報告に記載すること）
memory: [[project-cutin-plan]]

## 実装結果サマリ（2026-07-12）

Step 1〜8すべて実装完了。検証は主にJS直接実行（`javascript_tool`）で実施——
このdev serverのブラウザプレビューは**タブが`document.hidden=true`扱いのため
`requestAnimationFrame`が一切発火しない環境的制約**があり、three.jsの`animate()`
ループ・スクリーンショット・`resumeSuspend()`のチャンク処理（`_nextFrame()`が
rAF依存）が動かない。この制約下でも検証できる項目（ロジック・タイマー・
DOM状態・localStorage）は全て実機的に確認済み。rAF依存で確認しきれなかった項目
（実際のドラッグ操作・resumeの完全なE2E・制限時間ゲージの実描画）は
コードレビューのみ（**次回実ブラウザでの最終確認を推奨**）。

**実装中に発見した重大バグ（手順書には無かった・修正済み）**：
`window.Dialogue`は常に`undefined`だった。`const Dialogue = (()=>{...})()`は
トップレベル宣言のため`window`のプロパティにならない（`let`/`const`の仕様）。
これにより`cutinNotify()`の`if(!window.Dialogue) return [];`ガードが常に
成立してしまい、**time/open_rate/mines_removed/stage_clearの通知が実際には
一度も発火しない**状態だった（`stage_start`だけは`_cutinStageStart()`が
bare識別子`Dialogue.load()`を直接呼んでいたため気づかれにくかった）。
`restartGame()`の`if(window.Dialogue) Dialogue.reset();`、`saveSuspend()`の
`window.Dialogue ? Dialogue.getFired() : []`も同様に無効化されていた。
→ 全て`window.`プレフィックスを外しbare識別子（`Dialogue.notify(...)`等）に
修正。以後の動作確認は全てこの修正後のコードで実施し、正常動作を確認済み。

**動的に確認できた項目**：
- CutIn: show/play/キュー直列化・タイプライター・誤タップ防止300msガード・
  タップスキップ・duration自動クローズ・clearPending（stage_clear優先）・
  cancel（RETRY中断）・hooks(onStart/onEnd)が複数行/複数イベントで1回ずつ
- 時間停止: `pauseGameTime`/`resumeGameTime`による`_timerStartMs`シフトで
  クリアタイムが実測でカットイン分だけ増えないこと（5.000s→5.056sで誤差
  0.056sのみ、カットイン自体は1秒以上表示していた）
- ランキング振り分け: id:22(time/open_rateトリガーあり)→保存されない、
  id:23(stage_start/stage_clearのみ)→保存される、stage1(カットイン無し)→
  従来通り保存される（回帰なし）
- RETRY: once発火状態リセット・再生中カットインの強制終了・gamePaused復帰
- STORY MODE 2: MODE SELECTカード→リスト（01〜08表記）→RECORDS表示・
  `?story2=1`直接オープン・戻り導線URLロジック（`_listGroup`分岐）
- noflagステージ(id:12)回帰: gameRule/listGroup/開封フラッド動作に影響なし

**コードレビューのみで確認した項目**（rAF制約のため動的確認不可）：
- 制限時間ゲージの`_timePausedAt===null`ガード（既存条件への1個のAND追加のみ、
  低リスク）
- `resumeSuspend()`のcutinSet/listGroup/cutinFired復元（既存の`gameRule`復元と
  同一パターンで実装。`saveSuspend()`側がmeta生成に正しい値を含めることは
  動的確認済み）
- 実際のドラッグ/クリックによる盤面操作（`gamePaused`ガードのState遷移は
  動的確認済みだが、canvas上の実クリックイベント自体は未確認）
- モバイル幅レイアウト（375px CSS自体はレビュー済み、実描画は未確認）

**暫定のまま残る項目**（§4参照）は変更なし。

---

## 0. 前提・運用

- **ブランチ**: `feature/cutin-story2` を `master` から切って作業する。
- **git**: commit / push はユーザーが行う。マージはClaude実行可（ワーキングツリーがクリーンなことを確認してから）。
- **検証**: dev server 経由（`.claude/launch.json` の `static`＝`python -m http.server 8123`）。
  起動は許可不要。**検証後は必ず音を止めてサーバー停止**。
  ブラウザHTTPキャッシュで `data/*.json` の更新が反映されないことがある →
  `?cb=<timestamp>` 付きで再ナビゲーションするか `cache:'no-store'` で回避。
- 主対象ファイル: `js/cutin.js`（新規）/ `js/cutin-dialogue.js`（新規）/
  `data/cutin/*.json`（新規）/ `sphere-minesweeper.html` / `index.html` /
  `data/modes.json` / `data/stages.json` / `data/stage-params.json`
- 行番号は **2026-07-12 時点の master** のもの。ズレていたら記載のシンボル名で検索すること。

## 1. 仕様サマリ（ユーザー確定済み・変更禁止）

- プレイ中イベントで**半透明ウィンドウ＋バストアップ立ち絵**の会話カットインを表示。
  盤面は見えたまま（背景を完全に隠さない）。
- カットイン中は**プレイ停止・タイム停止・マス開放とUI操作は不可**。
- 進行方式: **自動クローズ（duration）＋タップで早送り**のハイブリッド。タイプライター表示。
- 器として**新モード「STORY MODE 2」**を追加: stage1〜8のミラー、**stageID 22〜29**
  （22←stage1, … 29←stage8）。
- **ランキング**: プレイ中に発火し得るトリガー（time/open_rate/mines_removed/manual）を
  含む会話セットのステージのみ対象外。初手前（stage_start）＋クリア後（stage_clear）のみなら
  対象のまま。判定は**会話JSONから自動導出**（手書きフラグ禁止）。
  想定: id:22・29が対象外、id:23〜28が対象。
- 画像素材: `assets/images/cutin/cutin_<charId>_<expression>.png`（幅600px前後、ユーザー準備）。
- ボイス無し・BGMダッキング無し。ウィンドウ表示SEはJSONで設定可（無指定なら無音）。
- スマホ狭幅（<600px）: ウィンドウ高さPC版の約2倍（テキスト4行分）。
- **警告演出（検討書§14）は今回スコープ外**。ただし `type:"warning"` をスキップする
  スタブ分岐だけ入れる（データ形式の先行凍結）。
- `GAME_VERSION` は**変更しない**（optionalなmetaフィールド追加のみ＝後方互換）。

---

## 2. 実装ステップ

### Step 1: `js/cutin.js`（新規・演出モジュール）

**ゲーム非依存**であること（マインスイーパーのグローバル変数を一切参照しない。
接点は `init()` で渡される `hooks` のみ）。DOM/CSSは自己注入し、ホストHTMLへの
タグ追加は不要。以下を参照実装として使う（細部の調整は可だが公開APIと挙動は維持）:

```js
/**
 * cutin.js — プレイ中カットイン演出モジュール（ゲーム非依存）
 * 依存: window.AudioSettings（任意。無ければ音量倍率1で動く）
 * DOM/CSSは自己注入。CutIn.init() → CutIn.show()/play()
 */
const CutIn = (() => {
  let _cfg = null;
  let _queue = [];            // {lines, resolve}
  let _running = false;       // 再生ループが回っているか
  let _layerOpen = false;     // レイヤー表示中か（hooks発火の判定に使用）
  let _typeTimer = null, _autoTimer = null;
  let _typing = false;
  let _lineResolve = null;    // 現在行の完了resolve
  let _currentLine = null;
  let _tapGuardUntil = 0;     // 誤タップ防止（行表示直後300ms）

  const CSS = `
  #cutin-layer{position:fixed;inset:0;z-index:150;display:none;
    background:radial-gradient(ellipse at center, transparent 40%, rgba(0,5,20,0.35) 100%);
    padding-bottom:env(safe-area-inset-bottom);}
  #cutin-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
  #cutin-window{position:relative;width:min(640px,86vw);z-index:2;
    background:rgba(0,10,30,0.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
    border:1px solid rgba(0,200,255,0.45);border-radius:6px;
    padding:14px 20px 18px;box-shadow:0 0 24px rgba(0,150,255,0.25);box-sizing:border-box;
    opacity:0;transform:translateY(14px);transition:opacity .28s ease, transform .28s ease;}
  #cutin-layer.show #cutin-window{opacity:1;transform:translateY(0);}
  .cutin-char{position:absolute;bottom:8vh;max-height:min(34vh,300px);width:auto;z-index:1;
    opacity:0;transition:transform .32s cubic-bezier(.22,.9,.3,1), opacity .32s ease;
    pointer-events:none;filter:drop-shadow(0 0 12px rgba(0,0,0,0.5));}
  .cutin-char.left{left:2vw;transform:translateX(-45%);}
  .cutin-char.right{right:2vw;transform:translateX(45%);}
  .cutin-char.in{opacity:1;transform:translateX(0);}
  #cutin-name{font-family:'Orbitron',sans-serif;font-size:12px;letter-spacing:.25em;
    color:#00ffff;margin-bottom:8px;min-height:1em;}
  #cutin-text{font-size:clamp(13px,3.4vw,16px);line-height:1.9;color:#dde8ff;min-height:3.8em;}
  #cutin-next{position:absolute;right:14px;bottom:8px;font-size:11px;color:#00ccff;
    opacity:0;transition:opacity .2s;animation:cutinBounce .8s ease-in-out infinite alternate;}
  #cutin-next.visible{opacity:1;}
  @keyframes cutinBounce{from{transform:translateY(0);}to{transform:translateY(4px);}}
  /* 狭幅: ウィンドウ高さPC比2倍（テキスト4行分）・立ち絵は背面半透明（実機判断で調整可） */
  @media (max-width:600px){
    #cutin-text{min-height:7.6em;}
    .cutin-char{opacity:0;max-height:42vh;}
    .cutin-char.in{opacity:.55;}
  }`;

  function init(cfg){
    _cfg = Object.assign({
      imagePath:'assets/images/cutin/', audioPath:'assets/audio/',
      typingSpeed:30, characters:{}, se:{}, hooks:{},
    }, cfg);
    _buildDom();
  }
  // Dialogue.load が characters/se を後から注入するための部分更新
  function configure(part){ if(_cfg) Object.assign(_cfg, part); }

  function _buildDom(){
    if(document.getElementById('cutin-layer')) return;
    const st = document.createElement('style');
    st.id = 'cutin-style'; st.textContent = CSS;
    document.head.appendChild(st);
    const layer = document.createElement('div');
    layer.id = 'cutin-layer';
    layer.innerHTML =
      '<div id="cutin-stage">' +
        '<img id="cutin-char-left" class="cutin-char left" alt="">' +
        '<img id="cutin-char-right" class="cutin-char right" alt="">' +
        '<div id="cutin-window">' +
          '<div id="cutin-name"></div><div id="cutin-text"></div>' +
          '<div id="cutin-next">▼</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(layer);
    layer.addEventListener('click', _onTap);
    layer.addEventListener('touchend', e => { e.preventDefault(); _onTap(e); }, {passive:false});
  }

  function play(lines){
    return new Promise(resolve => {
      _queue.push({ lines: Array.isArray(lines) ? lines : [lines], resolve });
      if(!_running) _run();
    });
  }
  const show = line => play([line]);

  async function _run(){
    _running = true;
    if(!_layerOpen){
      _layerOpen = true;
      if(_cfg.hooks && _cfg.hooks.onStart) _cfg.hooks.onStart();
      const layer = document.getElementById('cutin-layer');
      layer.style.display = 'block';
      void layer.offsetWidth;               // リフローでtransitionを確実に発火
      layer.classList.add('show');
    }
    while(_queue.length){
      const job = _queue.shift();
      for(const line of job.lines){ await _playLine(line); }
      job.resolve();
    }
    await _closeLayer();
    _running = false;
    if(_cfg.hooks && _cfg.hooks.onEnd) _cfg.hooks.onEnd();
    if(_queue.length) _run();               // onEnd中に積まれた分（稀）を回収
  }

  function _playLine(line){
    return new Promise(resolve => {
      _lineResolve = resolve; _currentLine = line;
      _tapGuardUntil = performance.now() + 300;
      const ch = (_cfg.characters && _cfg.characters[line.speaker]) || {};
      const side = line.side || ch.side || 'left';
      _setPortrait(side, line.speaker, ch, line.portrait || 'normal');
      document.getElementById('cutin-name').textContent = ch.name || line.speaker || '';
      _playSe(line.se !== undefined ? line.se : (_cfg.se && _cfg.se.open));
      _startTyping(line.text || '', () => {
        const dur = line.duration != null
          ? line.duration
          : Math.min(6000, 1200 + (line.text || '').length * 55);
        _autoTimer = setTimeout(_finishLine, dur);
        document.getElementById('cutin-next').classList.add('visible');
      });
    });
  }

  function _setPortrait(side, charId, ch, key){
    const el    = document.getElementById(side === 'right' ? 'cutin-char-right' : 'cutin-char-left');
    const other = document.getElementById(side === 'right' ? 'cutin-char-left'  : 'cutin-char-right');
    other.classList.remove('in');           // 話者以外は退場
    let file = null;
    if(ch.portraits && ch.portraits[key]) file = ch.portraits[key];
    else if(charId) file = 'cutin_' + charId + '_' + key + '.png';   // 規約フォールバック
    if(!file){ el.classList.remove('in'); return; }
    const src = _cfg.imagePath + file;
    if(el.getAttribute('src') !== src) el.src = src;
    el.classList.add('in');
  }

  function _startTyping(text, onDone){
    clearInterval(_typeTimer);
    _typing = true;
    document.getElementById('cutin-next').classList.remove('visible');
    const el = document.getElementById('cutin-text');
    el.innerHTML = '';
    let i = 0;
    _typeTimer = setInterval(() => {
      if(i >= text.length){
        clearInterval(_typeTimer); _typing = false; onDone(); return;
      }
      if(text[i] === '\n'){ el.appendChild(document.createElement('br')); }
      else {
        const last = el.lastChild;
        if(last && last.nodeType === 3) last.textContent += text[i];
        else el.appendChild(document.createTextNode(text[i]));
      }
      i++;
    }, _cfg.typingSpeed);
  }

  function _skipTyping(){
    clearInterval(_typeTimer); _typing = false;
    const line = _currentLine, el = document.getElementById('cutin-text');
    el.innerHTML = '';
    (line && line.text || '').split('\n').forEach((seg, idx) => {
      if(idx > 0) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(seg));
    });
    const dur = (line && line.duration != null)
      ? line.duration : Math.min(6000, 1200 + (line && line.text || '').length * 55);
    _autoTimer = setTimeout(_finishLine, dur);
    document.getElementById('cutin-next').classList.add('visible');
  }

  function _finishLine(){
    clearTimeout(_autoTimer);
    document.getElementById('cutin-next').classList.remove('visible');
    const r = _lineResolve; _lineResolve = null;
    if(r) r();
  }

  function _onTap(e){
    e.stopPropagation();
    if(performance.now() < _tapGuardUntil) return;   // 誤タップ防止
    if(_typing) _skipTyping();
    else if(_lineResolve) _finishLine();
  }

  function _closeLayer(){
    return new Promise(resolve => {
      const layer = document.getElementById('cutin-layer');
      layer.classList.remove('show');
      document.getElementById('cutin-char-left').classList.remove('in');
      document.getElementById('cutin-char-right').classList.remove('in');
      setTimeout(() => { layer.style.display = 'none'; _layerOpen = false; resolve(); }, 340);
    });
  }

  // stage_clear割り込み用: 再生待ちのジョブを破棄（進行中の1本は最後まで再生）
  function clearPending(){
    _queue.forEach(j => j.resolve());
    _queue = [];
  }

  function cancel(){                        // RETRY/遷移時の強制終了
    clearInterval(_typeTimer); clearTimeout(_autoTimer);
    _typing = false; _lineResolve = null;
    clearPending();
    const layer = document.getElementById('cutin-layer');
    if(layer){ layer.classList.remove('show'); layer.style.display = 'none'; }
    document.getElementById('cutin-char-left') && document.getElementById('cutin-char-left').classList.remove('in');
    document.getElementById('cutin-char-right') && document.getElementById('cutin-char-right').classList.remove('in');
    const wasOpen = _layerOpen;
    _layerOpen = false; _running = false;
    if(wasOpen && _cfg && _cfg.hooks && _cfg.hooks.onEnd) _cfg.hooks.onEnd();
  }

  function _playSe(file){
    if(!file) return;
    try {
      const a = new Audio(_cfg.audioPath + file);
      a.volume = 0.8 * (window.AudioSettings ? window.AudioSettings.getSeVolume() : 1);
      a.play().catch(() => {});
    } catch(e){}
  }

  return { init, configure, show, play, cancel, clearPending,
           isActive: () => _running || _queue.length > 0 };
})();
```

**守ること（罠）**:
1. アニメーションは transform / opacity のみ（three.jsの描画がカットイン中も
   回り続けるため、reflowを起こすプロパティは使わない）。
2. `hooks.onStart` は**レイヤーが開く瞬間に1回**、`onEnd` は**閉じ切った後に1回**
   （連続イベントがキューで繋がっている間は呼ばない＝ポーズがバタつかない）。
3. SEは自前 `new Audio` ＋ `AudioSettings.getSeVolume()` 倍率。
   **ゲーム側の `SND` オブジェクト（853行）には追加しない**
   （`_baseVolume` スナップショット規約に絡む事故を避ける。独立モジュールの原則）。
4. `cancel()` は待機中Promiseを必ずresolveしてリークさせない。

### Step 2: ホスト層 — 時間停止（sphere-minesweeper.html）

**2-1. `_timerTick` の抽出**：`startTimer()`（4165行）の interval 本体（4184-4188行）を
関数に抽出し、time通知（Step 5）もここに入れる：

```js
function _timerTick(){
  elapsed++;
  document.getElementById('stat-time').textContent = formatTime(elapsed);
  updateDigitTimer(elapsed);
  if(gameState === 'playing') cutinNotify('time', {sec: elapsed});
}
```
`startTimer()` 側は `timerInterval = setInterval(_timerTick, 1000);` に置換。

**2-2. pause/resume**（`startTimer` の直前に追加）:

```js
// ===================== CUTIN: 時間停止 =====================
let _timePausedAt = null;   // カットインによるポーズ開始時刻（null=非ポーズ）
let _cutinPausing = false;  // gamePaused の設定メニューとの共用を安全にするための別フラグ

function pauseGameTime(){
  if(_timePausedAt !== null) return;
  _timePausedAt = performance.now();
  clearInterval(timerInterval);
}
function resumeGameTime(){
  if(_timePausedAt === null) return;
  const pausedMs = performance.now() - _timePausedAt;
  _timePausedAt = null;
  // performance.now() 基準の起点をポーズ時間ぶん後方へシフト（精密クリアタイム・
  // 制限時間ゲージ・周回トータルの全てからカットイン時間を除外する）
  if(window._timerStartMs)     window._timerStartMs     += pausedMs;
  if(window._loopTotalStartMs) window._loopTotalStartMs += pausedMs;
  if(gameState === 'playing') timerInterval = setInterval(_timerTick, 1000);
}
```

**2-3. 制限時間ゲージのガード（必須・1箇所）**：`animate()` 内 4780行
`if(timeLimitMode && gameState==='playing' && totalTime > 0){` に
`&& _timePausedAt === null` を追加。**これを忘れるとカットイン中もゲージが減り
時間切れGOが発生する**。

**2-4. hooks と CutIn.init**：script読み込み（下記2-5）後に一度だけ:

```js
window._cutinHooks = {
  onStart(){ _cutinPausing = true; gamePaused = true; pauseGameTime(); },
  onEnd(){
    _cutinPausing = false;
    // 設定メニューが開いていない時だけ解除（gamePausedは設定メニューと共用のため）
    if(document.getElementById('settings-menu').style.display !== 'block') gamePaused = false;
    resumeGameTime();
  },
};
CutIn.init({ hooks: window._cutinHooks });
```

**2-5. script追加**：`<script src="js/audio-settings.js">` 等の既存script群の隣に
`js/cutin.js` → `js/cutin-dialogue.js` の順で2行追加。

### Step 3: `js/cutin-dialogue.js`（新規・データ/トリガー管理）

```js
/**
 * cutin-dialogue.js — カットイン会話データ・トリガー管理
 * 依存: cutin.js（先に読み込むこと）
 */
const Dialogue = (() => {
  let _data = null;
  let _fired = new Set();
  // プレイ中（初手〜クリア確定の間）に発火し得るトリガー。これを1つでも含む
  // セットのステージはランキング対象外（manualは発火時期を静的判定できないため安全側）
  const IN_PLAY_TRIGGERS = new Set(['time', 'open_rate', 'mines_removed', 'manual']);

  async function load(setName){
    const res = await fetch('data/cutin/' + setName + '.json', {cache:'no-store'});
    if(!res.ok) throw new Error('[Dialogue] not found: ' + setName);
    _data = await res.json();
    window._cutinBlocksRanking =
      (_data.events || []).some(ev => IN_PLAY_TRIGGERS.has(ev.trigger && ev.trigger.type));
    CutIn.configure({ characters: _data.characters || {}, se: _data.se || {} });
    _preloadPortraits();
  }

  function _preloadPortraits(){    // 初表示時のデコードjank防止
    Object.values(_data.characters || {}).forEach(ch => {
      Object.values(ch.portraits || {}).forEach(f => { new Image().src = 'assets/images/cutin/' + f; });
    });
  }

  // ゲームからの状態通知。発火したイベントの完了Promise配列を返す（stage_clearの待ち合わせ用）
  function notify(type, payload){
    const promises = [];
    if(!_data) return promises;
    for(const ev of (_data.events || [])){
      if(_fired.has(ev.id)) continue;
      if(!_match(ev.trigger, type, payload || {})) continue;
      promises.push(_fire(ev));
    }
    return promises;
  }

  function _match(t, type, p){
    if(!t || t.type !== type) return false;
    if(type === 'time')          return p.sec   >= (t.sec  ?? Infinity);
    if(type === 'open_rate')     return p.rate  >= (t.gte  ?? Infinity);
    if(type === 'mines_removed') return p.count >= (t.gte  ?? Infinity);
    return true;   // stage_start / stage_clear は型一致のみ（manualはnotify経由では発火しない）
  }

  function _fire(ev){
    if(ev.once !== false) _fired.add(ev.id);        // 発火時に即登録（同tick二重発火防止）
    if(ev.type === 'warning'){                       // §14スタブ：データ形式のみ先行凍結
      console.warn('[Dialogue] warning演出は未実装のためスキップ:', ev.id);
      return Promise.resolve();
    }
    if(ev.trigger && ev.trigger.type === 'stage_clear') CutIn.clearPending(); // クリアは他を破棄して優先
    return CutIn.play(ev.lines || []);
  }

  function play(id){                                 // 手動発火（将来のイベント駆動API）
    if(!_data) return Promise.resolve();
    const ev = (_data.events || []).find(e => e.id === id);
    return ev ? _fire(ev) : Promise.resolve();
  }

  function reset(){ _fired.clear(); CutIn.cancel(); }          // RETRY時（dataは保持）
  function getFired(){ return Array.from(_fired); }             // saveSuspend用
  function restoreFired(ids){ (ids || []).forEach(i => _fired.add(i)); }

  return { load, notify, play, reset, getFired, restoreFired };
})();
```

### Step 4: ステージ設定・起動・RETRY・suspend貫通（sphere-minesweeper.html）

**4-1. グローバル既定値**（`let gameRule = ...`（2128行）の近くに）:
```js
window._cutinSet = null;          // stage-params.json の cutin フィールド（会話セット名）
window._listGroup = null;         // 'story2' 等。STAGEボタンの戻り先判定
window._cutinBlocksRanking = false;
```

**4-2. `applyStageParam()`**：gameRule適用（4997行）の直後に追加:
```js
// カットイン / リストグループ適用（stage-params.json連携）
window._cutinSet  = stage.cutin || null;
window._listGroup = stage.listGroup || null;
```

**4-3. 起動時ロード＋stage_start通知**：`_charDataReady.finally`（5080行）の
**非resume側の分岐**（通常の `?stage=` 起動で `restartGame()` が呼ばれる経路）の後に:
```js
if(window._cutinSet && _bootMode !== 'resume'){
  Dialogue.load(window._cutinSet)
    .then(() => { Dialogue.notify('stage_start'); })   // 初手前(idle中)に発火
    .catch(e => console.warn('[cutin] 会話データ読込失敗（カットイン無効で続行）', e));
}
```
- ロード失敗は**カットイン無効で続行**（ゲームを止めない）。このとき
  `_cutinBlocksRanking` は false のまま＝ランキング保存される点は既知の仕様
  （データ破損時に記録が混ざるリスクよりゲーム継続を優先。完了報告に記載）。
- **resume時は stage_start を再通知しない**（`_bootMode !== 'resume'` ガード。
  中断は playing 中しかできないため stage_start は必ず発火済み→fired復元で整合）。

**4-4. `restartGame()`**（4571行）の冒頭付近に:
```js
if(window.Dialogue) Dialogue.reset();   // RETRY: once発火状態をリセット・進行中カットイン破棄
```
※ stage_start は起動時にしか通知しないので、RETRY後に開幕カットインは再生されない
（time/open_rate等はRETRY後の再プレイで再発火する）。この挙動は仕様。

**4-5. `saveSuspend()`**：meta（3628-3652行）の `factoryBoard:` 行の後に追加:
```js
cutinSet: window._cutinSet ?? null,
listGroup: window._listGroup ?? null,
cutinFired: window.Dialogue ? Dialogue.getFired() : []
```

**4-6. `resumeSuspend()`**：メタ復元部（gameRule復元 3745行の近く）に追加:
```js
window._cutinSet  = m.cutinSet ?? null;
window._listGroup = m.listGroup ?? null;
if(window._cutinSet){
  Dialogue.load(window._cutinSet)
    .then(() => Dialogue.restoreFired(m.cutinFired))
    .catch(e => console.warn('[cutin] resume時ロード失敗', e));
}
```
旧中断データ（フィールド未定義）→ null / 空配列フォールバックで後方互換。

### Step 5: 通知ポイント（sphere-minesweeper.html・各1〜2行）

**5-0. ガード付きヘルパー**（`_timerTick` の近くに定義）:
```js
// リプレイ再生・resume/リプレイの盤面再構築中はカットインを発火させない
function cutinNotify(type, payload){
  if(!window.Dialogue) return [];
  if(_replayMode || _replayInstant || _isReplaySession) return [];
  return Dialogue.notify(type, payload);
}
```
⚠️ **このガードは必須**。resume再構築は操作ログを `digCell`/`flagCell` で再実行するため、
ガード無しだと再構築中に `mines_removed` 等のカットインが発火して
RE-MEMBERING進捗表示と衝突する。

**5-1. time**：Step 2-1 の `_timerTick` 内に組込済み。

**5-2. open_rate**：`updateCharacterReveal()`（982-1004行）の末尾に:
```js
if(gameState === 'playing') cutinNotify('open_rate', {rate: charRevealRatio});
```
⚠️ `gameState==='playing'` ガード必須：クリア確定後の残存セル一括消滅でも
`onNonMineCellVanished()`→本関数が呼ばれ続けるため、ガード無しだと**勝利演出中に
閾値カットインが発火**する。

**5-3. mines_removed**：`removedMines++` の直後2箇所に
`cutinNotify('mines_removed', {count: removedMines});` を追加:
- `removeMine()` 内（2447行）
- `digCell` の地雷ゲージ枝（2290行）
- ※ 4532行はdebug用の一括処理なので**追加しない**。

**5-4. stage_clear**：`checkWin()` の最後（2745-2746行）を置換:
```js
const rescueDelay = gameRule === 'noflag' ? 2000 : (pending>0?700:150);
setTimeout(()=>{
  const _ps = cutinNotify('stage_clear');
  if(_ps.length) Promise.all(_ps).then(()=>triggerRescueSequence());
  else triggerRescueSequence();
}, rescueDelay);
```
- 直前の `mines_removed` カットインが再生中でも、CutIn のキューが直列化するので
  `Promise.all` が両方の完了を待つ（特別対応不要）。
- カットイン中も背後で残存セルの消滅演出が進むのは**想定挙動**（盤面が見える要件）。
- **hooksのポーズシフトにより、クリア後カットインを何秒眺めてもクリアタイムは伸びない**
  （`computeClearTimeSec`（1028行）は showRescueScreen 到達時の now() で算出するため、
  シフトが無いとランキング対象の id:23〜28 でタイムが壊れる。検証項目8で必ず確認）。

### Step 6: ランキング除外（sphere-minesweeper.html）

`showRescueScreen()` 内（1058行）`if(stageId){` を:
```js
if(stageId && !window._cutinBlocksRanking){
```
に変更（else側は既存の `rankEl.textContent = '';` に落ちる構造を維持）。
クリアタイム表示（`rescue-time`）は全ステージでそのまま。

### Step 7: STORY MODE 2 増設（id:22〜29）

noflag（id:12〜21）で確立したパターンの踏襲。

**7-1. `data/stages.json`**：id:22〜29 を追加（22←1, 23←2, … 29←8 のミラー。
`name`/`image`/`grid_col`/`grid_row`/`mines`/`difficulty`/`description` は元をコピー）。

**7-2. `data/stage-params.json`**：id:22〜29 を追加。元idの値をコピーした上で:
- `"listGroup": "story2"` を全ブロックに追加
- `"cutin": "stage22"` 等を**会話データを作ったステージにのみ**追加（Step 8参照。
  暫定では22と23のみ）
- `"novelAfterClear": null` に変更（ミラー元の novel/novelXX.html を引き継がない。
  mode=story時しか参照されないため実害は無いが、story2の章間ノベル仕様が未決のため
  明示的に切る）
- `charId` はミラー元のまま（"001"〜"008"）

**7-3. キャラ固定**：`applyStageParam` の `_exFixedCharIds`（4933行）を
`[10, 11, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]` に変更。
（暫定判断：カットインの話者と盤面キャラの整合を取りやすい**固定**とする。
ユーザーがランダムにしたければ配列から22〜29を外すだけ。完了報告に明記）

**7-4. `data/modes.json`**：`story` カードの直後に挿入:
```json
{
  "id": "story2",
  "label": "STORY MODE 2",
  "desc": "戦場に声が届く。\n仲間と共に星の傷を暴け。",
  "image": "assets/images/etc/mod003.png",
  "color": "blue",
  "enabled": true
}
```
（label/desc/image は暫定。カード位置もユーザーがJSON並べ替えで変更可能。完了報告に記載）

**7-5. `index.html`**：
- `renderNoflagList`（2248行）の直後に:
```js
// STORY MODE 2 は stage01-08 のミラー（新id 22-29）を使用
function renderStory2List(stages){
  renderStageList(
    stages,
    s => s.id >= 22 && s.id <= 29,
    s => String(s.id - 21).padStart(2,'0'),
    'STORY MODE 2'
  );
}
function openStory2List(){
  if(_normalStagesCache){ renderStory2List(_normalStagesCache); normalListModal.classList.add('show'); return; }
  fetch('data/stages.json').then(r=>r.json()).then(stages=>{
    _normalStagesCache = stages; renderStory2List(stages); normalListModal.classList.add('show');
  }).catch(()=>{ normalListModal.classList.add('show'); });
}
```
- `renderModeSelect` のクリック分岐（2177行の隣）に:
  `else if(id === 'story2'){ playSelect(); modeSelectModal.classList.remove('show'); openStory2List(); }`
- 直接オープン（2342行の隣）に: `if(p.get('story2') === '1') openStory2List();`
- 行クリックの遷移は既存 `renderStageList` のまま＝`?stage=<id>&mode=normal`
  （**mode=normal のまま**。story2の実体は stage-params の cutin/listGroup が担う。
  これにより isNormalMode 系の既存分岐＝クリア画面ボタン構成がそのまま正しく働く）。

**7-6. 戻り導線（sphere-minesweeper.html・2箇所）**：
- `updateRescueButtons` 内 1097行と設定メニュー 3268行の三項演算子を拡張:
```js
window._listGroup === 'story2' ? 'index.html?story2=1'
  : gameRule === 'noflag' ? 'index.html?noflag=1' : 'index.html?normal=1'
```
（resume経由でも Step 4-6 で `_listGroup` が復元済みなので判定に使える）

**7-7. ランキングキー**：`stellarDeleteRanking_stage_22`〜`29` に自然分離
（`_rankingKey` 3968行・無改修）。保存可否は Step 6 の自動導出に従う。

### Step 8: 暫定台本データ（`data/cutin/`）

台本はユーザー支給待ちのため、**動作確認用の暫定ダミー2本**を作る:

**`data/cutin/stage22.json`**（プレイ中トリガーあり＝ランキング除外側の代表）:
```json
{
  "se": {},
  "characters": {
    "001": { "name": "キャラ001", "side": "left",
             "portraits": { "normal": "cutin_001_normal.png" } },
    "oracle": { "name": "ORACLE", "side": "right",
                "portraits": { "normal": "cutin_oracle_normal.png" } }
  },
  "events": [
    { "id": "stage_open", "trigger": { "type": "stage_start" }, "once": true,
      "lines": [
        { "speaker": "oracle", "text": "観測を開始します。\nどこからでも掘り始めてください。" } ] },
    { "id": "rest_notice", "trigger": { "type": "time", "sec": 300 }, "once": true,
      "lines": [
        { "speaker": "oracle", "text": "5分経過しました。\n少し休憩しませんか？" } ] },
    { "id": "half_open", "trigger": { "type": "open_rate", "gte": 0.5 }, "once": true,
      "lines": [
        { "speaker": "001", "text": "半分まで来たよ！" },
        { "speaker": "oracle", "text": "この調子です。" } ] },
    { "id": "stage_clear", "trigger": { "type": "stage_clear" }, "once": true,
      "lines": [
        { "speaker": "001", "text": "やった……！全部見つけた！" } ] }
  ]
}
```

**`data/cutin/stage23.json`**（初手前＋クリア後のみ＝ランキング対象側の代表）:
stage_start と stage_clear の2イベントのみ。内容は任意のダミー文言。

⚠️ バストアップ画像 `assets/images/cutin/*.png` はユーザー準備。**未配置でも
落ちない**こと（imgのsrc 404はブラウザが黙って壊れアイコンにするだけで例外にならない。
気になる場合は `onerror` で `el.classList.remove('in')` を足してよい）。
検証時は既存画像を仮コピーして代用可（コミットには含めないか、完了報告に明記）。

### Step 9: デバッグ手段

debugメニューへのタイル追加は**不要**。コンソールから:
```js
CutIn.show({speaker:'oracle', side:'right', text:'テスト。\n2行目。'});
Dialogue.play('rest_notice');
```
で任意発火できる（`Dialogue.play` は manual API がそのまま使える）。

---

## 3. 検証チェックリスト(dev server・全項目必須)

**カットイン基本（stage22で確認）**:
1. `?stage=22&mode=normal` 起動 → 初手前に stage_open が表示される。
   カットイン中に盤面クリックしても初手が発生しない・UIボタン（設定/サーチ等）も反応しない
2. タイプ中タップ→全文表示、再タップ→次の行、放置→duration後に自動クローズ
3. カットイン終了後、通常どおり操作できる（gamePaused解除・ドラッグ/開封/旗OK）
4. 5分待ち（またはコンソールで `elapsed=299` にして1秒待つ）→ rest_notice 発火。
   **表示タイマー(stat-time)がカットイン中停止**し、閉じた後に続きから進む
5. open_rate 50%到達 → half_open（2行連続）発火。1行目→2行目が同一ポーズ内で連続する
   （ポーズが行間で解除されない＝onStart/onEndが全体で1回ずつ）
6. クリア → stage_clear カットイン → 完了後に救出演出。背後で消滅演出が進んでいてよい
7. RETRY → once リセット（time/open_rate は再プレイで再発火）・stage_open は再表示**されない**・
   進行中カットインが即消える
8. **クリアタイム非汚染**：id:23（ランキング対象）で stage_clear カットインを
   「即スキップ」と「最後まで放置」の2回クリアし、`rescue-time` の差がカットイン
   表示時間ぶん開いて**いない**こと（±1秒程度の操作差のみ）

**ランキング振り分け**:
9. id:22 クリア → ランキング未保存（`localStorage` の `stellarDeleteRanking_stage_22` が無い・
   RECORDSで記録なし）。タイム表示は出る
10. id:23 クリア → `stellarDeleteRanking_stage_23` に保存される
11. SIMPLE stage1 クリア → 従来どおり保存（回帰なし）

**中断・再開**:
12. id:22 で rest_notice 発火後に中断 → RESUME → rest_notice が**再発火しない**・
    stage_open も再表示されない・未発火の half_open は再開後のプレイで正しく発火する。
    resume再構築中（RE-MEMBERING）にカットインが割り込まないこと
13. resume→RESTART→初手正常（[[project-resume-perf]] の既知バグ回帰確認）

**STORY MODE 2 導線**:
14. MODE SELECT に STORY MODE 2 カード → リスト（01〜08表記）→ 各ステージ起動、
    キャラが charId 固定（001〜008）で出る
15. クリア画面 STAGE / 設定メニュー STAGE → `index.html?story2=1` の story2 リストに戻る
16. id:24〜29（cutin未定義）→ カットイン一切無し・ランキング保存される

**回帰**:
17. 制限時間モード（デバッグで timeLimitMode を有効化 or LIMIT系設定）＋コンソールから
    `CutIn.show({...})` → カットイン中ゲージが減らない・時間切れGOが出ない
18. noflag stage12・STORY stage（mode=story）・stage9（周回）各1回：挙動不変。
    設定メニューの開閉（ポーズ/BGM/中断ボタン）も従来どおり
19. 旧中断データ（今回のフィールドが無いもの）が正常にresumeできる
20. モバイル幅375px（DevTools）: ウィンドウ高さ約2倍・立ち絵背面半透明・誤タップ300msガード

**音**: 検証後は必ず音停止＋サーバー停止。

---

## 4. スコープ外(実装しないこと)

- 警告演出の本実装（検討書§14。今回は `type:"warning"` スキップのスタブのみ）
- STORY MODE 2 の直列解放・章間ノベル（未決。全ステージ解放状態で実装）
- クラシックモード・リプレイUI関連
- 既存 noflag の戻り導線を `listGroup` 方式へ統一するリファクタ（任意と検討書にあるが、
  今回は触らない。gameRule判定のまま残す）

## 5. 完了時にやること

- 本手順書のステータスを「実装済み」に更新（実測・調整した定数を追記）
- `etc/V2_CUTIN_PLAN.md` のステータス更新（§11の進捗反映）
- `etc/V2_HANDOFF.md` に作業サマリを追記
- **暫定のまま残る項目を完了報告に明記してユーザー判断を仰ぐ**:
  - 台本が暫定ダミー（stage22/23のみ。24〜29は未定義＝カットイン無し）
  - バストアップ画像・ウィンドウ表示SE 未配置（データ形式は凍結済み）
  - modes.json の story2 カード label/desc/image・カード位置が暫定
  - id:22〜29 の charId固定（001〜008）は暫定判断（ランダム希望なら配列から外す）
  - stages.json id:22〜29 の description がミラー元のコピー
  - 会話データ読込失敗時はランキング保存される（ゲーム継続優先）仕様
  - 狭幅の立ち絵配置（背面半透明）は実機確認待ち
  - 警告演出（§14）は未実装
