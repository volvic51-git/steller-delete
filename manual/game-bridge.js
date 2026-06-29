/* ============================================================================
 * game-bridge.js — Stellar Delete マニュアル連携アダプタ（ゲーム側レイヤー）
 *
 * MANUAL_SPEC.md §6 / §6-A 準拠。
 * このファイルは「ゲーム内部に触れてよい唯一の層」。
 * sphere-minesweeper.html のインライン script の後ろに classic script として読み込み、
 * 同一realmの字句スコープ共有でゲーム内部（board / camera / boardGroup / cellPosition 等）
 * を参照する。シナリオエンジンは window.GameBridge 経由でのみゲームに触れる。
 *
 * ゲーム本体のコードは編集しない（このファイル内で handleCellAction をラップする）。
 * ========================================================================== */
(function () {
  'use strict';

  // --- 必須シンボルの存在チェック（読み込み順ミスの早期検出） ---------------
  if (typeof board === 'undefined' || typeof boardGroup === 'undefined' ||
      typeof camera === 'undefined' || typeof THREE === 'undefined') {
    console.error('[GameBridge] ゲーム本体より後に読み込んでください（board/camera 未定義）');
    return;
  }

  // ---- 内部状態 -------------------------------------------------------------
  let _inputMode = 'FREE';                  // 'LOCK' | 'GUIDED' | 'FREE'
  let _guidedTargets = [];                  // GUIDED時に許可するセル [{row,col}]
  const _cellActionListeners = [];          // onCellAction コールバック群

  // ---- BusyCounter（§5-6b） -------------------------------------------------
  // ブリッジ起点の演出（focus等）用カウンタ。ゲーム既存の非同期演出は
  // 観測可能な状態（autoRotating / zoom未収束 / cell.animating / vanishキュー）で判定する。
  let _bridgeBusy = 0;

  function _gameAnimating() {
    // 球の自動回転中
    if (typeof autoRotating !== 'undefined' && autoRotating) return true;
    // ズーム未収束
    if (typeof zoomDist !== 'undefined' &&
        Math.abs(camera.position.z - zoomDist) > 0.01) return true;
    // 盤面生成中
    if (typeof gameState !== 'undefined' && gameState === 'generating') return true;
    // セル個別アニメ
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r] && board[r][c];
        if (cell && cell.animating) return true;
      }
    }
    // 0セル消滅キュー
    if (typeof _vanishQueue !== 'undefined' && _vanishQueue && _vanishQueue.length > 0) return true;
    return false;
  }

  function isBusy() {
    return _bridgeBusy > 0 || _gameAnimating();
  }

  function waitUntilIdle(opts) {
    const timeout = (opts && opts.timeout) || 5000;
    const start = performance.now();
    return new Promise(function (resolve) {
      (function poll() {
        if (!isBusy()) { resolve({ timedOut: false }); return; }
        if (performance.now() - start > timeout) {
          console.warn('[GameBridge] waitUntilIdle タイムアウト', { elapsed: performance.now() - start });
          resolve({ timedOut: true });
          return;
        }
        requestAnimationFrame(poll);
      })();
    });
  }

  // ---- 座標投影（§6 getCellScreenPosition） --------------------------------
  const _wp = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _edge = new THREE.Vector3();

  function getCellScreenPosition(row, col) {
    const cell = board[row] && board[row][col];
    if (!cell || !cell.mesh) return { x: 0, y: 0, visible: false, radius: 0 };

    boardGroup.updateMatrixWorld(true);
    cell.mesh.getWorldPosition(_wp);

    // 前面判定：球面法線（=正規化ワールド座標）とカメラ方向の内積
    const toCamX = camera.position.x - _wp.x;
    const toCamY = camera.position.y - _wp.y;
    const toCamZ = camera.position.z - _wp.z;
    const len = _wp.length() || 1;
    const visible = (_wp.x * toCamX + _wp.y * toCamY + _wp.z * toCamZ) / len > 0;

    // 中心をスクリーン投影
    const p = _wp.clone().project(camera);
    const x = (p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-p.y * 0.5 + 0.5) * window.innerHeight;

    // 半径：カメラ右方向へセル半サイズだけずらした点の投影距離
    _right.setFromMatrixColumn(camera.matrixWorld, 0); // camera right (world)
    const halfSize = (2 * Math.PI * 1.55 / COLS) * 0.5; // セルの概算半サイズ(world)
    _edge.copy(_wp).addScaledVector(_right, halfSize);
    const pe = _edge.project(camera);
    const ex = (pe.x * 0.5 + 0.5) * window.innerWidth;
    const ey = (-pe.y * 0.5 + 0.5) * window.innerHeight;
    const radius = Math.hypot(ex - x, ey - y);

    return { x: x, y: y, visible: visible, radius: radius };
  }

  function isCellVisible(row, col) {
    return getCellScreenPosition(row, col).visible;
  }

  // ---- セル状態取得（§6 getCellState） -------------------------------------
  function getCellState(row, col) {
    const cell = board[row] && board[row][col];
    if (!cell) return null;
    return {
      row: row, col: col,
      isOpen: !!cell.isOpen,
      hasFlag: !!cell.hasFlag,
      isMine: !!cell.isMine,
      isRemoved: !!cell.isRemoved,
      neighborMines: cell.neighborMines | 0
    };
  }

  // ---- フォーカス（§4 focusCell：回転→ズーム→idle まで内部完結） -----------
  function focusCell(row, col, options) {
    options = options || {};
    if (typeof startAutoRotate !== 'function') return;
    _bridgeBusy++;
    startAutoRotate(row, col); // 対象セルを正面へ回転（autoRotating=true）

    // 説明ウィンドウが下部にあるため、対象を「画面中央より少し上」へ寄せる
    // （回転ターゲットを上方向へオフセット）。下部ウィンドウとの重なりを避ける。
    if (typeof autoRotateTo !== 'undefined' && autoRotateTo) {
      autoRotateTo.x -= 0.12;
      autoRotateTo.x = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, autoRotateTo.x));
    }

    // 自動ズーム：対象が小さい場合は寄る（任意）
    if (options.zoom && typeof zoomDist !== 'undefined') {
      zoomDist = Math.max(2.0, Math.min(8.0, options.zoom));
    }

    // 回転＆ズームの収束を「ゲーム状態のみ」で監視して busy を解放する。
    // 注意：ここで waitUntilIdle()（=_bridgeBusy>0を含む）を待つと自分のカウンタで
    // 自分が永遠にビジーになりデッドロックするため、_gameAnimating() は使わず個別に判定する。
    const _focusStart = performance.now();
    (function pollFocus() {
      const rotating = (typeof autoRotating !== 'undefined' && autoRotating);
      const zoomBusy = Math.abs(camera.position.z - zoomDist) > 0.01;
      if ((!rotating && !zoomBusy) || performance.now() - _focusStart > 4000) {
        _bridgeBusy--;
        return;
      }
      requestAnimationFrame(pollFocus);
    })();
  }

  // ---- 固定盤面注入（§6 loadScenarioBoard） --------------------------------
  // プリセット = 地雷座標の配列。チュートリアルの dig(r,c) を毎回成立させる。
  const BOARD_PRESETS = {
    // 基本操作用：中央付近を安全地帯に、周囲に数字が出るよう地雷を配置
    basic01: [
      [3, 6], [3, 7], [4, 9], [6, 4], [7, 10],
      [8, 6], [9, 13], [5, 15], [2, 11], [10, 8]
    ]
  };

  function loadScenarioBoard(name) {
    const mines = BOARD_PRESETS[name];
    if (!mines) { console.error('[GameBridge] 未登録の盤面プリセット:', name); return false; }
    if (typeof initBoard !== 'function' || typeof calcNeighbors !== 'function') {
      console.error('[GameBridge] initBoard/calcNeighbors 不在');
      return false;
    }
    initBoard();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) board[r][c].isMine = false;
    mines.forEach(function (m) {
      const r = m[0], c = ((m[1] % COLS) + COLS) % COLS;
      if (board[r] && board[r][c]) board[r][c].isMine = true;
    });
    calcNeighbors();
    if (typeof window !== 'undefined') gameState = 'playing';
    if (typeof startTimer === 'function') startTimer();
    if (typeof updateStats === 'function') updateStats();
    return true;
  }

  // ---- 入力ゲート & 操作通知（§5-2 / §6） -----------------------------------
  function setInputMode(mode, targets) {
    _inputMode = mode || 'FREE';
    _guidedTargets = targets || [];
  }

  function onCellAction(cb) {
    if (typeof cb === 'function') _cellActionListeners.push(cb);
    return function off() {
      const i = _cellActionListeners.indexOf(cb);
      if (i >= 0) _cellActionListeners.splice(i, 1);
    };
  }

  function _notify(detail) {
    _cellActionListeners.slice().forEach(function (cb) {
      try { cb(detail); } catch (e) { console.error('[GameBridge] onCellAction listener error', e); }
    });
  }

  // handleCellAction を非侵襲ラップ（function宣言の global binding を上書き）
  if (typeof handleCellAction === 'function') {
    const _origHandleCellAction = handleCellAction;
    // eslint-disable-next-line no-global-assign
    handleCellAction = function (row, col, action) {
      let allowed = true;
      if (_inputMode === 'LOCK') allowed = false;
      else if (_inputMode === 'GUIDED') {
        // 対象セル一致＋（typeが指定されていれば）操作タイプ一致のみ許可。
        // これにより「地雷マスへの旗」条件で、誤って掘削しても digCell が走らず誤爆を防ぐ。
        allowed = _guidedTargets.some(function (t) {
          return t.row === row && t.col === col && (!t.type || t.type === action);
        });
      }
      // 操作通知（許可/不許可いずれも通知。condition判定はエンジン側）
      _notify({ row: row, col: col, type: action, allowed: allowed });
      if (allowed) _origHandleCellAction(row, col, action);
    };
  } else {
    console.warn('[GameBridge] handleCellAction 不在：onCellAction/inputMode は無効');
  }

  // ---- call 用ホワイトリスト（§5-1） ---------------------------------------
  const ACTION_API = {};
  [
    ['digCell', typeof digCell === 'function' ? digCell : null],
    ['flagCell', typeof flagCell === 'function' ? flagCell : null],
    ['setMode', typeof setMode === 'function' ? setMode : null],
    ['giveHint', typeof giveHint === 'function' ? giveHint : null],
    ['focusNearestNumberCell', typeof focusNearestNumberCell === 'function' ? focusNearestNumberCell : null],
    ['playSE', typeof playSE === 'function' ? playSE : null],
    ['openSettingsMenu', typeof openSettingsMenu === 'function' ? openSettingsMenu : null]
  ].forEach(function (pair) { if (pair[1]) ACTION_API[pair[0]] = pair[1]; });

  function callApi(fn, args) {
    const f = ACTION_API[fn];
    if (typeof f !== 'function') {
      console.error('[GameBridge] ホワイトリスト外の関数呼び出し:', fn);
      return { ok: false, error: 'not-whitelisted' };
    }
    f.apply(null, args || []);
    return { ok: true };
  }

  // ---- 公開 ----------------------------------------------------------------
  window.GameBridge = {
    isBusy: isBusy,
    waitUntilIdle: waitUntilIdle,
    getCellScreenPosition: getCellScreenPosition,
    isCellVisible: isCellVisible,
    getCellState: getCellState,
    focusCell: focusCell,
    loadScenarioBoard: loadScenarioBoard,
    setInputMode: setInputMode,
    onCellAction: onCellAction,
    callApi: callApi,
    ACTION_API: ACTION_API,
    // メタ
    dims: function () { return { rows: ROWS, cols: COLS }; }
  };

  console.log('[GameBridge] ready. ACTION_API =', Object.keys(ACTION_API));
})();
