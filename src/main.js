import './style.css';
import helperSource from './helper.js?raw';
import { initSettings } from './settings.js';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  DEVICES, GROUPS, OS_LABEL, BROWSERS_BY_OS, BROWSER_LABEL, DEFAULT_BROWSER, PRESETS, OS_VERSIONS,
  findDevice, resolvePane, osVersionLabel, screenShape,
} from './devices.js';

/* ------------------------------------------------------------------ helpers */
const $ = (sel, root = document) => root.querySelector(sel);
const STORE_KEY = 'devicedeck-state-v1';
const NAME_PREFIX = 'devicedeck:';
const DEMO_URL = new URL('demo.html', location.href).href;
let uid = 0;
const newId = () => `p${Date.now().toString(36)}${(uid++).toString(36)}`;

// Running as the installed Windows program: every device is a real native browser view.
const DESKTOP = !!window.__TAURI_INTERNALS__;
const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args);
if (DESKTOP) document.documentElement.classList.add('desktop');
let nativeSeq = 0;

/* ------------------------------------------------------------------ title bar */
// The tab strip is the window's title bar. macOS keeps its own traffic lights (drawn over
// the strip's left edge); Windows and Linux get minimize / maximize / close buttons here.
(function setupTitleBar() {
  const appWindow = DESKTOP && window.__TAURI__?.window?.getCurrentWindow?.();
  if (!appWindow) return;
  const root = document.documentElement;
  if (/Macintosh|Mac OS X/.test(navigator.userAgent)) {
    root.classList.add('mac');
    return;
  }
  document.getElementById('win-controls').hidden = false;
  document.getElementById('win-resize').hidden = false;
  document.getElementById('win-min').addEventListener('click', () => appWindow.minimize());
  document.getElementById('win-max').addEventListener('click', () => appWindow.toggleMaximize());
  document.getElementById('win-close').addEventListener('click', () => appWindow.close());
  const maxBtn = document.getElementById('win-max');
  const syncMaximized = async () => {
    const max = await appWindow.isMaximized().catch(() => false);
    root.classList.toggle('maximized', max);
    maxBtn.title = maxBtn.ariaLabel = max ? 'Restore' : 'Maximize';
  };
  syncMaximized();
  appWindow.onResized(syncMaximized);
  // Resize from the window edges (the system frame is hidden).
  document.querySelectorAll('#win-resize [data-dir]').forEach((edge) => {
    edge.addEventListener('mousedown', (e) => {
      if (e.button === 0) appWindow.startResizeDragging(edge.dataset.dir);
    });
  });
})();

const ICONS = {
  phone: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
  tablet: '<svg viewBox="0 0 24 24"><rect x="4.5" y="3" width="15" height="18" rx="2.5"/><path d="M11 18h2"/></svg>',
  laptop: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 18.5h19"/></svg>',
  desktop: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="11" height="11" rx="2"/><path d="M13 3a8 8 0 0 1 8 8M21 11l-2-2M21 11l2-2"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  focus: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>',
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>',
  inspect: '<svg viewBox="0 0 24 24"><path d="M4 4h10v4M4 4v10h4"/><path d="M11 11l9 3.5-4 1.5-1.5 4z"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg, ms = 2600, action = null) {
  const el = $('#toast');
  el.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { el.classList.remove('show'); action.fn(); });
    el.appendChild(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copied to clipboard');
}

/* ------------------------------------------------------------------ state */
function presetPanes(preset) {
  if (preset.panes === 'breakpoints') {
    return [
      [320, 'android', 'phone'], [576, 'android', 'phone'], [768, 'ipados', 'tablet'],
      [992, 'windows', 'laptop'], [1200, 'windows', 'laptop'], [1440, 'macos', 'laptop'],
    ].map(([w, os, type]) => ({
      id: newId(), deviceId: 'custom', browser: DEFAULT_BROWSER[os], rotated: false, scheme: null,
      custom: { w, h: 900, dpr: type === 'laptop' ? 1 : 2, os, type },
    }));
  }
  return preset.panes.map(([deviceId, browser]) => ({
    id: newId(), deviceId, browser, rotated: false, scheme: null, custom: null,
  }));
}

function defaultState() {
  return {
    source: { kind: 'url', url: DEMO_URL },
    panes: presetPanes(PRESETS[0]),
    preset: 'mix',
    layout: 'row',
    prevLayout: 'row',
    focusId: null,
    zoom: 'fit',
    canvas: { x: 0, y: 0, z: 1 }, // Free layout: where the canvas is moved to and its zoom
    sync: { scroll: true, nav: true, interact: true },
    pace: 'gentle',
    home: '',               // address new tabs open ('' = built-in test page)
    scheme: 'auto',
    frames: false,
    history: [DEMO_URL],
    histIdx: 0,
    tabs: [],
    activeTab: null,
    version: 2,
  };
}

// Fields that belong to a browser tab (each tab has its own address, history and devices).
const TAB_FIELDS = ['source', 'panes', 'preset', 'history', 'histIdx', 'focusId', 'title'];
function pickTab(obj) {
  const out = {};
  for (const k of TAB_FIELDS) out[k] = obj[k];
  return out;
}
function cleanPanes(panes, fallback) {
  const list = (panes || []).filter((p) => p && (p.deviceId === 'custom' || findDevice(p.deviceId)));
  return list.length ? list : fallback;
}

function loadState() {
  const base = defaultState();
  let s = base;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && Array.isArray(saved.panes)) {
      s = { ...base, ...saved, sync: { ...base.sync, ...(saved.sync || {}) } };
      s.panes = cleanPanes(saved.panes, base.panes);
      if (!s.source || !s.source.kind) s.source = base.source;
      if (saved.version !== 2) { s.frames = false; s.version = 2; }
    }
  } catch { /* fall back to defaults */ }
  if (!Array.isArray(s.tabs) || !s.tabs.length) {
    s.tabs = [{ id: newId(), ...pickTab(s) }];
    s.activeTab = s.tabs[0].id;
  }
  s.tabs.forEach((t) => { t.panes = cleanPanes(t.panes, presetPanes(PRESETS[0])); });
  if (!s.tabs.some((t) => t.id === s.activeTab)) s.activeTab = s.tabs[0].id;
  Object.assign(s, pickTab(s.tabs.find((t) => t.id === s.activeTab)));
  return s;
}

const state = loadState();
function activeTab() {
  return state.tabs.find((t) => t.id === state.activeTab);
}

// A link like ?url=https://… opens that address straight away.
const urlParam = new URLSearchParams(location.search).get('url');
if (urlParam) {
  state.source = { kind: 'url', url: normalizeUrl(urlParam) };
}

let saveTimer;
let resetting = false;   // Settings > Reset: nothing may be written back on the way out
function save() {
  clearTimeout(saveTimer);
  if (resetting) return;
  saveTimer = setTimeout(() => {
    Object.assign(activeTab(), pickTab(state));
    renderTabs();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // Very large pasted pages may not fit; keep everything else.
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, source: { kind: 'url', url: DEMO_URL } }));
      } catch { /* ignore */ }
    }
  }, 200);
}

/* ------------------------------------------------------------------ address & sources */
function normalizeUrl(input) {
  let v = String(input || '').trim();
  if (!v) return DEMO_URL;
  if (/^(https?|file|data|blob):/i.test(v)) return v;
  if (v.startsWith('//')) return location.protocol + v;
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(v) || /^[\w-]+\.local(:\d+)?(\/|$)/i.test(v)) {
    return `http://${v}`;
  }
  if (/^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(v) || /^[\w.-]+:\d+/.test(v)) return `https://${v}`;
  if (/\.html?(\?.*)?$/i.test(v)) return new URL(v, location.href).href;
  return `https://${v}`;
}

function sourceKey() {
  return state.source.kind === 'url' ? `url:${state.source.url}` : `html:${state.source.stamp || 0}`;
}

// In Focus layout the address bar shows where the focused device actually is (a site may have
// sent it to its own page, e.g. /download/mac); otherwise the address that was opened.
function displayUrl() {
  const fp = isFocus() && state.panes.find((p) => p.id === state.focusId);
  const entry = fp && entries.get(fp.id);
  // Only while it still shows the current page (not an older one it's about to leave).
  if (entry?.url && entry.key === frameKey(fp)) return entry.url;
  return state.source.url;
}

function updateAddress() {
  const input = $('#address');
  const mode = $('#address-mode');
  const typing = document.activeElement === input;
  if (state.source.kind === 'url') {
    const url = displayUrl();
    if (!typing) input.value = url === DEMO_URL ? 'Built-in test page' : url;
    mode.textContent = 'URL';
    mode.className = 'address-mode';
    input.readOnly = false;
  } else {
    if (!typing) input.value = state.source.name || 'Pasted HTML';
    mode.textContent = 'HTML';
    mode.className = 'address-mode html';
  }
  $('#btn-back').disabled = state.histIdx <= 0;
  $('#btn-forward').disabled = state.histIdx >= state.history.length - 1;
  updateBanner();
}

function navigate(url, { push = true } = {}) {
  const target = url === 'Built-in test page' ? DEMO_URL : normalizeUrl(url);
  if (location.protocol === 'https:' && target.startsWith('http:') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(target)) {
    toast('Note: this tool runs on a secure (https) address, so browsers may block plain "http" sites in the panes.', 5000);
  }
  state.source = { kind: 'url', url: target };
  if (push) {
    state.history = state.history.slice(0, state.histIdx + 1);
    if (state.history[state.history.length - 1] !== target) state.history.push(target);
    if (state.history.length > 50) state.history.shift();
    state.histIdx = state.history.length - 1;
  }
  updateAddress();
  updateBanner();
  reloadAll(true);
  save();
}

function showHtml(html, name) {
  state.source = { kind: 'html', html, name: name || 'Pasted HTML', stamp: Date.now() };
  updateAddress();
  reloadAll(true);
  save();
  toast(`Showing "${state.source.name}" with full device faking`);
}

function injectHelper(html, profileName) {
  const tag = `<script>window.name=${JSON.stringify(profileName)};\n${helperSource.replace(/<\/script/gi, '<\\/script')}</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  return `<!doctype html><html><head>${tag}</head><body>${html}</body></html>`;
}

/* ------------------------------------------------------------------ Connector (browser add-on) */
const ext = { connected: false, version: null, pending: new Map(), seq: 0, activePane: null, loading: 0 };

function extSend(msg) {
  if (!ext.connected) return Promise.resolve(null);
  const id = ++ext.seq;
  return new Promise((res) => {
    ext.pending.set(id, res);
    window.postMessage({ ...msg, __ddApp: true, id }, location.origin);
    setTimeout(() => { if (ext.pending.delete(id)) res(null); }, 1500);
  });
}

function profileFor(p) {
  return { ...resolvePane(p).profile, scheme: paneScheme(p), paneId: p.id };
}

function setActiveProfile(p) {
  if (!ext.connected || ext.loading > 0 || ext.activePane === p.id) return;
  ext.activePane = p.id;
  extSend({ type: 'profile', profile: profileFor(p) });
}

function updateExtUi() {
  const dot = $('#ext-dot');
  dot.classList.toggle('on', ext.connected);
  dot.title = ext.connected ? 'Connector active: any website gets faked' : 'Connector not installed';
  const st = $('#ext-state');
  st.textContent = ext.connected ? `Connector active (v${ext.version})` : ext.denied ? 'Connector blocked for this address' : 'Web version';
  st.classList.toggle('on', ext.connected);
  $('#ext-card').classList.toggle('connected', ext.connected);
  updateBanner();
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (e.source !== window || !m || m.__ddExt !== true) return;
  if (m.type === 'hello') {
    const first = !ext.connected;
    ext.connected = true;
    ext.version = m.version;
    ext.denied = false;
    updateExtUi();
    if (first) {
      toast('Connector active: every website in the previews now sees the chosen device');
      if (state.source.kind === 'url') reloadAll(true);
    }
  } else if (m.type === 'denied') {
    ext.denied = true;
    updateExtUi();
  } else if (m.id && ext.pending.has(m.id)) {
    const res = ext.pending.get(m.id);
    ext.pending.delete(m.id);
    res(m);
  }
});

/* ------------------------------------------------------------------ panes */
let entries = new Map(); // pane id -> { el, iframe, key, faked, url } (for the open tab)
const tabViews = new Map(); // tab id -> { entries, container }
let loadChain = Promise.resolve();

function paneScheme(p) {
  const s = p.scheme || state.scheme;
  return s === 'auto' ? null : s;
}

/* In Focus layout only the focused device is live: the others don't load, follow links,
   scroll, get screenshotted or change the address. They catch up when Focus is left. */
const isFocus = () => state.layout === 'focus';
function isActivePane(id) {
  return !isFocus() || id === state.focusId;
}
function activePanes() {
  return state.panes.filter((p) => isActivePane(p.id));
}
// The device whose page the address bar and tab title describe.
function primaryPane() {
  return (isFocus() && state.panes.find((p) => p.id === state.focusId)) || state.panes[0] || null;
}

const measuredChrome = { plain: null, framed: null };
function computeScale(r, stageRect, p) {
  if (state.layout === 'focus') {
    const availW = stageRect.width - 80;
    const availH = stageRect.height - 120;
    return Math.min(1, availW / r.vw, availH / r.vh);
  }
  if (state.layout === 'free' && p?.box?.s) return p.box.s;
  // Room left for the screen = stage height minus the pane's own strips (measured) and margins.
  const chrome = (state.frames ? measuredChrome.framed : measuredChrome.plain) ?? (state.frames ? 170 : 96);
  const availH = stageRect.height - 48 - chrome;
  const fit = Math.max(0.12, Math.min(1, availH / r.vh));
  if (state.zoom === 'fit') return fit;
  // Native views can't be clipped, so in the program they never grow below the window.
  return DESKTOP ? Math.min(parseFloat(state.zoom), fit) : parseFloat(state.zoom);
}

/* ------------------------------------------------------------------ native views (Windows program) */
function overlayOpen() {
  return !!document.querySelector('dialog[open]') || !$('#sync-menu').hidden;
}

// Native views always sit above the interface (and above each other in creation order), so they
// are parked while a menu or dialog is open, and in Free layout while another panel lies on top
// of them. Instead of a blank (white) screen, the parked device shows a picture of exactly what it
// showed, until it can be live again.
async function snapshotEntry(entry) {
  const label = entry.label;
  if (!label) return;
  entry.snapAt = Date.now();
  try {
    const res = await cdp(label, 'Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    if (!res?.data || entry.label !== label) return;
    const screen = entry.el.querySelector('.screen');
    let img = screen.querySelector('img.freeze');
    if (!img) {
      img = document.createElement('img');
      img.className = 'freeze';
      img.alt = '';
      screen.appendChild(img);
    }
    img.src = `data:image/jpeg;base64,${res.data}`;
  } catch { /* the view is gone or busy: the dark screen shows instead */ }
}
function dropSnapshot(entry) {
  entry.el.querySelector('.screen img.freeze')?.remove();
}

async function freezeViews() {
  if (!DESKTOP) return;
  const jobs = [];
  for (const entry of entries.values()) {
    if (entry.label && !entry.el.hidden && !entry.covered) jobs.push(snapshotEntry(entry));
  }
  // Never hold a menu up for long: whatever isn't captured in time just shows the dark screen.
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 450))]);
}
function thawViews() {
  for (const entry of entries.values()) if (!entry.covered) dropSnapshot(entry);
}
async function openDialog(sel) {
  await freezeViews();
  $(sel).showModal();
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Free layout: is this panel's screen under a panel that is stacked higher?
function coveredInFree(p, screenRect) {
  const z = p.box?.z || 0;
  return state.panes.some((o) => {
    if (o.id === p.id || (o.box?.z || 0) <= z) return false;
    const en = entries.get(o.id);
    return en && !en.el.hidden && overlaps(screenRect, en.el.getBoundingClientRect());
  });
}

// Windows can cut a device view to any outline; other systems only show it whole.
const CAN_CLIP = /Windows/.test(navigator.userAgent);
function scaleShape(shape, k) {
  if (!shape || k === 1) return shape || null;
  return { r: shape.r * k, cut: shape.cut && { ...shape.cut, x: shape.cut.x * k, y: shape.cut.y * k, w: shape.cut.w * k, h: shape.cut.h * k } };
}

let overlayWasOpen = false;
function nativeLayoutLoop() {
  const overlay = overlayOpen();
  if (overlayWasOpen && !overlay) {
    // Give the views a moment to come back before taking the pictures away.
    setTimeout(() => { if (!overlayOpen()) thawViews(); }, 180);
  }
  overlayWasOpen = overlay;
  const free = state.layout === 'free';
  const stage = $('#stage').getBoundingClientRect();
  const items = [];
  for (const p of state.panes) {
    const entry = entries.get(p.id);
    if (!entry?.label) continue;
    const r = entry.el.querySelector('.screen').getBoundingClientRect();

    // The part of the screen inside the stage. Windows cuts the view to it; elsewhere a view
    // that sticks out past the edge shows its picture until it's back inside.
    const ix1 = Math.max(r.left, stage.left); const iy1 = Math.max(r.top, stage.top);
    const ix2 = Math.min(r.right, stage.right); const iy2 = Math.min(r.bottom, stage.bottom);
    const partial = free && (ix1 > r.left + 0.5 || iy1 > r.top + 0.5 || ix2 < r.right - 0.5 || iy2 < r.bottom - 0.5);
    const clip = partial && CAN_CLIP && ix2 > ix1 && iy2 > iy1
      ? { x: Math.round(ix1 - r.left), y: Math.round(iy1 - r.top), w: Math.round(ix2 - ix1), h: Math.round(iy2 - iy1) }
      : null;
    const under = free && !entry.el.hidden && (coveredInFree(p, r) || (partial && !CAN_CLIP));
    if (under && !entry.covered && !entry.covering) {
      // Take its picture first, then park it, so it never flashes blank.
      entry.covering = true;
      snapshotEntry(entry).finally(() => { entry.covering = false; entry.covered = true; });
    } else if (!under && (entry.covered || entry.covering)) {
      entry.covered = false;
      entry.covering = false;
      setTimeout(() => { if (!entry.covered && !overlayOpen()) dropSnapshot(entry); }, 180);
    } else if (entry.covered && !entry.snapping && Date.now() - (entry.snapAt || 0) > 2000) {
      // A parked view keeps rendering, so keep its picture current (and retry one that failed
      // because the page hadn't drawn anything yet).
      entry.snapping = true;
      snapshotEntry(entry).finally(() => { entry.snapping = false; });
    }

    const hidden = entry.el.hidden || overlay || entry.covered || r.width < 2
      || ix2 - ix1 < 1 || iy2 - iy1 < 1;
    const item = {
      label: entry.label,
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      zoom: viewZoom(entry), visible: !hidden,
      // The view is cut to the screen's real outline, so the frame's corners and camera show.
      shape: scaleShape(entry.shape, free ? canvas().z : 1),
      // ...and to the part of the canvas that is on screen (Free layout can push it past the edge).
      clip,
    };
    const key = JSON.stringify(item);
    if (key !== entry.lastLayout) {
      entry.lastLayout = key;
      items.push(item);
    }
  }
  if (items.length) invoke('pane_layout', { items }).catch(() => {});
  requestAnimationFrame(nativeLayoutLoop);
}

// Native views are created and closed one at a time. WebView2 builds a view inside a nested
// message loop on the main thread; closing or creating other views meanwhile (e.g. switching the
// device set and opening an address right after) can deadlock the whole window.
let viewQueue = Promise.resolve();
function queueView(fn) {
  const run = viewQueue.then(fn, fn);
  viewQueue = run.catch(() => {});
  return run;
}

/*
 * Gentle page loading. Every device goes out through the same internet address, so to a website
 * ten devices opening a page in the same instant look like one visitor reloading it ten times,
 * and rate limits (HTTP 429 "Too many requests") kick in. Page loads therefore start one after
 * another; with "One after another" the next device waits until the previous page has loaded, so
 * it also gets the site's scripts and images from the shared cache instead of asking again.
 * A device that still gets a 429 tries again by itself after a growing pause.
 */
let paceChain = Promise.resolve();
const PACE_MS = { gentle: 0, 2: 2000, 5: 5000, off: 0 };
function paceBudget() { // roughly how long one device adds to a full load
  return state.pace === 'off' ? 0 : state.pace === 'gentle' ? 2500 : PACE_MS[state.pace] || 0;
}

function pacedNavigate(entry, url, { retry = false } = {}) {
  const label = entry.label;
  if (!label) return Promise.resolve();
  const tok = {};
  entry.navTok = tok;
  entry.navUrl = url;
  if (!retry) entry.retries = 0;
  entry.loading = true;
  const stale = () => entry.navTok !== tok || entry.label !== label;
  const run = paceChain.then(async () => {
    if (stale()) return;
    await invoke('pane_navigate', { label, url });
    const pace = state.pace || 'gentle';
    if (pace === 'gentle') {
      const until = Date.now() + 5000;
      await sleep(200);
      while (Date.now() < until && !stale() && entry.loading) await sleep(100);
      if (!stale() && entry.loading) checkRateLimit(entry); // error pages never say they're ready
      if (!stale()) await sleep(400); // let the page's own scripts and images finish too
    } else {
      setTimeout(() => { if (!stale() && entry.loading) checkRateLimit(entry); }, 6000);
      await sleep(PACE_MS[pace] || 0);
    }
  });
  paceChain = run.catch(() => {});
  return run;
}

// Did the site answer this device with "Too many requests"? Then wait and try again.
async function checkRateLimit(entry) {
  const { label, navTok: tok } = entry;
  if (!label || !tok || entry.checkedTok === tok) return;
  entry.checkedTok = tok;
  let status = 0;
  try {
    const res = await cdp(label, 'Runtime.evaluate', {
      expression: `(() => { const n = performance.getEntriesByType('navigation')[0]; const s = n && n.responseStatus;
        if (s) return s; const m = /HTTP ERROR (\\d{3})/.exec(document.body ? document.body.innerText : ''); return m ? +m[1] : 0; })()`,
      returnByValue: true,
    });
    status = res.result?.value || 0;
  } catch { return; }
  if (entry.navTok !== tok) return;
  if (status !== 429) { entry.retries = 0; return; }
  entry.retries = (entry.retries || 0) + 1;
  if (entry.retries > 3) {
    entry.loading = false;
    setBadge(entry, 'limited', 'Blocked: too many requests');
    toast('A site is still refusing with "Too many requests". Try Sync › Page loading › 5 s apart, or fewer devices.', 6000);
    return;
  }
  const wait = 4000 * 2 ** (entry.retries - 1); // 4, 8, 16 s
  entry.loading = true;
  setBadge(entry, 'limited', `Too many requests: retrying in ${wait / 1000} s`);
  setTimeout(() => {
    if (entry.navTok !== tok || entry.label !== label) return;
    setBadge(entry, 'wait');
    pacedNavigate(entry, entry.navUrl, { retry: true });
  }, wait);
}

function closeNative(entry) {
  if (entry?.label) {
    const label = entry.label;
    queueView(() => invoke('pane_close', { label })).catch(() => {});
    entry.label = null;
    entry.lastLayout = null;
  }
}

// The request headers each device sends, so servers (e.g. "download our app" pages)
// pick the App Store, Google Play, Mac or Windows version just like on the real device.
const CH_HEADERS = [
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-ch-ua-platform-version', 'sec-ch-ua-model',
  'sec-ch-ua-arch', 'sec-ch-ua-bitness', 'sec-ch-ua-full-version', 'sec-ch-ua-full-version-list',
  'sec-ch-ua-wow64', 'sec-ch-ua-form-factors',
];
function headerRules(profile) {
  const rules = [{ name: 'User-Agent', value: profile.ua }];
  const d = profile.uaData;
  if (!d) {
    // Safari and Firefox never send client hints.
    for (const name of CH_HEADERS) rules.push({ name, value: null });
    return rules;
  }
  const q = (s) => `"${s}"`;
  const list = (full) => d.brands.map((b) => `${q(b.brand)};v=${q(full ? `${b.version}.0.0.0` : b.version)}`).join(', ');
  rules.push(
    { name: 'sec-ch-ua', value: list(false) },
    { name: 'sec-ch-ua-mobile', value: d.mobile ? '?1' : '?0' },
    { name: 'sec-ch-ua-platform', value: q(d.platform) },
    { name: 'sec-ch-ua-platform-version', value: q(d.platformVersion || '') },
    { name: 'sec-ch-ua-model', value: q(d.model || '') },
    { name: 'sec-ch-ua-arch', value: q(d.architecture || '') },
    { name: 'sec-ch-ua-bitness', value: q(d.bitness || '64') },
    { name: 'sec-ch-ua-full-version', value: q(d.fullVersion || '') },
    { name: 'sec-ch-ua-full-version-list', value: list(true) },
    { name: 'sec-ch-ua-wow64', value: '?0' },
    { name: 'sec-ch-ua-form-factors', value: d.mobile ? '"Mobile"' : (profile.type === 'tablet' ? '"Tablet"' : '"Desktop"') },
  );
  return rules;
}

function nativeInit(profile) {
  return `window.__DD_PROFILE__=${JSON.stringify(profile)};\n${helperSource}`;
}

function sourceUrlForNative() {
  if (state.source.kind === 'url') return state.source.url;
  return `data:text/html;charset=utf-8,${encodeURIComponent(state.source.html)}`;
}

/* ------------------------------------------------------------------ browser-level emulation, inspect, screenshots (program only) */
async function cdp(label, method, params = {}) {
  const res = await invoke('pane_cdp', { label, method, params: JSON.stringify(params) });
  return res ? JSON.parse(res) : {};
}

function uaOverride(profile) {
  const o = { userAgent: profile.ua, platform: profile.platform };
  const d = profile.uaData;
  if (d) {
    o.userAgentMetadata = {
      brands: d.brands,
      fullVersionList: d.brands.map((b) => ({ brand: b.brand, version: `${b.version}.0.0.0` })),
      fullVersion: d.fullVersion,
      platform: d.platform,
      platformVersion: d.platformVersion || '',
      architecture: d.architecture || '',
      model: d.model || '',
      mobile: !!d.mobile,
      bitness: d.bitness || '64',
      wow64: false,
    };
  }
  return o;
}

// Switch on the browser engine's own device emulation for a view: real touch input
// (and touch-style CSS), the device's identity incl. client hints, and light/dark mode
// that every stylesheet follows.
async function applyEmulation(label, profile) {
  const coarse = !!profile.touch && profile.pointer === 'coarse';
  const steps = [
    ['Emulation.setTouchEmulationEnabled', coarse ? { enabled: true, maxTouchPoints: profile.touchPoints || 5 } : { enabled: false }],
    ['Emulation.setEmitTouchEventsForMouse', { enabled: coarse, configuration: coarse ? 'mobile' : 'desktop' }],
    // Phones and tablets have overlay scrollbars that take no room: without this a 412px phone
    // would lay its page out at 397px next to a desktop scrollbar.
    ['Emulation.setScrollbarsHidden', { hidden: !!profile.touch }],
    ['Emulation.setUserAgentOverride', uaOverride(profile)],
    ['Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: profile.scheme || '' }] }],
  ];
  for (const [method, params] of steps) {
    try { await cdp(label, method, params); } catch (e) { console.warn(method, e); }
  }
}

function shotName(p) {
  const r = resolvePane(p);
  let host = 'page';
  try { host = state.source.kind === 'url' ? new URL(state.source.url).host || 'page' : (state.source.name || 'page'); } catch { /* keep */ }
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  return `${host}-${r.device.id === 'custom' ? `${r.vw}x${r.vh}` : r.device.name}-${BROWSER_LABEL[r.browser]}-${stamp}`;
}

// PNG (base64) of one device: the whole page or just what's visible.
async function capturePane(p, entry, { full = true, maxWidth = 0 } = {}) {
  const r = resolvePane(p);
  const eff = (window.devicePixelRatio || 1) * viewZoom(entry);
  let width = r.vw;
  let height = r.vh;
  let x = 0;
  let y = 0;
  if (full) {
    const m = await cdp(entry.label, 'Page.getLayoutMetrics');
    const size = m.cssContentSize || m.contentSize || {};
    height = Math.max(r.vh, Math.min(Math.ceil(size.height || r.vh), 16000));
  } else {
    const m = await cdp(entry.label, 'Page.getLayoutMetrics');
    const vp = m.cssVisualViewport || m.visualViewport || {};
    x = vp.pageX || 0;
    y = vp.pageY || 0;
  }
  let out = Math.min(r.device.dpr, 2);
  if (maxWidth) out = Math.min(out, maxWidth / width);
  const res = await cdp(entry.label, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
    clip: { x, y, width, height, scale: out / eff },
  });
  return res.data;
}

async function screenshotPanes(list, full = true) {
  if (!DESKTOP) { toast('Screenshots are available in the Windows app.'); return; }
  toast(`Taking ${list.length} screenshot${list.length === 1 ? '' : 's'}…`, 1500);
  const saved = [];
  for (const p of list) {
    const entry = entries.get(p.id);
    if (!entry?.label) continue;
    try {
      const data = await capturePane(p, entry, { full });
      saved.push(await invoke('save_screenshot', { name: shotName(p), data }));
    } catch (e) {
      toast(`Screenshot failed for ${resolvePane(p).device.name}: ${e}`, 4000);
    }
  }
  if (saved.length) {
    toast(`Saved ${saved.length} screenshot${saved.length === 1 ? '' : 's'} to Pictures › DeviceDeck`, 5000, {
      label: 'Show',
      fn: () => invoke('open_path', { path: saved[0], select: true }),
    });
  }
}

// Touch emulation turns every mouse event into a touch, which also swallows the mouse moves and
// clicks DevTools needs for "Select an element". While inspecting, the device gets a normal mouse.
async function setTouchInput(label, on) {
  const steps = [
    ['Emulation.setTouchEmulationEnabled', on ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }],
    ['Emulation.setEmitTouchEventsForMouse', { enabled: on, configuration: on ? 'mobile' : 'desktop' }],
  ];
  for (const [method, params] of steps) {
    try { await cdp(label, method, params); } catch (e) { console.warn(method, e); }
  }
}

function setInspecting(entry, on) {
  entry.inspecting = on;
  const btn = entry.el.querySelector('[data-act="inspect"]');
  btn.classList.toggle('on', on);
  btn.title = on
    ? 'Inspecting with the mouse — click to bring touch input back'
    : 'Inspect (developer tools for this device)';
}

async function inspectPane(p) {
  const entry = entries.get(p.id);
  if (!DESKTOP || !entry?.label) { toast('Inspecting is available in the Windows app.'); return; }
  const pr = resolvePane(p).profile;
  const touch = !!pr.touch && pr.pointer === 'coarse';
  if (entry.inspecting) {
    // Second click: inspection finished, the device is a touch device again.
    if (touch) await setTouchInput(entry.label, true);
    setInspecting(entry, false);
    toast(`${resolvePane(p).device.name}: touch input is back`);
    return;
  }
  if (touch) {
    await setTouchInput(entry.label, false);
    setInspecting(entry, true);
    toast('Touch is paused on this device so the mouse can select elements in the inspector. Click Inspect again when you are done.', 6000, {
      label: 'Restore touch',
      fn: () => { if (entry.inspecting) inspectPane(p); },
    });
  }
  invoke('pane_devtools', { label: entry.label }).catch((e) => toast(`Couldn't open the inspector: ${e}`));
}

/* ------------------------------------------------------------------ AI assistants (MCP) */
const MCP_URL = 'http://127.0.0.1:12721/mcp';

/**
 * Which devices a tool works on (the same rule is described in the tool list for the AI):
 * 'all' | pane id | device id | part of a device name. Left out: the focused device in
 * Focus layout, otherwise every device (fallback 'all') or the first one (fallback 'first').
 */
function targetPanes(device, fallback) {
  if (device === undefined || device === null || String(device).trim() === '') {
    if (isFocus()) return activePanes();
    return fallback === 'all' ? state.panes.slice() : state.panes.slice(0, 1);
  }
  const q = String(device).trim().toLowerCase();
  if (q === 'all' || q === '*') return state.panes.slice();
  const exact = state.panes.filter((p) => p.id.toLowerCase() === q || resolvePane(p).device.id === q);
  if (exact.length) return exact;
  return state.panes.filter((p) => resolvePane(p).device.name.toLowerCase().includes(q));
}
function noDevice(device) {
  const known = state.panes.map((p) => `${paneLabel(p)} (${p.id})`).join(', ');
  return mcpText(`No previewed device matches "${device}". Previewed now: ${known}. Use 'all', a pane id, a device id or part of a name.`, true);
}
function mcpText(value, isError = false) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }], isError };
}
function paneLabel(p) {
  const r = resolvePane(p);
  return r.device.id === 'custom' ? `Custom ${r.vw}×${r.vh}` : r.device.name;
}
async function evalIn(p, expression) {
  const entry = entries.get(p.id);
  if (!entry?.label) throw new Error('device not loaded');
  const res = await cdp(entry.label, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result?.value;
}
function withTimeout(promise, ms, what) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms); }),
  ]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait until these devices report their page as loaded (or the time is up).
async function settle(panes, timeout = 15000 + panes.length * paceBudget()) {
  const until = Date.now() + timeout;
  await sleep(150);
  while (Date.now() < until && panes.some((p) => entries.get(p.id)?.loading)) await sleep(120);
  await sleep(250); // let late layout and fonts land before anyone looks
}
// A device hidden behind Focus layout may still show an old page: bring it up to date first.
async function ensureCurrent(panes) {
  const stale = [];
  for (const p of panes) {
    const entry = entries.get(p.id);
    if (!entry) continue;
    const key = frameKey(p);
    if (entry.key !== key || !entry.label && DESKTOP) {
      entry.key = key;
      loadFrame(p, entry);
      stale.push(p);
    }
  }
  if (stale.length) await settle(stale);
}
function loadInfo(p) {
  const entry = entries.get(p.id);
  return {
    device: paneLabel(p),
    pane: p.id,
    browser: BROWSER_LABEL[resolvePane(p).browser],
    url: entry?.url || null,
    title: entry?.title || null,
    loading: !!entry?.loading,
    live: isActivePane(p.id),
    tooManyRequests: entry?.retries ? (entry.retries > 3 ? 'blocked: the site kept answering 429 after 3 retries' : `the site answered 429, retry ${entry.retries} of 3 under way`) : undefined,
  };
}

// Runs inside the page (serialized with toString, so it must not use anything from outside).
function layoutCheck(minFont, minTap, touch) {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const vh = window.innerHeight;
  const se = document.scrollingElement || doc;
  const pageWidth = Math.max(se.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const overflowPx = Math.max(0, pageWidth - vw);
  const cut = (v) => v === 'hidden' || v === 'clip';
  const lockedX = cut(getComputedStyle(doc).overflowX) || (document.body && cut(getComputedStyle(document.body).overflowX));
  const sx = window.scrollX;
  const sel = (el) => {
    const parts = [];
    for (let e = el, i = 0; e && e.nodeType === 1 && e !== document.body && i < 4; e = e.parentElement, i++) {
      if (e.id) { parts.unshift(`#${CSS.escape(e.id)}`); break; }
      let s = e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
      const par = e.parentElement;
      if (par) {
        const same = [...par.children].filter((c) => c.tagName === e.tagName);
        if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      }
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const text = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const clipped = (el) => {
    for (let a = el.parentElement; a && a !== document.body && a !== doc; a = a.parentElement) {
      if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(a).overflowX)) return true;
    }
    return false;
  };
  const outside = (r) => r.right + sx > vw + 1 || r.left + sx < -1;
  const wide = []; const small = []; const taps = [];
  const counts = { wideElements: 0, smallText: 0, smallTapTargets: 0 };
  const all = document.body ? document.body.getElementsByTagName('*') : [];
  for (const el of all) {
    if (el.closest('[aria-hidden="true"],[inert]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) continue;
    if (outside(r) && cs.position !== 'fixed' && !clipped(el)) {
      const par = el.parentElement;
      // Only the outermost element that sticks out; its children follow from it.
      if (!par || par === document.body || !outside(par.getBoundingClientRect())) {
        counts.wideElements++;
        if (wide.length < 15) wide.push({ selector: sel(el), left: Math.round(r.left + sx), right: Math.round(r.right + sx), width: Math.round(r.width), text: text(el) });
      }
    }
    let ownText = false;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { ownText = true; break; }
    if (ownText) {
      const fs = parseFloat(cs.fontSize);
      if (fs < minFont) {
        counts.smallText++;
        if (small.length < 15) small.push({ selector: sel(el), fontSize: fs, text: text(el) });
      }
    }
    if (touch && el.matches('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[onclick]')) {
      // Links inside running text are exempt (as in WCAG 2.5.8).
      const inline = el.tagName === 'A' && cs.display === 'inline' && el.parentElement
        && el.parentElement.textContent.trim().length > text(el).length + 20;
      if (!inline && (r.width < minTap || r.height < minTap)) {
        counts.smallTapTargets++;
        if (taps.length < 15) taps.push({ selector: sel(el), width: Math.round(r.width), height: Math.round(r.height), text: text(el) });
      }
    }
  }
  return JSON.stringify({
    viewport: { width: vw, height: vh },
    pageWidth,
    horizontalScroll: overflowPx > 0 && !lockedX,
    overflowPx,
    wideElements: wide,
    smallText: small,
    smallTapTargets: touch ? taps : undefined,
    counts,
    ok: overflowPx === 0 && !counts.wideElements && !counts.smallText && !counts.smallTapTargets,
  });
}

// Run something in each device; one device gives its value, several give [{device, value|error}].
async function perDevice(panes, fn) {
  const out = [];
  for (const p of panes) {
    try {
      out.push({ device: paneLabel(p), pane: p.id, value: await fn(p) });
    } catch (e) {
      out.push({ device: paneLabel(p), pane: p.id, error: String(e?.message || e) });
    }
  }
  return out;
}

const MCP_TOOLS = {
  get_status: () => {
    const fp = isFocus() ? state.panes.find((p) => p.id === state.focusId) : null;
    return mcpText({
      layout: state.layout,
      focusedDevice: fp ? paneLabel(fp) : null,
      url: state.source.kind === 'url' ? state.source.url : `(${state.source.name || 'pasted HTML'})`,
      devices: state.panes.length,
      loading: state.panes.filter((p) => entries.get(p.id)?.loading).length,
      openMenuOrDialog: overlayOpen(),
    });
  },
  get_app_state: () => {
    const fp = isFocus() ? state.panes.find((p) => p.id === state.focusId) : null;
    return mcpText({
      url: state.source.kind === 'url' ? state.source.url : `(${state.source.name || 'pasted HTML'})`,
      layout: state.layout,
      focusedDevice: fp ? { pane: fp.id, name: paneLabel(fp) } : null,
      note: fp ? 'Focus layout: only the focused device is live. The others are paused and catch up when Focus is left; tools still work on them if you name them.' : undefined,
      tabs: state.tabs.map((t) => ({ id: t.id, title: tabLabel(t), active: t.id === state.activeTab })),
      devices: state.panes.map((p) => {
        const r = resolvePane(p);
        const entry = entries.get(p.id);
        return {
          pane: p.id, device: r.device.id, name: paneLabel(p), system: r.osVersion ? osVersionLabel(r.device.os, r.osVersion) : OS_LABEL[r.device.os], browser: BROWSER_LABEL[r.browser],
          width: r.vw, height: r.vh, pixelRatio: r.device.dpr, touch: !!r.profile.touch,
          url: entry?.url || null, loading: !!entry?.loading, live: isActivePane(p.id),
        };
      }),
      sync: state.sync,
      pageLoading: state.pace === 'off' ? 'all at once' : state.pace === 'gentle' ? 'one after another' : `${state.pace} s apart`,
      colorScheme: state.scheme,
    });
  },
  list_devices: () => mcpText({
    setDevicesFormat: "Pass ids to set_devices as 'device-id[:browser[:version]]' (browser from that device's `browsers`, version from its `versions`; leave a part empty for the default, e.g. 'pixel-8::15'), or 'custom:WIDTHxHEIGHT[:system[:kind[:version]]]'. The default version is the latest.",
    example: { devices: ['iphone-15:chrome', 'pixel-8', 'pixel-8::14', 'ipad-air:safari:17', 'windows-laptop:edge:10', 'custom:1280x800:windows:laptop'] },
    systems: Object.keys(OS_LABEL),
    versionsBySystem: Object.fromEntries(Object.entries(OS_VERSIONS).map(([os, list]) => [os, list.map((v) => v.id)])),
    kinds: GROUPS.map((g) => g.id),
    devices: DEVICES.map((d) => ({
      id: d.id, name: d.name, kind: d.type, system: OS_LABEL[d.os], width: d.w, height: d.h, pixelRatio: d.dpr,
      browsers: BROWSERS_BY_OS[d.os], defaultBrowser: DEFAULT_BROWSER[d.os],
      versions: OS_VERSIONS[d.os]?.map((v) => v.id) || [],
    })),
  }),
  set_devices: ({ devices = [] }) => {
    const panes = [];
    const skipped = [];
    // A version this system doesn't offer is reported and the latest is used.
    const versionFor = (item, os, v) => {
      if (!v) return null;
      const list = OS_VERSIONS[os];
      if (list?.some((x) => x.id === v)) return v === list[0].id ? null : v;
      skipped.push(`${item}: ${OS_LABEL[os]} ${v} isn't available${list ? ` (choose ${list.map((x) => x.id).join(', ')})` : ''}, used the latest`);
      return null;
    };
    for (const item of Array.isArray(devices) ? devices : [devices]) {
      const parts = String(item).split(':').map((s) => s.trim().toLowerCase());
      if (parts[0] === 'custom') {
        const m = /^(\d{3,4})x(\d{3,4})$/.exec(parts[1] || '');
        const os = OS_LABEL[parts[2]] ? parts[2] : 'windows';
        const type = GROUPS.some((g) => g.id === parts[3]) ? parts[3]
          : (os === 'ios' || os === 'android') ? 'phone' : os === 'ipados' ? 'tablet' : 'laptop';
        if (!m) { skipped.push(`${item} (use custom:WIDTHxHEIGHT, e.g. custom:390x844:ios:phone)`); continue; }
        const w = Math.max(200, Math.min(4000, +m[1]));
        const h = Math.max(200, Math.min(4000, +m[2]));
        const dpr = type === 'phone' ? 3 : type === 'tablet' ? 2 : 1;
        panes.push({ id: newId(), deviceId: 'custom', browser: DEFAULT_BROWSER[os], osVersion: versionFor(item, os, parts[4]), rotated: false, scheme: null, custom: { w, h, dpr, os, type } });
        continue;
      }
      const d = findDevice(parts[0]);
      if (!d) { skipped.push(`${item} (unknown device id)`); continue; }
      const browser = parts[1];
      if (browser && !BROWSERS_BY_OS[d.os].includes(browser)) skipped.push(`${item}: ${browser} isn't available on ${OS_LABEL[d.os]}, used ${BROWSER_LABEL[DEFAULT_BROWSER[d.os]]}`);
      panes.push({ id: newId(), deviceId: d.id, browser: BROWSERS_BY_OS[d.os].includes(browser) ? browser : DEFAULT_BROWSER[d.os], osVersion: versionFor(item, d.os, parts[2]), rotated: false, scheme: null, custom: null });
    }
    if (!panes.length) return mcpText(`No usable devices. ${skipped.join('; ')}. Call list_devices for the ids.`, true);
    state.panes = panes;
    state.preset = null;
    if (isFocus()) state.focusId = panes[0].id;
    renderPanes();
    save();
    return mcpText({
      previewing: panes.map((p) => {
        const r = resolvePane(p);
        return { pane: p.id, name: paneLabel(p), browser: BROWSER_LABEL[r.browser], system: r.osVersion ? osVersionLabel(r.device.os, r.osVersion) : OS_LABEL[r.device.os] };
      }),
      notes: skipped.length ? skipped : undefined,
    });
  },
  navigate: async ({ url, timeout_ms: timeout }) => {
    if (!url) return mcpText('Give a url, e.g. { "url": "localhost:3000" }.', true);
    navigate(url);
    const panes = activePanes();
    timeout ??= 15000 + panes.length * paceBudget(); // devices load one after another
    await settle(panes, Math.min(60000, Math.max(1000, timeout)));
    return mcpText({
      requested: state.source.url,
      devices: panes.map(loadInfo),
      note: isFocus() ? 'Focus layout: only the focused device loaded the page.' : undefined,
    });
  },
  reload: async ({ device }) => {
    const panes = targetPanes(device, 'all');
    if (!panes.length) return noDevice(device);
    for (const p of panes) {
      const entry = entries.get(p.id);
      if (!entry) continue;
      entry.key = frameKey(p);
      loadFrame(p, entry);
    }
    await settle(panes);
    return mcpText({ reloaded: panes.map(loadInfo) });
  },
  screenshot: async ({ device, full_page: full = false }) => {
    const panes = targetPanes(device, 'all');
    if (!panes.length) return noDevice(device);
    await ensureCurrent(panes);
    const content = [];
    for (const p of panes) {
      const entry = entries.get(p.id);
      const r = resolvePane(p);
      const head = `${paneLabel(p)} (${BROWSER_LABEL[r.browser]}, ${r.vw}×${r.vh}, pane ${p.id})`;
      if (!entry?.label) { content.push({ type: 'text', text: `${head}: not loaded` }); continue; }
      try {
        const data = await capturePane(p, entry, { full: !!full, maxWidth: 1000 });
        content.push({ type: 'text', text: head });
        content.push({ type: 'image', mimeType: 'image/png', data });
      } catch (e) {
        content.push({ type: 'text', text: `${head}: screenshot failed (${e?.message || e})` });
      }
    }
    return { content, isError: !content.some((c) => c.type === 'image') };
  },
  read_page: async ({ device }) => {
    const panes = targetPanes(device, 'first');
    if (!panes.length) return noDevice(device);
    await ensureCurrent(panes);
    const res = await perDevice(panes, async (p) => JSON.parse(await evalIn(p,
      'JSON.stringify({ title: document.title, url: location.href, text: (document.body ? document.body.innerText : "").slice(0, 20000) })')));
    const flat = res.map((r) => (r.error ? r : { device: r.device, pane: r.pane, ...r.value }));
    return mcpText(flat.length === 1 ? flat[0] : flat, flat.every((r) => r.error));
  },
  click: async ({ selector, device }) => {
    if (!selector) return mcpText('Give a CSS selector, e.g. { "selector": "#menu" }.', true);
    const panes = targetPanes(device, 'all');
    if (!panes.length) return noDevice(device);
    const sel = JSON.stringify(selector);
    const res = await perDevice(panes, (p) => evalIn(p, `(() => { const e = document.querySelector(${sel}); if (!e) return 'not found'; e.scrollIntoView({ block: 'center' }); e.click(); return 'clicked'; })()`));
    return mcpText(res.map((r) => `${r.device}: ${r.error ? `error: ${r.error}` : r.value}`).join('\n'), res.every((r) => r.error || r.value !== 'clicked'));
  },
  type_text: async ({ selector, text = '', device }) => {
    if (!selector) return mcpText('Give a CSS selector, e.g. { "selector": "input[name=q]", "text": "hello" }.', true);
    const panes = targetPanes(device, 'all');
    if (!panes.length) return noDevice(device);
    const sel = JSON.stringify(selector);
    const val = JSON.stringify(String(text));
    const res = await perDevice(panes, (p) => evalIn(p, `(() => { const e = document.querySelector(${sel}); if (!e) return 'not found'; e.focus(); const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set; if (set && 'value' in e) set.call(e, ${val}); else e.value = ${val}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 'typed'; })()`));
    return mcpText(res.map((r) => `${r.device}: ${r.error ? `error: ${r.error}` : r.value}`).join('\n'), res.every((r) => r.error || r.value !== 'typed'));
  },
  run_script: async ({ device, code, timeout_ms: timeout = 10000 }) => {
    if (!code) return mcpText('Give some code, e.g. { "code": "document.title" }.', true);
    const panes = targetPanes(device, 'first');
    if (!panes.length) return noDevice(device);
    await ensureCurrent(panes);
    const ms = Math.min(60000, Math.max(100, +timeout || 10000));
    const body = /\breturn\b|;/.test(code) ? code : `return (${code});`;
    const expr = `(async () => { const __r = await (async () => { ${body}\n })(); return JSON.stringify(__r === undefined ? null : __r); })()`;
    const res = await perDevice(panes, async (p) => JSON.parse((await withTimeout(evalIn(p, expr), ms, 'The script')) ?? 'null'));
    if (res.length === 1) {
      return res[0].error ? mcpText(`${res[0].device}: ${res[0].error}`, true) : mcpText(JSON.stringify(res[0].value, null, 2));
    }
    return mcpText(res, res.every((r) => r.error));
  },
  check_layout: async ({ device, min_font_px: minFont = 12, min_tap_px: minTap = 24 }) => {
    const panes = targetPanes(device, 'all');
    if (!panes.length) return noDevice(device);
    await ensureCurrent(panes);
    const res = await perDevice(panes, async (p) => {
      const pr = resolvePane(p).profile;
      const touch = !!pr.touch && pr.pointer === 'coarse';
      const args = [Number(minFont) || 12, Number(minTap) || 24, touch].map((a) => JSON.stringify(a)).join(',');
      return JSON.parse(await withTimeout(evalIn(p, `(${layoutCheck.toString()})(${args})`), 20000, 'The layout check'));
    });
    const flat = res.map((r) => (r.error ? r : { device: r.device, pane: r.pane, ...r.value }));
    return mcpText(flat, flat.every((r) => r.error));
  },
};

if (DESKTOP && window.__TAURI__?.event) {
  window.__TAURI__.event.listen('mcp-call', async (ev) => {
    const { id, name, arguments: args } = ev.payload || {};
    let result;
    try {
      const fn = MCP_TOOLS[name];
      result = fn ? await fn(args || {}) : mcpText(`Unknown tool ${name}`, true);
    } catch (e) {
      result = mcpText(String(e?.message || e), true);
    }
    invoke('mcp_reply', { id, result }).catch(() => {});
  });
}

function deviceOptions(selected) {
  let html = '';
  for (const g of GROUPS) {
    html += `<optgroup label="${g.label}">`;
    for (const d of DEVICES.filter((x) => x.type === g.id)) {
      html += `<option value="${d.id}"${d.id === selected ? ' selected' : ''}>${escapeHtml(d.name)}</option>`;
    }
    html += '</optgroup>';
  }
  html += `<optgroup label="Other"><option value="custom"${selected === 'custom' ? ' selected' : ''}>Custom size…</option></optgroup>`;
  return html;
}

function browserOptions(os, selected) {
  return BROWSERS_BY_OS[os]
    .map((b) => `<option value="${b}"${b === selected ? ' selected' : ''}>${BROWSER_LABEL[b]}</option>`)
    .join('');
}

function versionOptions(os, selected) {
  return (OS_VERSIONS[os] || [])
    .map((v, i) => `<option value="${v.id}"${v.id === selected ? ' selected' : ''}>${escapeHtml(osVersionLabel(os, v.id))}${i === 0 ? ' (latest)' : ''}</option>`)
    .join('');
}

function createPaneEl(p) {
  const el = document.createElement('section');
  el.className = 'pane';
  el.dataset.id = p.id;
  el.innerHTML = `
    <div class="pane-head">
      <span class="dev-icon"></span>
      <select class="dev-select" aria-label="Device"></select>
      <select class="browser-select" aria-label="Browser"></select>
      <select class="ver-select" aria-label="System version" title="System version"></select>
      <button class="icon-btn sm desktop-only" data-act="inspect" title="Inspect (developer tools for this device)">${ICONS.inspect}</button>
      <button class="icon-btn sm desktop-only" data-act="shot" title="Screenshot this device (whole page)">${ICONS.camera}</button>
    </div>
    <div class="pane-sub">
      <span class="dims"></span>
      <span class="custom-dims">
        <input type="number" class="cw" min="200" max="4000" aria-label="Width" /> ×
        <input type="number" class="ch" min="200" max="4000" aria-label="Height" />
      </span>
      <span class="chip os-chip"></span>
      <div class="pane-actions">
        <button class="icon-btn sm" data-act="rotate" title="Rotate">${ICONS.rotate}</button>
        <button class="icon-btn sm" data-act="scheme" title="Light / dark for this device"></button>
        <button class="icon-btn sm" data-act="info" title="What the page sees">${ICONS.info}</button>
        <button class="icon-btn sm" data-act="reload" title="Reload this device">${ICONS.reload}</button>
        <button class="icon-btn sm" data-act="open" title="Open in its own window at this size">${ICONS.open}</button>
        <button class="icon-btn sm" data-act="focus" title="Focus on this device">${ICONS.focus}</button>
        <button class="icon-btn sm danger" data-act="remove" title="Remove">${ICONS.close}</button>
      </div>
    </div>
    <div class="pane-info" hidden>
      <div class="info-grid"></div>
      <div class="ua-row"><code class="ua"></code><button class="icon-btn sm" data-act="copy-ua" title="Copy">${ICONS.copy}</button></div>
    </div>
    <div class="pane-body">
      <div class="shell">
        <div class="screen">
          <div class="frame-host"></div>
          <div class="resize-handle" title="Drag to change the width"></div>
        </div>
      </div>
      <span class="status-badge wait">Loading…</span>
    </div>
    <div class="pane-grip" title="Drag to resize this panel"></div>`;

  el.querySelector('.dev-select').addEventListener('change', (e) => {
    const cur = resolvePane(p);
    p.deviceId = e.target.value;
    if (p.deviceId === 'custom') {
      p.custom = { w: cur.vw, h: cur.vh, dpr: cur.device.dpr, os: cur.device.os, type: cur.device.type };
      p.rotated = false;
    } else {
      p.browser = DEFAULT_BROWSER[findDevice(p.deviceId).os];
      // Keep the chosen version only while the system stays the same.
      if (findDevice(p.deviceId).os !== cur.device.os) p.osVersion = null;
    }
    renderPanes();
    save();
  });
  el.querySelector('.browser-select').addEventListener('change', (e) => {
    p.browser = e.target.value;
    renderPanes();
    save();
  });
  el.querySelector('.ver-select').addEventListener('change', (e) => {
    const latest = OS_VERSIONS[resolvePane(p).device.os]?.[0]?.id;
    p.osVersion = e.target.value === latest ? null : e.target.value;
    renderPanes();
    save();
  });
  const onDims = () => {
    const w = Math.max(200, Math.min(4000, parseInt(el.querySelector('.cw').value, 10) || 0));
    const h = Math.max(200, Math.min(4000, parseInt(el.querySelector('.ch').value, 10) || 0));
    p.custom = { ...(p.custom || {}), w, h };
    renderPanes();
    save();
  };
  el.querySelector('.cw').addEventListener('change', onDims);
  el.querySelector('.ch').addEventListener('change', onDims);

  el.querySelector('.pane-actions').addEventListener('click', (e) => onPaneAction(p, e));
  el.querySelector('[data-act="inspect"]').addEventListener('click', () => inspectPane(p));
  el.querySelector('[data-act="shot"]').addEventListener('click', () => screenshotPanes([p], true));
  el.querySelector('[data-act="copy-ua"]').addEventListener('click', () => copyText(resolvePane(p).profile.ua));
  setupResize(p, el);
  setupFreeMove(p, el);
  // The device under the mouse is the one whose identity goes with new page requests.
  el.querySelector('.pane-body').addEventListener('pointerenter', () => setActiveProfile(p));
  return el;
}

function onPaneAction(p, e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const entry = entries.get(p.id);
  if (act === 'rotate') {
    if (p.deviceId === 'custom' && p.custom) p.custom = { ...p.custom, w: p.custom.h, h: p.custom.w };
    else p.rotated = !p.rotated;
  } else if (act === 'scheme') {
    p.scheme = p.scheme === null || p.scheme === undefined ? 'light' : p.scheme === 'light' ? 'dark' : null;
    toast(`This device: ${p.scheme ? `${p.scheme} mode` : 'follows the global setting'}`);
  } else if (act === 'info') {
    entry.el.querySelector('.pane-info').hidden = !entry.el.querySelector('.pane-info').hidden;
    btn.classList.toggle('on');
    return;
  } else if (act === 'reload') {
    loadFrame(p, entry);
    return;
  } else if (act === 'open') {
    openWindow(p);
    return;
  } else if (act === 'focus') {
    if (state.layout === 'focus' && state.focusId === p.id) {
      state.layout = state.prevLayout || 'row';
    } else {
      if (state.layout !== 'focus') state.prevLayout = state.layout;
      state.layout = 'focus';
      state.focusId = p.id;
    }
    updateLayoutSeg();
  } else if (act === 'remove') {
    if (state.panes.length === 1) {
      toast('Keep at least one device');
      return;
    }
    state.panes = state.panes.filter((x) => x.id !== p.id);
    state.preset = null;
  }
  renderPanes();
  save();
}

function openWindow(p) {
  const r = resolvePane(p);
  if (DESKTOP) {
    invoke('pane_popup', {
      url: sourceUrlForNative(),
      ua: r.profile.ua,
      init: nativeInit({ ...r.profile, scheme: paneScheme(p), paneId: null }),
      headers: headerRules(r.profile),
      title: `${r.device.name} — ${BROWSER_LABEL[r.browser]} (${r.vw} × ${r.vh})`,
      w: r.vw,
      h: r.vh,
    }).catch((err) => toast(`Couldn't open the window: ${err}`));
    return;
  }
  const name = NAME_PREFIX + JSON.stringify({ ...r.profile, scheme: paneScheme(p), paneId: null });
  const feats = `popup,width=${Math.min(r.vw, screen.availWidth)},height=${Math.min(r.vh, screen.availHeight)}`;
  if (state.source.kind === 'url') {
    window.open(state.source.url, name, feats);
  } else {
    const w = window.open('', name, feats);
    if (w) {
      w.document.open();
      w.document.write(injectHelper(state.source.html, name));
      w.document.close();
    }
  }
}

function setupResize(p, el) {
  const handle = el.querySelector('.resize-handle');
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const r = resolvePane(p);
    const entry = entries.get(p.id);
    const startX = e.clientX;
    const startW = r.vw;
    const scale = entry.scale || 1;
    document.body.classList.add('resizing');
    const move = (ev) => {
      const w = Math.round(Math.max(200, Math.min(4000, startW + ((ev.clientX - startX) * 2) / scale)));
      p.deviceId = 'custom';
      p.custom = { w, h: r.vh, dpr: r.device.dpr, os: r.device.os, type: r.device.type };
      p.rotated = false;
      sizePane(p, entry);
      entry.el.querySelector('.dims').textContent = `${w} × ${r.vh}`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      renderPanes();
      save();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

/* ------------------------------------------------------------------ Free layout: an endless canvas */
// Panels sit on a canvas that can be moved in any direction and zoomed. A panel's box is in canvas
// units; the canvas offset (x, y) and zoom (z) turn that into a place on screen.
let zTop = 1;
const CZ_MIN = 0.1;
const CZ_MAX = 3;
function canvas() {
  const c = state.canvas;
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y) || !(c.z > 0)) state.canvas = { x: 0, y: 0, z: 1 };
  return state.canvas;
}
const freeZoom = () => (state.layout === 'free' ? canvas().z : 1);
// What a device view is really zoomed to on screen.
const viewZoom = (entry) => (entry.scale || 1) * freeZoom();

function applyBox(p, entry) {
  const el = entry.el;
  if (state.layout !== 'free' || !p.box) {
    el.style.left = el.style.top = el.style.zIndex = el.style.transform = '';
    return;
  }
  const c = canvas();
  el.style.left = `${Math.round(p.box.x * c.z + c.x)}px`;
  el.style.top = `${Math.round(p.box.y * c.z + c.y)}px`;
  el.style.transform = c.z === 1 ? '' : `scale(${c.z})`;
  el.style.zIndex = String(p.box.z || 1);
}

let canvasSaveTimer;
function applyCanvas() {
  const host = $('#panes');
  if (state.layout !== 'free') {
    host.style.backgroundSize = host.style.backgroundPosition = '';
    return;
  }
  const c = canvas();
  for (const p of state.panes) { const en = entries.get(p.id); if (en) applyBox(p, en); }
  // The dot grid moves and zooms with the canvas (spaced wider when far out, so it never gets dense).
  let step = 24 * c.z;
  while (step < 12) step *= 4;
  host.style.backgroundSize = `${step}px ${step}px`;
  host.style.backgroundPosition = `${c.x}px ${c.y}px`;
  syncZoomSelect();
  clearTimeout(canvasSaveTimer);
  canvasSaveTimer = setTimeout(save, 300);
}

// Zoom keeping the canvas point under (px, py) (relative to the canvas) where it is.
function zoomAt(z, px, py) {
  const c = canvas();
  const nz = Math.max(CZ_MIN, Math.min(CZ_MAX, z));
  if (nz === c.z) return;
  c.x = px - ((px - c.x) / c.z) * nz;
  c.y = py - ((py - c.y) / c.z) * nz;
  c.z = Math.round(nz * 1000) / 1000;
  applyCanvas();
}
function zoomCenter(z) {
  const host = $('#panes');
  zoomAt(z, host.clientWidth / 2, host.clientHeight / 2);
}
function stepCanvasZoom(dir) {
  zoomCenter(canvas().z * (dir > 0 ? 1.25 : 0.8));
  toast(`Canvas ${Math.round(canvas().z * 100)}%`, 900);
}

// Zoom and move so every device is in view.
function fitAll() {
  const host = $('#panes').getBoundingClientRect();
  const c = canvas();
  let x1 = Infinity; let y1 = Infinity; let x2 = -Infinity; let y2 = -Infinity;
  for (const p of state.panes) {
    const en = entries.get(p.id);
    if (!en || en.el.hidden || !p.box) continue;
    const r = en.el.getBoundingClientRect();
    const x = (r.left - host.left - c.x) / c.z;
    const y = (r.top - host.top - c.y) / c.z;
    x1 = Math.min(x1, x); y1 = Math.min(y1, y);
    x2 = Math.max(x2, x + r.width / c.z); y2 = Math.max(y2, y + r.height / c.z);
  }
  if (!Number.isFinite(x1)) return;
  const pad = 32;
  const z = Math.max(CZ_MIN, Math.min(1, (host.width - pad * 2) / (x2 - x1), (host.height - pad * 2) / (y2 - y1)));
  c.z = Math.round(z * 1000) / 1000;
  c.x = Math.round((host.width - (x2 - x1) * c.z) / 2 - x1 * c.z);
  c.y = Math.round((host.height - (y2 - y1) * c.z) / 2 - y1 * c.z);
  applyCanvas();
}

// The toolbar's zoom menu zooms the canvas in Free layout.
const ZOOM_PANES = [['fit', 'Fit height'], ['0.25', '25%'], ['0.33', '33%'], ['0.5', '50%'], ['0.67', '67%'], ['0.75', '75%'], ['1', '100%']];
const ZOOM_CANVAS = [['fit', 'Show all'], ['0.25', '25%'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.5', '150%'], ['2', '200%']];
let zoomMenuKind = 'panes';
function syncZoomSelect() {
  const sel = $('#zoom');
  const free = state.layout === 'free';
  const kind = free ? 'canvas' : 'panes';
  if (kind !== zoomMenuKind || !sel.options.length) {
    zoomMenuKind = kind;
    sel.innerHTML = (free ? ZOOM_CANVAS : ZOOM_PANES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  }
  sel.title = free ? 'Canvas zoom (Ctrl + scroll)' : 'Device size';
  if (!free) { sel.value = state.zoom; return; }
  const z = canvas().z;
  const match = ZOOM_CANVAS.find(([v]) => v !== 'fit' && Math.abs(parseFloat(v) - z) < 0.005);
  let cur = sel.querySelector('option[data-cur]');
  if (match) { cur?.remove(); sel.value = match[0]; return; }
  if (!cur) {
    cur = document.createElement('option');
    cur.dataset.cur = '1';
    sel.appendChild(cur);
  }
  cur.value = String(z);
  cur.textContent = `${Math.round(z * 100)}%`;
  sel.value = cur.value;
}

function raiseNative(entry) {
  if (DESKTOP && entry?.label) invoke('pane_raise', { label: entry.label }).catch(() => {});
}
function bringToFront(p) {
  if (!p.box) return;
  if (p.box.z !== zTop) p.box.z = ++zTop;
  const entry = entries.get(p.id);
  if (entry) { entry.el.style.zIndex = String(p.box.z); raiseNative(entry); }
}
// Native views stack in creation order; put them back in the order the panels are stacked.
function restackNative() {
  if (state.layout !== 'free') return;
  state.panes.slice().sort((a, b) => (a.box?.z || 0) - (b.box?.z || 0)).forEach((p) => raiseNative(entries.get(p.id)));
}

// Switching to Free keeps every panel where it is now, at the size it is now; hidden ones are cascaded.
function initFreeBoxes() {
  const host = $('#stage').getBoundingClientRect();
  const c = canvas();
  let cascade = 0;
  for (const p of state.panes) {
    const entry = entries.get(p.id);
    if (p.box || !entry) continue;
    const r = entry.el.getBoundingClientRect();
    const shown = !entry.el.hidden && r.width > 0;
    const s = (entry.scale || 0.5) / c.z;
    p.box = shown
      ? { x: (r.left - host.left - c.x) / c.z, y: (r.top - host.top - c.y) / c.z, s, z: ++zTop }
      : { x: (24 - c.x) / c.z + cascade * 36, y: (24 - c.y) / c.z + cascade * 36, s, z: ++zTop };
    if (!shown) cascade++;
  }
}
// New panels appear in the part of the canvas that is on screen.
function newBoxFor() {
  const c = canvas();
  const n = state.panes.filter((x) => x.box).length;
  return { x: (24 - c.x) / c.z + (n % 8) * 36, y: (24 - c.y) / c.z + (n % 8) * 36, s: 0.4, z: ++zTop };
}

function setupFreeMove(p, el) {
  const head = el.querySelector('.pane-head');
  head.addEventListener('pointerdown', (e) => {
    if (state.layout !== 'free' || e.button !== 0 || e.target.closest('select, button, input')) return;
    e.preventDefault();
    head.setPointerCapture(e.pointerId);
    bringToFront(p);
    const entry = entries.get(p.id);
    const sx = e.clientX;
    const sy = e.clientY;
    const bx = p.box.x;
    const by = p.box.y;
    document.body.classList.add('moving');
    const move = (ev) => {
      const z = canvas().z;
      p.box.x = Math.round(bx + (ev.clientX - sx) / z);
      p.box.y = Math.round(by + (ev.clientY - sy) / z);
      applyBox(p, entry);
    };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      document.body.classList.remove('moving');
      save();
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  });
  // Clicking anywhere on a panel brings it to the front.
  el.addEventListener('pointerdown', () => { if (state.layout === 'free') bringToFront(p); }, true);

  const grip = el.querySelector('.pane-grip');
  grip.addEventListener('pointerdown', (e) => {
    if (state.layout !== 'free' || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    bringToFront(p);
    const entry = entries.get(p.id);
    const r = resolvePane(p);
    const sx = e.clientX;
    const sy = e.clientY;
    const startW = r.vw * p.box.s;
    document.body.classList.add('scaling');
    const move = (ev) => {
      // Follow whichever way the pointer went further, keeping the device's proportions.
      const z = canvas().z;
      const dx = (ev.clientX - sx) / z;
      const dy = ((ev.clientY - sy) / z) * (r.vw / r.vh);
      const want = (startW + (Math.abs(dx) > Math.abs(dy) ? dx : dy)) / r.vw;
      p.box.s = Math.round(Math.max(0.1, Math.min(want, 2)) * 1000) / 1000;
      sizePane(p, entry);
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      document.body.classList.remove('scaling');
      toast(`${paneLabel(p)}: ${Math.round(p.box.s * 100)}%`, 1000);
      save();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}

// Moving around the canvas: drag the empty background (or hold Space, or use the middle button,
// anywhere), scroll to move, Ctrl + scroll or pinch to zoom, double-click the background to show all.
let spaceHeld = false;
function setupCanvas() {
  // Every tab has its own panel container inside the stage, so listen on the stage.
  const host = $('#stage');
  host.addEventListener('pointerdown', (e) => {
    if (state.layout !== 'free' || !e.target.closest('#panes')) return;
    const onBackground = !e.target.closest('.pane');
    if (!(e.button === 1 || (e.button === 0 && (onBackground || spaceHeld)))) return;
    e.preventDefault();
    e.stopPropagation();
    host.setPointerCapture(e.pointerId);
    const c = canvas();
    const sx = e.clientX - c.x;
    const sy = e.clientY - c.y;
    document.body.classList.add('panning');
    const move = (ev) => {
      c.x = Math.round(ev.clientX - sx);
      c.y = Math.round(ev.clientY - sy);
      applyCanvas();
    };
    const up = () => {
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
      document.body.classList.remove('panning');
    };
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
  }, true);
  // The middle button would otherwise start the browser's autoscroll.
  host.addEventListener('auxclick', (e) => { if (state.layout === 'free' && e.button === 1) e.preventDefault(); });
  host.addEventListener('dblclick', (e) => {
    if (state.layout === 'free' && !e.target.closest('.pane')) fitAll();
  });
  host.addEventListener('wheel', (e) => {
    if (state.layout !== 'free') return;
    e.preventDefault();
    const line = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.clientHeight : 1;
    if (e.ctrlKey || e.metaKey) {
      const r = $('#panes').getBoundingClientRect();
      // Trackpad pinches arrive as small Ctrl + scroll steps, mouse wheels as big ones.
      const d = Math.max(-60, Math.min(60, e.deltaY * line));
      zoomAt(canvas().z * Math.exp(-d * 0.006), e.clientX - r.left, e.clientY - r.top);
      return;
    }
    let dx = e.deltaX * line;
    let dy = e.deltaY * line;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    const c = canvas();
    c.x = Math.round(c.x - dx);
    c.y = Math.round(c.y - dy);
    applyCanvas();
  }, { passive: false });

  const typing = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || state.layout !== 'free' || typing(e.target) || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (!spaceHeld) { spaceHeld = true; document.body.classList.add('pan-ready'); }
  });
  const release = () => { spaceHeld = false; document.body.classList.remove('pan-ready'); };
  document.addEventListener('keyup', (e) => { if (e.code === 'Space') release(); });
  window.addEventListener('blur', release);
}
setupCanvas();

function frameKey(p) {
  const r = resolvePane(p);
  return [sourceKey(), r.device.id, r.browser, r.osVersion || '', r.vw, r.vh, r.device.dpr, r.device.os, r.device.type, paneScheme(p) || ''].join('|');
}

function loadFrame(p, entry) {
  const r = resolvePane(p);
  const scheme = paneScheme(p);
  const profile = { ...r.profile, scheme, paneId: p.id };
  const name = NAME_PREFIX + JSON.stringify(profile);
  const host = entry.el.querySelector('.frame-host');
  host.innerHTML = '';
  entry.loading = true;
  entry.title = null;
  entry.covered = entry.covering = false;
  if (DESKTOP) dropSnapshot(entry);
  if (entry.inspecting) setInspecting(entry, false); // a fresh view starts with touch on again
  if (DESKTOP) {
    // A real browser view with this device's identity, placed exactly over the pane's screen.
    closeNative(entry);
    entry.iframe = null;
    entry.faked = true;
    entry.url = state.source.kind === 'url' ? state.source.url : null;
    sizePane(p, entry);
    const label = `pane-${p.id}-${++nativeSeq}`;
    const rect = entry.el.querySelector('.screen').getBoundingClientRect();
    entry.label = label;
    entry.lastLayout = null;
    setBadge(entry, 'faked');
    const nativeProfile = { ...profile, nativeTouch: true };
    const target = sourceUrlForNative();
    const stale = () => entry.label !== label; // replaced or closed while waiting its turn
    queueView(() => (stale() ? null : invoke('pane_open', {
      label,
      url: target,
      ua: r.profile.ua,
      init: nativeInit(nativeProfile),
      headers: headerRules(profile),
      bounds: { x: rect.left, y: rect.top, w: Math.max(1, rect.width), h: Math.max(1, rect.height), zoom: viewZoom(entry) },
      defer: true,
    }).then(() => { entry.lastLayout = null; }))) // the layout loop now places it where the panel is
      .then(() => { if (!stale()) return applyEmulation(label, profile); })
      .then(() => { if (!stale()) return pacedNavigate(entry, target); })
      .then(() => restackNative())
      .catch((err) => {
        if (stale()) return;
        entry.loading = false;
        setBadge(entry, 'size');
        toast(`Couldn't open this address: ${err}`, 4000);
      });
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.name = name;
  iframe.title = `${r.device.name} preview`;
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen; geolocation; camera; microphone');
  iframe.style.colorScheme = scheme || 'normal';
  entry.iframe = iframe;
  entry.faked = state.source.kind === 'html';
  entry.url = state.source.kind === 'url' ? state.source.url : null;
  setBadge(entry, 'wait');
  clearTimeout(entry.fakeTimer);
  iframe.addEventListener('load', () => {
    if (!iframe.getAttribute('src') && !iframe.srcdoc) return;
    entry.loading = false;
    clearTimeout(entry.fakeTimer);
    entry.fakeTimer = setTimeout(() => {
      if (!entry.faked) setBadge(entry, 'size');
      updateStatus();
    }, 700);
    entry.onLoaded?.();
  });
  sizePane(p, entry);
  if (state.source.kind === 'html') {
    iframe.srcdoc = injectHelper(state.source.html, name);
    host.appendChild(iframe);
    return;
  }
  const url = state.source.url;
  if (!ext.connected) {
    iframe.src = url;
    host.appendChild(iframe);
    return;
  }
  // With the Connector, devices load one after another so each page request
  // goes out with that device's own browser name and system.
  const token = {};
  entry.loadToken = token;
  ext.loading++;
  loadChain = loadChain.then(async () => {
    try {
      if (entry.loadToken !== token) return;
      await extSend({ type: 'profile', profile });
      ext.activePane = p.id;
      if (entry.loadToken !== token) return;
      await new Promise((done) => {
        const t = setTimeout(done, 3500);
        entry.onLoaded = () => { clearTimeout(t); entry.onLoaded = null; done(); };
        iframe.src = url;
        host.appendChild(iframe);
      });
    } finally {
      ext.loading--;
    }
  });
}

function isForeignUrl() {
  if (DESKTOP || state.source.kind !== 'url') return false;
  try { return new URL(state.source.url).origin !== location.origin; } catch { return false; }
}

// A card shown over a preview when the site may have refused to be embedded.
function setNotice(entry, show) {
  let n = entry.el.querySelector('.pane-notice');
  if (!show) { n?.remove(); return; }
  if (n) return;
  n = document.createElement('div');
  n.className = 'pane-notice';
  n.innerHTML = `
    <button class="notice-x" title="Hide" aria-label="Hide">${ICONS.close}</button>
    <b>Blank or "refused to connect"?</b>
    <span>This website forbids being shown inside other pages, and in the web version it also sees your real browser. The Windows app shows every site as this real device.</span>
    <div class="notice-actions">
      <a class="btn primary sm" href="https://github.com/dhia-eddine-mahdaoui/devicedeck/releases/latest" target="_blank" rel="noopener">Get the Windows app</a>
      <button class="btn ghost sm" data-n="open">Open in a window</button>
    </div>`;
  n.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('notice-x')) n.remove();
    else if (b.dataset.n === 'setup') openDialog('#dlg-helper');
    else if (b.dataset.n === 'open') {
      const p = state.panes.find((x) => entries.get(x.id) === entry);
      if (p) openWindow(p);
    }
  });
  entry.el.querySelector('.screen').appendChild(n);
}

function updateBanner() {
  const show = !ext.connected && isForeignUrl() && !sessionStorage.getItem('dd-banner-hidden');
  $('#ext-banner').hidden = !show;
}

function setBadge(entry, kind, text) {
  const b = entry.el.querySelector('.status-badge');
  b.className = `status-badge ${kind}`;
  setNotice(entry, kind === 'size' && !ext.connected && isForeignUrl());
  if (kind === 'limited') {
    b.textContent = text;
    b.title = 'The website answered "Too many requests" (HTTP 429). All devices share your internet address, so the site counts them as one visitor.';
  } else if (kind === 'wait') {
    b.textContent = 'Loading…';
    b.title = '';
  } else if (kind === 'faked') {
    b.textContent = 'Device faked';
    b.title = 'The page sees this device: browser name, system, touch, screen and pixel density.';
  } else {
    b.textContent = 'Size only';
    b.title = 'Shown at this device\'s exact size. To fake the device itself, add the helper line to your site (see "Emulation setup").';
  }
}

function sizePane(p, entry) {
  const r = resolvePane(p);
  const stageRect = $('#stage').getBoundingClientRect();
  const s = computeScale(r, stageRect, p);
  entry.scale = s;
  const screen = entry.el.querySelector('.screen');
  screen.style.width = `${Math.round(r.vw * s)}px`;
  screen.style.height = `${Math.round(r.vh * s)}px`;
  if (entry.iframe) {
    entry.iframe.style.width = `${r.vw}px`;
    entry.iframe.style.height = `${r.vh}px`;
    entry.iframe.style.transform = `scale(${s})`;
  }
  const shell = entry.el.querySelector('.shell');
  shell.className = `shell ${state.frames ? `framed ${r.device.type}` : 'plain'}${r.vw > r.vh ? ' landscape' : ''}${r.device.home ? ' home' : ''}`;
  shell.style.setProperty('--s', s);
  // The real screen outline: rounded corners and the front camera, where the real device has them.
  const shape = state.frames ? screenShape(r.device, r.rotated) : { r: 0, cut: null };
  shell.style.setProperty('--r', `${shape.r * s}px`);
  let cut = screen.querySelector('.cutout');
  if (shape.cut) {
    if (!cut) {
      cut = document.createElement('div');
      cut.className = 'cutout';
      screen.appendChild(cut);
    }
    const c = shape.cut;
    Object.assign(cut.style, { left: `${c.x * s}px`, top: `${c.y * s}px`, width: `${c.w * s}px`, height: `${c.h * s}px` });
    cut.classList.toggle('circle', c.round === 'circle');
  } else cut?.remove();
  entry.shape = shape.r || shape.cut ? { r: shape.r * s, cut: shape.cut && { ...shape.cut, x: shape.cut.x * s, y: shape.cut.y * s, w: shape.cut.w * s, h: shape.cut.h * s } } : null;
  entry.el.style.setProperty('--pane-w', `${Math.max(Math.round(r.vw * s) + (state.frames ? 48 : 2), 300)}px`);
  entry.el.querySelector('.zoom-tag')?.remove();
  if (!entry.el.hidden && state.layout !== 'focus' && state.layout !== 'free' && entry.el.isConnected) {
    const extra = Math.round(entry.el.getBoundingClientRect().height - Math.round(r.vh * s));
    const k = state.frames ? 'framed' : 'plain';
    if (extra > 20 && extra < 400 && extra !== measuredChrome[k]) {
      const first = measuredChrome[k] === null;
      measuredChrome[k] = Math.max(measuredChrome[k] || 0, extra);
      if (first) requestAnimationFrame(resizeAll);
    }
  }
}

function updatePaneChrome(p, entry) {
  const r = resolvePane(p);
  const el = entry.el;
  el.querySelector('.dev-icon').innerHTML = ICONS[r.device.type];
  const devSel = el.querySelector('.dev-select');
  devSel.innerHTML = deviceOptions(p.deviceId === 'custom' ? 'custom' : r.device.id);
  el.querySelector('.browser-select').innerHTML = browserOptions(r.device.os, r.browser);
  el.querySelector('.browser-select').disabled = BROWSERS_BY_OS[r.device.os].length < 2;
  const verSel = el.querySelector('.ver-select');
  verSel.innerHTML = versionOptions(r.device.os, r.osVersion);
  verSel.hidden = !OS_VERSIONS[r.device.os];
  const isCustom = p.deviceId === 'custom';
  el.querySelector('.dims').hidden = isCustom;
  el.querySelector('.custom-dims').hidden = !isCustom;
  el.querySelector('.dims').textContent = `${r.vw} × ${r.vh}`;
  el.querySelector('.cw').value = r.vw;
  el.querySelector('.ch').value = r.vh;
  el.querySelector('.os-chip').textContent = `${r.osVersion ? osVersionLabel(r.device.os, r.osVersion) : OS_LABEL[r.device.os]} · @${r.device.dpr}x`;
  const sch = p.scheme;
  const sb = el.querySelector('[data-act="scheme"]');
  sb.innerHTML = sch === 'light' ? ICONS.sun : sch === 'dark' ? ICONS.moon : ICONS.auto;
  sb.classList.toggle('on', !!sch);
  el.querySelector('[data-act="rotate"]').classList.toggle('on', r.rotated);
  el.querySelector('[data-act="focus"]').classList.toggle('on', state.layout === 'focus' && state.focusId === p.id);
  el.classList.toggle('is-focused', state.layout === 'focus' && state.focusId === p.id);

  const pr = r.profile;
  const touchText = pr.touch ? `Yes (${pr.touchPoints} points)` : 'No';
  el.querySelector('.info-grid').innerHTML = [
    ['System', r.osVersion ? osVersionLabel(pr.os, r.osVersion) : OS_LABEL[pr.os]],
    ['Browser', BROWSER_LABEL[pr.browser]],
    ['Platform', pr.platform],
    ['Screen', `${pr.screenW} × ${pr.screenH}`],
    ['Pixel ratio', `${pr.dpr}`],
    ['Touch', touchText],
    ['Pointer / hover', `${pr.pointer} / ${pr.hover}`],
    ['Orientation', pr.orientation],
  ].map(([k, v]) => `<span>${k}</span><b>${escapeHtml(v)}</b>`).join('');
  el.querySelector('.ua').textContent = pr.ua;
}

function renderPanes() {
  const container = $('#panes');
  if (state.layout === 'focus' && !state.panes.some((p) => p.id === state.focusId)) {
    state.focusId = state.panes[0]?.id || null;
  }
  container.className = `panes layout-${state.layout}`;

  // remove panes that are gone
  for (const [id, entry] of entries) {
    if (!state.panes.some((p) => p.id === id)) {
      closeNative(entry);
      entry.el.remove();
      entries.delete(id);
    }
  }
  state.panes.forEach((p, i) => {
    let entry = entries.get(p.id);
    if (!entry) {
      entry = { el: createPaneEl(p), iframe: null, key: null, faked: false };
      entries.set(p.id, entry);
    }
    if (container.children[i] !== entry.el) container.insertBefore(entry.el, container.children[i] || null);
    if (state.layout === 'free' && !p.box) p.box = newBoxFor();
    if (p.box?.z) zTop = Math.max(zTop, p.box.z);
    updatePaneChrome(p, entry);
    entry.el.hidden = !isActivePane(p.id);
    const key = frameKey(p);
    // Devices paused by Focus layout keep their old key and load the current page once they're shown again.
    if (key !== entry.key && isActivePane(p.id)) {
      entry.key = key;
      loadFrame(p, entry);
    } else {
      sizePane(p, entry);
    }
    applyBox(p, entry);
  });
  if (state.layout === 'free') {
    applyCanvas();
  }
  renderFocusStrip();
  renderPresets();
  updateStatus();
  updateAddress();
}

function renderFocusStrip() {
  let strip = $('#focus-strip');
  if (state.layout !== 'focus') {
    strip?.remove();
    return;
  }
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'focus-strip';
    strip.className = 'focus-strip';
    $('#stage').prepend(strip);
    strip.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      state.focusId = b.dataset.id;
      renderPanes();
      save();
    });
  }
  strip.innerHTML = state.panes.map((p) => {
    const r = resolvePane(p);
    return `<button data-id="${p.id}" class="${p.id === state.focusId ? 'on' : ''}">${ICONS[r.device.type]}<span>${escapeHtml(r.device.id === 'custom' ? `${r.vw} × ${r.vh}` : r.device.name)}</span></button>`;
  }).join('');
}

function reloadAll(force) {
  for (const p of state.panes) {
    const entry = entries.get(p.id);
    if (!entry) continue;
    if (force) entry.key = null;
  }
  renderPanes();
}

function resizeAll() {
  for (const p of state.panes) {
    const entry = entries.get(p.id);
    if (!entry) continue;
    sizePane(p, entry);
    if (state.layout === 'free') applyBox(p, entry);
  }
}

/* ------------------------------------------------------------------ browser tabs */
function tabLabel(t) {
  if (t.source?.kind === 'html') return t.source.name || 'Pasted HTML';
  if (t.title) return t.title;
  if (t.source?.url === DEMO_URL) return 'Test page';
  try { return new URL(t.source.url).host || t.source.url; } catch { return 'New tab'; }
}
function tabIcon(t) {
  const label = tabLabel(t);
  return `<i class="tab-letter">${escapeHtml((label.replace(/^www\./, '')[0] || '•').toUpperCase())}</i>`;
}

function renderTabs() {
  const box = $('#tabs');
  if (!box) return;
  box.innerHTML = state.tabs.map((t) => `
    <div class="tab${t.id === state.activeTab ? ' on' : ''}" data-tab="${t.id}" role="tab" title="${escapeHtml(tabLabel(t))}">
      <span class="tab-icon">${tabIcon(t)}</span>
      <span class="tab-title">${escapeHtml(tabLabel(t))}</span>
      <button class="tab-x" data-close="${t.id}" aria-label="Close tab">${ICONS.close}</button>
    </div>`).join('');
}

function currentContainer() {
  let view = tabViews.get(state.activeTab);
  if (!view) {
    const container = document.createElement('div');
    container.className = 'panes';
    $('#stage').appendChild(container);
    view = { entries: new Map(), container };
    tabViews.set(state.activeTab, view);
  }
  return view;
}

function hideNativeViews(map) {
  if (!DESKTOP) return;
  const items = [];
  for (const e of map.values()) {
    if (!e.label) continue;
    e.lastLayout = null;
    items.push({ label: e.label, x: 0, y: 0, w: 1, h: 1, zoom: 1, visible: false });
  }
  if (items.length) invoke('pane_layout', { items }).catch(() => {});
}

function activateTabView() {
  for (const [id, v] of tabViews) {
    const on = id === state.activeTab;
    v.container.hidden = !on;
    if (on) v.container.id = 'panes'; else v.container.removeAttribute('id');
  }
  const view = currentContainer();
  view.container.hidden = false;
  view.container.id = 'panes';
  entries = view.entries;
}

function switchTab(id) {
  if (id === state.activeTab || !state.tabs.some((t) => t.id === id)) return;
  Object.assign(activeTab(), pickTab(state));
  hideNativeViews(entries);
  state.activeTab = id;
  Object.assign(state, pickTab(activeTab()));
  activateTabView();
  $('#sync-menu').hidden = true;
  updateAddress();
  renderPanes();
  renderTabs();
  save();
}

// A copy of a device for another tab (its own id and its own panel position).
function clonePane(p) {
  return { ...p, id: newId(), box: p.box ? { ...p.box } : undefined };
}

// Settings > New tabs open: the built-in test page, or an address of the user's choice.
function homeUrl() {
  return state.home ? normalizeUrl(state.home) : DEMO_URL;
}

function newTab(url) {
  Object.assign(activeTab(), pickTab(state));
  const panes = state.panes.map(clonePane);
  const target = url || homeUrl();
  const tab = { id: newId(), source: { kind: 'url', url: target }, panes, preset: state.preset, history: [target], histIdx: 0, focusId: null, title: '' };
  state.tabs.push(tab);
  switchTab(tab.id);
  if (!url) setTimeout(() => $('#address').focus(), 50);
}

function closeTab(id) {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const view = tabViews.get(id);
  if (view) {
    for (const e of view.entries.values()) closeNative(e);
    view.container.remove();
    tabViews.delete(id);
  }
  if (state.tabs.length === 1) {
    // Closing the last tab leaves a fresh one.
    state.tabs = [];
    const home = homeUrl();
    const tab = { id: newId(), source: { kind: 'url', url: home }, panes: state.panes.map(clonePane), preset: state.preset, history: [home], histIdx: 0, focusId: null, title: '' };
    state.tabs.push(tab);
    state.activeTab = tab.id;
    Object.assign(state, pickTab(tab));
    activateTabView();
    updateAddress();
    renderPanes();
    renderTabs();
    save();
    return;
  }
  const wasActive = id === state.activeTab;
  state.tabs.splice(idx, 1);
  if (wasActive) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
    state.activeTab = next.id;
    Object.assign(state, pickTab(next));
    activateTabView();
    updateAddress();
    renderPanes();
  }
  renderTabs();
  save();
}

$('#tabs').addEventListener('click', (e) => {
  const x = e.target.closest('[data-close]');
  if (x) { e.stopPropagation(); closeTab(x.dataset.close); return; }
  const t = e.target.closest('[data-tab]');
  if (t) switchTab(t.dataset.tab);
});
$('#tabs').addEventListener('auxclick', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t && e.button === 1) closeTab(t.dataset.tab);
});
$('#tab-new').addEventListener('click', () => newTab());

/* ------------------------------------------------------------------ presets / toolbar */
function renderPresets() {
  const box = $('#presets');
  box.innerHTML = PRESETS.map((pr) => `<button role="tab" data-preset="${pr.id}" class="${state.preset === pr.id ? 'on' : ''}">${pr.label}</button>`).join('');
}

$('#presets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-preset]');
  if (!b) return;
  const preset = PRESETS.find((x) => x.id === b.dataset.preset);
  state.panes = presetPanes(preset);
  state.preset = preset.id;
  if (state.layout === 'focus') state.focusId = state.panes[0].id;
  renderPanes();
  save();
});

function updateLayoutSeg() {
  document.querySelectorAll('#layout-seg button').forEach((b) => b.classList.toggle('on', b.dataset.layout === state.layout));
  $('#zoom').disabled = state.layout === 'focus';
  syncZoomSelect();
  applyCanvas();
  $('#btn-shot-all').title = isFocus()
    ? 'Screenshot the focused device (whole page) into Pictures › DeviceDeck'
    : 'Screenshot every device (whole page) into Pictures › DeviceDeck';
}
$('#layout-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-layout]');
  if (!b) return;
  if (b.dataset.layout === 'focus' && state.layout !== 'focus') state.prevLayout = state.layout;
  // Free layout starts from wherever the panels are right now.
  if (b.dataset.layout === 'free' && state.layout !== 'free') initFreeBoxes();
  state.layout = b.dataset.layout;
  if (state.layout === 'focus' && !state.focusId) state.focusId = state.panes[0].id;
  updateLayoutSeg();
  renderPanes();
  save();
});

$('#zoom').addEventListener('change', (e) => {
  if (state.layout === 'free') {
    if (e.target.value === 'fit') fitAll(); else zoomCenter(parseFloat(e.target.value));
    syncZoomSelect();
    return;
  }
  state.zoom = e.target.value;
  resizeAll();
  save();
});
function stepZoom(dir) {
  const opts = [...$('#zoom').options].map((o) => o.value);
  let i = opts.indexOf(state.zoom);
  if (state.zoom === 'fit') i = dir > 0 ? 3 : 2;
  else i = Math.max(1, Math.min(opts.length - 1, i + dir));
  state.zoom = opts[i];
  $('#zoom').value = state.zoom;
  resizeAll();
  save();
  toast(`Zoom ${Math.round(parseFloat(state.zoom) * 100)}%`, 1200);
}

// Sync menu
function updateSync() {
  document.querySelectorAll('#sync-menu input[data-sync]').forEach((cb) => { cb.checked = !!state.sync[cb.dataset.sync]; });
  const n = Object.values(state.sync).filter(Boolean).length;
  $('#sync-count').textContent = n;
  $('#btn-sync').classList.toggle('on', n > 0);
  $('#pace-select').value = state.pace || 'gentle';
}
function setPace(value) {
  state.pace = value;
  $('#pace-select').value = value;
  save();
}
$('#pace-select').addEventListener('change', (e) => {
  setPace(e.target.value);
  toast(state.pace === 'off' ? 'Devices load pages all at once' : state.pace === 'gentle' ? 'Devices load pages one after another' : `Devices start loading ${state.pace} s apart`, 1800);
});
$('#btn-sync').addEventListener('click', async (e) => {
  e.stopPropagation();
  const menu = $('#sync-menu');
  if (!menu.hidden) { menu.hidden = true; return; }
  await freezeViews();
  menu.hidden = false;
});
$('#sync-menu').addEventListener('click', (e) => e.stopPropagation());
$('#sync-menu').addEventListener('change', (e) => {
  const k = e.target.dataset.sync;
  if (!k) return;
  state.sync[k] = e.target.checked;
  updateSync();
  updateStatus();
  save();
});
document.addEventListener('click', () => { $('#sync-menu').hidden = true; });

// Global light/dark
function updateSchemeBtn() {
  const s = state.scheme;
  $('#btn-scheme').querySelector('svg').outerHTML = s === 'light' ? ICONS.sun : s === 'dark' ? ICONS.moon : ICONS.auto;
  $('#scheme-label').textContent = s === 'auto' ? 'Auto' : s === 'light' ? 'Light' : 'Dark';
  $('#btn-scheme').classList.toggle('on', s !== 'auto');
}
$('#btn-scheme').addEventListener('click', () => {
  state.scheme = state.scheme === 'auto' ? 'light' : state.scheme === 'light' ? 'dark' : 'auto';
  updateSchemeBtn();
  renderPanes();
  save();
  toast(state.scheme === 'auto' ? 'Pages follow your computer\'s light/dark setting' : `Pages shown in ${state.scheme} mode`);
});

// In Focus layout only the device on screen is photographed.
$('#btn-shot-all').addEventListener('click', () => screenshotPanes(activePanes(), true));
$('#btn-ai').addEventListener('click', () => openDialog('#dlg-ai'));
initSettings({
  openDialog,
  toast,
  copyText,
  getHome: () => state.home || '',
  setHome: (v) => { state.home = v; save(); },
  getPace: () => state.pace || 'gentle',
  setPace,
  reloadAll: () => reloadAll(true),
  openMcpSetup: () => openDialog('#dlg-ai'),
  // Back to a first start: forget tabs, devices, layout and settings, then restart.
  resetAll: () => {
    resetting = true;
    clearTimeout(saveTimer);
    try {
      localStorage.removeItem(STORE_KEY);
      for (const k of Object.keys(localStorage)) if (k.startsWith('dd.')) localStorage.removeItem(k);
    } catch { /* ignore */ }
    if (DESKTOP) relaunch().catch(() => location.reload());
    else location.reload();
  },
});
$('#btn-frames').addEventListener('click', () => {
  state.frames = !state.frames;
  $('#btn-frames').classList.toggle('on', state.frames);
  resizeAll();
  save();
});

/* ------------------------------------------------------------------ add device dialog */
function renderAddList(filter = '') {
  const q = filter.trim().toLowerCase();
  let html = '';
  for (const g of GROUPS) {
    const list = DEVICES.filter((d) => d.type === g.id && (!q || `${d.name} ${OS_LABEL[d.os]}`.toLowerCase().includes(q)));
    if (!list.length) continue;
    html += `<h3>${g.label}</h3><div class="cards">`;
    html += list.map((d) => `
      <button type="button" class="dev-card" data-device="${d.id}">
        <span class="dev-card-icon">${ICONS[d.type]}</span>
        <span class="dev-card-name">${escapeHtml(d.name)}</span>
        <span class="dev-card-meta">${d.w} × ${d.h} · ${OS_LABEL[d.os]}</span>
      </button>`).join('');
    html += '</div>';
  }
  $('#add-list').innerHTML = html || '<p class="muted">No device matches.</p>';
}
function addPane(p) {
  state.panes.push(p);
  state.preset = null;
  if (state.layout === 'focus') state.focusId = p.id;
  renderPanes();
  save();
  requestAnimationFrame(() => entries.get(p.id)?.el.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' }));
}
$('#btn-add').addEventListener('click', () => {
  $('#add-search').value = '';
  renderAddList();
  openDialog('#dlg-add').then(() => $('#add-search').focus());
});
$('#add-search').addEventListener('input', (e) => renderAddList(e.target.value));
$('#add-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-device]');
  if (!b) return;
  const d = findDevice(b.dataset.device);
  addPane({ id: newId(), deviceId: d.id, browser: DEFAULT_BROWSER[d.os], rotated: false, scheme: null, custom: null });
  $('#dlg-add').close();
  toast(`${d.name} added`);
});
$('#custom-add').addEventListener('click', () => {
  const os = $('#custom-os').value;
  const custom = {
    w: Math.max(200, Math.min(4000, +$('#custom-w').value || 1024)),
    h: Math.max(200, Math.min(4000, +$('#custom-h').value || 768)),
    dpr: Math.max(1, Math.min(4, +$('#custom-dpr').value || 1)),
    os,
    type: $('#custom-type').value,
  };
  addPane({ id: newId(), deviceId: 'custom', browser: DEFAULT_BROWSER[os], rotated: false, scheme: null, custom });
  $('#dlg-add').close();
});

/* ------------------------------------------------------------------ paste / open file / helper */
$('#btn-paste').addEventListener('click', () => {
  $('#paste-text').value = state.source.kind === 'html' ? state.source.html : '';
  openDialog('#dlg-paste').then(() => $('#paste-text').focus());
});
$('#paste-go').addEventListener('click', (e) => {
  const html = $('#paste-text').value.trim();
  if (!html) {
    e.preventDefault();
    toast('Paste some HTML first');
    return;
  }
  showHtml(html, 'Pasted HTML');
});
if (DESKTOP) {
  // In the program, open the file from disk so its pictures, styles and scripts load too.
  $('#file-input').closest('label').addEventListener('click', async (e) => {
    e.preventDefault();
    const url = await invoke('pick_html_file').catch(() => null);
    if (url) navigate(url);
  });
}
$('#file-input').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const text = await f.text();
  showHtml(text, f.name);
  e.target.value = '';
});

const helperUrl = new URL('devicedeck-helper.js', location.href).href;
$('#helper-snippet').textContent = `<script src="${helperUrl}"></script>`;
$('#download-helper').href = URL.createObjectURL(new Blob([helperSource], { type: 'text/javascript' }));
$('#copy-inline').addEventListener('click', () => copyText(`<script>\n${helperSource}\n</script>`));
document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText($(`#${b.dataset.copy}`).textContent)));
$('#btn-helper').addEventListener('click', () => openDialog('#dlg-helper'));

/* ------------------------------------------------------------------ address bar & nav */
$('#address-form').addEventListener('submit', (e) => {
  e.preventDefault();
  navigate($('#address').value);
  $('#address').blur();
});
$('#address').addEventListener('focus', (e) => {
  if (state.source.kind === 'url' && state.source.url === DEMO_URL) e.target.value = DEMO_URL;
  e.target.select();
});
$('#address').addEventListener('blur', () => updateAddress());
$('#btn-back').addEventListener('click', () => {
  if (state.histIdx <= 0) return;
  state.histIdx--;
  navigate(state.history[state.histIdx], { push: false });
});
$('#btn-forward').addEventListener('click', () => {
  if (state.histIdx >= state.history.length - 1) return;
  state.histIdx++;
  navigate(state.history[state.histIdx], { push: false });
});
$('#btn-reload').addEventListener('click', () => reloadAll(true));

/* ------------------------------------------------------------------ messages from panes */
function entryFromSource(src) {
  for (const [id, entry] of entries) if (entry.iframe && entry.iframe.contentWindow === src) return [id, entry];
  return [null, null];
}
function sendCmd(entry, msg) {
  if (DESKTOP) {
    if (!entry.label) return;
    const js = `window.__deviceDeck&&window.__deviceDeck.cmd&&window.__deviceDeck.cmd(${JSON.stringify({ ...msg, __ddCmd: true })})`;
    invoke('pane_eval', { label: entry.label, js }).catch(() => {});
    return;
  }
  try { entry.iframe.contentWindow.postMessage({ ...msg, __ddCmd: true }, '*'); } catch { /* ignore */ }
}

// Mirror something the person did in one device to the other live devices.
// (In Focus layout the hidden devices are paused: they get nothing.)
function broadcast(fromId, msg) {
  for (const [id, entry] of entries) {
    if (id === fromId || !(entry.iframe || entry.label) || !entry.faked) continue;
    if (!isActivePane(id)) continue;
    sendCmd(entry, msg);
  }
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (!m || m.__dd !== true) return;
  const [id, entry] = entryFromSource(e.source);
  if (!entry) return;
  handlePaneMessage(id, entry, m);
});

if (DESKTOP && window.__TAURI__?.event) {
  window.__TAURI__.event.listen('dd-event', (ev) => {
    const { label, data } = ev.payload || {};
    if (!data || data.__dd !== true) return;
    for (const [id, entry] of entries) {
      if (entry.label === label) { handlePaneMessage(id, entry, data); break; }
    }
  });
}

const isWebUrl = (u) => /^https?:|^file:/i.test(u || '');

/*
 * Where each device ends up is its own business: a site may send the Mac to /download/mac and
 * the phone to /download/android. That is exactly what the real devices would see, so a device's
 * landing address is only recorded (entry.url), never pushed to the other devices. The address
 * that is shared is the one the person asked for: typed in the address bar, or a link they
 * clicked in a device (the link's own href, before any redirect).
 */
function handlePaneMessage(id, entry, m) {
  const live = isActivePane(id);
  const primary = primaryPane()?.id === id;
  switch (m.type) {
    case 'ready':
      if (m.url === 'about:blank') break;
      entry.faked = true;
      entry.loading = false;
      setBadge(entry, 'faked');
      if (DESKTOP) checkRateLimit(entry);
      entry.onLoaded?.();
      if (isWebUrl(m.url)) entry.url = m.url;
      entry.title = m.title || null;
      if (primary && m.title && m.title !== state.title) {
        state.title = m.title;
        activeTab().title = m.title;
        renderTabs();
      }
      if (primary) updateAddress();
      updateStatus();
      break;
    case 'soft-nav': {
      // Single-page apps changing their own address (pushState / replaceState) are device-local,
      // unless it is the router following a link the person just clicked in this device.
      if (isWebUrl(m.url)) entry.url = m.url;
      const pl = entry.pendingLink;
      if (live && pl && Date.now() - pl.t < 3000 && m.url.split('#')[0] === pl.url.split('#')[0]) {
        entry.pendingLink = null;
        if (state.source.kind === 'url' && (state.sync.nav || state.sync.interact)) adoptSource(pl.url);
      }
      if (primary) updateAddress();
      break;
    }
    case 'scroll':
      if (live && state.sync.scroll) broadcast(id, { type: 'scroll', x: m.x, y: m.y });
      break;
    case 'click':
      if (!live) break;
      if (m.link && followLink(id, m)) break;
      if (state.sync.interact) broadcast(id, { type: 'click', path: m.path });
      break;
    case 'input':
      if (live && state.sync.interact) broadcast(id, { type: 'input', path: m.path, value: m.value, check: m.check });
      break;
    default:
      break;
  }
}

// The person followed a link in one device: the link's address becomes the shared page and the
// other live devices open that same address (each then gets whatever the site gives that device).
// Make `url` the shared address without reloading the live devices (they are already there or on
// their way). Paused devices keep their old key, so they load it when Focus is left.
function adoptSource(url) {
  state.source = { kind: 'url', url };
  state.history = state.history.slice(0, state.histIdx + 1);
  if (state.history[state.history.length - 1] !== url) state.history.push(url);
  if (state.history.length > 50) state.history.shift();
  state.histIdx = state.history.length - 1;
  for (const p of activePanes()) {
    const entry = entries.get(p.id);
    if (entry) entry.key = frameKey(p);
  }
  updateAddress();
  save();
}

function followLink(fromId, m) {
  if (state.source.kind !== 'url') return false;
  if (m.spa) {
    // The page's own router took the click. The other devices get the same click (if clicks are
    // synced); the shared address follows once the router really changes the URL (see soft-nav).
    const from = entries.get(fromId);
    if (from) from.pendingLink = { url: m.link, t: Date.now() };
    return false;
  }
  if (!state.sync.nav) return false;
  const url = m.link;
  adoptSource(url);
  const from = entries.get(fromId);
  if (from) from.loading = true; // it is leaving for the link by itself
  let reloadNeeded = false;
  for (const p of activePanes()) {
    const entry = entries.get(p.id);
    if (!entry || p.id === fromId) continue;
    if (DESKTOP && entry.label) {
      entry.url = url;
      pacedNavigate(entry, url).catch(() => {});
    } else if (entry.iframe && entry.faked && !ext.connected) {
      entry.loading = true;
      sendCmd(entry, { type: 'navigate', url });
    } else {
      entry.key = null; // no helper there: reload it at the new address
      reloadNeeded = true;
    }
  }
  if (reloadNeeded) renderPanes();
  return true;
}

/* ------------------------------------------------------------------ status bar */
function updateStatus() {
  const total = state.panes.length;
  const faked = [...entries.values()].filter((e) => e.faked).length;
  const syncs = [state.sync.scroll && 'scrolling', state.sync.nav && 'links', state.sync.interact && 'clicks & typing'].filter(Boolean);
  let html = `<b>${total}</b> device${total === 1 ? '' : 's'} · faking active in <b>${faked}</b> · sync: ${syncs.length ? syncs.join(', ') : 'off'}`;
  const fp = isFocus() && state.panes.find((p) => p.id === state.focusId);
  if (fp && total > 1) html += ` · <b>Focus: ${escapeHtml(paneLabel(fp))}</b> — the other ${total - 1} paused`;
  if (state.layout === 'free') html += ' · Free layout: drag the background or scroll to move around, Ctrl + scroll to zoom, double-click the background to show all';
  $('#status-left').innerHTML = html;
}

/* ------------------------------------------------------------------ keyboard */
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 't') {
    e.preventDefault();
    newTab();
  } else if (mod && e.key.toLowerCase() === 'w') {
    e.preventDefault();
    closeTab(state.activeTab);
  } else if (mod && e.key === 'Tab') {
    e.preventDefault();
    const i = state.tabs.findIndex((t) => t.id === state.activeTab);
    const n = state.tabs.length;
    switchTab(state.tabs[(i + (e.shiftKey ? n - 1 : 1)) % n].id);
  } else if (mod && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    $('#address').focus();
  } else if ((mod && e.key.toLowerCase() === 'r') || e.key === 'F5') {
    e.preventDefault();
    reloadAll(true);
    toast('Reloaded all devices', 1200);
  } else if (mod && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    if (state.layout === 'free') stepCanvasZoom(1);
    else if (state.layout !== 'focus') stepZoom(1);
  } else if (mod && e.key === '-') {
    e.preventDefault();
    if (state.layout === 'free') stepCanvasZoom(-1);
    else if (state.layout !== 'focus') stepZoom(-1);
  } else if (mod && e.key === '0' && state.layout === 'free') {
    e.preventDefault();
    fitAll();
  } else if (e.altKey && e.key === 'ArrowLeft') {
    $('#btn-back').click();
  } else if (e.altKey && e.key === 'ArrowRight') {
    $('#btn-forward').click();
  } else if (e.key === 'Escape' && !$('#sync-menu').hidden) {
    $('#sync-menu').hidden = true;
  } else if (e.key === 'Escape' && state.layout === 'focus' && !document.querySelector('dialog[open]')) {
    state.layout = state.prevLayout || 'row';
    updateLayoutSeg();
    renderPanes();
    save();
  }
});

/* ------------------------------------------------------------------ boot */
window.addEventListener('blur', () => {
  // Clicking into a device moves focus into its frame: make it the active one.
  setTimeout(() => {
    const [id] = entryFromSource(document.activeElement?.contentWindow);
    const p = state.panes.find((x) => x.id === id);
    if (p) setActiveProfile(p);
  }, 0);
});
// The banner's button is a plain download link.
$('#banner-x').addEventListener('click', () => {
  sessionStorage.setItem('dd-banner-hidden', '1');
  updateBanner();
});
window.postMessage({ __ddApp: true, type: 'ping' }, location.origin);
updateExtUi();
let resizeQueued = false;
new ResizeObserver(() => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => { resizeQueued = false; resizeAll(); });
}).observe($('#stage'));
$('#zoom').value = state.zoom;
$('#btn-frames').classList.toggle('on', state.frames);
updateLayoutSeg();
updateSync();
updateSchemeBtn();
updateAddress();
if (DESKTOP && state.layout === 'grid') state.layout = 'row';
updateLayoutSeg();
tabViews.set(state.activeTab, { entries, container: $('#panes') });
renderTabs();
renderPanes();
if (DESKTOP) requestAnimationFrame(nativeLayoutLoop);
