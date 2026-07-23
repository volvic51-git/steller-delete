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
  let _warnQueue = [];        // 警告バナー専用キュー（会話とは独立・非モーダル）
  let _warnPlaying = false;
  let _warnAbort = null;      // 再生中バナーの後片付け（cancel時に呼ぶ）

  // 警告バナーのバリアント：方向と通り道ラインの色。太さは両者共通（CSS側で固定）。
  const WARN_VARIANTS = {
    default:   { direction:'ltr', trackColor:'rgba(40,140,255,0.5)' },  // 青・左→右
    orangeRTL: { direction:'rtl', trackColor:'rgba(255,120,0,0.55)' }   // オレンジ・右→左
  };

  const CSS = `
  #cutin-layer{position:fixed;inset:0;z-index:150;display:none;
    background:radial-gradient(ellipse at center, transparent 40%, rgba(0,5,20,0.35) 100%);
    padding-bottom:env(safe-area-inset-bottom);}
  /* 既定は中央（特殊ルール告知など speaker 無しの行）。話者ありの行は
     side-left / side-right クラスで左右に寄せる（画面端に付かないよう左右パディングを確保）。 */
  #cutin-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    padding:0 clamp(12px,5vw,90px);box-sizing:border-box;}
  #cutin-layer.side-left  #cutin-stage{justify-content:flex-start;}
  #cutin-layer.side-right #cutin-stage{justify-content:flex-end;}
  #cutin-window{position:relative;width:min(640px,86vw);z-index:2;
    padding:14px 20px 18px;box-sizing:border-box;
    opacity:0;transform:translateY(14px);transition:opacity .28s ease, transform .28s ease;}
  #cutin-layer.show #cutin-window{opacity:1;transform:translateY(0);}
  /* ジグザグ・ホログラムポインタ（tool/zigzag-pointer-maker.html で設計）。
     ボックス＋尾を1本のpolygonで表現し、話者sideに応じてこのSVGだけをscaleX(-1)反転する
     （#cutin-name/#cutin-text/#cutin-nextは反転させず、常に正しく読める） */
  #cutin-window-bg{position:absolute;top:0;left:0;overflow:visible;pointer-events:none;z-index:-1;
    filter:drop-shadow(0 0 4px #35e7ff) drop-shadow(0 0 10px rgba(53,231,255,0.5));
    transition:transform .25s ease;}
  #cutin-window-bg.mirror{transform:scaleX(-1);}
  #cutin-window-bg polygon{fill:rgba(6,10,16,0.9);stroke:#eef2f8;stroke-width:4;stroke-linejoin:miter;}
  .cutin-char{position:absolute;bottom:8vh;max-height:min(34vh,300px);width:auto;z-index:1;
    opacity:0;transition:transform .32s cubic-bezier(.22,.9,.3,1), opacity .32s ease;
    pointer-events:none;filter:drop-shadow(0 0 12px rgba(0,0,0,0.5));}
  .cutin-char.left{left:2vw;transform:translateX(-45%);}
  .cutin-char.right{right:2vw;transform:translateX(45%);}
  .cutin-char.in{opacity:1;transform:translateX(0);}
  /* ウインドウ内ではなく、ウインドウ下の尾（右肩あたり）に添える形に配置 */
  #cutin-name{position:absolute;left:calc(19% + 8px);top:calc(100% + 10px);z-index:1;
    font-family:'Orbitron',sans-serif;font-size:12px;letter-spacing:.25em;
    color:#ffffff;white-space:nowrap;text-shadow:0 0 6px rgba(0,0,0,0.85);pointer-events:none;}
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
  }
  /* ===== 立ち絵アニメ（type:collision / shake。台詞なし＝ウィンドウ非表示） ===== */
  #cutin-layer.anim #cutin-window{opacity:0 !important;}
  @keyframes cutinShakeAnim{
    0%,100%{transform:translateX(0);}
    8%{transform:translateX(-8px) rotate(-1.5deg);}
    18%{transform:translateX(8px) rotate(1.5deg);}
    30%{transform:translateX(-7px);}
    42%{transform:translateX(7px);}
    54%{transform:translateX(-5px);}
    66%{transform:translateX(5px);}
    78%{transform:translateX(-3px);}
    90%{transform:translateX(2px);}
  }
  /* 衝突：右キャラが左へ突進→左キャラに衝突→二人まとめて画面左へ退場 */
  @keyframes cutinCollideLeft{
    0%,50%{transform:translateX(0);opacity:1;}
    58%{transform:translateX(-14px);}               /* 衝突の反動 */
    100%{transform:translateX(-75vw);opacity:0;}
  }
  @keyframes cutinCollideRight{
    0%{transform:translateX(0);opacity:1;}
    50%{transform:translateX(-72vw);opacity:1;}     /* 左キャラ位置まで突進＝衝突 */
    58%{transform:translateX(-70vw);}               /* 反動 */
    100%{transform:translateX(-150vw);opacity:0;}   /* まとめて左へ抜ける */
  }
  /* ===== 警告バナー（type:warning。非モーダル・タップで中央静止を解除） =====
     旧sphere-minesweeper.html側のプロトタイプを移設。青(default,左→右)/オレンジ(orangeRTL,右→左)。
     通り道ラインの太さは両バリアント共通（バナー幅×0.8）。色だけ--wb-track-colorで切替。 */
  #cutin-warn-layer{position:fixed;inset:0;z-index:160;display:none;
    align-items:center;justify-content:center;overflow:hidden;
    pointer-events:none;--wb-w:min(640px,92vw);}
  #cutin-warn-layer.show{display:flex;}
  #cutin-warn-track{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);
    opacity:0;background:var(--wb-track-color, rgba(40,140,255,0.5));
    height:calc(var(--wb-w) * 0.8);will-change:opacity;transition:opacity .28s linear;}
  #cutin-warn-layer.warn-show #cutin-warn-track{opacity:1;}
  #cutin-warn-img{position:relative;width:var(--wb-w);height:auto;
    will-change:transform,opacity;opacity:0;}`;

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
          '<svg id="cutin-window-bg"><polygon></polygon></svg>' +
          '<div id="cutin-name"></div><div id="cutin-text"></div>' +
          '<div id="cutin-next">▼</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(layer);
    layer.addEventListener('click', _onTap);
    layer.addEventListener('touchend', e => { e.preventDefault(); _onTap(e); }, {passive:false});
    new ResizeObserver(_updateWindowShape).observe(document.getElementById('cutin-window'));

    // 警告バナー用レイヤー（会話レイヤーとは別・非モーダル）
    const warn = document.createElement('div');
    warn.id = 'cutin-warn-layer';
    warn.innerHTML = '<div id="cutin-warn-track"></div><img id="cutin-warn-img" alt="">';
    document.body.appendChild(warn);
  }

  // 尾の形状（tool/zigzag-pointer-maker.html で確定した固定デザインを移植）。
  // ボックス左上を(0,0)として、尾の付け根x座標はボックス幅に比例、尾自体の形は絶対px固定。
  const TAIL_ANCHOR_RATIO = 29 / 480;
  const TAIL_REL_POINTS = [[62,-7], [23,14], [43,34], [3,82], [14,44], [-22,30], [0,-9]];

  function _bubblePoints(boxW, boxH){
    const anchorX = TAIL_ANCHOR_RATIO * boxW;
    const tail = TAIL_REL_POINTS.map(([dx, dy]) => [anchorX + dx, boxH + dy]);
    return [[0,0], [boxW,0], [boxW,boxH], ...tail, [0,boxH]];
  }

  function _updateWindowShape(){
    const winEl = document.getElementById('cutin-window');
    const svgEl = document.getElementById('cutin-window-bg');
    if(!winEl || !svgEl) return;
    const boxW = winEl.clientWidth, boxH = winEl.clientHeight;
    if(boxW <= 0 || boxH <= 0) return;
    const pts = _bubblePoints(boxW, boxH);
    const maxY = Math.ceil(Math.max(...pts.map(p => p[1])));
    svgEl.setAttribute('width', boxW);
    svgEl.setAttribute('height', maxY);
    svgEl.setAttribute('viewBox', `0 0 ${boxW} ${maxY}`);
    svgEl.querySelector('polygon').setAttribute('points', pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
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
      _updateWindowShape();                 // display:none中はResizeObserverが発火しないため明示更新
    }
    while(_queue.length){
      const job = _queue.shift();
      if(job.anim){ await _playAnim(job.anim); }
      else { for(const line of job.lines){ await _playLine(line); } }
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
      document.getElementById('cutin-window-bg').classList.toggle('mirror', side === 'right');
      // 吹き出しを話者側へ寄せる。speaker無しの行（特殊ルール告知など）は中央のまま。
      const layerEl = document.getElementById('cutin-layer');
      layerEl.classList.remove('side-left', 'side-right');
      if(line.speaker) layerEl.classList.add(side === 'right' ? 'side-right' : 'side-left');
      const nameEl = document.getElementById('cutin-name');
      const nameText = ch.name || line.speaker || '';
      nameEl.textContent = nameText;
      nameEl.style.display = nameText ? '' : 'none';
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

  // 立ち絵のsrcだけを適用（退場ロジックは呼び出し側が制御）。表示できたらtrue。
  function _applyPortraitSrc(el, charId, ch, key){
    let file = null;
    if(ch && ch.portraits && ch.portraits[key]) file = ch.portraits[key];
    else if(charId) file = 'cutin_' + charId + '_' + key + '.png';   // 規約フォールバック
    if(!file) return false;
    const src = _cfg.imagePath + file;
    if(el.getAttribute('src') !== src) el.src = src;
    return true;
  }

  function _setPortrait(side, charId, ch, key){
    const el    = document.getElementById(side === 'right' ? 'cutin-char-right' : 'cutin-char-left');
    const other = document.getElementById(side === 'right' ? 'cutin-char-left'  : 'cutin-char-right');
    other.classList.remove('in');           // 話者以外は退場
    if(_applyPortraitSrc(el, charId, ch, key)) el.classList.add('in');
    else el.classList.remove('in');
  }

  // 台詞なしの立ち絵アニメ（collision / shake）。会話レイヤーを使い、ウィンドウだけ隠す。
  // 会話キューと同じ_queueに積まれるので、会話とアニメは同一の開いたレイヤー内で順に流れる。
  function animate(opts){
    return new Promise(resolve => {
      _queue.push({ anim: opts || {}, resolve });
      if(!_running) _run();
    });
  }

  function _playAnim(anim){
    return new Promise(resolve => {
      const layer   = document.getElementById('cutin-layer');
      const leftEl  = document.getElementById('cutin-char-left');
      const rightEl = document.getElementById('cutin-char-right');
      layer.classList.add('anim');                 // ウィンドウ非表示
      [leftEl, rightEl].forEach(el => { el.style.animation = ''; el.style.opacity = ''; el.style.transition = ''; el.classList.remove('in'); });

      // 立ち絵を即座に不透明表示する（.inのopacityトランジションに頼らない）。
      // 短い演出中にフェードインが競合するのを避け、非コンポジット環境でも確実に映す。
      const showChar = (el) => { el.classList.add('in'); el.style.transition = 'none'; el.style.opacity = '1'; };

      let done = false, safety = null;
      const finish = () => {
        if(done) return; done = true;
        clearTimeout(safety);
        [leftEl, rightEl].forEach(el => { el.style.animation = ''; el.style.opacity = ''; el.style.transition = ''; el.classList.remove('in'); });
        layer.classList.remove('anim');
        resolve();
      };
      // animationend は非表示タブ等（コンポジット停止）で発火しないことがあるため、
      // dur+余白の保険タイマーで必ず完了させる（＝ゲームがポーズしっぱなしになるのを防ぐ）。
      const arm = (dur) => {
        const onEnd = () => finish();
        (anim.type === 'collision' ? rightEl : (anim.side === 'right' ? rightEl : leftEl))
          .addEventListener('animationend', onEnd, { once: true });
        safety = setTimeout(finish, dur + 200);
      };

      if(anim.se) _playSe(anim.se);

      if(anim.type === 'shake'){
        const side = anim.side === 'right' ? 'right' : 'left';
        const el   = side === 'right' ? rightEl : leftEl;
        const ch   = (_cfg.characters && _cfg.characters[anim.speaker]) || {};
        _applyPortraitSrc(el, anim.speaker, ch, anim.portrait || 'normal');
        showChar(el);
        const dur = anim.duration != null ? anim.duration : 1000;
        void el.offsetWidth;
        el.style.animation = 'cutinShakeAnim ' + dur + 'ms ease-in-out 1';
        arm(dur);

      } else if(anim.type === 'collision'){
        const L = anim.left || {}, R = anim.right || {};
        const chL = (_cfg.characters && _cfg.characters[L.speaker]) || {};
        const chR = (_cfg.characters && _cfg.characters[R.speaker]) || {};
        _applyPortraitSrc(leftEl,  L.speaker, chL, L.portrait || 'normal');
        _applyPortraitSrc(rightEl, R.speaker, chR, R.portrait || 'normal');
        showChar(leftEl); showChar(rightEl);
        const dur = anim.duration != null ? anim.duration : 1000;
        void leftEl.offsetWidth;
        leftEl.style.animation  = 'cutinCollideLeft '  + dur + 'ms ease-in 1 forwards';
        rightEl.style.animation = 'cutinCollideRight ' + dur + 'ms ease-in 1 forwards';
        arm(dur);

      } else {
        finish();
      }
    });
  }

  /* ===== 警告バナー（非モーダル・タップで中央静止を解除・SE対応） ===== */
  function warn(opts){
    return new Promise(resolve => {
      const wasIdle = !_warnPlaying && _warnQueue.length === 0;
      _warnQueue.push({ opts: opts || {}, resolve });
      if(wasIdle && _cfg.hooks && _cfg.hooks.onWarnStart) _cfg.hooks.onWarnStart();
      if(!_warnPlaying) _runWarn();
    });
  }

  function _runWarn(){
    if(_warnQueue.length === 0){
      _warnPlaying = false;
      if(_cfg.hooks && _cfg.hooks.onWarnEnd) _cfg.hooks.onWarnEnd();
      return;
    }
    _warnPlaying = true;
    const { opts, resolve } = _warnQueue.shift();
    const V     = WARN_VARIANTS[opts.variant] || WARN_VARIANTS.default;
    const layer = document.getElementById('cutin-warn-layer');
    const img   = document.getElementById('cutin-warn-img');
    const enterFrom = V.direction === 'rtl' ? '120vw'  : '-120vw';
    const exitTo    = V.direction === 'rtl' ? '-120vw' : '120vw';
    const file = opts.image || '警告.png';
    layer.style.setProperty('--wb-track-color', V.trackColor);
    img.src = /[\/:]/.test(file) ? file : (_cfg.imagePath + file);

    // 同期FLIP：先にレイヤーを表示（display:flex）して要素を描画対象にしてから
    // 初期位置(transition:none)→リフロー→中央(transition:0.3s)を同一tickで設定する。
    // ※display:none のまま transform を仕込むと突入トランジションの開始フレームが無く、
    //   中央へスライドインせずいきなり静止位置に飛ぶ（＝アニメが効かない）。
    layer.classList.add('show');
    img.style.transition = 'none';
    img.style.transform  = 'translateX(' + enterFrom + ')';
    img.style.opacity    = '0';
    void img.offsetWidth;                         // 初期位置を確定（要素は既に描画対象）

    if(opts.se) _playSe(opts.se);

    // 突入（0.3s）：中央へスライドイン＋通り道ラインをフェードイン
    img.style.transition = 'transform .3s cubic-bezier(.22,.7,.3,1), opacity .3s ease';
    img.style.transform  = 'translateX(0)';
    img.style.opacity    = '1';
    layer.classList.add('warn-show');

    let done = false, holdTimer = null, enterTimer = null;
    const HOLD_MS = opts.holdMs != null ? opts.holdMs : 1500;

    const exit = () => {
      if(done) return; done = true;
      clearTimeout(holdTimer); clearTimeout(enterTimer);
      document.removeEventListener('pointerdown', onTap, true);
      _warnAbort = null;
      // 離脱（0.3s）：反対側へ抜けて消える
      img.style.transition = 'transform .3s cubic-bezier(.5,0,.7,.4), opacity .3s ease';
      img.style.transform  = 'translateX(' + exitTo + ')';
      img.style.opacity    = '0';
      layer.classList.remove('warn-show');
      setTimeout(() => {
        layer.classList.remove('show');
        resolve();
        _runWarn();               // キューに次があれば続けて再生
      }, 320);
    };
    const onTap = () => exit();   // クリック/タッチで中央静止を即解除
    _warnAbort = () => {          // cancel()用：即座に片付ける
      if(done) return; done = true;
      clearTimeout(holdTimer); clearTimeout(enterTimer);
      document.removeEventListener('pointerdown', onTap, true);
      layer.classList.remove('show', 'warn-show');
      resolve();
    };

    // 突入完了後に中央静止（HOLD_MS）を開始。タップで前倒しできるよう listener を張る。
    enterTimer = setTimeout(() => {
      document.addEventListener('pointerdown', onTap, true);
      holdTimer = setTimeout(exit, HOLD_MS);
    }, 300);
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
    if(layer){ layer.classList.remove('show', 'anim'); layer.style.display = 'none'; }
    const cl = document.getElementById('cutin-char-left');
    const cr = document.getElementById('cutin-char-right');
    // _playAnim が付けた inline の opacity/transition/animation も消す（残ると立ち絵が出っぱなしになる）
    [cl, cr].forEach(el => { if(el){ el.classList.remove('in'); el.style.animation = ''; el.style.opacity = ''; el.style.transition = ''; } });
    const wasOpen = _layerOpen;
    _layerOpen = false; _running = false;
    if(wasOpen && _cfg && _cfg.hooks && _cfg.hooks.onEnd) _cfg.hooks.onEnd();

    // 警告バナーも強制終了
    if(_warnAbort) _warnAbort();
    const wasWarn = _warnPlaying || _warnQueue.length > 0;
    _warnQueue.forEach(j => j.resolve());
    _warnQueue = []; _warnPlaying = false; _warnAbort = null;
    const wl = document.getElementById('cutin-warn-layer');
    if(wl) wl.classList.remove('show', 'warn-show');
    if(wasWarn && _cfg && _cfg.hooks && _cfg.hooks.onWarnEnd) _cfg.hooks.onWarnEnd();
  }

  function _playSe(file){
    if(!file) return;
    try {
      const a = new Audio(_cfg.audioPath + file);
      a.volume = 0.8 * (window.AudioSettings ? window.AudioSettings.getSeVolume() : 1);
      a.play().catch(() => {});
    } catch(e){}
  }

  return { init, configure, show, play, warn, animate, cancel, clearPending,
           isActive: () => _running || _queue.length > 0 || _warnPlaying || _warnQueue.length > 0 };
})();
