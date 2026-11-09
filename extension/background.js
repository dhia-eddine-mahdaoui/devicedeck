// Changes the request headers of the previews inside a DeviceDeck tab,
// and lets sites that refuse to be embedded show up inside it.
const RESOURCE = ['sub_frame'];

function ids(tabId) {
  return { ua: tabId * 4 + 1, frame: tabId * 4 + 2 };
}

async function initTab(tabId) {
  const { frame } = ids(tabId);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [frame],
    addRules: [{
      id: frame,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'x-frame-options', operation: 'remove' },
          { header: 'content-security-policy', operation: 'remove' },
          { header: 'cross-origin-opener-policy', operation: 'remove' },
          { header: 'cross-origin-embedder-policy', operation: 'remove' },
        ],
      },
      condition: { tabIds: [tabId], resourceTypes: RESOURCE },
    }],
  });
}

function clientHints(p) {
  const list = [];
  if (p.uaData) {
    list.push({ header: 'sec-ch-ua', operation: 'set', value: p.uaData.brands.map((b) => `"${b.brand}";v="${b.version}"`).join(', ') });
    list.push({ header: 'sec-ch-ua-mobile', operation: 'set', value: p.uaData.mobile ? '?1' : '?0' });
    list.push({ header: 'sec-ch-ua-platform', operation: 'set', value: `"${p.uaData.platform}"` });
  } else {
    // Safari and Firefox don't send client hints.
    for (const h of ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-ch-ua-platform-version', 'sec-ch-ua-model', 'sec-ch-ua-full-version-list', 'sec-ch-ua-arch', 'sec-ch-ua-bitness']) {
      list.push({ header: h, operation: 'remove' });
    }
  }
  return list;
}

async function setProfile(tabId, profile) {
  const { ua } = ids(tabId);
  const update = { removeRuleIds: [ua] };
  if (profile && profile.ua) {
    update.addRules = [{
      id: ua,
      priority: 2,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'user-agent', operation: 'set', value: profile.ua }, ...clientHints(profile)],
      },
      condition: { tabIds: [tabId], resourceTypes: RESOURCE },
    }];
  }
  await chrome.declarativeNetRequest.updateSessionRules(update);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (typeof tabId !== 'number' || tabId < 0) { sendResponse({ ok: false }); return false; }
  const job = msg.type === 'init' ? initTab(tabId)
    : msg.type === 'profile' ? setProfile(tabId, msg.profile)
      : Promise.resolve();
  job.then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const { ua, frame } = ids(tabId);
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ua, frame] }).catch(() => {});
});
