/**
 * cutin-dialogue.js — カットイン会話データ・トリガー管理
 * 依存: cutin.js（先に読み込むこと）
 */
const Dialogue = (() => {
  let _data = null;
  let _fired = new Set();
  let _ruleHandler = null;   // ゲーム側が登録する type:"rule" 用コールバック（{action,ruleId,label}）
  // プレイ中（初手〜クリア確定の間）に発火し得るトリガー。これを1つでも含む
  // セットのステージはランキング対象外（manualは発火時期を静的判定できないため安全側）
  const IN_PLAY_TRIGGERS = new Set(['time', 'open_rate', 'mines_removed', 'manual']);

  async function load(setName){
    const res = await fetch('data/cutin/' + setName + '.json', {cache:'no-store'});
    if(!res.ok) throw new Error('[Dialogue] not found: ' + setName);
    _data = await res.json();
    window._cutinBlocksRanking =
      (_data.events || []).some(ev => IN_PLAY_TRIGGERS.has(ev.trigger && ev.trigger.type));
    CutIn.configure({ characters: _data.characters || {}, se: _data.se || {} });
    _preloadPortraits();
  }

  function _preloadPortraits(){    // 初表示時のデコードjank防止
    Object.values(_data.characters || {}).forEach(ch => {
      Object.values(ch.portraits || {}).forEach(f => { new Image().src = 'assets/images/cutin/' + f; });
    });
  }

  // ゲームからの状態通知。発火したイベントの完了Promise配列を返す（stage_clearの待ち合わせ用）。
  // 同一トリガーで複数イベントが一致した場合は、1つが完全に完了してから次を発火する
  // （同時に台詞・警告・ルールが重なって始まらないように直列チェーンで繋ぐ）。
  // onceの発火済み登録だけは即時（同tick二重発火防止）に行い、実際の演出呼び出し（_fire）を
  // チェーンで遅延させる。
  function notify(type, payload){
    const promises = [];
    if(!_data) return promises;
    let chain = Promise.resolve();
    for(const ev of (_data.events || [])){
      if(_fired.has(ev.id)) continue;
      if(!_match(ev.trigger, type, payload || {})) continue;
      if(ev.once !== false) _fired.add(ev.id);
      chain = chain.then(() => _fire(ev));
      promises.push(chain);
    }
    return promises;
  }

  function _match(t, type, p){
    if(!t || t.type !== type) return false;
    if(type === 'time')          return p.sec   >= (t.sec  ?? Infinity);
    if(type === 'open_rate')     return p.rate  >= (t.gte  ?? Infinity);
    if(type === 'mines_removed') return p.count >= (t.gte  ?? Infinity);
    return true;   // stage_start / stage_clear は型一致のみ（manualはnotify経由では発火しない）
  }

  // 実際の演出呼び出し（once登録はnotify/play側で済ませてから呼ぶこと）
  function _fire(ev){
    // クリア／負けイベント終了は他を破棄して優先（stage_overは他のトリガーが起き得ない負けイベント専用だが念のため統一）
    if(ev.trigger && (ev.trigger.type === 'stage_clear' || ev.trigger.type === 'stage_over')) CutIn.clearPending();
    // 演出タイプで振り分け（type省略/'dialogue' は従来の会話カットイン）
    if(ev.type === 'warning'){
      return CutIn.warn({ image: ev.image, variant: ev.variant, se: ev.se });
    }
    if(ev.type === 'collision'){
      return CutIn.animate({ type:'collision', left: ev.left, right: ev.right, se: ev.se, duration: ev.duration });
    }
    if(ev.type === 'shake'){
      return CutIn.animate({ type:'shake', side: ev.side, speaker: ev.speaker, portrait: ev.portrait, se: ev.se, duration: ev.duration });
    }
    if(ev.type === 'rule'){
      // ルール表示は常設ゲームHUD（RuleHudなど）の領分でcutin.jsには持たせない。
      // ゲーム側が登録したハンドラへ委譲し、その完了（スライドイン/アウトの演出完了）を
      // 待ってから次のイベントへ進む（ハンドラがPromiseを返さない場合も安全にフォールバック）。
      return _ruleHandler ? Promise.resolve(_ruleHandler(ev)) : Promise.resolve();
    }
    return CutIn.play(ev.lines || []);
  }

  function play(id){                                 // 手動発火（将来のイベント駆動API）
    if(!_data) return Promise.resolve();
    const ev = (_data.events || []).find(e => e.id === id);
    if(!ev) return Promise.resolve();
    if(ev.once !== false) _fired.add(ev.id);          // 発火時に即登録（同tick二重発火防止）
    return _fire(ev);
  }

  function reset(){ _fired.clear(); CutIn.cancel(); }          // RETRY時（dataは保持）
  function getFired(){ return Array.from(_fired); }             // saveSuspend用
  function restoreFired(ids){ (ids || []).forEach(i => _fired.add(i)); }
  function setRuleHandler(fn){ _ruleHandler = fn; }             // ゲーム側からRuleHud操作を登録

  return { load, notify, play, reset, getFired, restoreFired, setRuleHandler };
})();
