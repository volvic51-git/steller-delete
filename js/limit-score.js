/**
 * limit-score.js — LIMIT MODEのスコア計算（純関数のみ・数値定数を一切持たない）
 * 依存なし。config は data/limit-config.json を fetch したオブジェクトをそのまま渡す。
 * index.html（設定画面のリアルタイム表示）と sphere-minesweeper.html（クリア確定）で共用。
 */
window.LimitScore = (() => {

  function tableLookup(table, key, fallback){
    const v = table[String(key)];
    return v !== undefined ? v : fallback;
  }

  // 周回倍率：config.loop.table に完全一致すればそれを使う。
  // 無い場合（+10/+100で作られた値）はtable内の最大キーから perExtraLoopGrowth で外挿する。
  function loopMult(loops, loopCfg){
    const n = Math.max(loopCfg.minLoops, Math.min(loopCfg.maxLoops, Math.round(loops)));
    const exact = loopCfg.table[String(n)];
    if(exact !== undefined) return exact;
    const keys = Object.keys(loopCfg.table).map(Number).sort((a, b) => a - b);
    const maxKey = keys[keys.length - 1];
    if(n > maxKey){
      const maxVal = loopCfg.table[String(maxKey)];
      return maxVal * Math.pow(loopCfg.perExtraLoopGrowth, n - maxKey);
    }
    let lowerKey = keys[0];
    for(const k of keys){ if(k <= n) lowerKey = k; else break; }
    return loopCfg.table[String(lowerKey)];
  }

  // settings = { tl, lp, hint, nf(bool) }
  // NoFlag ONの時は「NoFlag以外の合計倍率」自体をNoFlagの倍率として使う（＝他の合計倍率を2乗する）。
  // OFFの時はconfig.noflag.off（通常1.0）をそのまま掛けるだけ。
  function computeBonusMult(settings, config){
    const timeMult  = tableLookup(config.time, settings.tl, 1);
    const lpMult    = loopMult(settings.lp, config.loop);
    const hintMult  = tableLookup(config.hint, settings.hint, 1);
    const otherMult = timeMult * lpMult * hintMult;
    const nfMult    = settings.nf ? otherMult : config.noflag.off;
    return otherMult * nfMult;
  }

  function computeScore(boardId, settings, config){
    const board = config.boards[String(boardId)];
    const base = board ? board.baseScore : 0;
    return base * computeBonusMult(settings, config);
  }

  function optionPercent(mult){
    return Math.round(mult * 100) + '%';
  }

  // Number.prototype.toFixedは10^21以上だと指数表記のtoString相当にフォールバックして
  // 表示が崩れるため、NoFlag(2乗)込みで巨大化しうるbonusMultは指数表記に切り替える。
  function formatBonus(mult){
    if(mult >= 1e15) return '×' + mult.toExponential(2);
    return '×' + mult.toFixed(1);
  }

  // 億未満はカンマ区切り整数（unit1=''・count2=null）。
  // 億以上は「上位の単位＋その4桁ぶんの数」＋「1段下の単位＋その4桁ぶんの数」の2組に分けて返す
  // （config.unitsはexpが4刻み＝万進法と同じ桁区切りで並んでいる前提）。
  // 1段下の単位が無い場合（=億そのものの桁の場合）はunit2=''になり、count2はそのまま
  // 素の数字として表示される（日本語の慣習で億未満に単位を付けないのと同じ形）。
  // number/unitを別々に表示したい場面（ランキング一覧の2行表示など）向けに、
  // formatScoreはこれを組み合わせるだけにする。
  function formatScoreParts(score, config){
    const th = Math.pow(10, config.unitThresholdExp);
    if(score < th){
      return { count1: Math.floor(score).toLocaleString('en-US'), unit1: '', count2: null, unit2: '' };
    }
    const units = config.units.slice().sort((a, b) => a.exp - b.exp);
    let unit1 = units[0];
    for(const u of units){ if(Math.pow(10, u.exp) <= score) unit1 = u; else break; }
    const scale1 = Math.pow(10, unit1.exp);
    const count1 = Math.floor(score / scale1);
    const remainder = score - count1 * scale1;
    const scale2 = Math.pow(10, unit1.exp - 4);
    const count2 = Math.floor(remainder / scale2);
    const unit2Obj = units.find(u => u.exp === unit1.exp - 4);
    // count1/count2は単位付きの4桁枠（0〜9999）なのでカンマ区切りにしない
    // （カンマ区切りにするのは単位なしの生の整数＝億未満のcount1だけ）。
    return {
      count1: String(count1), unit1: unit1.name,
      count2: String(count2), unit2: unit2Obj ? unit2Obj.name : ''
    };
  }

  function formatScore(score, config){
    const { count1, unit1, count2, unit2 } = formatScoreParts(score, config);
    if(count2 === null) return count1 + '点'; // 億未満：単位なしの整数のまま
    return `${count1}${unit1}${count2}${unit2}点`;
  }

  return {
    computeBonusMult, computeScore, optionPercent, formatBonus,
    formatScore, formatScoreParts, loopMult, factorMult: tableLookup
  };
})();
