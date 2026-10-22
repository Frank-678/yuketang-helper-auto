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

const scriptLoads = new Map();
export function loadScriptOnce(src) {
  if (scriptLoads.has(src)) return scriptLoads.get(src);
  const promise = new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(s => s.src === src);
    const script = existing || document.createElement('script');
    const finish = error => { clearTimeout(timer); script.removeEventListener('load', loaded); script.removeEventListener('error', failed); if (error) { scriptLoads.delete(src); if (!existing) script.remove(); reject(error); } else resolve(); };
    const loaded = () => finish();
    const failed = () => finish(new Error('外部工具加载失败，请稍后重试'));
    const timer = setTimeout(() => finish(new Error('外部工具加载超时，请检查网络后重试')), 12000);
    script.addEventListener('load', loaded, { once: true }); script.addEventListener('error', failed, { once: true });
    if (!existing) { script.src = src; (document.head || document.documentElement).appendChild(script); }
  });
  scriptLoads.set(src, promise); return promise;
}

export async function ensureHtml2Canvas() {
  const w = gm.uw || window;                         
  if (typeof w.html2canvas === 'function') return w.html2canvas;
  await loadScriptOnce('https://html2canvas.hertzen.com/dist/html2canvas.min.js');
  const h2c = w.html2canvas?.default || w.html2canvas;
  if (typeof h2c === 'function') return h2c;
  throw new Error('html2canvas 未正确加载');
}

export async function ensureJsPDF() {
  const current = () => (gm.uw || window).jspdf || window.jspdf;
  if (!current()?.jsPDF) await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  if (!current()?.jsPDF) throw new Error('jsPDF 未加载成功');
  window.jspdf = current(); return current();
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
  document.head.appendChild(link);
}
