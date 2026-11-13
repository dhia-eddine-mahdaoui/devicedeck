// Updates: checks the latest GitHub release (latest.json), shows what changed,
// downloads and verifies the signed update, installs it and restarts DeviceDeck.
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const KEY_EVERY = 'dd.update.everyDays';   // 1 = daily (default), 7 = weekly, 0 = never
const KEY_LAST = 'dd.update.lastCheck';    // ms timestamp of the last automatic check
const DAY = 24 * 60 * 60 * 1000;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};
const $ = (id) => document.getElementById(id);

/** What changed: the part of the release notes above the "---" line (the rest is the download table). */
function changesOf(body) {
  const text = String(body || '').split(/\n\s*---\s*\n/)[0].trim();
  return text || 'Improvements and fixes.';
}

export function initUpdater({ openDialog, toast }) {
  if (!window.__TAURI_INTERNALS__) return;   // plain website version: nothing to update
  let pending = null;                         // the Update found by the last check
  let busy = false;

  const everyDays = () => {
    const v = Number(store.get(KEY_EVERY));
    return Number.isFinite(v) && store.get(KEY_EVERY) !== null ? v : 1;
  };
  $('update-every').value = String(everyDays());
  $('update-every').addEventListener('change', (e) => store.set(KEY_EVERY, e.target.value));

  window.__TAURI__?.app?.getVersion?.().then((v) => { $('update-current').textContent = v; }).catch(() => {});

  function show(update) {
    pending = update;
    document.querySelector('.update-dot').hidden = !update;
    $('update-new').hidden = !update;
    $('update-install').hidden = !update;
    if (update) {
      $('update-version').textContent = update.version;
      $('update-notes').textContent = changesOf(update.body);
      $('update-status').innerHTML = `DeviceDeck <b>${update.version}</b> is available. You have <b>${update.currentVersion}</b>.`;
    }
  }

  async function runCheck({ quiet }) {
    if (busy) return;
    busy = true;
    $('update-check').disabled = true;
    if (!quiet) $('update-status').textContent = 'Checking for updates…';
    try {
      const update = await check();
      store.set(KEY_LAST, String(Date.now()));
      if (update) {
        show(update);
        if (quiet) toast(`DeviceDeck ${update.version} is available`, 10000, { label: "See what's new", fn: () => openDialog('#dlg-update') });
      } else {
        show(null);
        const v = $('update-current').textContent;
        if (!quiet) $('update-status').innerHTML = `You're up to date — DeviceDeck <b>${v}</b> is the latest version.`;
      }
    } catch (err) {
      if (!quiet) $('update-status').textContent = `Couldn't check for updates: ${err?.message || err}. Check your internet connection and try again.`;
    } finally {
      busy = false;
      $('update-check').disabled = false;
    }
  }

  async function install() {
    if (!pending || busy) return;
    busy = true;
    $('update-install').disabled = $('update-check').disabled = true;
    $('update-progress').hidden = false;
    $('update-status').textContent = `Downloading DeviceDeck ${pending.version}…`;
    let total = 0;
    let done = 0;
    try {
      await pending.downloadAndInstall((ev) => {
        if (ev.event === 'Started') total = ev.data.contentLength || 0;
        if (ev.event === 'Progress') {
          done += ev.data.chunkLength;
          if (total) $('update-bar').style.width = `${Math.min(100, (done / total) * 100)}%`;
        }
        if (ev.event === 'Finished') {
          $('update-bar').style.width = '100%';
          $('update-status').textContent = 'Installing… DeviceDeck will restart by itself.';
        }
      });
      await relaunch();   // Windows closes the app itself to run the installer
    } catch (err) {
      $('update-status').textContent = `The update failed: ${err?.message || err}. You can also download it from the Releases page.`;
      $('update-progress').hidden = true;
      $('update-install').disabled = $('update-check').disabled = false;
      busy = false;
    }
  }

  $('btn-update').addEventListener('click', () => {
    openDialog('#dlg-update');
    if (!pending) runCheck({ quiet: false });
  });
  $('update-check').addEventListener('click', () => runCheck({ quiet: false }));
  $('update-install').addEventListener('click', install);

  // Automatic check: shortly after start, then whenever the chosen interval has passed.
  const autoCheck = () => {
    const days = everyDays();
    if (!days) return;
    const last = Number(store.get(KEY_LAST)) || 0;
    if (Date.now() - last >= days * DAY) runCheck({ quiet: true });
  };
  setTimeout(autoCheck, 15000);
  setInterval(autoCheck, 60 * 60 * 1000);
}
