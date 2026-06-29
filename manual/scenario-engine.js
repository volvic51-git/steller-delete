/* ============================================================================
 * scenario-engine.js — Stellar Delete シナリオ再生エンジン（マニュアル側レイヤー）
 *
 * MANUAL_SPEC.md 準拠。ゲームには window.GameBridge 経由でのみ触れる（§6-A）。
 * このファイルは board[][] や Canvas内部・ゲームのグローバルに直接アクセスしない。
 *
 * 構成（§7）：
 *   - DOM Overlay … 説明ウィンドウ / 戻る・次へ・スキップ・自動 / STEP表示 / デバッグ
 *   - Canvas      … ハイライト(円/四角)・矢印・パルス・点滅（描画専用）
 *
 * 主要概念：
 *   - 3層Action（Gameplay / Visual / UI Animation）§4
 *   - dispose スコープ（ステップ単位の自動回収）§5-5
 *   - Atomic（Gameplay は完了境界まで停止保留）§5-6
 *   - 同期点は GameBridge.waitUntilIdle 一点 §5-6b
 * ========================================================================== */
(function () {
  'use strict';

  const B = window.GameBridge;
  if (!B) { console.error('[ScenarioEngine] GameBridge 未ロード'); return; }

  const COLORS = { yellow: '#ffe14d', cyan: '#3fe0ff', red: '#ff4d5e', green: '#4dff9b' };

  /* ------------------------------------------------------------------ *
   * DisposeScope：ステップ単位の後始末を登録 → まとめて破棄（§5-5）
   * ------------------------------------------------------------------ */
  function DisposeScope() { this._fns = []; }
  DisposeScope.prototype.add = function (fn) { if (typeof fn === 'function') this._fns.push(fn); };
  DisposeScope.prototype.dispose = function () {
    while (this._fns.length) { try { this._fns.pop()(); } catch (e) { console.error(e); } }
  };

  /* ------------------------------------------------------------------ *
   * Overlay：DOM（UI専用） + Canvas（描画専用）
   * ------------------------------------------------------------------ */
  const Overlay = {
    root: null, canvas: null, ctx: null, win: null,
    elTitle: null, elBody: null, elStep: null, elToast: null, dbg: null,
    _raf: null, _drawables: [],

    build: function () {
      if (this.root) return;
      const root = document.createElement('div');
      root.id = 'scn-overlay';
      root.innerHTML =
        '<canvas id="scn-canvas"></canvas>' +
        '<div id="scn-toast"></div>' +
        '<div id="scn-window">' +
          '<div id="scn-step"></div>' +
          '<div id="scn-title"></div>' +
          '<div id="scn-text"></div>' +
          '<div id="scn-controls">' +
            '<button id="scn-next" type="button">次へ</button>' +
            '<button id="scn-restart" type="button">最初から</button>' +
            '<button id="scn-quit" type="button">終了</button>' +
          '</div>' +
        '</div>' +
        '<div id="scn-debug" hidden>' +
          '<div class="scn-dbg-row"><span>STEP</span><b id="scn-dbg-step">-</b></div>' +
          '<div class="scn-dbg-row"><span>ACTION</span><b id="scn-dbg-action">-</b></div>' +
          '<div class="scn-dbg-row"><span>FOCUS</span><b id="scn-dbg-focus">-</b></div>' +
          '<div class="scn-dbg-row"><span>POS</span><b id="scn-dbg-pos">-</b></div>' +
          '<div class="scn-dbg-row"><span>ZOOM</span><b id="scn-dbg-zoom">-</b></div>' +
          '<div class="scn-dbg-jump"><button id="scn-dbg-prev" type="button">◀</button>' +
            '<input id="scn-dbg-input" type="number" min="1" /> ' +
            '<button id="scn-dbg-go" type="button">JUMP</button>' +
            '<button id="scn-dbg-nextb" type="button">▶</button></div>' +
        '</div>';
      document.body.appendChild(root);

      this.root = root;
      this.canvas = root.querySelector('#scn-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.win = root.querySelector('#scn-window');
      this.elTitle = root.querySelector('#scn-title');
      this.elBody = root.querySelector('#scn-text');
      this.elStep = root.querySelector('#scn-step');
      this.elToast = root.querySelector('#scn-toast');
      this.dbg = {
        box: root.querySelector('#scn-debug'),
        step: root.querySelector('#scn-dbg-step'),
        action: root.querySelector('#scn-dbg-action'),
        focus: root.querySelector('#scn-dbg-focus'),
        pos: root.querySelector('#scn-dbg-pos'),
        zoom: root.querySelector('#scn-dbg-zoom'),
        input: root.querySelector('#scn-dbg-input')
      };
      this._resize();
      window.addEventListener('resize', this._resize.bind(this));
      this._loop();
    },

    _resize: function () {
      if (!this.canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.width = window.innerWidth + 'px';
      this.canvas.style.height = window.innerHeight + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    show: function (on) { if (this.root) this.root.classList.toggle('active', !!on); },

    setText: function (title, body) {
      this.elTitle.textContent = title || '';
      this.elBody.textContent = body || '';
    },
    setStep: function (label) { this.elStep.textContent = label || ''; },

    toast: function (msg) {
      this.elToast.textContent = msg;
      this.elToast.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => this.elToast.classList.remove('show'), 1800);
    },

    /* --- Canvas 描画オブジェクト管理 --- */
    addDrawable: function (d) { this._drawables.push(d); return () => this.removeDrawable(d); },
    removeDrawable: function (d) { const i = this._drawables.indexOf(d); if (i >= 0) this._drawables.splice(i, 1); },
    clearDrawables: function () { this._drawables.length = 0; },

    _loop: function () {
      const ctx = this.ctx;
      const t = performance.now();
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (const d of this._drawables) { try { d.draw(ctx, t); } catch (e) { /* noop */ } }
      this._raf = requestAnimationFrame(this._loop.bind(this));
    }
  };

  /* ------------------------------------------------------------------ *
   * 描画プリミティブ（Canvas）：対象位置は毎フレーム解決（§2-4 追従）
   * resolve() … () => {x,y,radius,visible} を返す関数
   * ------------------------------------------------------------------ */
  function makeHighlight(resolve, opt) {
    opt = opt || {};
    const color = COLORS[opt.color] || COLORS.yellow;
    const shape = opt.shape || 'circle';
    const pulse = opt.pulse !== false;
    return {
      draw: function (ctx, t) {
        const p = resolve();
        if (!p || p.visible === false) return;
        const base = Math.max(p.radius || 22, 16) + 10;
        const k = pulse ? (1 + 0.15 * Math.sin(t / 220)) : 1;
        const r = base * k;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.9;
        if (shape === 'rect') {
          ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    };
  }

  function makeArrow(resolve, opt) {
    opt = opt || {};
    const color = COLORS[opt.color] || COLORS.cyan;
    return {
      draw: function (ctx, t) {
        const p = resolve();
        if (!p || p.visible === false) return;
        const bob = 10 * Math.sin(t / 260);
        const tipY = p.y - (p.radius || 22) - 18 - Math.abs(bob);
        const topY = tipY - 46;
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(p.x, tipY);
        ctx.lineTo(p.x - 12, tipY - 16);
        ctx.lineTo(p.x - 5, tipY - 16);
        ctx.lineTo(p.x - 5, topY);
        ctx.lineTo(p.x + 5, topY);
        ctx.lineTo(p.x + 5, tipY - 16);
        ctx.lineTo(p.x + 12, tipY - 16);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    };
  }

  // DOM要素 → 中心/サイズを毎回 getBoundingClientRect で解決（§2-2）
  function domResolver(selector) {
    return function () {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: Math.max(r.width, r.height) / 2, visible: true };
    };
  }
  // セル → GameBridge.getCellScreenPosition で解決（§2-1）
  function cellResolver(row, col) {
    return function () { return B.getCellScreenPosition(row, col); };
  }

  /* ------------------------------------------------------------------ *
   * Action ハンドラ登録（§4 容易な追加：ここに足すだけ）
   *   handler(action, ctx) … ctx = { scope, engine }
   *   - Gameplay は Atomic（await し切る／途中で stop しない）
   *   - Visual / UI は scope に dispose を登録
   * ------------------------------------------------------------------ */
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const Handlers = {
    /* --- 共通 / 制御フロー --- */
    message: async function (a, ctx) {
      Overlay.setText(a.title || ctx.engine.chapterTitle, a.text || '');
      // メッセージは next で進む（自動再生時は waitAfter / time で進む）
    },
    wait: async function (a) { await sleep(a.time || 500); },
    moveMouse: async function (a) { await sleep((a.effect && a.effect.duration) || 300); },
    finish: async function (a, ctx) { ctx.engine.finish(); },

    /* --- ② Visual（dispose対象） --- */
    highlight: async function (a, ctx) { // UI(DOM)
      const sel = typeof a.target === 'string' ? a.target : (a.target && a.target.selector);
      const remove = Overlay.addDrawable(makeHighlight(domResolver(sel), Object.assign({ shape: 'rect' }, a.effect)));
      ctx.scope.add(remove);
    },
    highlightUI: async function (a, ctx) { return Handlers.highlight(a, ctx); },
    highlightCell: async function (a, ctx) {
      const remove = Overlay.addDrawable(makeHighlight(cellResolver(a.row, a.col), a.effect));
      ctx.scope.add(remove);
    },
    arrow: async function (a, ctx) {
      const resolve = a.row != null ? cellResolver(a.row, a.col)
        : domResolver(typeof a.target === 'string' ? a.target : a.target.selector);
      ctx.scope.add(Overlay.addDrawable(makeArrow(resolve, a.effect)));
    },
    focus: async function (a, ctx) { // UI focus（カメラは動かさない・ハイライトのみ）
      return Handlers.highlight(a, ctx);
    },
    focusCell: async function (a, ctx) {
      B.focusCell(a.row, a.col, a.effect || {});
      // 回転・ズーム収束は外側の waitUntilIdle が待つ（§5-6b）
    },
    camera: async function (a) { B.focusCell(a.row, a.col, { zoom: a.zoom }); },
    zoom: async function (a) { B.focusCell(a.row, a.col, { zoom: a.zoom }); },

    /* --- ③ UI Animation（副作用ゼロ・dispose対象） --- */
    pressButton: async function (a, ctx) { await uiAnim(a, ctx, 'press'); },
    pulseButton: async function (a, ctx) { await uiAnim(a, ctx, 'pulse'); },
    shakeButton: async function (a, ctx) { await uiAnim(a, ctx, 'shake'); },
    flashButton: async function (a, ctx) { await uiAnim(a, ctx, 'flash'); },

    /* --- ① Gameplay（Atomic／状態変更） --- */
    digCell: async function (a) { await gameplay('digCell', [a.row, a.col], a); },
    flagCell: async function (a) { await gameplay('flagCell', [a.row, a.col], a); },
    call: async function (a) { await gameplay(a.fn, a.args || [], a); },

    /* --- condition（プレイヤー操作待ち）§5-2 ---
     * ブロックawaitではなく「ゲート方式」：handlerは即時returnしリスナを張る。
     * ゲートが開いている間 next() は無効（誤スキップ防止）。正しい操作で gate を閉じ next()。 */
    condition: async function (a, ctx) {
      const engine = ctx.engine;
      engine._gateOpen = true;   // 冒頭で即ゲートを開く（focus収束中のスキップを防止）
      // 任意：操作に必要なモードへ切替（例 旗条件で "flag"）。ゲーム状態は変えない準備操作。
      if (a.mode) B.callApi('setMode', [a.mode]);
      // 任意：対象セルへフォーカス（回転＋ズーム）。idle まで待つ。
      if (a.focus) { B.focusCell(a.row, a.col, (a.focus === true) ? {} : a.focus); await B.waitUntilIdle({ timeout: 4000 }); }
      const targets = [{ row: a.row, col: a.col, type: a.type || null }];
      B.setInputMode(a.inputMode ? a.inputMode.toUpperCase() : 'GUIDED', targets);
      const remove = Overlay.addDrawable(makeHighlight(cellResolver(a.row, a.col),
        { color: (a.effect && a.effect.color) || 'cyan' }));
      const off = B.onCellAction(function (d) {
        const hit = d.row === a.row && d.col === a.col && (!a.type || d.type === a.type);
        if (hit) {
          engine._gateOpen = false;
          cleanup();
          engine.next();              // 満了 → 次へ
        } else if (a.onError && a.onError.message) {
          Overlay.toast(a.onError.message);   // 誤操作：トーストのみ（ペナルティなし）
        }
      });
      function cleanup() { off(); remove(); B.setInputMode('FREE'); }
      ctx.scope.add(function () { engine._gateOpen = false; cleanup(); });
    }
  };

  // UI Animation 共通（CSSクラス付与→解除を scope 登録）
  async function uiAnim(a, ctx, kind) {
    const sel = typeof a.target === 'string' ? a.target : (a.target && a.target.selector);
    const el = sel && document.querySelector(sel);
    if (!el) return;
    const cls = 'scn-anim-' + kind;
    el.classList.add(cls);
    ctx.scope.add(() => el.classList.remove(cls));
    await sleep((a.effect && a.effect.duration) || 600);
  }

  // Gameplay 共通：Atomic（uiEffect→実行→idle）§5-7
  async function gameplay(fn, args, a) {
    let pressEl = null, pressCls = null;
    if (a.uiEffect && a.uiEffect.target) {
      pressEl = document.querySelector(a.uiEffect.target);
      if (pressEl) { pressCls = 'scn-anim-' + (a.uiEffect.animation || 'press'); pressEl.classList.add(pressCls); }
      await sleep(180);
    }
    const res = B.callApi(fn, args);
    if (!res.ok) throw new Error('callApi failed: ' + fn);
    await B.waitUntilIdle({ timeout: 5000 });
    if (a.effect && a.effect.waitAfter) await sleep(a.effect.waitAfter);
    if (pressEl && pressCls) pressEl.classList.remove(pressCls);
  }

  const GAMEPLAY_ACTIONS = { digCell: 1, flagCell: 1, call: 1 };

  /* ------------------------------------------------------------------ *
   * Engine 本体：ステップ進行・自動再生・スキップ・デバッグ
   * ------------------------------------------------------------------ */
  function Engine() {
    this.steps = [];
    this.chapterTitle = '';
    this.index = -1;
    this.running = false;
    this.autoPlay = false;
    this.debug = false;
    this._scope = null;
    this._waitNext = null;       // next 待ちの resolve
    this._busyAtomic = false;    // Atomic実行中フラグ（停止保留）
    this._pendingNav = null;     // 'next'|'prev'|'skip'|'jump:n' 保留
    this._gateOpen = false;      // condition 待機中（next無効）
  }

  Engine.prototype.load = function (scenario) {
    if (Array.isArray(scenario)) { this.steps = scenario; this.chapterTitle = ''; this.boardPreset = null; }
    else {
      this.steps = scenario.steps || [];
      this.chapterTitle = scenario.chapter || scenario.title || '';
      this.boardPreset = scenario.boardPreset || null;
    }
    return this;
  };

  Engine.prototype.start = async function (opts) {
    opts = opts || {};
    this._opts = opts;
    Overlay.build();
    Overlay.show(true);
    const preset = opts.boardPreset || this.boardPreset;
    if (preset) B.loadScenarioBoard(preset);
    document.body.classList.add('scn-manual-active'); // 下側アイコンを上方へ退避（CSS）
    B.setInputMode('LOCK'); // 開始直後から全セルをガード（指示が出るまで操作不可）
    this.debug = !!opts.debug;
    Overlay.dbg.box.hidden = !this.debug;
    this._bindControls();
    this.running = true;
    this.index = -1;
    await this.next();
  };

  // 「最初から」：盤面を初期状態に戻し、ステップ1からやり直す
  Engine.prototype.restart = async function () {
    if (this._busyAtomic) { this._pendingNav = 'restart'; return; }
    this._gateOpen = false;
    if (this._scope) { this._scope.dispose(); this._scope = null; }
    Overlay.clearDrawables();
    const preset = (this._opts && this._opts.boardPreset) || this.boardPreset;
    if (preset) B.loadScenarioBoard(preset);   // 盤面を初期状態へ
    B.setInputMode('LOCK');
    this.running = true;
    this.autoPlay = false;
    this.index = -1;
    await this.next();
  };

  Engine.prototype._setStepLabel = function () {
    const n = this.index + 1, total = this.steps.length;
    const label = this.chapterTitle ? (this.chapterTitle + '  ' + n + ' / ' + total)
      : ('STEP ' + n + ' / ' + total);
    Overlay.setStep(label);
  };

  // 1ステップ実行
  Engine.prototype._runStep = async function () {
    const a = this.steps[this.index];
    if (!a) return;
    this._setStepLabel();
    if (this.debug) this._updateDebug(a);

    // どのActionでも title/text があれば説明ウィンドウに表示（ハイライト＋文章の同時表示用）。
    // text が無いステップは現在の文章を保持する（focus/condition等の沈黙ステップ）。
    if (a.text != null || a.title != null) Overlay.setText(a.title || this.chapterTitle, a.text || '');

    const scope = new DisposeScope();
    this._scope = scope;
    const ctx = { scope: scope, engine: this };
    const handler = Handlers[a.action];

    if (!handler) { console.error('[ScenarioEngine] 未知のaction:', a.action); return; }

    // 入力ゲート既定（§5-2）：condition 以外のステップは全セルをガード（LOCK）。
    // condition は handler 内で対象セルのみ GUIDED にする。
    // シナリオ側で a.inputMode を明示すれば上書き可（例 "free" で自由操作を許可）。
    if (a.action !== 'condition') {
      B.setInputMode(a.inputMode ? a.inputMode.toUpperCase() : 'LOCK');
    }

    const isGameplay = !!GAMEPLAY_ACTIONS[a.action];
    if (isGameplay) {
      // Atomic：完了境界まで停止保留（§5-6）
      this._busyAtomic = true;
      await B.waitUntilIdle({ timeout: 5000 }); // 実行前 idle
      try { await handler(a, ctx); }
      catch (e) { console.error(e); this._fail(); }
      this._busyAtomic = false;
      this._consumePendingNav();
    } else {
      try { await handler(a, ctx); } catch (e) { console.error(e); }
    }

    // message / next 系：自動再生でなければ「次へ」待ち
    if (this._needsManualAdvance(a)) {
      await this._awaitNext(a);
    }
  };

  Engine.prototype._needsManualAdvance = function (a) {
    if (a.action === 'condition' || a.action === 'finish') return false;
    if (this.autoPlay) return false;
    // Gameplay/Visual/UI/message いずれも、手動モードでは next 待ち
    return true;
  };

  Engine.prototype._awaitNext = function (a) {
    const self = this;
    return new Promise(function (resolve) { self._waitNext = resolve; });
  };

  Engine.prototype._resolveNext = function () {
    if (this._waitNext) { const r = this._waitNext; this._waitNext = null; r(); }
  };

  // 自動再生時の待機（message等はwaitAfter/timeで自動送り）
  Engine.prototype._autoDelay = function (a) {
    const d = (a.effect && a.effect.waitAfter) || a.time || (a.action === 'message' ? 1400 : 500);
    return sleep(d);
  };

  Engine.prototype.next = async function () {
    if (this._busyAtomic) { this._pendingNav = 'next'; return; }     // Atomic中は保留
    if (this._gateOpen) return;                                      // condition待ち中は無効
    this._resolveNext();
    if (this._scope) { this._scope.dispose(); this._scope = null; }  // 退出時 dispose（§5-5）
    if (this.index >= this.steps.length - 1) { this.finish(); return; }
    this.index++;
    await this._runStep();
    const a = this.steps[this.index];
    if (!this.running) return;
    if (this.autoPlay && a && a.action !== 'condition') {
      await this._autoDelay(a);
      if (this.autoPlay && this.running) this.next();
    }
  };

  Engine.prototype.prev = async function () {
    if (this._busyAtomic) { this._pendingNav = 'prev'; return; }
    this._resolveNext();
    if (this._scope) { this._scope.dispose(); this._scope = null; }
    if (this.index <= 0) return;
    this.index--;
    // Gameplay は巻き戻さない（§5-5）：状態変更系はスキップして表示だけ戻す
    await this._runStep();
  };

  Engine.prototype.jump = async function (n) {
    if (this._busyAtomic) { this._pendingNav = 'jump:' + n; return; }
    const idx = Math.max(0, Math.min(this.steps.length - 1, n));
    this._resolveNext();
    if (this._scope) { this._scope.dispose(); this._scope = null; }
    this.index = idx;
    await this._runStep();
  };

  Engine.prototype.skip = function () {
    if (this._busyAtomic) { this._pendingNav = 'skip'; return; }
    this.finish();
  };

  Engine.prototype._consumePendingNav = function () {
    const p = this._pendingNav; this._pendingNav = null;
    if (!p) return;
    if (p === 'next') this.next();
    else if (p === 'prev') this.prev();
    else if (p === 'skip') this.skip();
    else if (p === 'restart') this.restart();
    else if (p.indexOf('jump:') === 0) this.jump(parseInt(p.slice(5), 10));
  };

  Engine.prototype.toggleAuto = function () {
    this.autoPlay = !this.autoPlay;
    const btn = document.getElementById('scn-auto');
    if (btn) btn.textContent = this.autoPlay ? '⏸ 停止' : '▶ 自動';
    if (this.autoPlay) this.next();
  };

  Engine.prototype._fail = function () {
    if (this.debug) Overlay.toast('[DEBUG] Action失敗（step ' + (this.index + 1) + '）');
    else { Overlay.setText('', 'マニュアルを続行できませんでした'); this.finish(); }
  };

  Engine.prototype.finish = function () {
    if (!this.running) return;
    this.running = false;
    this.autoPlay = false;
    if (this._scope) { this._scope.dispose(); this._scope = null; }
    Overlay.clearDrawables();
    B.setInputMode('FREE');
    document.body.classList.remove('scn-manual-active'); // アイコン位置を元に戻す
    Overlay.show(false);
  };

  Engine.prototype._bindControls = function () {
    const q = (id) => document.getElementById(id);
    q('scn-next').onclick = () => this.next();
    q('scn-restart').onclick = () => this.restart();
    q('scn-quit').onclick = () => this.finish();
    if (this.debug) {
      q('scn-dbg-go').onclick = () => this.jump((parseInt(Overlay.dbg.input.value, 10) || 1) - 1);
      q('scn-dbg-prev').onclick = () => this.prev();
      q('scn-dbg-nextb').onclick = () => this.next();
    }
  };

  Engine.prototype._updateDebug = function (a) {
    const d = Overlay.dbg;
    d.step.textContent = (this.index + 1) + ' / ' + this.steps.length;
    d.action.textContent = a.action + (a.fn ? (':' + a.fn) : '');
    if (a.row != null) {
      d.focus.textContent = 'cell(' + a.row + ',' + a.col + ')';
      const p = B.getCellScreenPosition(a.row, a.col);
      d.pos.textContent = Math.round(p.x) + ',' + Math.round(p.y) + (p.visible ? '' : ' (裏)');
    } else if (a.target) {
      d.focus.textContent = (typeof a.target === 'string' ? a.target : a.target.selector) || '-';
      d.pos.textContent = '-';
    } else { d.focus.textContent = '-'; d.pos.textContent = '-'; }
    d.zoom.textContent = (typeof zoomDist !== 'undefined' ? zoomDist.toFixed(2) : '-');
  };

  /* ------------------------------------------------------------------ *
   * 公開API：ScenarioPlayer
   * ------------------------------------------------------------------ */
  const _engine = new Engine();

  window.ScenarioPlayer = {
    engine: _engine,
    play: function (scenario, opts) { _engine.load(scenario); return _engine.start(opts || {}); },
    playUrl: async function (url, opts) {
      const res = await fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now());
      const data = await res.json();
      _engine.load(data);
      return _engine.start(opts || {});
    },
    stop: function () { _engine.finish(); },
    // 新Action登録（§4 拡張容易性）
    registerAction: function (name, handler) { Handlers[name] = handler; },
    markGameplay: function (name) { GAMEPLAY_ACTIONS[name] = 1; }
  };

  console.log('[ScenarioEngine] ready');
})();
