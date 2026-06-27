(function () {
  let ch;
  try { ch = new BroadcastChannel('stellar-delete-tab'); } catch (e) { return; }

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
      '<button onclick="window.close()" style="background:rgba(0,20,50,0.8);border:1px solid rgba(0,200,255,0.5);color:#00ccff;padding:10px 28px;cursor:pointer;font-family:\'Orbitron\',sans-serif;font-size:13px;border-radius:2px;letter-spacing:.1em;">このタブを閉じる</button>';
    if (document.body) {
      document.body.appendChild(el);
    } else {
      document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(el); });
    }
  }

  ch.addEventListener('message', function (e) {
    if (e.data === 'check') {
      ch.postMessage('alive');
    } else if (e.data === 'alive' && !duplicate) {
      clearTimeout(timer);
      showDuplicateOverlay();
    }
  });

  var timer = setTimeout(function () {
    // 応答なし = 他タブなし、通常起動
  }, 300);

  ch.postMessage('check');
})();
