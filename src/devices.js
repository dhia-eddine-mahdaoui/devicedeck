// Device catalogue and the identity (user agent, platform, screen…) each one reports.

export const GROUPS = [
  { id: 'phone', label: 'Phones' },
  { id: 'tablet', label: 'Tablets' },
  { id: 'laptop', label: 'Laptops' },
  { id: 'desktop', label: 'Desktops' },
];

export const OS_LABEL = {
  ios: 'iOS',
  ipados: 'iPadOS',
  android: 'Android',
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  chromeos: 'ChromeOS',
};

export const BROWSERS_BY_OS = {
  ios: ['safari', 'chrome', 'firefox', 'edge'],
  ipados: ['safari', 'chrome', 'firefox', 'edge'],
  android: ['chrome', 'samsung', 'firefox', 'edge'],
  windows: ['chrome', 'edge', 'firefox'],
  macos: ['safari', 'chrome', 'firefox', 'edge'],
  linux: ['chrome', 'firefox'],
  chromeos: ['chrome'],
};

export const BROWSER_LABEL = {
  safari: 'Safari',
  chrome: 'Chrome',
  firefox: 'Firefox',
  edge: 'Edge',
  samsung: 'Samsung Internet',
};

// type: phone | tablet | laptop | desktop
// radius: the screen's rounded corners and cutout: the front camera (pill = Dynamic Island,
// circle = punch hole), both in CSS pixels as on the real device; the cutout is centred, `y` from
// the top edge in portrait. Phones/tablets without them have square screens.
export const DEVICES = [
  // Phones
  { id: 'iphone-se', name: 'iPhone SE', type: 'phone', os: 'ios', w: 375, h: 667, dpr: 2, home: true },
  { id: 'iphone-15', name: 'iPhone 15', type: 'phone', os: 'ios', w: 393, h: 852, dpr: 3, radius: 55, cutout: { shape: 'pill', w: 126, h: 37, y: 11 } },
  { id: 'iphone-16-pro', name: 'iPhone 16 Pro', type: 'phone', os: 'ios', w: 402, h: 874, dpr: 3, radius: 62, cutout: { shape: 'pill', w: 126, h: 37, y: 14 } },
  { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', type: 'phone', os: 'ios', w: 430, h: 932, dpr: 3, radius: 55, cutout: { shape: 'pill', w: 126, h: 37, y: 11 } },
  { id: 'pixel-8', name: 'Pixel 8', type: 'phone', os: 'android', model: 'Pixel 8', w: 412, h: 915, dpr: 2.625, radius: 44, cutout: { shape: 'circle', w: 25, h: 25, y: 14 } },
  { id: 'galaxy-s24', name: 'Galaxy S24', type: 'phone', os: 'android', model: 'SM-S921B', w: 360, h: 780, dpr: 3, radius: 34, cutout: { shape: 'circle', w: 19, h: 19, y: 15 } },
  { id: 'galaxy-s24-ultra', name: 'Galaxy S24 Ultra', type: 'phone', os: 'android', model: 'SM-S928B', w: 384, h: 824, dpr: 3.75, radius: 18, cutout: { shape: 'circle', w: 19, h: 19, y: 14 } },
  { id: 'galaxy-z-fold', name: 'Galaxy Z Fold (folded)', type: 'phone', os: 'android', model: 'SM-F946B', w: 344, h: 882, dpr: 3, radius: 26, cutout: { shape: 'circle', w: 17, h: 17, y: 14 } },
  { id: 'redmi-note', name: 'Redmi Note 13', type: 'phone', os: 'android', model: '23129RAA4G', w: 393, h: 873, dpr: 2.75, radius: 36, cutout: { shape: 'circle', w: 22, h: 22, y: 15 } },
  // Tablets
  { id: 'ipad-mini', name: 'iPad mini', type: 'tablet', os: 'ipados', w: 744, h: 1133, dpr: 2, radius: 22 },
  { id: 'ipad-air', name: 'iPad Air 11"', type: 'tablet', os: 'ipados', w: 820, h: 1180, dpr: 2, radius: 18 },
  { id: 'ipad-pro-13', name: 'iPad Pro 13"', type: 'tablet', os: 'ipados', w: 1032, h: 1376, dpr: 2, radius: 18 },
  { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9', type: 'tablet', os: 'android', model: 'SM-X710', w: 800, h: 1280, dpr: 2, radius: 16 },
  { id: 'pixel-tablet', name: 'Pixel Tablet', type: 'tablet', os: 'android', model: 'Pixel Tablet', w: 800, h: 1280, dpr: 2, radius: 20 },
  { id: 'surface-pro', name: 'Surface Pro', type: 'tablet', os: 'windows', w: 912, h: 1368, dpr: 2, pointer: 'fine', radius: 8 },
  // Laptops
  { id: 'macbook-air-13', name: 'MacBook Air 13"', type: 'laptop', os: 'macos', w: 1470, h: 956, dpr: 2 },
  { id: 'macbook-pro-14', name: 'MacBook Pro 14"', type: 'laptop', os: 'macos', w: 1512, h: 982, dpr: 2 },
  { id: 'windows-laptop', name: 'Windows laptop (HD)', type: 'laptop', os: 'windows', w: 1366, h: 768, dpr: 1 },
  { id: 'windows-laptop-fhd', name: 'Windows laptop (Full HD, 125%)', type: 'laptop', os: 'windows', w: 1536, h: 864, dpr: 1.25 },
  { id: 'chromebook', name: 'Chromebook', type: 'laptop', os: 'chromeos', w: 1366, h: 768, dpr: 1 },
  // Desktops
  { id: 'windows-desktop', name: 'Windows desktop 1080p', type: 'desktop', os: 'windows', w: 1920, h: 1080, dpr: 1 },
  { id: 'windows-desktop-1440', name: 'Windows desktop 1440p', type: 'desktop', os: 'windows', w: 2560, h: 1440, dpr: 1 },
  { id: 'imac-24', name: 'iMac 24"', type: 'desktop', os: 'macos', w: 2240, h: 1260, dpr: 2 },
  { id: 'linux-desktop', name: 'Linux desktop', type: 'desktop', os: 'linux', w: 1920, h: 1080, dpr: 1 },
];

export const DEFAULT_BROWSER = {
  ios: 'safari', ipados: 'safari', android: 'chrome', windows: 'chrome',
  macos: 'safari', linux: 'firefox', chromeos: 'chrome',
};

export function findDevice(id) {
  return DEVICES.find((d) => d.id === id) || null;
}

const CHROME_V = '126';
const CHROME_FULL = '126.0.6478.127';
const FF_V = '127.0';

// System versions you can pick per device; the first one is the latest and the default.
// Each version only changes what that real system + browser actually reveal:
//  - Apple: Safari's "Version/" matches the system. Since iOS/iPadOS 26, Safari freezes the
//    system number in the user agent at 18_6, so sites read the real one from "Version/".
//  - macOS: every browser freezes the user agent at 10.15(.7); only Safari's "Version/" and
//    Chromium's client hints (platformVersion) tell the release apart.
//  - Windows: the user agent says "Windows NT 10.0" on 10 and 11; client hints tell them apart
//    (platformVersion 13+ means Windows 11).
//  - Android: Chrome's user agent is reduced to "Android 10; K"; client hints carry the real
//    version, and Firefox / Samsung Internet still put it in the user agent.
const APPLE_MOBILE = [
  { id: '27', safari: '27.0', token: '18_6' },
  { id: '26', safari: '26.0', token: '18_6' },
  { id: '18', safari: '18.6', token: '18_6' },
  { id: '17', safari: '17.6', token: '17_6' },
  { id: '16', safari: '16.6', token: '16_6' },
];
export const OS_VERSIONS = {
  ios: APPLE_MOBILE,
  ipados: APPLE_MOBILE,
  android: ['17', '16', '15', '14', '13', '12'].map((v) => ({ id: v, hint: `${v}.0.0` })),
  macos: [
    { id: '27', safari: '27.0', hint: '27.0.0' },
    { id: '26', safari: '26.0', hint: '26.0.0' },
    { id: '15', name: 'Sequoia', safari: '18.6', hint: '15.6.0' },
    { id: '14', name: 'Sonoma', safari: '17.6', hint: '14.6.0' },
    { id: '13', name: 'Ventura', safari: '16.6', hint: '13.6.0' },
  ],
  windows: [
    { id: '11', hint: '19.0.0' },
    { id: '10', hint: '10.0.0' },
  ],
};

export function osVersionLabel(os, v) {
  const name = OS_VERSIONS[os]?.find((x) => x.id === v)?.name;
  return `${OS_LABEL[os]} ${v}${name ? ` ${name}` : ''}`;
}

// The chosen version for this system, or the latest when none (or an unknown one) is chosen.
function pickVersion(os, id) {
  const list = OS_VERSIONS[os];
  if (!list) return null;
  return list.find((v) => v.id === String(id)) || list[0];
}

function buildUA(os, browser, device, ver) {
  const mobile = device.type === 'phone';
  const chromeTail = `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_V}.0.0.0 ${mobile ? 'Mobile ' : ''}Safari/537.36`;
  switch (os) {
    case 'ios':
    case 'ipados': {
      const ipad = os === 'ipados';
      // iPads report themselves as iPads here (Safari's "mobile website" mode), so sites and
      // device checkers see iPadOS. Safari's "Request Desktop Website" would report a Mac instead.
      const head = ipad
        ? `Mozilla/5.0 (iPad; CPU OS ${ver.token} like Mac OS X)`
        : `Mozilla/5.0 (iPhone; CPU iPhone OS ${ver.token} like Mac OS X)`;
      if (browser === 'chrome') return `${head} AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${CHROME_FULL} Mobile/15E148 Safari/604.1`;
      if (browser === 'firefox') return `${head} AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/${FF_V} Mobile/15E148 Safari/605.1.15`;
      if (browser === 'edge') return `${head} AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/${CHROME_V}.0.2592.56 Mobile/15E148 Safari/605.1.15`;
      return `${head} AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ver.safari} Mobile/15E148 Safari/604.1`;
    }
    case 'android': {
      if (browser === 'firefox') return `Mozilla/5.0 (Android ${ver.id}; ${mobile ? 'Mobile' : 'Tablet'}; rv:${FF_V}) Gecko/${FF_V} Firefox/${FF_V}`;
      if (browser === 'samsung') return `Mozilla/5.0 (Linux; Android ${ver.id}; SAMSUNG ${device.model || 'SM-S921B'}) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 ${mobile ? 'Mobile ' : ''}Safari/537.36`;
      const base = `Mozilla/5.0 (Linux; Android 10; K) ${chromeTail}`;
      if (browser === 'edge') return `${base} EdgA/${CHROME_V}.0.0.0`;
      return base;
    }
    case 'windows': {
      if (browser === 'firefox') return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${FF_V}) Gecko/20100101 Firefox/${FF_V}`;
      const base = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_V}.0.0.0 Safari/537.36`;
      return browser === 'edge' ? `${base} Edg/${CHROME_V}.0.0.0` : base;
    }
    case 'macos': {
      if (browser === 'safari') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${ver.safari} Safari/605.1.15`;
      if (browser === 'firefox') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${FF_V}) Gecko/20100101 Firefox/${FF_V}`;
      const base = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_V}.0.0.0 Safari/537.36`;
      return browser === 'edge' ? `${base} Edg/${CHROME_V}.0.0.0` : base;
    }
    case 'linux':
      if (browser === 'firefox') return `Mozilla/5.0 (X11; Linux x86_64; rv:${FF_V}) Gecko/20100101 Firefox/${FF_V}`;
      return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_V}.0.0.0 Safari/537.36`;
    case 'chromeos':
      return `Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_V}.0.0.0 Safari/537.36`;
    default:
      return navigator.userAgent;
  }
}

function platformFor(os, browser) {
  switch (os) {
    case 'ios': return 'iPhone';
    case 'ipados': return 'iPad';
    case 'android': return 'Linux armv81';
    case 'windows': return 'Win32';
    case 'macos': return 'MacIntel';
    case 'chromeos': return 'Linux x86_64';
    default: return 'Linux x86_64';
  }
}

const UADATA_PLATFORM = {
  android: 'Android', windows: 'Windows', macos: 'macOS', linux: 'Linux', chromeos: 'Chrome OS',
};
const PLATFORM_VERSION = {
  android: '14.0.0', windows: '15.0.0', macos: '14.5.0', linux: '6.5.0', chromeos: '14541.0.0',
};

function uaDataFor(os, browser, device, ver) {
  const appleWebKitOnly = os === 'ios' || os === 'ipados';
  if (appleWebKitOnly || browser === 'safari' || browser === 'firefox') return null;
  let brand = ['Google Chrome', CHROME_V];
  let chromium = CHROME_V;
  if (browser === 'edge') brand = ['Microsoft Edge', CHROME_V];
  if (browser === 'samsung') { brand = ['Samsung Internet', '25']; chromium = '121'; }
  return {
    brands: [
      { brand: 'Not/A)Brand', version: '8' },
      { brand: 'Chromium', version: chromium },
      { brand: brand[0], version: brand[1] },
    ],
    mobile: device.type === 'phone',
    platform: UADATA_PLATFORM[os] || 'Linux',
    platformVersion: ver?.hint || PLATFORM_VERSION[os] || '',
    model: os === 'android' ? device.model || '' : '',
    architecture: os === 'android' ? 'arm' : (os === 'macos' ? 'arm' : 'x86'),
    bitness: '64',
    fullVersion: browser === 'samsung' ? '25.0.1.3' : CHROME_FULL,
  };
}

/**
 * Turn a pane's settings into the identity the helper fakes inside the page.
 * pane: { deviceId, browser, rotated, custom: {w,h,dpr,os,type} }
 */
export function resolvePane(pane) {
  let device = pane.deviceId === 'custom' ? null : findDevice(pane.deviceId);
  if (!device) {
    const c = pane.custom || {};
    device = {
      id: 'custom',
      name: 'Custom size',
      type: c.type || 'laptop',
      os: c.os || 'windows',
      w: c.w || 1024,
      h: c.h || 768,
      dpr: c.dpr || 1,
      model: '',
    };
  }
  const browsers = BROWSERS_BY_OS[device.os];
  const browser = browsers.includes(pane.browser) ? pane.browser : DEFAULT_BROWSER[device.os];
  const ver = pickVersion(device.os, pane.osVersion);
  const rotated = !!pane.rotated;
  const vw = rotated ? device.h : device.w;
  const vh = rotated ? device.w : device.h;
  const handheld = device.type === 'phone' || device.type === 'tablet';
  const touch = handheld;
  const pointer = device.pointer || (handheld ? 'coarse' : 'fine');
  const vendor = (device.os === 'ios' || device.os === 'ipados' || browser === 'safari')
    ? 'Apple Computer, Inc.'
    : browser === 'firefox' ? '' : 'Google Inc.';
  const taskbar = device.os === 'windows' && !handheld ? 48 : device.os === 'macos' ? 25 : 0;
  return {
    device,
    browser,
    osVersion: ver?.id || null,
    rotated,
    vw,
    vh,
    profile: {
      ua: buildUA(device.os, browser, device, ver),
      platform: platformFor(device.os, browser),
      vendor,
      os: device.os,
      browser,
      type: device.type,
      name: device.name,
      touch,
      touchPoints: touch ? (device.os === 'windows' ? 10 : 5) : 0,
      pointer,
      hover: pointer === 'fine' ? 'hover' : 'none',
      dpr: device.dpr,
      screenW: vw,
      screenH: vh,
      availH: vh - taskbar,
      orientation: vw > vh ? 'landscape' : 'portrait',
      mobileOrientation: handheld,
      firefox: browser === 'firefox',
      osVersion: ver?.id || null,
      uaData: uaDataFor(device.os, browser, device, ver),
    },
  };
}

export const PRESETS = [
  { id: 'mix', label: 'Mixed set', panes: [
    ['iphone-15', 'safari'], ['galaxy-s24', 'chrome'], ['ipad-air', 'safari'], ['windows-laptop', 'chrome'], ['macbook-air-13', 'safari'],
  ] },
  { id: 'phones', label: 'Phones', panes: [
    ['iphone-se', 'safari'], ['iphone-15', 'safari'], ['iphone-15-pro-max', 'chrome'], ['pixel-8', 'chrome'], ['galaxy-s24', 'samsung'], ['galaxy-z-fold', 'chrome'],
  ] },
  { id: 'ios-android', label: 'iOS vs Android', panes: [
    ['iphone-15', 'safari'], ['pixel-8', 'chrome'], ['ipad-mini', 'safari'], ['galaxy-tab-s9', 'samsung'],
  ] },
  { id: 'tablets', label: 'Tablets', panes: [
    ['ipad-mini', 'safari'], ['ipad-air', 'safari'], ['galaxy-tab-s9', 'chrome'], ['surface-pro', 'edge'],
  ] },
  { id: 'desktops', label: 'Laptops & desktops', panes: [
    ['windows-laptop', 'edge'], ['macbook-air-13', 'safari'], ['chromebook', 'chrome'], ['windows-desktop', 'chrome'], ['linux-desktop', 'firefox'],
  ] },
  { id: 'breakpoints', label: 'Breakpoints', panes: 'breakpoints' },
];

// The real screen outline at the size it is shown: corner radius and the camera cutout
// (x, y, w, h from the screen's top-left), in CSS pixels of the device; rotated devices have
// the camera on the left like a phone turned anticlockwise.
export function screenShape(device, rotated) {
  const r = device.radius || 0;
  const c = device.cutout;
  if (!c) return { r, cut: null };
  const round = c.shape === 'pill' ? 'pill' : 'circle';
  if (!rotated) return { r, cut: { x: (device.w - c.w) / 2, y: c.y, w: c.w, h: c.h, round } };
  return { r, cut: { x: c.y, y: (device.w - c.w) / 2, w: c.h, h: c.w, round } };
}
