/*!
 * DeviceDeck helper — makes a page believe it runs on the device chosen in DeviceDeck.
 * Put it as the FIRST script in <head> of the site you are developing.
 * Outside DeviceDeck it does nothing at all, so it is safe to leave in during development.
 */
(function () {
  'use strict';
  if (window.__deviceDeck) return;
  var PREFIX = 'devicedeck:';
  var cfg = null;
  try {
    if (typeof window.name === 'string' && window.name.indexOf(PREFIX) === 0) {
      cfg = JSON.parse(window.name.slice(PREFIX.length));
    }
  } catch (e) { cfg = null; }
  // The desktop app hands the device over directly before the page starts.
  var fromDesktop = false;
  if (!cfg && window.__DD_PROFILE__ && typeof window.__DD_PROFILE__ === 'object') {
    cfg = window.__DD_PROFILE__;
    fromDesktop = true;
  }
  if (!cfg) return; // Not opened inside DeviceDeck: leave the page untouched.

  var parentWin = window.parent !== window ? window.parent : null;
  var api = (window.__deviceDeck = { profile: cfg, active: true });

  function define(obj, prop, value) {
    try {
      Object.defineProperty(obj, prop, { get: function () { return value; }, configurable: true, enumerable: true });
    } catch (e) { /* ignore */ }
  }

  /* ---------- navigator ---------- */
  var N = Navigator.prototype;
  define(N, 'userAgent', cfg.ua);
  define(N, 'appVersion', cfg.ua.replace(/^Mozilla\//, ''));
  define(N, 'platform', cfg.platform);
  define(N, 'vendor', cfg.vendor);
  define(N, 'maxTouchPoints', cfg.touchPoints || 0);
  if (cfg.firefox) {
    define(N, 'oscpu', cfg.os === 'windows' ? 'Windows NT 10.0; Win64; x64' : cfg.os === 'macos' ? 'Intel Mac OS X 10.15' : 'Linux x86_64');
    define(N, 'buildID', '20181001000000');
  }
  if (cfg.uaData) {
    var d = cfg.uaData;
    var low = { brands: d.brands, mobile: d.mobile, platform: d.platform };
    var uaData = {
      brands: d.brands,
      mobile: d.mobile,
      platform: d.platform,
      getHighEntropyValues: function (hints) {
        var out = { brands: d.brands, mobile: d.mobile, platform: d.platform };
        (hints || []).forEach(function (h) {
          if (h === 'fullVersionList') out.fullVersionList = d.brands.map(function (b) { return { brand: b.brand, version: b.version + '.0.0.0' }; });
          else if (h === 'uaFullVersion') out.uaFullVersion = d.fullVersion;
          else if (h in d) out[h] = d[h];
        });
        return Promise.resolve(out);
      },
      toJSON: function () { return low; },
    };
    define(N, 'userAgentData', uaData);
  } else {
    // Safari and Firefox don't have it at all, so remove it rather than leave an empty one.
    try { delete N.userAgentData; } catch (e) { /* ignore */ }
    if ('userAgentData' in navigator) define(N, 'userAgentData', undefined);
  }

  /* ---------- screen, pixel ratio, orientation ---------- */
  var S = Screen.prototype;
  define(S, 'width', cfg.screenW);
  define(S, 'height', cfg.screenH);
  define(S, 'availWidth', cfg.screenW);
  define(S, 'availHeight', cfg.availH || cfg.screenH);
  define(S, 'colorDepth', 24);
  define(S, 'pixelDepth', 24);
  define(window, 'devicePixelRatio', cfg.dpr);
  var landscape = cfg.orientation === 'landscape';
  if (window.ScreenOrientation) {
    define(ScreenOrientation.prototype, 'type', landscape ? 'landscape-primary' : 'portrait-primary');
    define(ScreenOrientation.prototype, 'angle', landscape && cfg.mobileOrientation ? 90 : 0);
  }
  if (cfg.mobileOrientation) define(window, 'orientation', landscape ? 90 : 0);

  /* ---------- touch ---------- */
  if (cfg.touch) {
    if (!('ontouchstart' in window)) {
      try { window.ontouchstart = null; document.ontouchstart = null; } catch (e) { /* ignore */ }
    }
  } else {
    // Hide touch support on desktop profiles.
    ['ontouchstart', 'ontouchmove', 'ontouchend', 'ontouchcancel'].forEach(function (k) {
      try { delete window[k]; } catch (e) { /* ignore */ }
      try { delete Window.prototype[k]; } catch (e) { /* ignore */ }
      try { delete HTMLElement.prototype[k]; } catch (e) { /* ignore */ }
      try { delete Document.prototype[k]; } catch (e) { /* ignore */ }
    });
  }

  /* ---------- media queries (JS + same-site CSS) ---------- */
  var TRUE_Q = '(min-width: 0px)';
  var FALSE_Q = '(min-width: 999999px)';
  function num(v) { return parseFloat(v); }
  function resToDppx(v) {
    var m = /^([\d.]+)\s*(dppx|x|dpi|dpcm)?$/.exec(String(v).trim());
    if (!m) return NaN;
    var n = num(m[1]);
    if (m[2] === 'dpi') return n / 96;
    if (m[2] === 'dpcm') return (n * 2.54) / 96;
    return n;
  }
  function cmp(kind, actual, wanted) {
    if (kind === 'min') return actual >= wanted;
    if (kind === 'max') return actual <= wanted;
    return Math.abs(actual - wanted) < 0.001;
  }
  function rewrite(query) {
    if (!query || typeof query !== 'string') return query;
    return query
      .replace(/\(\s*(any-)?pointer\s*:\s*(coarse|fine|none)\s*\)/gi, function (_, any, v) {
        return v.toLowerCase() === cfg.pointer ? TRUE_Q : FALSE_Q;
      })
      .replace(/\(\s*(any-)?hover\s*:\s*(hover|none)\s*\)/gi, function (_, any, v) {
        return v.toLowerCase() === cfg.hover ? TRUE_Q : FALSE_Q;
      })
      .replace(/\(\s*(?:-webkit-)?(min-|max-)?(?:-webkit-)?(?:min-|max-)?device-pixel-ratio\s*:\s*([\d.]+)\s*\)/gi, function (all, k, v) {
        var kind = /min/i.test(all) ? 'min' : /max/i.test(all) ? 'max' : '';
        return cmp(kind, cfg.dpr, num(v)) ? TRUE_Q : FALSE_Q;
      })
      .replace(/\(\s*(min-|max-)?resolution\s*:\s*([^)]+)\)/gi, function (all, k, v) {
        var kind = k ? k.slice(0, 3).toLowerCase() : '';
        var want = resToDppx(v);
        if (isNaN(want)) return all;
        return cmp(kind, cfg.dpr, want) ? TRUE_Q : FALSE_Q;
      })
      .replace(/\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)/gi, function (all, v) {
        if (!cfg.scheme) return all;
        return v.toLowerCase() === cfg.scheme ? TRUE_Q : FALSE_Q;
      })
      .replace(/\(\s*(min-|max-)?device-(width|height)\s*:\s*([\d.]+)px\s*\)/gi, function (all, k, dim, v) {
        var kind = k ? k.slice(0, 3).toLowerCase() : '';
        var actual = dim.toLowerCase() === 'width' ? cfg.screenW : cfg.screenH;
        return cmp(kind, actual, num(v)) ? TRUE_Q : FALSE_Q;
      });
  }
  api.rewriteMedia = rewrite;

  var nativeMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
  if (nativeMatchMedia) {
    window.matchMedia = function (q) {
      var rewritten = rewrite(String(q));
      var mql = nativeMatchMedia(rewritten);
      if (rewritten !== q) {
        try { Object.defineProperty(mql, 'media', { value: String(q) }); } catch (e) { /* ignore */ }
      }
      return mql;
    };
  }

  function patchRules(rules) {
    if (!rules) return;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        if (r.media && r.media.mediaText) {
          var t = r.media.mediaText;
          var n2 = rewrite(t);
          if (n2 !== t) r.media.mediaText = n2;
        }
        if (r.cssRules) patchRules(r.cssRules);
        if (r.styleSheet) patchSheet(r.styleSheet);
      } catch (e) { /* ignore */ }
    }
  }
  function patchSheet(sheet) {
    try {
      if (sheet.media && sheet.media.mediaText) {
        var t = sheet.media.mediaText;
        var n2 = rewrite(t);
        if (n2 !== t) sheet.media.mediaText = n2;
      }
      patchRules(sheet.cssRules);
    } catch (e) { /* stylesheet from another site: the browser keeps it closed */ }
  }
  var patchQueued = false;
  function patchAll() {
    patchQueued = false;
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) patchSheet(sheets[i]);
  }
  function queuePatch() {
    if (patchQueued) return;
    patchQueued = true;
    (window.requestAnimationFrame || setTimeout)(patchAll);
  }
  api.refreshStyles = patchAll;
  document.addEventListener('DOMContentLoaded', patchAll);
  window.addEventListener('load', patchAll);
  document.addEventListener('load', function (e) {
    if (e.target && (e.target.tagName === 'LINK' || e.target.tagName === 'STYLE')) queuePatch();
  }, true);
  try {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var tag = added[j].tagName;
          if (tag === 'STYLE' || tag === 'LINK') { queuePatch(); return; }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  } catch (e) { /* ignore */ }

  /* ---------- touch cursor + mouse → touch events ---------- */
  // (The desktop app switches on the browser's own touch emulation instead.)
  if (cfg.touch && cfg.pointer === 'coarse' && !cfg.nativeTouch) {
    var style = document.createElement('style');
    style.textContent =
      'html,html *{cursor:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27%3E%3Ccircle cx=%2712%27 cy=%2712%27 r=%279%27 fill=%27rgba(120,120,120,.35)%27 stroke=%27rgba(60,60,60,.7)%27 stroke-width=%272%27/%3E%3C/svg%3E") 12 12, auto !important}';
    var addStyle = function () {
      var host = document.head || document.documentElement;
      if (host) host.appendChild(style); else setTimeout(addStyle, 0);
    };
    addStyle();

    var touchActive = false;
    var canTouch = typeof Touch === 'function' && typeof TouchEvent === 'function';
    function fireTouch(type, e) {
      if (!canTouch) return;
      try {
        var t = new Touch({ identifier: 1, target: e.target, clientX: e.clientX, clientY: e.clientY, pageX: e.pageX, pageY: e.pageY, screenX: e.screenX, screenY: e.screenY, radiusX: 11, radiusY: 11, force: 1 });
        var list = type === 'touchend' ? [] : [t];
        e.target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: list, targetTouches: list, changedTouches: [t] }));
      } catch (err) { canTouch = false; }
    }
    window.addEventListener('mousedown', function (e) { if (e.button === 0) { touchActive = true; fireTouch('touchstart', e); } }, true);
    window.addEventListener('mousemove', function (e) { if (touchActive) fireTouch('touchmove', e); }, true);
    window.addEventListener('mouseup', function (e) { if (touchActive) { touchActive = false; fireTouch('touchend', e); } }, true);
  }

  /* ---------- talking to DeviceDeck (scroll, navigation, clicks, typing) ---------- */
  // In the desktop app each device is its own top-level view and talks to the app directly.
  var desktop = fromDesktop && !parentWin;
  if (!parentWin && !desktop) return;
  function send(msg) {
    msg.__dd = true;
    msg.paneId = cfg.paneId;
    if (desktop) {
      var t = window.__TAURI_INTERNALS__;
      if (t && typeof t.invoke === 'function') {
        try { t.invoke('dd_event', { payload: msg }).catch(function () {}); } catch (e) { /* ignore */ }
      }
      return;
    }
    try { parentWin.postMessage(msg, '*'); } catch (e) { /* ignore */ }
  }
  var muteUntil = 0;
  function muted() { return Date.now() < muteUntil; }

  function cssPath(el) {
    if (!(el instanceof Element)) return null;
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) { parts.unshift('#' + el.id); break; }
      var idx = 1;
      var sib = el;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) idx++;
      parts.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + idx + ')');
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  // Only scrolling the person does here is mirrored (never the scrolling we were told to do),
  // so devices don't bounce scroll positions back and forth.
  var lastInput = 0;
  ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'mousedown', 'keydown'].forEach(function (type) {
    window.addEventListener(type, function (e) { if (e.isTrusted) lastInput = Date.now(); }, { capture: true, passive: true });
  });
  var scrollQueued = false;
  window.addEventListener('scroll', function () {
    if (muted() || scrollQueued || Date.now() - lastInput > 1200) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      var el = document.scrollingElement || document.documentElement;
      var maxY = Math.max(1, el.scrollHeight - window.innerHeight);
      var maxX = Math.max(1, el.scrollWidth - window.innerWidth);
      send({ type: 'scroll', y: window.scrollY / maxY, x: window.scrollX / maxX });
    });
  }, { passive: true });

  // The address a click on a plain link will open (null for buttons, new-tab links, downloads,
  // jumps inside the page…). The app uses it to tell a link the person followed apart from a
  // redirect the site does by itself for this one device (e.g. /download -> /download/mac).
  function linkTarget(e) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return null;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download')) return null;
    var t = (a.getAttribute('target') || '').toLowerCase();
    if (t && t !== '_self' && t !== '_top' && t !== '_parent') return null;
    var href = a.href;
    if (!/^(https?|file):/i.test(href)) return null;
    if (href.split('#')[0] === location.href.split('#')[0] && href.indexOf('#') >= 0) return null;
    return href;
  }

  document.addEventListener('click', function (e) {
    if (!e.isTrusted || muted()) return;
    var path = cssPath(e.target);
    if (!path) return;
    var msg = { type: 'click', path: path };
    var link = linkTarget(e);
    if (link) msg.link = link;
    // Let the page decide first: a script may cancel the click (single-page apps do).
    setTimeout(function () {
      if (msg.link && e.defaultPrevented) msg.spa = true;
      send(msg);
    }, 0);
  }, true);

  document.addEventListener('input', function (e) {
    if (!e.isTrusted || muted()) return;
    var t = e.target;
    if (!t || !('value' in t)) return;
    var path = cssPath(t);
    if (path) send({ type: 'input', path: path, value: t.type === 'checkbox' || t.type === 'radio' ? t.checked : t.value, check: t.type === 'checkbox' || t.type === 'radio' });
  }, true);

  function announce(kind) {
    send({ type: kind, url: location.href, title: document.title });
  }
  window.addEventListener('DOMContentLoaded', function () { announce('ready'); });
  window.addEventListener('hashchange', function () { announce('soft-nav'); });
  window.addEventListener('popstate', function () { announce('soft-nav'); });
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () {
      var r = orig.apply(this, arguments);
      announce('soft-nav');
      return r;
    };
  });

  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.__ddCmd !== true || !parentWin || e.source !== parentWin) return;
    runCommand(m);
  });
  api.cmd = runCommand;

  function runCommand(m) {
    muteUntil = Date.now() + 250;
    var el = document.scrollingElement || document.documentElement;
    if (m.type === 'scroll') {
      window.scrollTo(m.x * Math.max(0, el.scrollWidth - window.innerWidth), m.y * Math.max(0, el.scrollHeight - window.innerHeight));
    } else if (m.type === 'click') {
      var target = document.querySelector(m.path);
      if (target && typeof target.click === 'function') target.click();
    } else if (m.type === 'input') {
      var field = document.querySelector(m.path);
      if (field) {
        if (m.check) field.checked = !!m.value; else field.value = m.value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (m.type === 'navigate') {
      if (m.url && m.url !== location.href) location.href = m.url;
    } else if (m.type === 'ping') {
      announce('ready');
    }
  }
})();
