/**
 * cutin-dialogue.js — カットイン会話データ・トリガー管理
 * 依存: cutin.js（先に読み込むこと）
 */
const Dialogue = (() => {
  let _data = null;
  let _fired = new Set();
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

  // ゲームからの状態通知。発火したイベントの完了Promise配列を返す（stage_clearの待ち合わせ用）
  function notify(type, payload){
    const promises = [];
    if(!_data) return promises;
    for(const ev of (_data.events || [])){
      if(_fired.has(ev.id)) continue;
      if(!_match(ev.trigger, type, payload || {})) continue;
      promises.push(_fire(ev));
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

  function _fire(ev){
    if(ev.once !== false) _fired.add(ev.id);        // 発火時に即登録（同tick二重発火防止）
    if(ev.type === 'warning'){                       // §14スタブ：データ形式のみ先行凍結
      console.warn('[Dialogue] warning演出は未実装のためスキップ:', ev.id);
      return Promise.resolve();
    }
    if(ev.trigger && ev.trigger.type === 'stage_clear') CutIn.clearPending(); // クリアは他を破棄して優先
    return CutIn.play(ev.lines || []);
  }

  function play(id){                                 // 手動発火（将来のイベント駆動API）
    if(!_data) return Promise.resolve();
    const ev = (_data.events || []).find(e => e.id === id);
    return ev ? _fire(ev) : Promise.resolve();
  }

  function reset(){ _fired.clear(); CutIn.cancel(); }          // RETRY時（dataは保持）
  function getFired(){ return Array.from(_fired); }             // saveSuspend用
  function restoreFired(ids){ (ids || []).forEach(i => _fired.add(i)); }

  return { load, notify, play, reset, getFired, restoreFired };
})();
