/*
 * Steller Solver — 盤面ソルバー（純関数・DOM/グローバル非依存）
 * ------------------------------------------------------------------
 * ゲーム本体・Board Factory・Verification・解析ツールで共通利用する。
 *
 * 設計方針（docs/00-Architecture.md / 20-BoardFormat.md に準拠）:
 *   - グローバル変数・DOM に一切依存しない。
 *   - 入力は「盤面データ」と「ルール（隣接の解釈）」のみ。
 *   - 隣接ルール（円柱ラップ等）は引数で受け取る（Board は隣接を知らない）。
 *
 * セルアクセスは cellAt(r,c) → { isMine, isOpen, hasFlag, isRemoved, neighborMines }
 * を返す関数で抽象化する。呼び出し側がどんな盤面表現を使っていても良い。
 *
 * セルキーは k = r*cols + c。返り値の Set/Map はこのキーで構成する。
 */
(function (global) {
  'use strict';

  // ===== 隣接（RuleSet） =====
  // 円柱: wrapCols=true（列方向ラップ）。トーラス: wrapRows も true。通常矩形: 両方 false。
  // 返り値は {r,c} 座標の配列（セル実体は返さない＝表現非依存）。
  function neighbors(r, c, rows, cols, wrapCols, wrapRows) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        let nr = r + dr, nc = c + dc;
        if (wrapRows) nr = ((nr % rows) + rows) % rows;
        else if (nr < 0 || nr >= rows) continue;
        if (wrapCols) nc = ((nc % cols) + cols) % cols;
        else if (nc < 0 || nc >= cols) continue;
        out.push({ r: nr, c: nc });
      }
    }
    return out;
  }

  // 地雷配置から近傍数字を計算するユーティリティ（Factory 用。ゲームは既存の値を渡す）。
  // isMineAt(r,c) → bool。返り値は (r*cols+c) → 近傍地雷数 の Map。
  function computeNeighborMines(rows, cols, isMineAt, wrapCols, wrapRows) {
    const map = new Map();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let n = 0;
        const nb = neighbors(r, c, rows, cols, wrapCols, wrapRows);
        for (const p of nb) if (isMineAt(p.r, p.c)) n++;
        map.set(r * cols + c, n);
      }
    }
    return map;
  }

  // ===== 制約ソルバー（SEARCH / 確率表示用） =====
  // opts = {
  //   rows, cols,
  //   mineCount,            // 盤面全体の地雷総数
  //   removedMines = 0,     // 既に除去済みの地雷数
  //   mode = 'full',        // 'basic' | 'logic' | 'full'
  //   wrapCols = true, wrapRows = false,
  //   cellAt(r,c) -> { isOpen, hasFlag, isRemoved, neighborMines }
  // }
  // 返り値: { safe:Set, mines:Set, probs:Map }  キーは r*cols+c。
  function runSolver(opts) {
    const rows = opts.rows, cols = opts.cols;
    const mineCount = opts.mineCount;
    const removedMines = opts.removedMines || 0;
    const mode = opts.mode || 'full';
    const wrapCols = opts.wrapCols !== false; // 既定: 円柱
    const wrapRows = !!opts.wrapRows;
    const cellAt = opts.cellAt;
    const key = (r, c) => r * cols + c;

    const safe = new Set(), mines = new Set();

    // 旗セルは既知地雷として計上（isRemoved は除く：removedMines に計上済み）
    let flaggedCount = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = cellAt(r, c);
      if (cell.hasFlag && !cell.isRemoved) flaggedCount++;
    }
    const allUnknown = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = cellAt(r, c);
      if (!cell.isOpen && !cell.hasFlag && !cell.isRemoved) allUnknown.push(key(r, c));
    }
    const remaining = mineCount - removedMines - flaggedCount;

    // ローカル制約のみ生成（全体制約を混ぜない）
    function buildLocalConstraints() {
      const cons = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cell = cellAt(r, c);
        if (!cell.isOpen) continue;
        const nbrs = neighbors(r, c, rows, cols, wrapCols, wrapRows);
        const unk = nbrs.filter(n => {
          const nc = cellAt(n.r, n.c), k = key(n.r, n.c);
          return !nc.isOpen && !nc.hasFlag && !nc.isRemoved && !mines.has(k) && !safe.has(k);
        });
        // isRemoved セルは neighborMines から除外済みなので km にも含めない
        const km = nbrs.filter(n => {
          const nc = cellAt(n.r, n.c);
          return !nc.isRemoved && (mines.has(key(n.r, n.c)) || nc.hasFlag);
        }).length;
        const eff = cell.neighborMines - km;
        if (unk.length === 0 || eff < 0) continue;
        cons.push({ cells: unk.map(n => key(n.r, n.c)), mines: eff });
      }
      return cons;
    }

    // LOGIC/FULL 用：全体制約を別途生成（ローカルと分離）
    function buildGlobalConstraint() {
      if (mode === 'basic') return null;
      const unk = allUnknown.filter(k => !mines.has(k) && !safe.has(k));
      const rem = remaining - mines.size;
      if (unk.length === 0 || rem < 0) return null;
      return { cells: unk, mines: rem };
    }

    // 確定ループ
    const maxPass = mode === 'full' ? 30 : mode === 'logic' ? 15 : 5;
    let changed = true, pass = 0;
    while (changed && pass < maxPass) {
      changed = false; pass++;
      const localCons = buildLocalConstraints();
      const globalCon = buildGlobalConstraint();
      const allCons = globalCon ? [...localCons, globalCon] : localCons;

      // Rule1/2
      for (const con of allCons) {
        if (con.mines === con.cells.length) con.cells.forEach(k => { if (!mines.has(k)) { mines.add(k); changed = true; } });
        if (con.mines === 0) con.cells.forEach(k => { if (!safe.has(k)) { safe.add(k); changed = true; } });
      }

      // Rule3: 部分集合推論
      for (let i = 0; i < allCons.length; i++) for (let j = 0; j < allCons.length; j++) {
        if (i === j) continue;
        const a = allCons[i], b = allCons[j];
        if (b.cells.length === 0 || b.cells.length >= a.cells.length) continue;
        const bSet = new Set(b.cells);
        if (!b.cells.every(k => a.cells.includes(k))) continue;
        const diff = a.cells.filter(k => !bSet.has(k));
        const dm = a.mines - b.mines;
        if (dm < 0 || dm > diff.length) continue;
        if (dm === diff.length) diff.forEach(k => { if (!mines.has(k)) { mines.add(k); changed = true; } });
        if (dm === 0) diff.forEach(k => { if (!safe.has(k)) { safe.add(k); changed = true; } });
      }
    }

    // FULL モード: CSP 全探索 - 連結成分ごとに分割して実行
    if (mode === 'full') {
      const localCons = buildLocalConstraints();

      const cellToCons = new Map();
      localCons.forEach((con, ci) => {
        con.cells.forEach(k => {
          if (!cellToCons.has(k)) cellToCons.set(k, []);
          cellToCons.get(k).push(ci);
        });
      });

      const visited = new Set();
      for (const startK of cellToCons.keys()) {
        if (visited.has(startK)) continue;
        const compCells = [], compConsSet = new Set();
        const queue = [startK];
        while (queue.length) {
          const k = queue.pop();
          if (visited.has(k)) continue;
          visited.add(k); compCells.push(k);
          (cellToCons.get(k) || []).forEach(ci => {
            if (compConsSet.has(ci)) return;
            compConsSet.add(ci);
            localCons[ci].cells.forEach(k2 => { if (!visited.has(k2)) queue.push(k2); });
          });
        }
        const compCons = [...compConsSet].map(ci => localCons[ci]);
        if (compCells.length === 0 || compCells.length > 24) continue;

        const n = compCells.length;
        const indexMap = new Map(compCells.map((k, i) => [k, i]));
        let validCount = 0;
        const safeCount = new Array(n).fill(0);
        const mineCount_ = new Array(n).fill(0);
        for (let mask = 0; mask < (1 << n); mask++) {
          let ok = true;
          for (const con of compCons) {
            let cnt = 0;
            for (const k of con.cells) {
              const idx = indexMap.get(k);
              if (idx !== undefined && (mask >> idx & 1)) cnt++;
            }
            if (cnt !== con.mines) { ok = false; break; }
          }
          if (!ok) continue;
          validCount++;
          for (let i = 0; i < n; i++) {
            if (mask >> i & 1) mineCount_[i]++;
            else safeCount[i]++;
          }
        }
        if (validCount > 0) {
          for (let i = 0; i < n; i++) {
            const k = compCells[i];
            if (mineCount_[i] === validCount && !mines.has(k)) mines.add(k);
            if (safeCount[i] === validCount && !safe.has(k)) safe.add(k);
          }
        }
      }
    }

    // 確率計算（ローカル制約のみ使用）
    const finalLocal = buildLocalConstraints();
    const probCount = new Map(), probTotal = new Map();
    for (const con of finalLocal) {
      if (con.cells.length === 0) continue;
      const p = con.mines / con.cells.length;
      con.cells.forEach(k => { probCount.set(k, (probCount.get(k) || 0) + 1); probTotal.set(k, (probTotal.get(k) || 0) + p); });
    }
    const unkLeft = allUnknown.filter(k => !mines.has(k) && !safe.has(k));
    const globalProb = unkLeft.length > 0 ? (remaining - mines.size) / unkLeft.length : 0;
    const probs = new Map();
    allUnknown.forEach(k => {
      if (mines.has(k)) { probs.set(k, 1.0); return; }
      if (safe.has(k)) { probs.set(k, 0.0); return; }
      probs.set(k, probCount.has(k) ? probTotal.get(k) / probCount.get(k) : globalProb);
    });

    return { safe, mines, probs };
  }

  // ===== 完全シミュレーション（保証盤面判定） =====
  // 指定の開始セルから論理のみで全クリアできるかを判定する。
  // opts = {
  //   rows, cols, mineCount,
  //   wrapCols = true, wrapRows = false,
  //   start: {r,c},
  //   cellAt(r,c) -> { isMine, neighborMines }
  // }
  // 返り値: bool（推測なしで全非地雷セルを開けるか）。
  function isSolvable(opts) {
    const rows = opts.rows, cols = opts.cols, mineCount = opts.mineCount;
    const wrapCols = opts.wrapCols !== false;
    const wrapRows = !!opts.wrapRows;
    const cellAt = opts.cellAt;
    const key = (r, c) => r * cols + c;

    const opened = new Set();
    const flagged = new Set();

    // 初手で開くセルをシミュレート（openCell の連鎖を模倣）
    function simOpen(r, c) {
      const k = key(r, c);
      if (opened.has(k)) return;
      opened.add(k);
      if (cellAt(r, c).neighborMines === 0) {
        neighbors(r, c, rows, cols, wrapCols, wrapRows).forEach(n => {
          if (!cellAt(n.r, n.c).isMine) simOpen(n.r, n.c);
        });
      }
    }
    simOpen(opts.start.r, opts.start.c);

    const maxIter = rows * cols;
    for (let iter = 0; iter < maxIter; iter++) {
      const safe = new Set(), mines = new Set();
      const flaggedCount = flagged.size;
      const remaining = mineCount - flaggedCount;

      // ローカル制約生成
      const cons = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (!opened.has(key(r, c))) continue;
        const nbrs = neighbors(r, c, rows, cols, wrapCols, wrapRows);
        const unk = nbrs.filter(n => {
          const k = key(n.r, n.c);
          return !opened.has(k) && !flagged.has(k);
        });
        const km = nbrs.filter(n => flagged.has(key(n.r, n.c))).length;
        const eff = cellAt(r, c).neighborMines - km;
        if (unk.length === 0 || eff < 0) continue;
        cons.push({ cells: unk.map(n => key(n.r, n.c)), mines: eff });
      }
      // 全体制約
      const unkAll = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const k = key(r, c);
        if (!opened.has(k) && !flagged.has(k)) unkAll.push(k);
      }
      if (unkAll.length > 0 && remaining >= 0) cons.push({ cells: unkAll, mines: remaining });

      // Rule1/2 + 部分集合
      let changed = false;
      for (const con of cons) {
        if (con.mines === con.cells.length) con.cells.forEach(k => { if (!mines.has(k)) { mines.add(k); changed = true; } });
        if (con.mines === 0) con.cells.forEach(k => { if (!safe.has(k)) { safe.add(k); changed = true; } });
      }
      for (let i = 0; i < cons.length; i++) for (let j = 0; j < cons.length; j++) {
        if (i === j) continue;
        const a = cons[i], b = cons[j];
        if (b.cells.length === 0 || b.cells.length >= a.cells.length) continue;
        const bSet = new Set(b.cells);
        if (!b.cells.every(k => a.cells.includes(k))) continue;
        const diff = a.cells.filter(k => !bSet.has(k));
        const dm = a.mines - b.mines;
        if (dm < 0 || dm > diff.length) continue;
        if (dm === diff.length) diff.forEach(k => { if (!mines.has(k)) { mines.add(k); changed = true; } });
        if (dm === 0) diff.forEach(k => { if (!safe.has(k)) { safe.add(k); changed = true; } });
      }

      if (!changed) break;

      // 確定セルを反映
      safe.forEach(k => {
        const r = Math.floor(k / cols), c = k % cols;
        simOpen(r, c);
      });
      mines.forEach(k => flagged.add(k));
    }

    // 全非地雷セルが開かれ、全地雷が旗で確定されたら解けた
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = key(r, c);
      if (cellAt(r, c).isMine && !flagged.has(k)) return false;
      if (!cellAt(r, c).isMine && !opened.has(k)) return false;
    }
    return true;
  }

  const StellerSolver = { neighbors, computeNeighborMines, runSolver, isSolvable };

  // UMD 風エクスポート（ブラウザ <script> / Worker / CommonJS）
  if (typeof module !== 'undefined' && module.exports) module.exports = StellerSolver;
  global.StellerSolver = StellerSolver;
})(typeof self !== 'undefined' ? self : this);
