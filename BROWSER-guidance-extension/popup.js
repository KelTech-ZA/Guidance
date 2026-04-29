// popup.js — Guidance Beta

const DEFAULT_COLOUR_RULES = [
  { id: 'chatgpt',  name: 'ChatGPT',  domain: 'chatgpt.com',         colour: '#10a37f', enabled: true },
  { id: 'claude',   name: 'Claude',   domain: 'claude.ai',            colour: '#cc785c', enabled: true },
  { id: 'grok',     name: 'Grok',     domain: 'grok.com',             colour: '#1DA1F2', enabled: true },
  { id: 'gemini',   name: 'Gemini',   domain: 'gemini.google.com',    colour: '#4285F4', enabled: true },
  { id: 'github',   name: 'GitHub',   domain: 'github.com',           colour: '#6e40c9', enabled: false },
  { id: 'vscode',   name: 'VS Code',  domain: 'vscode.dev',           colour: '#007ACC', enabled: false },
];

// ── Tab navigation ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── WebSocket status ────────────────────────────────────────────────────────
function updateStatus(connected) {
  const dot  = document.getElementById('ws-dot');
  const text = document.getElementById('status-text');
  if (connected) {
    dot.classList.add('connected');
    text.textContent = 'Connected to Guidance server';
  } else {
    dot.classList.remove('connected');
    text.textContent = 'Server offline — start the Guidance app';
  }
}

// Ask background for current WS state
chrome.runtime.sendMessage({ type: 'GET_WS_STATUS' }, resp => {
  if (resp) updateStatus(resp.connected);
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'WS_STATUS') updateStatus(msg.connected);
});

// ── Patches ─────────────────────────────────────────────────────────────────
let patches = [];

function loadPatches() {
  chrome.storage.local.get(['patches'], result => {
    patches = result.patches || [];
    renderPatches();
  });
}

function savePatches() {
  chrome.storage.local.set({ patches });
}

function renderPatches() {
  const list = document.getElementById('patch-list');
  if (patches.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="emoji">👀</div>
        <p>No patches detected yet.<br />Open ChatGPT, Claude, Grok, or Gemini<br />and ask for code — patches will appear here.</p>
      </div>`;
    return;
  }

  list.innerHTML = patches.map((p, i) => `
    <div class="patch-item ${p.applied ? 'applied' : ''}" data-index="${i}">
      <div class="patch-icon ${p.applied ? 'applied' : 'pending'}">${p.applied ? '✓' : '⚡'}</div>
      <div class="patch-meta">
        <div class="patch-title">${escHtml(p.title || 'Code Patch')}</div>
        <div class="patch-sub">${escHtml(p.source || 'AI')} · ${escHtml(p.language || 'code')}</div>
      </div>
      <span class="patch-time">${timeAgo(p.ts)}</span>
      <button class="patch-apply-btn ${p.applied ? 'done' : ''}" data-index="${i}">
        ${p.applied ? 'Applied' : 'Apply'}
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.patch-apply-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      applyPatch(idx);
    });
  });
}

function applyPatch(idx) {
  patches[idx].applied = true;
  savePatches();
  renderPatches();
  chrome.runtime.sendMessage({ type: 'APPLY_PATCH', patch: patches[idx] });
}

document.getElementById('btn-apply-all').addEventListener('click', () => {
  patches.forEach((p, i) => { if (!p.applied) patches[i].applied = true; });
  savePatches();
  renderPatches();
});

document.getElementById('btn-clear-patches').addEventListener('click', () => {
  patches = [];
  savePatches();
  renderPatches();
});

// Listen for new patches from background
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'NEW_PATCH') {
    patches.unshift(msg.patch);
    if (patches.length > 50) patches.length = 50;
    savePatches();
    renderPatches();
  }
});

loadPatches();

// ── Tab Colours ──────────────────────────────────────────────────────────────
let colourRules = [];

function loadColourRules() {
  chrome.storage.local.get(['colourRules'], result => {
    colourRules = result.colourRules || JSON.parse(JSON.stringify(DEFAULT_COLOUR_RULES));
    renderColourRules();
  });
}

function saveColourRules() {
  chrome.storage.local.set({ colourRules });
  chrome.runtime.sendMessage({ type: 'COLOUR_RULES_UPDATED', rules: colourRules });
}

function renderColourRules() {
  const grid = document.getElementById('colour-grid');
  grid.innerHTML = colourRules.map((rule, i) => `
    <div class="colour-rule">
      <div class="colour-swatch" style="background:${rule.colour}"></div>
      <div class="colour-info">
        <div class="colour-name">${escHtml(rule.name)}</div>
        <div class="colour-domain">${escHtml(rule.domain)}</div>
      </div>
      <label class="colour-toggle">
        <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-index="${i}" />
        <span class="slider"></span>
      </label>
    </div>
  `).join('');

  grid.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.index);
      colourRules[idx].enabled = cb.checked;
      saveColourRules();
      applyTabColours();
    });
  });
}

document.getElementById('btn-add-rule').addEventListener('click', () => {
  const domain = prompt('Enter domain (e.g. stackoverflow.com):');
  if (!domain) return;
  const name = prompt('Enter label (e.g. Stack Overflow):') || domain;
  const colour = prompt('Enter hex colour (e.g. #F58025):') || '#534AB7';
  colourRules.push({ id: Date.now().toString(), name, domain, colour, enabled: true });
  saveColourRules();
  renderColourRules();
  applyTabColours();
});

function applyTabColours() {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      if (!tab.url) return;
      const matchingRule = colourRules.find(r => r.enabled && tab.url.includes(r.domain));
      if (matchingRule) {
        // Use chrome.scripting to apply a coloured favicon overlay effect
        chrome.runtime.sendMessage({
          type: 'COLOUR_TAB',
          tabId: tab.id,
          colour: matchingRule.colour,
          name: matchingRule.name
        });
      }
    });
  });
}

loadColourRules();

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  return Math.floor(secs / 86400) + 'd ago';
}
