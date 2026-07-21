/*
 * Factory MAX — 探索的地雷追加アルゴリズム（純関数・DOM/グローバル非依存）
 * ------------------------------------------------------------------
 * 既存Factory盤面（seedプール）へ地雷を追加し、guess=0（isSolvable）を維持したまま
 * どこまで密度を上げられるかを測る研究用コア。Node CLI / Worker / ブラウザ共用。
 *
 * 設計: etc/V3_FACTORY_MAX_PLAN.md（確定版）／ etc/V3_FACTORY_MAX_WORKORDER.md §2・§4。
 *
 * ★絶対制約: js/solver.js・js/board-gen.js は require するだけで、
 *   ロジックの再実装・改変は一切しない（isSolvable は認定基準そのもの）。
 * ★決定論契約: 追加地雷の選択アルゴリズム（候補列構築・シャッフル）を1文字でも変えたら
 *   ADD_VERSION を上げること（Factory MAX盤面のseed拡張形式の再現性契約）。
 */
(function (global) {
  'use strict';

  const ADD_VERSION = "1";

  const BoardGen = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('../../js/board-gen.js') : global.StellerBoardGen;
  const Solver = (typeof module !== 'undefined' && typeof require === 'function')
    ? require('../../js/solver.js') : global.StellerSolver;

  // ===== プールJSON + seed → 基礎盤面データ =====
  // o = { pool, seed }  pool = data/board/*.json をパースしたオブジェクト（seedプール形式）
  // 返り値: { rows, cols, start, wrapCols, wrapRows, totalCells, exclude, mineSet, baseMines, baseDensity, seed }
  function buildBase(o) {
    const pool = o.pool;
    const P = pool.params;
    if (P.wrap !== 'cyl') {
      throw new Error(`unsupported wrap: "${P.wrap}"（本プールは全て cyl 前提。他値が来たら停止）`);
    }
    if (String(pool.genVersion) !== BoardGen.GEN_VERSION) {
      throw new Error(`genVersion mismatch: pool=${pool.genVersion} board-gen.js=${BoardGen.GEN_VERSION}`);
    }
    const rows = P.rows, cols = P.cols, start = P.start;
    const wrapCols = true, wrapRows = false;
    const totalCells = rows * cols;
    const exclude = BoardGen.excludeZone(rows, cols, start.r, start.c, wrapCols, wrapRows);
    const mineSet = BoardGen.generateMineSet({
      rows, cols, mineCount: P.mineCount, start, seed: o.seed, wrapCols, wrapRows
    });
    const baseMines = mineSet.size;
    const baseDensity = baseMines / totalCells * 100;
    return { rows, cols, start, wrapCols, wrapRows, totalCells, exclude, mineSet, baseMines, baseDensity, seed: o.seed };
  }

  // ===== neighborMinesフル再計算 + isSolvable判定（正確性優先・差分更新はしない） =====
  // o = { rows, cols, mineSet, start, wrapCols, wrapRows }
  // 返り値: { solvable, ms }
  function checkSolvable(o) {
    const nm = Solver.computeNeighborMines(o.rows, o.cols,
      (r, c) => o.mineSet.has(r * o.cols + c), o.wrapCols, o.wrapRows);
    const t0 = performance.now();
    const solvable = Solver.isSolvable({
      rows: o.rows, cols: o.cols,
      mineCount: o.mineSet.size,        // ★追加後の実数。外から別途渡さない
      wrapCols: o.wrapCols, wrapRows: o.wrapRows,
      start: o.start,
      cellAt: (r, c) => {
        const k = r * o.cols + c;
        return { isMine: o.mineSet.has(k), neighborMines: nm.get(k) };
      }
    });
    return { solvable, ms: performance.now() - t0 };
  }

  // ===== ランダム一括追加（モードA用） =====
  // generateMineSet の配置ループと同じ様式（while + floor(rng*rows/cols)）で固定。
  // o = { baseSet, count, addSeed, rows, cols, exclude }
  // 返り値: Set<number>（baseSetを変更せず新しいSetを返す）
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

  // ===== モードA: ランダム一括追加 1試行 =====
  // o = { pool, baseSeed, addSeed, addCount }
  function runSweepTrial(o) {
    const base = buildBase({ pool: o.pool, seed: o.baseSeed });
    const mineSet = addMinesBulk({
      baseSet: base.mineSet, count: o.addCount, addSeed: o.addSeed,
      rows: base.rows, cols: base.cols, exclude: base.exclude
    });
    const result = checkSolvable({
      rows: base.rows, cols: base.cols, mineSet, start: base.start,
      wrapCols: base.wrapCols, wrapRows: base.wrapRows
    });
    return {
      baseSeed: o.baseSeed, addSeed: o.addSeed, addCount: o.addCount,
      rows: base.rows, cols: base.cols, totalCells: base.totalCells,
      baseMines: base.baseMines, baseDensity: base.baseDensity,
      finalMines: mineSet.size,
      finalDensity: +(mineSet.size / base.totalCells * 100).toFixed(4),
      solvable: result.solvable, ms: +result.ms.toFixed(3)
    };
  }

  // イベントループへ1tick戻す（SIGINT等のシグナルをNodeが処理できるようにするためだけの待機。
  // 決定論の計算内容には一切影響しない＝再現性テストの値は同期版と完全一致する）。
  function yieldToEventLoop() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  // ===== モードC: 漸増クライム（Factory MAX研究の本体） =====
  // 1個ずつ追加→isSolvable→失敗なら戻す、を budget 回まで繰り返す。
  // 候補列の構築・シャッフル・採否判定は決定論固定（この中身を変えたら ADD_VERSION を上げること）。
  // ★async: 各判定後にイベントループへ制御を戻す（SIGINTで安全に中断できるようにするため）。
  //   これは実行タイミングの都合であり、候補順序・判定結果には一切影響しない。
  // o = { pool, baseSeed, addSeed, budget, onProgress, checkCancelled }
  // 返り値: Promise<{ history, accepted, rejected, calls, finalMines, finalDensity, interrupted, ... }>
  async function runClimb(o) {
    const base = buildBase({ pool: o.pool, seed: o.baseSeed });
    const { rows, cols, start, wrapCols, wrapRows, totalCells, exclude } = base;
    const mineSet = new Set(base.mineSet);

    const baseline = checkSolvable({ rows, cols, mineSet, start, wrapCols, wrapRows });
    if (!baseline.solvable) {
      throw new Error(`base board is not solvable (baseSeed=${o.baseSeed})。プール盤面が不正の疑い`);
    }

    // 候補列: k昇順で「非地雷 かつ 除外帯以外」→ Fisher–Yatesシャッフル（この順序で固定）
    const rng = BoardGen.mulberry32(o.addSeed);
    const candidates = [];
    for (let k = 0; k < totalCells; k++) {
      if (!mineSet.has(k) && !exclude.has(k)) candidates.push(k);
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }

    const history = [];
    let calls = 0, accepted = 0, rejected = 0, interrupted = false;
    const t0 = performance.now();
    for (const k of candidates) {
      if (calls >= o.budget) break;
      if (typeof o.checkCancelled === 'function' && o.checkCancelled()) { interrupted = true; break; }
      mineSet.add(k);
      calls++;
      const result = checkSolvable({ rows, cols, mineSet, start, wrapCols, wrapRows });
      const entry = {
        call: calls,
        candidate: { r: Math.floor(k / cols), c: k % cols },
        accepted: result.solvable,
        minesNow: mineSet.size,
        densityNow: +(mineSet.size / totalCells * 100).toFixed(4),
        ms: +result.ms.toFixed(3)
      };
      history.push(entry);
      if (result.solvable) accepted++;
      else { mineSet.delete(k); rejected++; }
      if (typeof o.onProgress === 'function') {
        o.onProgress(entry, { calls, accepted, rejected, budget: o.budget, elapsedMs: performance.now() - t0 });
      }
      await yieldToEventLoop();
    }
    const elapsed = performance.now() - t0;

    return {
      baseSeed: o.baseSeed, addSeed: o.addSeed, budget: o.budget,
      rows, cols, start, wrapCols, wrapRows, totalCells,
      baseMines: base.baseMines, baseDensity: base.baseDensity,
      history, accepted, rejected, calls, interrupted,
      finalMineSet: mineSet,
      finalMines: mineSet.size,
      finalDensity: +(mineSet.size / totalCells * 100).toFixed(4),
      elapsed
    };
  }

  // ===== base/extra/final の統一密度表示（3点セット） =====
  function formatDensity3(baseDensity, finalDensity) {
    const extra = finalDensity - baseDensity;
    const f = n => n.toFixed(1);
    return `${f(baseDensity)}% / +${f(extra)}% / ${f(finalDensity)}%`;
  }

  // ===== 成功盤面の保存用Board JSON（mines直接収載＋hash。board-factory.htmlと同形式） =====
  // o = { base:{rows,cols,start}, mineSet, meta:{mode,basePool,baseSeed,addSeed,budget,
  //       baseDensity,extraDensity,finalDensity} }
  // 返り値: Promise<{ board:{rows,cols,mineCount,wrap,startCell,mines,hash}, meta:{...} }>
  async function buildBoardJson(o) {
    const { rows, cols, start } = o.base;
    const wrap = 'cyl';
    const mineCount = o.mineSet.size;
    const mines = [...o.mineSet].sort((a, b) => a - b).map(k => ({ r: Math.floor(k / cols), c: k % cols }));
    const hash = await BoardGen.hashBoard({ rows, cols, mineCount, wrap, startCell: start, mines });
    return {
      board: { rows, cols, mineCount, wrap, startCell: start, mines, hash },
      meta: Object.assign({
        tool: 'factory-max-explorer',
        addVersion: ADD_VERSION,
        createdAt: new Date().toISOString()
      }, o.meta)
    };
  }

  const FactoryMaxCore = {
    ADD_VERSION, buildBase, checkSolvable, addMinesBulk,
    runSweepTrial, runClimb, buildBoardJson, formatDensity3
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FactoryMaxCore;
  global.FactoryMaxCore = FactoryMaxCore;
})(typeof self !== 'undefined' ? self : this);
