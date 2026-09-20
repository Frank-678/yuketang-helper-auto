// src/core/env.js
export const gm = {
  notify(opt) {
    if (typeof window.GM_notification === 'function') {
      window.GM_notification(opt);
      return;
    }
    // On mobile userscript hosts that do not expose GM_notification, use an
    // already-granted browser notification permission.  Never request it
    // automatically: the user controls that permission in the browser.
    try {
      if (window.Notification?.permission !== 'granted') return;
      const notice = new window.Notification(opt?.title || '雨课堂提醒', {
        body: opt?.text || '',
        icon: opt?.image || undefined,
      });
      if (opt?.timeout > 0) setTimeout(() => notice.close?.(), opt.timeout);
    } catch {}
  },
  addStyle(css) {
    if (typeof window.GM_addStyle === 'function') window.GM_addStyle(css);
    else {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    }
  },
  xhr(opt) {
    if (typeof window.GM_xmlhttpRequest === 'function') return window.GM_xmlhttpRequest(opt);
    throw new Error('GM_xmlhttpRequest is not available');
  },
  uw: window.unsafeWindow || window,
};

function runtimeGlobal(name) {
  const candidates = [globalThis, window, gm.uw].filter(Boolean);
  for (const candidate of candidates) {
    const value = candidate?.[name];
    if (value != null) return value;
  }
  return undefined;
}

export async function ensureHtml2Canvas() {
  const raw = runtimeGlobal('html2canvas');
  const h2c = raw?.default || raw;
  if (typeof h2c === 'function') return h2c;
  throw new Error('html2canvas 固定依赖未加载或不可用');
}

export async function ensureJsPDF() {
  const raw = runtimeGlobal('jspdf');
  if (raw?.jsPDF) return raw;
  throw new Error('jsPDF 固定依赖未加载或不可用');
}

export function randInt(l, r) {
  return l + Math.floor(Math.random() * (r - l + 1));
}

export async function ensureFontAwesome() {
  const href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
  if ([...document.styleSheets].some(s => s.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.integrity = 'sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==';
  link.crossOrigin = 'anonymous';
  link.referrerPolicy = 'no-referrer';
  document.head.appendChild(link);
}
