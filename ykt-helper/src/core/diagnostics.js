// src/core/diagnostics.js
// 课堂运行日志：只记录自动作答链路上的关键节点，便于真实课堂失败后导出复盘。
const STORAGE_KEY = 'ykt-helper:diag';
const MAX_ENTRIES = 600;

let entries = null;
let saveTimer = null;

function load() {
  if (entries) return entries;
  try { entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { entries = []; }
  if (!Array.isArray(entries)) entries = [];
  return entries;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))); } catch {}
  }, 500);
}

function compact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…(${value.length})` : value;
  if (typeof value !== 'object') return value;
  if (depth > 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 20).map(v => compact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value).slice(0, 30)) out[k] = compact(v, depth + 1);
  return out;
}

/** 记录一条诊断事件。 */
export function diag(event, detail = {}) {
  const list = load();
  list.push({ at: Date.now(), path: location.pathname, event, ...compact(detail) });
  if (list.length > MAX_ENTRIES * 1.5) entries = list.slice(-MAX_ENTRIES);
  scheduleSave();
}

export function getDiagnostics() {
  return load().slice();
}

export function clearDiagnostics() {
  entries = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** 生成可发给开发者的文本：版本、环境和事件列表。 */
export function exportDiagnostics(meta = {}) {
  const header = {
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    href: location.href,
    ...meta,
  };
  const lines = load().map(e => {
    const { at, event, path, ...rest } = e;
    const t = new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
    return `${t} ${event} ${path} ${JSON.stringify(rest)}`;
  });
  return `${JSON.stringify(header)}\n${lines.join('\n')}\n`;
}

export function downloadDiagnostics(meta = {}) {
  const text = exportDiagnostics(meta);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ykt-helper-diag-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return text.length;
}
