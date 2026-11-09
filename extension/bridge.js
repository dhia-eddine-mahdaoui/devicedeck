// Runs in every top-level page but only wakes up inside DeviceDeck.
(function () {
  if (!document.querySelector('meta[name="devicedeck-app"]')) return;
  var origin = location.origin;
  var VERSION = chrome.runtime.getManifest().version;
  var allowed = null; // null = not asked yet

  function reply(msg) {
    msg.__ddExt = true;
    window.postMessage(msg, origin);
  }

  var asking = null;
  function checkAllowed() {
    if (allowed !== null) return Promise.resolve(allowed);
    if (asking) return asking;
    return (asking = chrome.storage.local.get('allowedOrigins').then(function (res) {
      var list = res.allowedOrigins || [];
      if (list.indexOf(origin) !== -1) return (allowed = true);
      var ok = window.confirm(
        'DeviceDeck Connector\n\nAllow DeviceDeck on ' + origin +
        ' to change how websites shown inside it see this browser (device, browser name) and to show sites that normally refuse to be embedded?\n\nThis only affects previews inside this tool.'
      );
      if (ok) {
        list.push(origin);
        return chrome.storage.local.set({ allowedOrigins: list }).then(function () { return (allowed = true); });
      }
      return (allowed = false);
    }));
  }

  function hello() {
    checkAllowed().then(function (ok) {
      if (!ok) { reply({ type: 'denied' }); return; }
      chrome.runtime.sendMessage({ type: 'init' }, function () {
        reply({ type: 'hello', version: VERSION });
      });
    });
  }

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (e.source !== window || !m || m.__ddApp !== true) return;
    if (m.type === 'ping') { hello(); return; }
    if (!allowed) return;
    chrome.runtime.sendMessage(m, function (res) {
      reply({ id: m.id, ok: !!(res && res.ok) });
    });
  });

  hello();
})();
