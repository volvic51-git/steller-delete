/* 全画面共通のBGM/SE音量管理。localStorageに保存し、画面をまたいで共有する。 */
(function(global){
  const KEY = 'stellarDeleteAudioSettings';
  const DEFAULT_VOLUME = 0.5;
  const listeners = [];
  let state = { bgm: DEFAULT_VOLUME, se: DEFAULT_VOLUME };

  function clamp01(v){
    v = Number(v);
    if(!isFinite(v)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, v));
  }

  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      state = {
        bgm: parsed && typeof parsed.bgm === 'number' ? clamp01(parsed.bgm) : DEFAULT_VOLUME,
        se:  parsed && typeof parsed.se  === 'number' ? clamp01(parsed.se)  : DEFAULT_VOLUME,
      };
    }catch(e){ state = { bgm: DEFAULT_VOLUME, se: DEFAULT_VOLUME }; }
    return state;
  }

  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
  }

  function notify(){
    listeners.forEach(fn => { try{ fn(state); }catch(e){} });
  }

  function getBgmVolume(){ return state.bgm; }
  function getSeVolume(){ return state.se; }

  function setBgmVolume(v){ state.bgm = clamp01(v); save(); notify(); }
  function setSeVolume(v){ state.se = clamp01(v); save(); notify(); }

  function subscribe(fn){
    listeners.push(fn);
    return function unsubscribe(){
      const i = listeners.indexOf(fn);
      if(i >= 0) listeners.splice(i, 1);
    };
  }

  load();

  global.AudioSettings = { getBgmVolume, getSeVolume, setBgmVolume, setSeVolume, subscribe };
})(window);
