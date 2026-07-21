#!/usr/bin/env node
/*
 * Factory MAX CLI — 既存Factory盤面に地雷を探索的に追加し guess=0 維持限界を測る
 * ------------------------------------------------------------------
 * 使い方:
 *   node tool/board/factory-max.js --mode climb --pool data/board/30x64_24.json \
 *     --baseSeed index:0 --addSeed 777 --budget 200 --out tool/board/results
 *
 * 設計: etc/V3_FACTORY_MAX_PLAN.md（確定版）／ etc/V3_FACTORY_MAX_WORKORDER.md §5。
 * ロジック本体は factory-max-core.js（Node/Worker/ブラウザ共用の純関数）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('./factory-max-core.js');
const BoardGen = require('../../js/board-gen.js');

function parseArgs(argv) {
  const args = {
    mode: 'climb', baseSeed: 'index:0', addSeed: undefined,
    budget: 500, percents: '0.5,1,2,3', trials: 100, out: null, yes: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    switch (a) {
      case '--mode': args.mode = next(); break;
      case '--pool': args.pool = next(); break;
      case '--baseSeed': args.baseSeed = next(); break;
      case '--addSeed': args.addSeed = next(); break;
      case '--budget': args.budget = parseInt(next(), 10); break;
      case '--percents': args.percents = next(); break;
      case '--trials': args.trials = parseInt(next(), 10); break;
      case '--out': args.out = next(); break;
      case '--yes': case '-y': args.yes = true; break;
      case '--help': case '-h': args.help = true; break;
      default: throw new Error(`unknown argument: ${a}`);
    }
  }
  if (args.help) return args;
  if (!args.pool) throw new Error('--pool is required（例: --pool data/board/30x64_24.json）');
  if (!Number.isInteger(args.budget) || args.budget <= 0) throw new Error(`invalid --budget: ${args.budget}`);
  return args;
}

function printHelp() {
  console.log(`Factory MAX CLI

  node tool/board/factory-max.js --mode climb --pool <path> [options]

  --mode climb|sweep|resilience   既定 climb
  --pool <path>                   data/board/*.json（必須）
  --baseSeed index:N|<seed>|all   既定 index:0（climb/sweep用。resilienceは常に全seed）
  --addSeed <n>                   既定 未指定=ランダム発行（発行値を表示するので記録すること）
  --budget <n>                    既定 500（climb/resilience: isSolvable呼び出し回数上限）
  --percents <csv>                既定 0.5,1,2,3（sweep: 追加率%ポイントのリスト）
  --trials <n>                    既定 100（sweep: 各追加率の試行数）
  --out <dir>                     既定 tool/board/results
  -y, --yes                       確認プロンプトをスキップ（resilienceの実行時間見積り確認用）

例:
  node tool/board/factory-max.js --mode climb --pool data/board/30x64_24.json --addSeed 777 --budget 500
  node tool/board/factory-max.js --mode sweep --pool data/board/72x144_20.json --percents 0.5,1,2,3 --trials 100
  node tool/board/factory-max.js --mode resilience --pool data/board/30x64_24.json --budget 300 --yes
`);
}

function loadPool(poolPathArg) {
  const p = path.resolve(process.cwd(), poolPathArg);
  const pool = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(pool.boards) || pool.boards.length === 0) {
    throw new Error(`pool has no boards: ${p}`);
  }
  return { pool, poolPath: p };
}

function resolveBaseSeed(arg, boards) {
  if (arg === 'all') return 'all';
  if (arg.startsWith('index:')) {
    const idx = parseInt(arg.slice('index:'.length), 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= boards.length) {
      throw new Error(`--baseSeed index out of range: ${arg}（pool has ${boards.length} boards）`);
    }
    return boards[idx].seed;
  }
  const n = Number(arg);
  if (!Number.isFinite(n)) throw new Error(`invalid --baseSeed: ${arg}`);
  return n >>> 0;
}

function resolveAddSeed(arg) {
  if (arg === undefined) {
    const s = BoardGen.randomSeed();
    console.log(`[factory-max] --addSeed 未指定 → 自動発行: ${s}（再現するにはこの値を記録すること）`);
    return s;
  }
  const n = Number(arg);
  if (!Number.isFinite(n)) throw new Error(`invalid --addSeed: ${arg}`);
  return n >>> 0;
}

function ensureOutDir(outArg) {
  const dir = outArg ? path.resolve(process.cwd(), outArg) : path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function outBaseName(mode, poolPath, baseSeed, addSeed) {
  const poolName = path.basename(poolPath, '.json');
  return `factory-max_${mode}_${poolName}_${baseSeed}_${addSeed}`;
}

function historyToCsv(history) {
  const header = 'call,r,c,accepted,minesNow,densityNow,ms';
  const rows = history.map(h =>
    `${h.call},${h.candidate.r},${h.candidate.c},${h.accepted ? 1 : 0},${h.minesNow},${h.densityNow},${h.ms}`
  );
  return [header, ...rows].join('\n') + '\n';
}

function sweepTrialsToCsv(trials) {
  const header = 'pct,trial,baseSeed,addSeed,addCount,baseDensity,finalDensity,solvable,ms';
  const rows = trials.map(t =>
    `${t.pct},${t.t},${t.baseSeed},${t.addSeed},${t.addCount},${t.baseDensity.toFixed(4)},${t.finalDensity},${t.solvable ? 1 : 0},${t.ms}`
  );
  return [header, ...rows].join('\n') + '\n';
}

function resilienceToCsv(perSeed) {
  const header = 'rank,baseSeed,baseDensity,finalDensity,accepted,calls,interrupted';
  const rows = perSeed.map((s, i) =>
    `${i + 1},${s.baseSeed},${s.baseDensity.toFixed(4)},${s.finalDensity},${s.accepted},${s.calls},${s.interrupted ? 1 : 0}`
  );
  return [header, ...rows].join('\n') + '\n';
}

// 確認プロンプト（長時間バッチの実行前）。--yes で自動同意、非対話環境ならabort（自動承認はしない）。
async function confirmOrAbort(promptMsg, args) {
  if (args.yes) return true;
  if (!process.stdin.isTTY) {
    console.error(`[factory-max] ${promptMsg}`);
    console.error('[factory-max] 非対話環境のため、続行するには --yes を付けて再実行してください。');
    return false;
  }
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise(resolve => {
    rl.question(`${promptMsg} 続行しますか？ [y/N] `, ans => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

// ===== mode: climb =====
async function runClimbCommand(args) {
  const { pool, poolPath } = loadPool(args.pool);
  const baseSeed = resolveBaseSeed(args.baseSeed, pool.boards);
  if (baseSeed === 'all') throw new Error('--baseSeed all は --mode resilience 専用です');
  const addSeed = resolveAddSeed(args.addSeed);

  // baseDensity表示・進捗ETA用に先出しでベース情報だけ取得（isSolvableは呼ばない＝軽量）
  const baseInfo = core.buildBase({ pool, seed: baseSeed });
  console.log(`[factory-max] mode=climb pool=${path.basename(poolPath)} baseSeed=${baseSeed} addSeed=${addSeed} budget=${args.budget}`);
  console.log(`[factory-max] base: ${baseInfo.rows}x${baseInfo.cols} mines=${baseInfo.baseMines} density=${baseInfo.baseDensity.toFixed(2)}%`);

  let cancelled = false;
  const onSigint = () => {
    if (cancelled) {
      console.log('\n[factory-max] 2回目のCtrl+C → 強制終了');
      process.exit(130);
    }
    cancelled = true;
    console.log('\n[factory-max] 中断を受け付けました。現在の判定完了後、結果を保存して終了します…（もう一度Ctrl+Cで強制終了）');
  };
  process.on('SIGINT', onSigint);

  const result = await core.runClimb({
    pool, baseSeed, addSeed, budget: args.budget,
    checkCancelled: () => cancelled,
    onProgress: (entry, stats) => {
      if (stats.calls % 10 !== 0 && stats.calls !== stats.budget) return;
      const dens3 = core.formatDensity3(baseInfo.baseDensity, entry.densityNow);
      const elapsedSec = stats.elapsedMs / 1000;
      const avgMs = stats.elapsedMs / stats.calls;
      const etaSec = (avgMs * (stats.budget - stats.calls)) / 1000;
      console.log(`  calls=${stats.calls}/${stats.budget} accepted=${stats.accepted} density=${dens3} elapsed=${elapsedSec.toFixed(0)}s ETA=${etaSec.toFixed(0)}s`);
    }
  });
  process.removeListener('SIGINT', onSigint);

  const extraDensity = +(result.finalDensity - baseInfo.baseDensity).toFixed(4);
  const densityLabel = core.formatDensity3(baseInfo.baseDensity, result.finalDensity);

  const outDir = ensureOutDir(args.out);
  const base = outBaseName('climb', poolPath, baseSeed, addSeed);

  const summary = {
    tool: 'factory-max-explorer',
    mode: 'climb',
    addVersion: core.ADD_VERSION,
    genVersion: BoardGen.GEN_VERSION,
    args: { pool: path.basename(poolPath), baseSeed, addSeed, budget: args.budget },
    interrupted: result.interrupted,
    calls: result.calls, accepted: result.accepted, rejected: result.rejected,
    baseDensity: +baseInfo.baseDensity.toFixed(4),
    extraDensity, finalDensity: result.finalDensity,
    densityLabel,
    elapsedMs: +result.elapsed.toFixed(0),
    climbCurve: result.history.filter(h => h.accepted)
      .map(h => ({ call: h.call, minesNow: h.minesNow, densityNow: h.densityNow })),
    createdAt: new Date().toISOString()
  };
  const summaryPath = path.join(outDir, `${base}_summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  const historyPath = path.join(outDir, `${base}_history.csv`);
  fs.writeFileSync(historyPath, historyToCsv(result.history));

  const boardJson = await core.buildBoardJson({
    base: { rows: result.rows, cols: result.cols, start: result.start },
    mineSet: result.finalMineSet,
    meta: {
      mode: 'climb', basePool: path.basename(poolPath), baseSeed, addSeed, budget: args.budget,
      baseDensity: +baseInfo.baseDensity.toFixed(4), extraDensity, finalDensity: result.finalDensity,
      calls: result.calls, accepted: result.accepted, interrupted: result.interrupted, verified: true
    }
  });
  const boardPath = path.join(outDir, `${base}_best-board.json`);
  fs.writeFileSync(boardPath, JSON.stringify(boardJson, null, 2));

  console.log(`[factory-max] 完了${result.interrupted ? '（中断）' : ''}: calls=${result.calls} accepted=${result.accepted} rejected=${result.rejected}`);
  console.log(`[factory-max] density: ${densityLabel}`);
  console.log(`[factory-max] 出力:`);
  console.log(`  ${summaryPath}`);
  console.log(`  ${historyPath}`);
  console.log(`  ${boardPath}`);
}

// ===== mode: sweep（モードA・比較対照データ用） =====
// 各追加率pctについて trials 回試行。試行tは base=boards[t%boards.length]・addSeed=addSeedBase+t
// で決定論化（PLAN §3-3）。成功試行のうち最高密度の1枚を best-board として保存する。
async function runSweepCommand(args) {
  const { pool, poolPath } = loadPool(args.pool);
  const addSeedBase = resolveAddSeed(args.addSeed);
  const percents = args.percents.split(',').map(s => parseFloat(s.trim())).filter(n => Number.isFinite(n));
  if (percents.length === 0) throw new Error(`invalid --percents: ${args.percents}`);
  if (!Number.isInteger(args.trials) || args.trials <= 0) throw new Error(`invalid --trials: ${args.trials}`);

  const totalCells = pool.params.rows * pool.params.cols;
  const boards = pool.boards;
  console.log(`[factory-max] mode=sweep pool=${path.basename(poolPath)} percents=${percents.join(',')} trials=${args.trials} addSeedBase=${addSeedBase}`);

  let cancelled = false;
  const onSigint = () => {
    if (cancelled) { console.log('\n[factory-max] 2回目のCtrl+C → 強制終了'); process.exit(130); }
    cancelled = true;
    console.log('\n[factory-max] 中断を受け付けました。現在の追加率までの集計を保存して終了します…（もう一度Ctrl+Cで強制終了）');
  };
  process.on('SIGINT', onSigint);

  const pctResults = [];
  const allTrials = [];
  let best = null; // { finalDensity, baseSeed, addSeed, addCount, baseDensity }

  pctLoop:
  for (const pct of percents) {
    const addCount = Math.round(totalCells * pct / 100);
    let success = 0, sumDensity = 0, sumMs = 0, tested = 0;
    for (let t = 0; t < args.trials; t++) {
      if (cancelled) break pctLoop;
      const baseSeed = boards[t % boards.length].seed;
      const addSeed = addSeedBase + t;
      const trial = core.runSweepTrial({ pool, baseSeed, addSeed, addCount });
      allTrials.push({ pct, t, baseSeed, addSeed, addCount, baseDensity: trial.baseDensity, finalDensity: trial.finalDensity, solvable: trial.solvable, ms: trial.ms });
      tested++;
      if (trial.solvable) {
        success++;
        if (!best || trial.finalDensity > best.finalDensity) {
          best = { finalDensity: trial.finalDensity, baseSeed, addSeed, addCount, baseDensity: trial.baseDensity };
        }
      }
      sumDensity += trial.finalDensity; sumMs += trial.ms;
      await new Promise(resolve => setTimeout(resolve, 0)); // SIGINTをNodeが処理できるように1tick譲る
    }
    const rate = tested ? (success / tested * 100) : 0;
    pctResults.push({
      pct, addCount, tested, success, rate: +rate.toFixed(1),
      avgDensity: tested ? +(sumDensity / tested).toFixed(2) : 0,
      avgMs: tested ? +(sumMs / tested).toFixed(1) : 0
    });
    console.log(`  +${pct}% (add ${addCount}): ${success}/${tested} success (${rate.toFixed(1)}%)`);
  }
  process.removeListener('SIGINT', onSigint);

  const outDir = ensureOutDir(args.out);
  const base = outBaseName('sweep', poolPath, 'cycle', addSeedBase);

  const summary = {
    tool: 'factory-max-explorer', mode: 'sweep', addVersion: core.ADD_VERSION, genVersion: BoardGen.GEN_VERSION,
    args: { pool: path.basename(poolPath), percents, trials: args.trials, addSeedBase },
    interrupted: cancelled, results: pctResults, createdAt: new Date().toISOString()
  };
  const summaryPath = path.join(outDir, `${base}_summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  const trialsPath = path.join(outDir, `${base}_trials.csv`);
  fs.writeFileSync(trialsPath, sweepTrialsToCsv(allTrials));

  console.log(`[factory-max] 完了${cancelled ? '（中断）' : ''}`);
  console.log(`[factory-max] 出力:`);
  console.log(`  ${summaryPath}`);
  console.log(`  ${trialsPath}`);

  if (best) {
    const base2 = core.buildBase({ pool, seed: best.baseSeed });
    const mineSet = core.addMinesBulk({
      baseSet: base2.mineSet, count: best.addCount, addSeed: best.addSeed,
      rows: base2.rows, cols: base2.cols, exclude: base2.exclude
    });
    const boardJson = await core.buildBoardJson({
      base: { rows: base2.rows, cols: base2.cols, start: base2.start },
      mineSet,
      meta: {
        mode: 'sweep', basePool: path.basename(poolPath), baseSeed: best.baseSeed, addSeed: best.addSeed,
        addCount: best.addCount, baseDensity: +best.baseDensity.toFixed(4), finalDensity: best.finalDensity,
        extraDensity: +(best.finalDensity - best.baseDensity).toFixed(4), verified: true
      }
    });
    const boardPath = path.join(outDir, `${base}_best-board.json`);
    fs.writeFileSync(boardPath, JSON.stringify(boardJson, null, 2));
    console.log(`  ${boardPath}`);
    console.log(`[factory-max] 最高密度成功盤面: ${core.formatDensity3(best.baseDensity, best.finalDensity)}`);
  } else {
    console.log('[factory-max] 成功試行が無かったため best-board は保存していません');
  }
}

// ===== mode: resilience（モードB・盤面別耐性） =====
// プールの各seedに対して同一budget・同一addSeedでclimbを実行し、到達finalDensityでランク付けする。
// addSeedを固定するのは「同じ追加パターンで、base盤面の違いだけを比較する」ため（PLAN §3-2）。
async function runResilienceCommand(args) {
  const { pool, poolPath } = loadPool(args.pool);
  const addSeed = resolveAddSeed(args.addSeed);
  const boards = pool.boards;

  const sampleBase = core.buildBase({ pool, seed: boards[0].seed });
  const sampleCheck = core.checkSolvable({
    rows: sampleBase.rows, cols: sampleBase.cols, mineSet: sampleBase.mineSet,
    start: sampleBase.start, wrapCols: sampleBase.wrapCols, wrapRows: sampleBase.wrapRows
  });
  const estTotalMs = boards.length * args.budget * sampleCheck.ms;
  console.log(`[factory-max] mode=resilience pool=${path.basename(poolPath)} boards=${boards.length} budget=${args.budget} addSeed=${addSeed}`);
  console.log(`[factory-max] 見積り実行時間: 約${(estTotalMs / 1000 / 60).toFixed(1)}分（1判定サンプル${sampleCheck.ms.toFixed(0)}ms基準。密度上昇で1回あたりは伸びる傾向があるため下限見積り）`);

  const proceed = await confirmOrAbort('この見積りで', args);
  if (!proceed) { console.log('[factory-max] 中止しました。'); return; }

  let cancelled = false;
  const onSigint = () => {
    if (cancelled) { console.log('\n[factory-max] 2回目のCtrl+C → 強制終了'); process.exit(130); }
    cancelled = true;
    console.log('\n[factory-max] 中断を受け付けました。現在のseedのクライム完了後、結果を保存して終了します…（もう一度Ctrl+Cで強制終了）');
  };
  process.on('SIGINT', onSigint);

  const perSeed = [];
  let bestClimb = null; // { result, baseSeed }
  for (let i = 0; i < boards.length; i++) {
    if (cancelled) break;
    const baseSeed = boards[i].seed;
    console.log(`[factory-max] [${i + 1}/${boards.length}] baseSeed=${baseSeed} クライム開始`);
    const result = await core.runClimb({
      pool, baseSeed, addSeed, budget: args.budget,
      checkCancelled: () => cancelled,
      onProgress: (entry, stats) => {
        if (stats.calls % 20 === 0 || stats.calls === stats.budget) {
          console.log(`    calls=${stats.calls}/${stats.budget} density=${entry.densityNow.toFixed(2)}%`);
        }
      }
    });
    perSeed.push({
      baseSeed, baseDensity: result.baseDensity, finalDensity: result.finalDensity,
      accepted: result.accepted, calls: result.calls, interrupted: result.interrupted
    });
    if (!bestClimb || result.finalDensity > bestClimb.result.finalDensity) bestClimb = { result, baseSeed };
    console.log(`    → final density ${result.finalDensity.toFixed(2)}% (accepted ${result.accepted}/${result.calls})`);
  }
  process.removeListener('SIGINT', onSigint);

  perSeed.sort((a, b) => b.finalDensity - a.finalDensity);

  const outDir = ensureOutDir(args.out);
  const base = outBaseName('resilience', poolPath, 'all', addSeed);

  const summary = {
    tool: 'factory-max-explorer', mode: 'resilience', addVersion: core.ADD_VERSION, genVersion: BoardGen.GEN_VERSION,
    args: { pool: path.basename(poolPath), budget: args.budget, addSeed },
    interrupted: cancelled, tested: perSeed.length, ranking: perSeed, createdAt: new Date().toISOString()
  };
  const summaryPath = path.join(outDir, `${base}_summary.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  const rankingPath = path.join(outDir, `${base}_ranking.csv`);
  fs.writeFileSync(rankingPath, resilienceToCsv(perSeed));

  console.log(`[factory-max] 完了${cancelled ? '（中断）' : ''}: ${perSeed.length}/${boards.length} seed測定`);
  console.log(`[factory-max] 出力:`);
  console.log(`  ${summaryPath}`);
  console.log(`  ${rankingPath}`);

  if (bestClimb) {
    const boardJson = await core.buildBoardJson({
      base: { rows: bestClimb.result.rows, cols: bestClimb.result.cols, start: bestClimb.result.start },
      mineSet: bestClimb.result.finalMineSet,
      meta: {
        mode: 'resilience', basePool: path.basename(poolPath), baseSeed: bestClimb.baseSeed, addSeed, budget: args.budget,
        baseDensity: +bestClimb.result.baseDensity.toFixed(4),
        extraDensity: +(bestClimb.result.finalDensity - bestClimb.result.baseDensity).toFixed(4),
        finalDensity: bestClimb.result.finalDensity,
        calls: bestClimb.result.calls, accepted: bestClimb.result.accepted,
        interrupted: bestClimb.result.interrupted, verified: true
      }
    });
    const boardPath = path.join(outDir, `${base}_best-board.json`);
    fs.writeFileSync(boardPath, JSON.stringify(boardJson, null, 2));
    console.log(`  ${boardPath}`);
    console.log(`[factory-max] 最高耐性seed=${bestClimb.baseSeed}: ${core.formatDensity3(bestClimb.result.baseDensity, bestClimb.result.finalDensity)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }
  if (args.mode === 'climb') {
    await runClimbCommand(args);
  } else if (args.mode === 'sweep') {
    await runSweepCommand(args);
  } else if (args.mode === 'resilience') {
    await runResilienceCommand(args);
  } else {
    throw new Error(`unknown --mode: ${args.mode}（climb / sweep / resilience）`);
  }
}

main().catch(err => {
  console.error('[factory-max] ERROR:', err.message);
  process.exitCode = 1;
});
