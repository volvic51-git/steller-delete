/*
 * Steller Board Generator — 盤面生成器（決定論・純関数・DOM/グローバル非依存）
 * ------------------------------------------------------------------
 * ゲーム本体・Board Hunter・Board Factory で共通利用する「唯一の生成器」。
 * 同じ (seed, genVersion, params) からは、どこで呼んでも完全に同一の盤面が出る
 * （= パリティ）。これがリプレイ・中断・Factory盤面の再現性の土台。
 *
 * 設計（docs/00-Architecture.md Traceability / etc/V2_GENERATION_ENGINE.md）:
 *   - Math.random は使わない。乱数は必ず seed から mulberry32 で生成する。
 *   - 隣接ルール（円柱ラップ等）は引数で受け取る（Board は隣接を知らない）。
 *   - 生成ロジックを1行でも変えたら GEN_VERSION を上げる（互換契約）。
 *
 * ★重要: 生成アルゴリズムは sphere-minesweeper.html の旧 placeMines と
 *   Board Hunter の generateMines に「バイト単位で一致」させてある。
 *   ここを変更したら GEN_VERSION を必ず上げること。
 */
(function (global) {
  'use strict';

  // 生成アルゴリズムのバージョン。ロジックを変えたら必ず +1（保存済みリプレイとの互換契約）。
  const GEN_VERSION = "1";

  // ---- 決定論PRNG（mulberry32）: seed から同一乱数列を再現 ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 32bit ランダム seed（新規ゲーム開始時の seed 発行用）
  function randomSeed() {
    return (Math.random() * 4294967296) >>> 0;
  }

  // ---- 開始セル周囲（3x3）の除外集合 ----
  // 旧 placeMines と同一: 列は常にラップ (wrapCols)、行はラップしない (wrapRows) が既定。
  function excludeZone(rows, cols, sr, sc, wrapCols, wrapRows) {
    const ex = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        let nr = sr + dr, nc = sc + dc;
        if (wrapRows) nr = ((nr % rows) + rows) % rows;
        else if (nr < 0 || nr >= rows) continue;
        if (wrapCols) nc = ((nc % cols) + cols) % cols;
        else if (nc < 0 || nc >= cols) continue;
        ex.add(nr * cols + nc);
      }
    }
    return ex;
  }

  // ---- 地雷集合の生成（唯一の配置ロジック） ----
  // opts = {
  //   rows, cols, mineCount,
  //   start: {r,c},              // 除外中心（初手セル）
  //   seed,                      // 決定論シード
  //   wrapCols = true, wrapRows = false
  // }
  // 返り値: Set<number>  キーは r*cols+c
  //
  // ★旧 placeMines と完全一致させること:
  //   ・除外は開始セルの3x3（列ラップ）
  //   ・mineCount は maxMines にクランプ
  //   ・配置ループは while で r=floor(rng*rows), c=floor(rng*cols) の順
  function generateMineSet(opts) {
    const rows = opts.rows, cols = opts.cols;
    const sr = opts.start.r, sc = opts.start.c;
    const wrapCols = opts.wrapCols !== false; // 既定: 円柱
    const wrapRows = !!opts.wrapRows;
    const rng = mulberry32(opts.seed);

    const exclude = excludeZone(rows, cols, sr, sc, wrapCols, wrapRows);
    const maxMines = rows * cols - exclude.size;
    const actualMines = Math.min(opts.mineCount, maxMines);

    const mines = new Set();
    let placed = 0, guard = 0;
    const guardMax = actualMines * 1000 + 100000; // 無限ループ保険（正常時は発火しない）
    while (placed < actualMines && guard < guardMax) {
      guard++;
      const r = Math.floor(rng() * rows);
      const c = Math.floor(rng() * cols);
      const k = r * cols + c;
      if (!mines.has(k) && !exclude.has(k)) { mines.add(k); placed++; }
    }
    return mines;
  }

  // ---- Board JSON 相当のオブジェクトを返す（Factory/保存用の便利関数） ----
  // 20-BoardFormat.md の board ブロック相当。ゲーム本体は generateMineSet を使えば十分。
  function generateBoard(opts) {
    const rows = opts.rows, cols = opts.cols;
    const set = generateMineSet(opts);
    const mines = [...set].map(k => ({ r: Math.floor(k / cols), c: k % cols }))
      .sort((a, b) => a.r - b.r || a.c - b.c);
    return {
      genVersion: GEN_VERSION,
      seed: opts.seed,
      rows, cols,
      mineCount: opts.mineCount,
      start: { r: opts.start.r, c: opts.start.c },
      wrapCols: opts.wrapCols !== false,
      wrapRows: !!opts.wrapRows,
      mines
    };
  }

  const StellerBoardGen = { GEN_VERSION, mulberry32, randomSeed, excludeZone, generateMineSet, generateBoard };

  if (typeof module !== 'undefined' && module.exports) module.exports = StellerBoardGen;
  global.StellerBoardGen = StellerBoardGen;
})(typeof self !== 'undefined' ? self : this);
