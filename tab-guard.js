(function () {
  let ch;
  try { ch = new BroadcastChannel('stellar-delete-tab'); } catch (e) { return; }

  // sessionStorage でタブIDを管理
  // 同一タブ内のページ遷移では同じIDが維持される。タブを閉じるとリセットされる。
  let tabId = sessionStorage.getItem('_sdTabId');
  if (!tabId) {
    tabId = Date.now() + '_' + Math.random().toString(36).slice(2);
    sessionStorage.setItem('_sdTabId', tabId);
  }

  let duplicate = false;

  function showDuplicateOverlay() {
    duplicate = true;
    document.documentElement.style.overflow = 'hidden';
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:rgba(0,5,20,0.97)',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'text-align:center', 'padding:24px', 'box-sizing:border-box'
    ].join(';');
    el.innerHTML =
      '<div style="color:#00ffff;font-family:\'Orbitron\',sans-serif;font-size:clamp(16px,4vw,22px);letter-spacing:.2em;margin-bottom:24px;">STELLAR DELETE</div>' +
      '<div style="color:#ff8800;font-family:\'Orbitron\',sans-serif;font-size:clamp(12px,3vw,16px);letter-spacing:.15em;margin-bottom:16px;">ALREADY RUNNING</div>' +
      '<div style="color:#aabbcc;font-family:\'Share Tech Mono\',monospace;font-size:clamp(11px,2.5vw,13px);line-height:1.8;margin-bottom:32px;">別のタブで起動中です<br>元のタブに戻ってください</div>' +
      '<div style="color:#00ccff;font-family:\'Share Tech Mono\',monospace;font-size:clamp(11px,2.5vw,13px);">タブを手動で閉じてください</div>';
    if (document.body) {
      document.body.appendChild(el);
    } else {
      document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(el); });
    }
  }

  ch.addEventListener('message', function (e) {
    if (!e.data || typeof e.data !== 'object') return;
    // 自分と異なるタブIDのcheckにのみ応答する
    if (e.data.type === 'check' && e.data.tabId !== tabId) {
      ch.postMessage({ type: 'alive', tabId: tabId });
    } else if (e.data.type === 'alive' && e.data.tabId !== tabId && !duplicate) {
      clearTimeout(timer);
      showDuplicateOverlay();
    }
  });

  var timer = setTimeout(function () {
    // 応答なし = 他タブなし、通常起動
  }, 300);

  ch.postMessage({ type: 'check', tabId: tabId });
})();
