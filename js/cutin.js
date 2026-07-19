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
          '<svg id="cutin-window-bg"><polygon></polygon></svg>' +
          '<div id="cutin-name"></div><div id="cutin-text"></div>' +
          '<div id="cutin-next">▼</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(layer);
    layer.addEventListener('click', _onTap);
    layer.addEventListener('touchend', e => { e.preventDefault(); _onTap(e); }, {passive:false});
    new ResizeObserver(_updateWindowShape).observe(document.getElementById('cutin-window'));
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
      document.getElementById('cutin-window-bg').classList.toggle('mirror', side === 'right');
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
