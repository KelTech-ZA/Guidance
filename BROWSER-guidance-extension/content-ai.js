// content-ai.js — Guidance Beta
// Detects code patches on ChatGPT, Claude, Grok, and Gemini

(function () {
  'use strict';

  // Don't inject twice
  if (window.__GUIDANCE_INJECTED__) return;
  window.__GUIDANCE_INJECTED__ = true;

  // ── Source detection ──────────────────────────────────────────────────────
  function getSource() {
    const host = location.hostname;
    if (host.includes('chatgpt.com'))      return 'ChatGPT';
    if (host.includes('claude.ai'))        return 'Claude';
    if (host.includes('grok.com'))         return 'Grok';
    if (host.includes('gemini.google.com'))return 'Gemini';
    return 'AI';
  }

  const SOURCE = getSource();

  // ── Selectors per platform ────────────────────────────────────────────────
  const CODE_SELECTORS = {
    ChatGPT: 'pre code, .markdown code',
    Claude:  'pre code, .prose code',
    Grok:    'pre code, [class*="CodeBlock"] code',
    Gemini:  'pre code, .code-block code',
  };

  const SELECTOR = CODE_SELECTORS[SOURCE] || 'pre code';

  // ── Language detection ────────────────────────────────────────────────────
  function detectLanguage(el) {
    const cls = (el.className + ' ' + (el.parentElement?.className || ''));
    const match = cls.match(/language-(\w+)/i);
    if (match) return match[1].toLowerCase();
    const text = el.textContent.slice(0, 200);
    if (/^\s*import |from\s+\w+\s+import|def |class |if __name__/.test(text)) return 'python';
    if (/^\s*(const|let|var|function|=>|import\s+{)/.test(text)) return 'javascript';
    if (/^\s*(public|private|class|void|int|string)\b/.test(text)) return 'java/c#';
    if (/^\s*<[a-zA-Z]/.test(text)) return 'html';
    if (/^\s*[\.\#][a-zA-Z].*\{/.test(text)) return 'css';
    return 'code';
  }

  // ── Title heuristic ───────────────────────────────────────────────────────
  function guessTitle(codeEl) {
    // Look for a filename comment on the first line
    const firstLine = codeEl.textContent.split('\n')[0].trim();
    const fnMatch = firstLine.match(/(?:\/\/|#|\/\*)\s*(.{3,60}\.\w{1,6})/);
    if (fnMatch) return fnMatch[1];

    // Look for a label above the code block
    const pre = codeEl.closest('pre');
    if (pre) {
      const label = pre.previousElementSibling;
      if (label && label.textContent.length < 80) return label.textContent.trim();
    }

    return 'Code Patch';
  }

  // ── Already-reported tracking ─────────────────────────────────────────────
  const reported = new WeakSet();

  // ── Patch extraction ──────────────────────────────────────────────────────
  function extractAndReport(codeEl) {
    if (reported.has(codeEl)) return;
    const content = codeEl.textContent.trim();
    if (content.length < 20) return; // ignore tiny snippets

    reported.add(codeEl);

    const patch = {
      source:   SOURCE,
      language: detectLanguage(codeEl),
      title:    guessTitle(codeEl),
      content:  content.slice(0, 8000), // cap size
      url:      location.href,
      ts:       Date.now(),
    };

    chrome.runtime.sendMessage({ type: 'PATCH_FROM_PAGE', patch });
  }

  // ── Observe DOM for new code blocks ───────────────────────────────────────
  function scanAll() {
    document.querySelectorAll(SELECTOR).forEach(el => extractAndReport(el));
  }

  const observer = new MutationObserver(mutations => {
    let relevant = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) { relevant = true; break; }
      }
      if (relevant) break;
    }
    if (relevant) {
      // Small debounce to let streaming finish a line
      clearTimeout(observer._timer);
      observer._timer = setTimeout(scanAll, 600);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan (for already-loaded content)
  setTimeout(scanAll, 1000);

  // ── Keyboard shortcut: Alt+G opens popup ──────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'g') {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    }
  });

  console.log(`[Guidance] Content script active on ${SOURCE}`);
})();
