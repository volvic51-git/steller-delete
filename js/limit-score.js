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
  function computeBonusMult(settings, config){
    const timeMult = tableLookup(config.time, settings.tl, 1);
    const lpMult   = loopMult(settings.lp, config.loop);
    const hintMult = tableLookup(config.hint, settings.hint, 1);
    const nfMult   = settings.nf ? config.noflag.on : config.noflag.off;
    return timeMult * lpMult * hintMult * nfMult;
  }

  function computeScore(boardId, settings, config){
    const board = config.boards[String(boardId)];
    const base = board ? board.baseScore : 0;
    return base * computeBonusMult(settings, config);
  }

  function optionPercent(mult){
    return Math.round(mult * 100) + '%';
  }

  function formatBonus(mult){
    return '×' + mult.toFixed(1);
  }

  // 億未満はカンマ区切り整数、以上は日本語単位（万〜無量大数）。
  // 表示単位の小数第3位未満は切り捨て（四捨五入しない）。
  function formatScore(score, config){
    const th = Math.pow(10, config.unitThresholdExp);
    if(score < th){
      return Math.floor(score).toLocaleString('en-US');
    }
    const units = config.units.slice().sort((a, b) => a.exp - b.exp);
    let unit = units[0];
    for(const u of units){ if(Math.pow(10, u.exp) <= score) unit = u; else break; }
    const scale = Math.pow(10, unit.exp);
    const v = Math.floor((score / scale) * 1000) / 1000; // 第3位以下切り捨て
    return v.toFixed(3) + ' ' + unit.name;
  }

  function difficultyStars(bonusMult, config){
    const buckets = config.difficultyStars.slice().sort((a, b) => a.min - b.min);
    let stars = buckets.length ? buckets[0].stars : 1;
    for(const b of buckets){ if(bonusMult >= b.min) stars = b.stars; else break; }
    return stars;
  }

  return {
    computeBonusMult, computeScore, optionPercent, formatBonus,
    formatScore, difficultyStars, loopMult, factorMult: tableLookup
  };
})();
