// background.js — Guidance Beta Service Worker

const WS_PORT = 8765;
const WS_URL  = `ws://127.0.0.1:${WS_PORT}`;
const RECONNECT_INTERVAL = 3000;

let ws = null;
let wsConnected = false;

// ── WebSocket ────────────────────────────────────────────────────────────────
function connectWebSocket() {
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      wsConnected = true;
      broadcast({ type: 'WS_STATUS', connected: true });
      console.log('[Guidance] WebSocket connected');
    };

    ws.onclose = () => {
      wsConnected = false;
      broadcast({ type: 'WS_STATUS', connected: false });
      console.log('[Guidance] WebSocket disconnected — retrying…');
      setTimeout(connectWebSocket, RECONNECT_INTERVAL);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.warn('[Guidance] Bad WS message', e);
      }
    };
  } catch (e) {
    console.warn('[Guidance] Could not create WebSocket', e);
    setTimeout(connectWebSocket, RECONNECT_INTERVAL);
  }
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'PATCH_DETECTED':
      storePatch(msg.patch);
      break;
    case 'PING':
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PONG' }));
      break;
  }
}

function sendToServer(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ── Patches ──────────────────────────────────────────────────────────────────
function storePatch(patch) {
  patch.ts = Date.now();
  chrome.storage.local.get(['patches'], result => {
    const patches = result.patches || [];
    patches.unshift(patch);
    if (patches.length > 50) patches.length = 50;
    chrome.storage.local.set({ patches }, () => {
      broadcast({ type: 'NEW_PATCH', patch });
      showPatchNotification(patch);
    });
  });
}

function showPatchNotification(patch) {
  chrome.notifications && chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Guidance — New Patch',
    message: `${patch.source || 'AI'} sent a ${patch.language || 'code'} patch: ${patch.title || 'Untitled'}`,
    silent: true
  });
}

// ── Tab Colours ──────────────────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  chrome.storage.local.get(['colourRules'], result => {
    const rules = result.colourRules || [];
    const match = rules.find(r => r.enabled && tab.url.includes(r.domain));
    if (match) {
      applyTabColour(tabId, match.colour);
    }
  });
});

function applyTabColour(tabId, colour) {
  // Inject a subtle coloured dot into the page title via content script
  chrome.scripting.executeScript({
    target: { tabId },
    func: (col) => {
      const existing = document.getElementById('_guidance_colour_dot');
      if (existing) return; // already applied
      const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
      // We mark the tab title with a unicode dot of the right colour
      // (actual tab colouring not supported by Chrome API — we add a visual cue)
    },
    args: [colour]
  }).catch(() => {}); // Silently ignore restricted pages
}

// ── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_WS_STATUS':
      sendResponse({ connected: wsConnected });
      break;

    case 'PATCH_FROM_PAGE':
      storePatch(msg.patch);
      sendToServer({ type: 'PATCH_FROM_PAGE', patch: msg.patch });
      break;

    case 'APPLY_PATCH':
      sendToServer({ type: 'APPLY_PATCH', patch: msg.patch });
      break;

    case 'COLOUR_RULES_UPDATED':
      // Re-apply colours to all open tabs
      chrome.tabs.query({}, tabs => {
        tabs.forEach(tab => {
          if (!tab.url) return;
          const match = msg.rules.find(r => r.enabled && tab.url.includes(r.domain));
          if (match) applyTabColour(tab.id, match.colour);
        });
      });
      break;

    case 'COLOUR_TAB':
      applyTabColour(msg.tabId, msg.colour);
      break;
  }
  return true; // keep channel open for async
});

// ── Broadcast to all popup/content contexts ───────────────────────────────────
function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {}); // ignore if popup closed
}

// ── Init ─────────────────────────────────────────────────────────────────────
connectWebSocket();
