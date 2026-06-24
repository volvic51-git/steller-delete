/**
 * novel.js — ノベルゲームエンジン本体
 * script.js より先に読み込まれること（index.html の script 順序を守ること）
 */

const NovelEngine = (() => {

  /* ============================================
     内部状態
  ============================================ */
  let _config    = {};
  let _script    = [];
  let _index     = 0;
  let _isTyping  = false;
  let _isWaiting = false;
  let _typeTimer = null;
  let _bgmAudio  = null;
  let _started   = false;
  let _autoPlay  = false;
  let _autoTimer = null;
  let _currentFadeColor = '#000000'; // whiteout/blackoutで変更される現在のフェード色（title_cardの文字色自動切替に使用）
  let _titleCardVisible = false; // タイトルカードが画面に出ている間ずっとtrue（待機中も含む）
  let _titleCardActive  = false; // 待機が終わり、クリックで閉じられる状態になったらtrue
  let _titleCardTimer   = null;
  let _isFading         = false; // fadeout/fadein のトランジション中（600ms）だけtrue

  /* ============================================
     DOM参照（遅延取得）
  ============================================ */
  function $id(id) { return document.getElementById(id); }

  /* ============================================
     初期化
  ============================================ */
  function init(config) {
    _config = Object.assign({
      characters:  {},
      imagePath:   '../assets/images/',
      bgmPath:     '../assets/audio/',
      sePath:      'se/',
      typingSpeed: 30,
      clickSE:     '',
      autoPlayDelay: 1000, // 自動送りON時、文章を読み終えてから次へ進むまでの待機時間(ms)
    }, config);

    // 自動送りは常にOFFスタート（画面をまたいで引き継がない）
    _autoPlay = false;

    // DOM構築はDOMContentLoaded後に実行
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _setup);
    } else {
      _setup();
    }
  }

  function _setup() {
    _buildCharacterElements();
    _buildAutoToggle();
    _bindEvents();
    const endScreen = $id('end-screen');
    if(endScreen) endScreen.classList.add('hidden');
    $id('start-screen').style.display = 'flex';
    console.log('[NovelEngine] 初期化完了。キャラクター数:', Object.keys(_config.characters).length);
  }

  /* ============================================
     自動送りトグルボタン
  ============================================ */
  function _buildAutoToggle() {
    if ($id('auto-toggle-btn')) return;
    const uiLayer = $id('ui-layer');
    if (!uiLayer) return;
    const btn = document.createElement('button');
    btn.id = 'auto-toggle-btn';
    btn.type = 'button';
    btn.textContent = 'AUTO';
    btn.style.cssText = [
      'position:absolute', 'top:14px', 'right:14px', 'z-index:60',
      'pointer-events:auto', 'cursor:pointer', 'display:none',
      'font-family:var(--font-ui), sans-serif', 'font-size:11px', 'font-weight:700',
      'letter-spacing:0.15em', 'padding:6px 16px',
      'border-radius:2px', 'transition:all 0.2s',
    ].join(';');
    function _toggleAuto(e) {
      e.stopPropagation();
      if (e.type === 'touchend') e.preventDefault();
      _autoPlay = !_autoPlay;
      _updateAutoToggleVisual();
      if (_autoPlay && _started && !_isTyping && !_isWaiting) {
        _scheduleAutoAdvance();
      } else {
        _clearAutoTimer();
      }
    }
    btn.addEventListener('click', _toggleAuto);
    btn.addEventListener('touchend', _toggleAuto, { passive: false });
    uiLayer.appendChild(btn);
    _updateAutoToggleVisual();
  }

  function _updateAutoToggleVisual() {
    const btn = $id('auto-toggle-btn');
    if (!btn) return;
    if (_autoPlay) {
      btn.style.background  = 'rgba(80,40,160,0.55)';
      btn.style.border      = '1px solid var(--col-accent, #9B59FF)';
      btn.style.color       = 'var(--col-accent-glow, #C39FFF)';
      btn.style.boxShadow   = '0 0 10px rgba(155,89,255,0.4)';
    } else {
      btn.style.background  = 'rgba(10,8,22,0.7)';
      btn.style.border      = '1px solid rgba(155,89,255,0.35)';
      btn.style.color       = 'rgba(200,208,224,0.55)';
      btn.style.boxShadow   = 'none';
    }
  }

  function _clearAutoTimer() {
    if (_autoTimer) { clearTimeout(_autoTimer); _autoTimer = null; }
  }

  function _scheduleAutoAdvance() {
    _clearAutoTimer();
    if (!_autoPlay) return;
    _autoTimer = setTimeout(function() {
      _autoTimer = null;
      if (_autoPlay && _started && !_isTyping && !_isWaiting) _next();
    }, _config.autoPlayDelay);
  }

  /* ============================================
     キャラクター要素構築
  ============================================ */
  function _buildCharacterElements() {
    const layer = $id('character-layer');
    if (!layer) return;
    layer.innerHTML = '';

    Object.entries(_config.characters).forEach(([id, data]) => {
      const img = document.createElement('img');
      img.id               = 'char-' + id;
      img.className        = 'character';
      img.dataset.charId   = id;
      img.dataset.position = data.position || 'left';
      img.alt              = data.name || id;
      img.src              = _withCacheBust(_getPortraitSrc(id, data.defaultPortrait || 'normal'));
      layer.appendChild(img);
    });
  }

  /* ============================================
     イベントバインド
  ============================================ */
  function _bindEvents() {
    const container = $id('game-container');
    if (!container) return;

    // 画面全体クリックで進行 (PC)
    document.addEventListener('click', _onContainerClick);

    // モバイル: touchend を game-container に登録し、ナビゲーション直後に click が
    // 発火しない Android Chrome の問題を回避する。
    // e.preventDefault() で後続の click 二重発火を抑制。
    // restart-btn / auto-toggle-btn は touchend でも stopPropagation+preventDefault 済み。
    container.addEventListener('touchend', function(e) {
      e.preventDefault();
      _onContainerClick();
    }, { passive: false });

    // キーボード
    document.addEventListener('keydown', function(e) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        _onContainerClick();
      }
    });

    // リスタートボタン
    const restartBtn = $id('restart-btn');
    if (restartBtn) {
      function _onRestartTap(e) {
        e.stopPropagation();
        if (e.type === 'touchend') e.preventDefault();
        _restart();
      }
      restartBtn.addEventListener('click', _onRestartTap);
      restartBtn.addEventListener('touchend', _onRestartTap, { passive: false });
    }
  }

  /* ============================================
     コンテナクリック — 状態で振り分け
  ============================================ */
  function _onContainerClick() {
    const endScreen = $id('end-screen');
    if (endScreen && !endScreen.classList.contains('hidden')) return;

    // フェードトランジション中（600ms）はクリックを無視（背景が一瞬見えるのを防止）
    // blackout/whiteout は fading-out クラスを残したままにするため、クラスではなくフラグで判定
    if (_isFading) return;

    if (!_started) {
      _handleStart();
      return;
    }

    if (_titleCardVisible) {
      if (_titleCardActive) {
        _hideTitleCard();
        _next();
        if (_config.clickSE) _playSE(_config.clickSE);
      }
      // 専用の待機が終わるまではクリックを完全に無視する
      return;
    }

    if (_isWaiting) {
      // wait中は操作を受け付けない
      return;
    }

    if (_isTyping) {
      _skipTyping();
    } else {
      _next();
    }

    if (_config.clickSE) _playSE(_config.clickSE);
  }

  /* ============================================
     スクリプト再生
  ============================================ */
  function play(scriptData) {
    _script  = scriptData;
    _index   = 0;
    _started = false;
    // init の _setup が終わっていない場合に備えて少し待つ
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        $id('start-screen').style.display = 'flex';
        _preloadFonts();
      });
    } else {
      _preloadFonts();
    }
  }

  /* ============================================
     スタート
  ============================================ */
  function _handleStart() {
    if (_started) return;
    _started  = true;
    _isWaiting = true; // フェード中の連打でステップがズレないようブロック

    const startScreen = $id('start-screen');
    startScreen.style.transition = 'opacity 0.5s';
    startScreen.style.opacity    = '0';
    setTimeout(function() {
      startScreen.style.display = 'none';
      const bgImg = $id('background-img');
      if (bgImg) bgImg.classList.add('default-bg');
      const autoBtn = $id('auto-toggle-btn');
      if (autoBtn) autoBtn.style.display = '';
      _isWaiting = false;
      _processStep();
    }, 1000);
  }

  /* ============================================
     ステップ処理
  ============================================ */
  function _processStep() {
    const step = _script[_index];
    if (!step) { _showEnd(); return; }

    if (step.command) {
      _runCommand(step);
    } else {
      _showDialog(step);
    }
  }

  function _next() {
    _clearAutoTimer();
    _index++;
    if (_index >= _script.length) {
      _showEnd();
    } else {
      _processStep();
    }
  }

  /* ============================================
     コマンド実行
  ============================================ */
  function _runCommand(cmd) {
    switch (cmd.command) {
      case 'background':
        _setBackground(cmd.value, cmd.position, cmd.positionMobile, cmd.zoomMobile);
        _next();
        break;
      case 'bgm':
        if (cmd.value) playBGM(cmd.value);
        else stopBGM();
        _next();
        break;
      case 'bgm_stop':
        stopBGM();
        _next();
        break;
      case 'bgm_fade':
        fadeOutBGM(cmd.duration || 2000);
        _next();
        break;
      case 'se':
        _playSE(cmd.value);
        _next();
        break;
      case 'show':
        _showCharacter(cmd.character, cmd.portrait);
        _next();
        break;
      case 'hide':
        _hideCharacter(cmd.character);
        _next();
        break;
      case 'hide_all':
        _hideAllCharacters();
        _next();
        break;
      case 'fadeout':
        _setFadeColor('#000000'); // 既存仕様：fadeoutは常に黒（whiteout/blackoutで変更した色をリセット）
        _fadeOut(function() { _next(); });
        break;
      case 'fadein':
        _fadeIn(function() { _next(); });
        break;
      case 'whiteout':
        _setFadeColor('#ffffff');
        _fadeOut(function() { _next(); });
        break;
      case 'blackout':
        _setFadeColor('#000000');
        _fadeOut(function() { _next(); });
        break;
      case 'title_card':
        _showTitleCard(cmd.title, cmd.text, cmd.duration);
        // クリック待ちにするため、ここでは _next() を呼ばない（_onContainerClick 側で処理）
        break;
      case 'wait':
        _isWaiting = true;
        setTimeout(function() { _isWaiting = false; _next(); }, cmd.duration || 1000);
        break;
      case 'font':
        _setFont(cmd);
        _next();
        break;
      case 'end':
        // フェードオーバーレイをリセットしてからEND画面を表示
        var ov = $id('fade-overlay');
        if (ov) { ov.classList.remove('fading-out'); ov.classList.remove('fading-in'); ov.style.opacity = '0'; }
        _showEnd();
        break;
      case 'dialog_clear':
        $id('dialog-text').innerHTML = '';
        $id('speaker-name').textContent = '';
        $id('name-plate').style.display = 'none';
        $id('next-indicator').classList.remove('visible');
        _next();
        break;
      case 'dialog_hide':
        $id('dialog-window').classList.add('hidden');
        _next();
        break;
      case 'dialog_show':
        $id('dialog-window').classList.remove('hidden');
        _next();
        break;
      case 'fg':
        _setFg(cmd.value, cmd.fit);
        _next();
        break;
      case 'fg_hide':
        _hideFg();
        _next();
        break;
      case 'bg_scroll':
        _startBgScroll(cmd.direction || 'up', cmd.speed || 30, cmd.loop, cmd.distance);
        _next();
        break;
      case 'bg_scroll_stop':
        _stopBgScroll();
        _next();
        break;
      default:
        console.warn('[NovelEngine] 未知のコマンド:', cmd.command);
        _next();
    }
  }

  /* ============================================
     会話表示
  ============================================ */
  function _showDialog(step) {
    const charId = _getCharIdByName(step.speaker);

    const dialogWindow = $id('dialog-window');
    const namePlate    = $id('name-plate');
    const speakerName  = $id('speaker-name');
    const nextIndicator = $id('next-indicator');

    dialogWindow.classList.remove('hidden');
    nextIndicator.classList.remove('visible');

    if (step.speaker) {
      namePlate.style.display    = 'flex';
      speakerName.textContent    = step.speaker;
    } else {
      namePlate.style.display    = 'none';
    }

    if (charId && step.portrait) _updatePortrait(charId, step.portrait);
    _updateCharacterFocus(charId);
    _startTyping(step.text || '');
  }

  /* ============================================
     キャラクターフォーカス
  ============================================ */
  function _updateCharacterFocus(activeCharId) {
    Object.keys(_config.characters).forEach(function(id) {
      const el = $id('char-' + id);
      if (!el) return;
      const isVisible = el.classList.contains('visible') || el.classList.contains('active');
      if (!isVisible) return;

      el.classList.remove('active', 'visible');
      if (id === activeCharId) {
        el.classList.add('active');
      } else {
        el.classList.add('visible');
      }
    });
  }

  /* ============================================
     画像キャッシュ対策
     同名ファイルを差し替えてもブラウザの古いキャッシュ画像が
     表示され続けないよう、読み込み時に常にタイムスタンプを付与する
  ============================================ */
  function _withCacheBust(url) {
    var sep = (url.indexOf('?') === -1) ? '?' : '&';
    return url + sep + '_cb=' + Date.now();
  }

  /* ============================================
     立ち絵
  ============================================ */
  function _updatePortrait(charId, portraitKey) {
    const el  = $id('char-' + charId);
    if (!el) return;
    const src = _getPortraitSrc(charId, portraitKey);
    if (!src) return;
    el.src = _withCacheBust(src);
  }

  function _getPortraitSrc(charId, portraitKey) {
    const data = _config.characters[charId];
    if (!data) return '';
    if (data.portraits) {
      // オブジェクト形式 {key: file}
      if (!Array.isArray(data.portraits) && data.portraits[portraitKey]) {
        return _config.imagePath + data.portraits[portraitKey];
      }
      // 配列形式 [{key, file}]
      if (Array.isArray(data.portraits)) {
        var found = null;
        for (var i = 0; i < data.portraits.length; i++) {
          if (data.portraits[i].key === portraitKey) { found = data.portraits[i]; break; }
        }
        if (found) return _config.imagePath + found.file;
      }
    }
    return _config.imagePath + charId + '_' + portraitKey + '.png';
  }

  /* ============================================
     キャラクター表示 / 非表示
  ============================================ */
  function _showCharacter(charId, portrait) {
    const el = $id('char-' + charId);
    if (!el) { console.warn('[NovelEngine] キャラクター未定義:', charId); return; }
    if (portrait) _updatePortrait(charId, portrait);
    el.classList.remove('active');
    el.classList.add('visible');
  }

  function _hideCharacter(charId) {
    const el = $id('char-' + charId);
    if (!el) return;
    el.classList.remove('visible', 'active');
  }

  function _hideAllCharacters() {
    Object.keys(_config.characters).forEach(function(id) { _hideCharacter(id); });
  }

  /* ============================================
     背景
  ============================================ */
  var _familyMap = { serif: "'Noto Serif JP','Hiragino Mincho ProN',serif", gothic: "'M PLUS 1p','Hiragino Kaku Gothic ProN',sans-serif" };

  function _loadGoogleFont(family) {
    if (_familyMap[family]) return; // serif/gothic はGoogleフォント読み込み不要
    var linkId = 'gfont-' + family.replace(/[^a-zA-Z0-9]/g, '-');
    if ($id(linkId)) return; // 既に読み込み済み
    var link = document.createElement('link');
    link.id   = linkId;
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family) + ':wght@400;700&display=swap';
    document.head.appendChild(link);
  }

  function _preloadFonts() {
    // シナリオ内の font コマンドを事前にスキャンし、
    // スタート画面表示中にGoogleフォントを先読みしておく
    if (!Array.isArray(_script)) return;
    for (var i = 0; i < _script.length; i++) {
      var step = _script[i];
      if (step && step.command === 'font' && step.family) {
        _loadGoogleFont(step.family);
      }
    }
  }

  function _setFont(cmd) {
    var el = $id('dialog-text');
    if (!el) return;
    // PC/スマホ別サイズ対応
    var isSP = window.matchMedia('(max-aspect-ratio: 3/4)').matches;
    if (cmd.sizePC || cmd.sizeSP) {
      if (isSP && cmd.sizeSP) el.style.fontSize = cmd.sizeSP;
      else if (!isSP && cmd.sizePC) el.style.fontSize = cmd.sizePC;
      else if (cmd.sizePC) el.style.fontSize = cmd.sizePC;
      else if (cmd.sizeSP) el.style.fontSize = cmd.sizeSP;
    } else if (cmd.size) {
      el.style.fontSize = cmd.size;
    }
    if (cmd.color) el.style.color = cmd.color;
    if (cmd.family) {
      var resolved = _familyMap[cmd.family] || cmd.family;
      if (!_familyMap[cmd.family]) {
        _loadGoogleFont(cmd.family);
        resolved = "'" + cmd.family + "',sans-serif";
      }
      el.style.fontFamily = resolved;
    }
  }

  var _scrollTimer = null;
  var _scrollPos = 0;
  var _pendingBgSrc = null; // 読み込み待ち中の背景画像URL（最新の指定を識別するため）

  function _setFg(filename, fit) {
    var layer = $id('background-layer');
    var existing = $id('fg-img');
    if (existing) existing.parentNode.removeChild(existing);
    if (!filename) return;
    var img = document.createElement('img');
    img.id = 'fg-img';
    img.src = _withCacheBust(_config.imagePath + filename);
    img.style.position = 'absolute';
    img.style.inset = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = (fit === 'contain') ? 'contain' : 'cover'; // contain指定で見切れずに収める（余白可）
    img.style.objectPosition = 'center';
    img.style.zIndex = '1';
    img.style.pointerEvents = 'none';
    layer.appendChild(img);
  }

  function _hideFg() {
    var existing = $id('fg-img');
    if (existing) existing.parentNode.removeChild(existing);
  }

  var _scrollPosX = 0;

  // background-position の文字列（'center','top','bottom','50%','120px' 等）を
  // cover サイズ基準の px 値に変換するヘルパー
  function _resolveBgPosY(posStr, cH, coverH) {
    var s = (posStr || 'center').trim().toLowerCase();
    if (s === 'top'    || s === '0%')   return 0;
    if (s === 'bottom' || s === '100%') return -(coverH - cH);
    if (s === 'center' || s === '50%')  return -((coverH - cH) / 2);
    if (s.endsWith('%')) {
      var pct = parseFloat(s) / 100;
      return -((coverH - cH) * pct);
    }
    if (s.endsWith('px')) return parseFloat(s);
    return -((coverH - cH) / 2); // fallback: center
  }

  function _resolveBgPosX(posStr, cW, coverW) {
    var s = (posStr || 'center').trim().toLowerCase();
    if (s === 'left'   || s === '0%')   return 0;
    if (s === 'right'  || s === '100%') return -(coverW - cW);
    if (s === 'center' || s === '50%')  return -((coverW - cW) / 2);
    if (s.endsWith('%')) {
      var pct = parseFloat(s) / 100;
      return -((coverW - cW) * pct);
    }
    if (s.endsWith('px')) return parseFloat(s);
    return -((coverW - cW) / 2); // fallback: center
  }

  function _startBgScroll(direction, speed, loop, distance) {
    _stopBgScroll();
    var bgImg = $id('background-img');
    if (!bgImg) return;
    var useLoop = (loop === true); // 明示的に true のときだけループ（デフォルト: false）
    var isVertical   = (direction === 'up'   || direction === 'down');
    var isHorizontal = (direction === 'left' || direction === 'right');
    // ループ時もCSSタイル(repeat)は使わない。継ぎ目のない単一画像とは限らないため、
    // 表示範囲の端まで来たら反対側の端へ位置を折り返す方式でループさせる。
    bgImg.style.backgroundRepeat = 'no-repeat';
    bgImg.style.backgroundSize = 'cover';

    // cover サイズ計算（画像読み込み後に _imgW/_imgH がセットされている前提）
    var cW   = bgImg.offsetWidth;
    var cH   = bgImg.offsetHeight;
    var imgW = bgImg._imgW || cW;
    var imgH = bgImg._imgH || cH;
    var scale  = Math.max(cW / imgW, cH / imgH);
    var coverW = imgW * scale;
    var coverH = imgH * scale;

    // 現在の background-position を px に変換して初期値とする
    var computed = window.getComputedStyle(bgImg);
    if (isVertical) {
      // backgroundPositionY の値は既に px で返ってくる（ブラウザが解決済み）
      var rawY = computed.backgroundPositionY || bgImg.style.backgroundPositionY || '';
      if (rawY.endsWith('px')) {
        _scrollPos = parseFloat(rawY);
      } else {
        // キーワード（'bottom' 等）が残っている場合は手動解決
        var posStr = bgImg._bgPosition || 'center';
        _scrollPos = _resolveBgPosY(posStr, cH, coverH);
      }
    }
    if (isHorizontal) {
      var rawX = computed.backgroundPositionX || bgImg.style.backgroundPositionX || '';
      if (rawX.endsWith('px')) {
        _scrollPosX = parseFloat(rawX);
      } else {
        var posStrX = bgImg._bgPosition || 'center';
        _scrollPosX = _resolveBgPosX(posStrX, cW, coverW);
      }
    }

    // distance 指定時: 移動先を計算して上書き終点を決める
    var distancePx = (distance != null) ? Number(distance) : null;
    var startY  = _scrollPos;
    var startX  = _scrollPosX;
    var moved   = 0; // 累積移動量

    var last = Date.now();
    _scrollTimer = setInterval(function() {
      var now   = Date.now();
      var delta = (now - last) / 1000;
      last = now;
      var step = speed * delta;

      // distance 指定: 残り距離を超えないようにクランプ
      if (distancePx != null) {
        var remaining = distancePx - moved;
        if (remaining <= 0) { _stopBgScroll(); return; }
        step = Math.min(step, remaining);
        moved += step;
      }

      // cover サイズは毎フレーム再計算（リサイズ対応）
      cW   = bgImg.offsetWidth;
      cH   = bgImg.offsetHeight;
      imgW = bgImg._imgW || cW;
      imgH = bgImg._imgH || cH;
      scale  = Math.max(cW / imgW, cH / imgH);
      coverW = imgW * scale;
      coverH = imgH * scale;

      if (direction === 'up') {
        _scrollPos -= step;
        var minY = -(coverH - cH);
        if (_scrollPos < minY) {
          if (useLoop) { _scrollPos = 0; } else { _scrollPos = minY; _stopBgScroll(); }
        }
        bgImg.style.backgroundPositionY = _scrollPos + 'px';
      } else if (direction === 'down') {
        _scrollPos += step;
        if (_scrollPos > 0) {
          // 最上部まで来たらloop指定に関わらずピタッと停止（既存通りの挙動）
          _scrollPos = 0;
          _stopBgScroll();
        }
        bgImg.style.backgroundPositionY = _scrollPos + 'px';
      } else if (direction === 'left') {
        _scrollPosX -= step;
        var minX = -(coverW - cW);
        if (_scrollPosX < minX) {
          if (useLoop) { _scrollPosX = 0; } else { _scrollPosX = minX; _stopBgScroll(); }
        }
        bgImg.style.backgroundPositionX = _scrollPosX + 'px';
      } else if (direction === 'right') {
        _scrollPosX += step;
        if (_scrollPosX > 0) {
          var minX2 = -(coverW - cW);
          if (useLoop) { _scrollPosX = minX2; } else { _scrollPosX = 0; _stopBgScroll(); }
        }
        bgImg.style.backgroundPositionX = _scrollPosX + 'px';
      }
    }, 16);
  }

  function _stopBgScroll() {
    if (_scrollTimer) {
      clearInterval(_scrollTimer);
      _scrollTimer = null;
    }
  }

  function _setBackground(filename, position, positionMobile, zoomMobile) {
    if (!filename) return;
    const bgImg = $id('background-img');

    // スクロール中に背景を切り替えた場合、スクロールを止めて位置をリセット
    _stopBgScroll();

    // スマホ相当（縦長・幅が狭い）画面では positionMobile / zoomMobile があればそちらを優先
    var isMobileLike = (window.innerWidth / window.innerHeight) < 0.8;
    var pos  = (isMobileLike && positionMobile) ? positionMobile : (position || 'center');
    var zoom = (isMobileLike && zoomMobile) ? zoomMobile : null; // 例: 1.3 = 通常のcoverよりさらに30%拡大
    bgImg._zoomMobile = isMobileLike ? zoomMobile : null; // リサイズ時の再計算用に保持（PC幅に戻ったら無効）
    // キャッシュ対策: 同名ファイルを差し替えても古い画像が出ないようタイムスタンプ付与
    var bustedSrc = _withCacheBust(_config.imagePath + filename);
    // この呼び出しが「最新の指定」であることを示す識別子
    var targetSrc = bustedSrc;
    _pendingBgSrc = targetSrc;

    // 画像を先読みし、読み込みが完了してから表示を切り替える。
    // サイズの大きい画像でもダウンロード中に次の画像へ上書きされて
    // 表示されないまま終わる、という問題を防ぐため。
    var tmpImg = new Image();
    tmpImg.onload = function() {
      // 読み込み完了時点でまだこの呼び出しが最新の指定先である場合のみ反映
      // （途中で別の background 呼び出しが発生していた場合は何もしない）
      if (_pendingBgSrc !== targetSrc) return;
      _pendingBgSrc = null;

      bgImg._imgW = tmpImg.width;
      bgImg._imgH = tmpImg.height;

      bgImg.classList.remove('default-bg');
      bgImg.style.opacity    = '0';
      bgImg.style.transition = 'opacity 0.5s';
      // 1フレーム後にセットしてから fade-in させる（opacity:0 を確実に反映させるため）
      requestAnimationFrame(function() {
        bgImg.style.backgroundImage    = "url('" + bustedSrc + "')";
        bgImg.style.backgroundPosition = pos;
        bgImg.style.backgroundRepeat   = 'no-repeat'; // スクロールで repeat になっていた場合の後始末
        bgImg._bgPosition = pos;
        if (zoom && zoom !== 1) {
          _applyBgZoom(bgImg, zoom);
        } else {
          bgImg.style.backgroundSize = 'cover';
        }
        // スクロール位置をリセット（新しい背景に切り替わったので）
        _scrollPos  = 0;
        _scrollPosX = 0;
        requestAnimationFrame(function() {
          bgImg.style.opacity = '1';
        });
      });
    };
    tmpImg.onerror = function() {
      if (_pendingBgSrc !== targetSrc) return;
      _pendingBgSrc = null;
      console.warn('[NovelEngine] 背景画像の読み込みに失敗:', filename);
    };
    tmpImg.src = targetSrc;
  }

  // 通常のcoverサイズに対し、zoom倍率をかけたピクセルサイズを計算して適用
  function _applyBgZoom(bgImg, zoom) {
    var iw = bgImg._imgW, ih = bgImg._imgH;
    if (!iw || !ih) return;
    var cw = bgImg.clientWidth, ch = bgImg.clientHeight;
    if (!cw || !ch) return;
    var coverScale = Math.max(cw / iw, ch / ih);
    var finalScale = coverScale * zoom;
    bgImg.style.backgroundSize = (iw * finalScale) + 'px ' + (ih * finalScale) + 'px';
  }

  // 画面回転・リサイズ時、zoomMobile指定中の背景があれば再計算
  // （スマホ⇄PC幅をまたいだ場合はcoverへ自動で戻す）
  window.addEventListener('resize', function() {
    var bgImg = $id('background-img');
    if (!bgImg) return;
    var isMobileLike = (window.innerWidth / window.innerHeight) < 0.8;
    if (isMobileLike && bgImg._zoomMobile && bgImg._zoomMobile !== 1) {
      _applyBgZoom(bgImg, bgImg._zoomMobile);
    } else if (bgImg.style.backgroundSize !== 'cover') {
      bgImg.style.backgroundSize = 'cover';
    }
  });

  /* ============================================
     文字送り
  ============================================ */
  function _startTyping(text) {
    clearInterval(_typeTimer);
    _clearAutoTimer();
    _isTyping = true;
    const dialogText = $id('dialog-text');
    dialogText.innerHTML = '';
    let i = 0;

    _typeTimer = setInterval(function() {
      if (i >= text.length) {
        clearInterval(_typeTimer);
        _isTyping = false;
        $id('next-indicator').classList.add('visible');
        if (_autoPlay) _scheduleAutoAdvance();
        return;
      }
      if (text[i] === '\n') {
        dialogText.appendChild(document.createElement('br'));
      } else {
        var last = dialogText.lastChild;
        if (last && last.nodeType === 3) {
          last.textContent += text[i];
        } else {
          dialogText.appendChild(document.createTextNode(text[i]));
        }
      }
      i++;
    }, _config.typingSpeed);
  }

  function _skipTyping() {
    clearInterval(_typeTimer);
    _isTyping = false;
    const step = _script[_index];
    if (step && step.text) {
      var el = $id('dialog-text');
      el.innerHTML = '';
      step.text.split('\n').forEach(function(line, idx) {
        if (idx > 0) el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(line));
      });
    }
    $id('next-indicator').classList.add('visible');
    if (_autoPlay) _scheduleAutoAdvance();
  }

  /* ============================================
     フェード
  ============================================ */
  function _setFadeColor(color) {
    _currentFadeColor = color;
    const ov = $id('fade-overlay');
    if (ov) ov.style.backgroundColor = color;
  }

  function _fadeOut(cb) {
    const ov = $id('fade-overlay');
    ov.classList.add('fading-out');
    _isFading = true;
    setTimeout(function() { _isFading = false; if (cb) cb(); }, 600);
  }

  function _fadeIn(cb) {
    const ov = $id('fade-overlay');
    ov.classList.remove('fading-out');
    ov.classList.add('fading-in');
    _isFading = true;
    setTimeout(function() {
      _isFading = false;
      ov.classList.remove('fading-in');
      if (cb) cb();
    }, 600);
  }

  /* ============================================
     タイトルカード（ED向け：中央タイトル＋ナレーション）
     whiteout/blackout と組み合わせて使う想定。
     例: hide_all → blackout → title_card → （クリックで次へ）
  ============================================ */
  function _buildTitleCard() {
    if ($id('title-card')) return;
    const container = $id('game-container') || document.body;
    const wrap = document.createElement('div');
    wrap.id = 'title-card';
    wrap.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:110',
      'display:none', 'flex-direction:column', 'align-items:center', 'justify-content:center',
      'text-align:center', 'padding:0 8%', 'pointer-events:none', 'box-sizing:border-box',
    ].join(';');

    const titleEl = document.createElement('h1');
    titleEl.id = 'title-card-title';
    titleEl.style.cssText = [
      'font-family:var(--font-ui), sans-serif', 'font-size:clamp(22px,6vw,40px)', 'font-weight:700',
      'letter-spacing:.08em', 'margin:0 0 22px', 'opacity:0', 'transition:opacity 0.8s ease',
    ].join(';');

    const textEl = document.createElement('p');
    textEl.id = 'title-card-text';
    textEl.style.cssText = [
      'font-size:clamp(13px,3.2vw,16px)', 'line-height:2', 'margin:0', 'white-space:pre-line',
      'opacity:0', 'transition:opacity 0.8s ease 0.3s',
    ].join(';');

    const cursorEl = document.createElement('div');
    cursorEl.id = 'title-card-cursor';
    cursorEl.textContent = '▼';
    cursorEl.style.cssText = [
      'margin-top:30px', 'font-size:0.9rem', 'opacity:0', 'transition:opacity 0.3s',
      'filter:drop-shadow(0 0 4px currentColor)',
    ].join(';');

    wrap.appendChild(titleEl);
    wrap.appendChild(textEl);
    wrap.appendChild(cursorEl);
    container.appendChild(wrap);
  }

  function _showTitleCard(title, text, duration) {
    _buildTitleCard();
    const wrap    = $id('title-card');
    const titleEl = $id('title-card-title');
    const textEl  = $id('title-card-text');
    const cursorEl= $id('title-card-cursor');

    // 現在のフェード色（whiteout/blackout）に応じて文字色を自動で白/黒に切り替え
    const isWhiteBg = (_currentFadeColor === '#ffffff' || _currentFadeColor === '#fff' || _currentFadeColor === 'white');
    const textColor = isWhiteBg ? '#111111' : '#ffffff';
    titleEl.style.color  = textColor;
    textEl.style.color   = textColor;
    cursorEl.style.color = textColor;

    titleEl.textContent = title || '';
    textEl.textContent  = text  || '';

    titleEl.style.opacity  = '0';
    textEl.style.opacity   = '0';
    cursorEl.style.opacity = '0';
    cursorEl.style.animation = 'none';
    wrap.style.display = 'flex';
    void wrap.offsetWidth; // リフローでアニメーションを確実に再トリガー
    requestAnimationFrame(function() {
      titleEl.style.opacity = '1';
      textEl.style.opacity  = '1';
    });

    // 専用の待機時間：終わるまではクリックを受け付けない（_isWaitingと同様の扱い）
    _titleCardVisible = true;
    _titleCardActive  = false;
    clearTimeout(_titleCardTimer);
    _titleCardTimer = setTimeout(function() {
      cursorEl.style.opacity = '1';
      cursorEl.style.animation = 'bounce-arrow 0.8s ease-in-out infinite alternate';
      _titleCardActive = true; // ここから先はクリックで次へ進める
    }, duration != null ? duration : 1500);
  }

  function _hideTitleCard() {
    clearTimeout(_titleCardTimer);
    const wrap = $id('title-card');
    if (wrap) wrap.style.display = 'none';
    const cursorEl = $id('title-card-cursor');
    if (cursorEl) { cursorEl.style.opacity = '0'; cursorEl.style.animation = 'none'; }
    _titleCardVisible = false;
    _titleCardActive  = false;
  }

  /* ============================================
     セーブ完了トースト
  ============================================ */
  function _showSaveToast() {
    var t = document.getElementById('save-toast');
    if(!t){
      t = document.createElement('div');
      t.id = 'save-toast';
      t.textContent = '💾 SAVED';
      t.style.cssText = [
        'position:fixed','bottom:60px','right:16px','z-index:9999',
        'background:rgba(0,15,30,0.88)','backdrop-filter:blur(6px)',
        'border:1px solid rgba(0,200,255,0.5)','border-radius:4px',
        'color:#00ccff','font-family:var(--font-ui,monospace)','font-size:11px','letter-spacing:.18em',
        'padding:7px 14px','box-shadow:0 0 12px rgba(0,200,255,0.25)',
        'opacity:0','pointer-events:none',
        'transition:opacity .3s ease,transform .3s ease','transform:translateY(8px)',
      ].join(';');
      document.body.appendChild(t);
    }
    clearTimeout(t._timer);
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    t._timer = setTimeout(function(){
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
    }, 1600);
  }

  /* ============================================
     エンド / リスタート
  ============================================ */
  function _showEnd() {
    _clearAutoTimer();
    _hideTitleCard();
    const autoBtn = $id('auto-toggle-btn');
    if (autoBtn) autoBtn.style.display = 'none';
    _stopBgScroll();
    _hideFg();
    _hideAllCharacters();
    $id('dialog-window').classList.add('hidden');
    fadeOutBGM(2000);
    setTimeout(function() {
      // nextUrl が設定されている場合は END画面を出さずそのまま自動遷移
      if (_config.nextUrl) {
        // ?reread=1（エピソード再読モード）の場合はnextUrlではなくタイトルへ戻る
        var _isReread = (typeof URLSearchParams !== 'undefined')
          && new URLSearchParams(window.location.search).get('reread') === '1';

        // 通常進行時のみ解放処理（再読時はスキップ）
        // 1. unlockStageOnComplete が明示設定されていればそれを使う
        // 2. なければ nextUrl の storyStage パラメータから自動判定
        if (!_isReread) {
          try {
            var _stageToUnlock = _config.unlockStageOnComplete != null
              ? parseInt(_config.unlockStageOnComplete, 10)
              : parseInt(new URLSearchParams(_config.nextUrl.split('?')[1] || '').get('storyStage'), 10);
            if (!isNaN(_stageToUnlock)) {
              var SAVE_KEY = 'stellarDeleteSave';
              var _raw = localStorage.getItem(SAVE_KEY);
              var _sd = _raw ? JSON.parse(_raw) : { unlockedStage:0, unlockedEpisode:0 };
              if (_stageToUnlock > (_sd.unlockedStage || 0)) {
                _sd.unlockedStage = _stageToUnlock;
                localStorage.setItem(SAVE_KEY, JSON.stringify(_sd));
                console.log('[SAVE] novel end: unlockedStage =', _sd.unlockedStage, '| full data:', JSON.stringify(_sd));
                _showSaveToast();
              }
            }
          } catch(_e) {}
        }

        window.location.href = _isReread ? '../index.html' : _config.nextUrl;
        return;
      }
      $id('end-screen').classList.remove('hidden');
    }, 800);
  }

  function _restart() {
    _clearAutoTimer();
    _hideTitleCard();
    _setFadeColor('#000000');
    const autoBtn = $id('auto-toggle-btn');
    if (autoBtn) autoBtn.style.display = '';
    _index    = 0;
    _started  = true;
    _isTyping = false;
    _isWaiting = false;
    _pendingBgSrc = null; // 読み込み待ちだった背景指定を無効化
    $id('end-screen').classList.add('hidden');
    const bgImg = $id('background-img');
    bgImg.style.backgroundImage = '';
    bgImg.classList.add('default-bg');
    _stopBgScroll();
    _scrollPos = 0;
    _scrollPosX = 0;
    _hideFg();
    _hideAllCharacters();
    _processStep();
  }

  /* ============================================
     ユーティリティ
  ============================================ */
  function _getCharIdByName(name) {
    if (!name) return null;
    for (const id in _config.characters) {
      const data = _config.characters[id];
      if (data.name === name || id === name) return id;
    }
    return null;
  }

  /* ============================================
     BGM / SE（公開）
  ============================================ */
  function playBGM(filename, loop) {
    stopBGM();
    if (loop === undefined) loop = true;
    try {
      _bgmAudio        = new Audio(_config.bgmPath + filename);
      _bgmAudio.loop   = loop;
      _bgmAudio.volume = 0.6;
      _bgmAudio.play().catch(function(e) {
        console.warn('[NovelEngine] BGM再生失敗:', e.message);
      });
    } catch(e) {
      console.warn('[NovelEngine] BGMエラー:', e);
    }
  }

  function stopBGM() {
    if (_bgmAudio) {
      _bgmAudio.pause();
      _bgmAudio.currentTime = 0;
      _bgmAudio = null;
    }
  }

  function fadeOutBGM(duration) {
    if (!_bgmAudio) return;
    if (!duration) duration = 2000;
    const audio     = _bgmAudio;
    const step      = 50;
    const decrement = audio.volume / (duration / step);
    const timer     = setInterval(function() {
      if (audio.volume > decrement) {
        audio.volume = Math.max(0, audio.volume - decrement);
      } else {
        audio.volume = 0;
        audio.pause();
        clearInterval(timer);
        if (_bgmAudio === audio) _bgmAudio = null;
      }
    }, step);
  }

  function _playSE(filename) {
    if (!filename) return;
    try {
      const se    = new Audio(_config.sePath + filename);
      se.volume   = 0.8;
      se.play().catch(function() {});
    } catch(e) {}
  }

  /* ============================================
     公開API
  ============================================ */
  return {
    init:           init,
    play:           play,
    playBGM:        playBGM,
    stopBGM:        stopBGM,
    fadeOutBGM:     fadeOutBGM,
    playSE:         _playSE,
    showCharacter:  function(id, portrait) { _showCharacter(id, portrait); },
    hideCharacter:  function(id) { _hideCharacter(id); },
    hideAll:        function() { _hideAllCharacters(); },
    setBackground:  function(file) { _setBackground(file); },
    fadeOut:        function(cb) { _fadeOut(cb); },
    fadeIn:         function(cb) { _fadeIn(cb); },
  };

})();
