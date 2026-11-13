// Settings › Theme: how DeviceDeck itself looks (the pages in the devices have their own light/dark
// switch in the toolbar). Kept apart from the main state so index.html can apply it before the
// first paint, without a flash of the other theme.
const KEY = 'dd.theme';
const THEMES = ['system', 'dark', 'light'];
const lightQuery = window.matchMedia('(prefers-color-scheme: light)');

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return THEMES.includes(t) ? t : 'dark';
  } catch {
    return 'dark';
  }
}

function apply() {
  const t = getTheme();
  document.documentElement.dataset.theme = t === 'system' ? (lightQuery.matches ? 'light' : 'dark') : t;
}

export function setTheme(t) {
  try { localStorage.setItem(KEY, THEMES.includes(t) ? t : 'dark'); } catch { /* still applies for now */ }
  apply();
}

lightQuery.addEventListener('change', apply);
apply();
