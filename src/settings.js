// Settings: the gear button in the toolbar. General options, updates, privacy & data,
// keyboard shortcuts and information about DeviceDeck.
import { version as WEB_VERSION } from '../package.json';
import { initUpdater } from './updater.js';
import { getTheme, setTheme } from './theme.js';

const REPO = 'https://github.com/dhia-eddine-mahdaoui/devicedeck';
const DESKTOP = !!window.__TAURI_INTERNALS__;
const invoke = (cmd, args) => window.__TAURI_INTERNALS__.invoke(cmd, args);
const $ = (id) => document.getElementById(id);
const OS_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

/**
 * ctx: { openDialog, toast, copyText, getHome, setHome, getPace, setPace,
 *        reloadAll, resetAll, openMcpSetup }
 */
export function initSettings(ctx) {
  const dlg = $('dlg-settings');
  let info = { version: WEB_VERSION, os: '', arch: '', mcpRunning: false, mcpUrl: '', screenshotsDir: '' };

  const updater = initUpdater({ openSettings: open, toast: ctx.toast });

  /* ---- sections */
  function showSection(name) {
    dlg.querySelectorAll('.set-nav button').forEach((b) => b.classList.toggle('on', b.dataset.sec === name));
    dlg.querySelectorAll('.set-panes section').forEach((s) => { s.hidden = s.dataset.sec !== name; });
    if (name === 'updates') updater.onShow();
  }
  dlg.querySelectorAll('.set-nav button').forEach((b) => b.addEventListener('click', () => showSection(b.dataset.sec)));

  async function open(section = 'general') {
    fill();
    showSection(section);
    if (!dlg.open) await ctx.openDialog('#dlg-settings');
    refreshInfo();
  }
  $('btn-settings').addEventListener('click', () => open());

  /* ---- facts about this copy */
  function systemText() {
    if (!DESKTOP) return `Web version ${WEB_VERSION}`;
    return `Version ${info.version} · ${OS_NAMES[info.os] || info.os} ${info.arch}`;
  }
  async function refreshInfo() {
    if (DESKTOP) {
      try { info = { ...info, ...(await invoke('app_info')) }; } catch { /* keep the defaults */ }
    }
    $('set-version').textContent = info.version;
    $('set-system').textContent = systemText();
    if (DESKTOP) {
      $('set-shots-dir').textContent = info.screenshotsDir || 'Pictures › DeviceDeck';
      $('set-mcp-status').innerHTML = info.mcpRunning
        ? `<i class="dot ok"></i>Running at <code>${info.mcpUrl}</code>`
        : '<i class="dot off"></i>Not running. Port 12721 is taken, usually by another open DeviceDeck window.';
      $('set-mcp-copy').hidden = !info.mcpRunning;
    }
    const body = `**What happened**\n\n\n**What I expected**\n\n\n**Steps to see it**\n1. \n\n---\n${systemText()}`;
    $('set-report').href = `${REPO}/issues/new?body=${encodeURIComponent(body)}`;
  }

  /* ---- General */
  function fill() {
    $('set-theme').value = getTheme();
    const home = ctx.getHome();
    $('set-home-kind').value = home ? 'url' : 'test';
    $('set-home-url').value = home;
    $('set-home-row').hidden = !home;
    $('set-pace').value = ctx.getPace();
  }
  $('set-theme').addEventListener('change', (e) => setTheme(e.target.value));
  $('set-home-kind').addEventListener('change', (e) => {
    const url = e.target.value === 'url';
    $('set-home-row').hidden = !url;
    if (url) $('set-home-url').focus();
    else { $('set-home-url').value = ''; ctx.setHome(''); }
  });
  const saveHome = () => {
    const v = $('set-home-url').value.trim();
    ctx.setHome(v);
    if (!v) { $('set-home-kind').value = 'test'; $('set-home-row').hidden = true; }
  };
  $('set-home-url').addEventListener('change', saveHome);
  $('set-home-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveHome(); ctx.toast('New tabs will open this address', 1600); }
  });
  $('set-pace').addEventListener('change', (e) => ctx.setPace(e.target.value));
  $('set-shots-open').addEventListener('click', () => {
    invoke('open_shots_dir').catch((e) => ctx.toast(`Couldn't open the folder: ${e}`));
  });
  $('set-mcp-copy').addEventListener('click', () => ctx.copyText(info.mcpUrl));
  $('set-mcp-setup').addEventListener('click', () => { dlg.close(); ctx.openMcpSetup(); });

  /* ---- Privacy & data */
  $('set-clear').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    // The device views share one browser profile with the interface, so keep its settings.
    const keep = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); keep[k] = localStorage.getItem(k); } } catch { /* ignore */ }
    try {
      await invoke('clear_browsing_data');
      try { for (const [k, v] of Object.entries(keep)) localStorage.setItem(k, v); } catch { /* ignore */ }
      ctx.reloadAll();
      ctx.toast('Cookies and cache cleared. The devices start fresh.', 2600);
    } catch (err) {
      ctx.toast(`Couldn't clear the data: ${err}`);
    } finally {
      btn.disabled = false;
    }
  });

  // Two clicks, so a stray one doesn't throw away every tab.
  let armTimer;
  $('set-reset').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.textContent = 'Click again to reset';
      clearTimeout(armTimer);
      armTimer = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = 'Reset'; }, 4000);
      return;
    }
    clearTimeout(armTimer);
    btn.disabled = true;
    btn.textContent = 'Resetting…';
    ctx.resetAll();
  });

  /* ---- About */
  $('set-copy-info').addEventListener('click', () => ctx.copyText(`DeviceDeck ${systemText()}\n${navigator.userAgent}`));

  // Web links open in the normal browser, not inside DeviceDeck.
  dlg.querySelectorAll('a[data-ext]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener';
    a.addEventListener('click', (e) => {
      if (!DESKTOP) return;
      e.preventDefault();
      invoke('open_url', { url: a.href }).catch((err) => ctx.toast(`Couldn't open the link: ${err}`));
    });
  });

  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  dlg.querySelectorAll('.mac-only').forEach((el) => { el.hidden = !mac; });

  refreshInfo();
  return { open };
}
