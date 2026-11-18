import { readCheckinCookies } from './checkin-protocol.js';

const valid = value => typeof value === 'string' && value.length > 0 && value.length < 8192 && !/[\r\n;\0]/.test(value);
const validName = name => typeof name === 'string' && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name);

export function normalizeSiteAuthorization(value) {
  if (typeof value !== 'string') return '';
  const token = value.trim().replace(/^Bearer(?:\s+|$)/i, '');
  if (!token || /^(?:null|undefined)$/i.test(token) || token.length > 65536 || /[^\x21-\x7e]/.test(token)) return '';
  return `Bearer ${token}`;
}

export function selectCheckinSession(origin, visibleCookie = '', cookies = []) {
  const target = new URL('/api/v3/lesson/checkin', origin);
  const values = readCheckinCookies(visibleCookie), rows = [];
  for (const row of Array.isArray(cookies) ? cookies : []) {
    if (!validName(row?.name) || !valid(row.value)) continue;
    const domain = String(row.domain || target.hostname).replace(/^\./, '').toLowerCase();
    if (row.hostOnly ? domain !== target.hostname : target.hostname !== domain && !target.hostname.endsWith(`.${domain}`)) continue;
    const path = row.path || '/';
    if (target.pathname !== path && !(target.pathname.startsWith(path) && (path.endsWith('/') || target.pathname[path.length] === '/'))) continue;
    if (row.expirationDate != null && row.expirationDate * 1000 <= Date.now()) continue;
    if (row.partitionKey?.topLevelSite) {
      try { const site = new URL(row.partitionKey.topLevelSite); if (site.protocol !== 'https:' || !['yuketang.cn', target.hostname].includes(site.hostname)) continue; } catch { continue; }
    }
    rows.push(row);
  }
  // Like a browser Cookie header, put more specific paths first and retain
  // applicable companion cookies rather than guessing an authentication list.
  rows.sort((a, b) => (b.path || '/').length - (a.path || '/').length);
  const selected = new Map();
  for (const row of rows) if (!selected.has(row.name)) selected.set(row.name, row);
  for (const name of ['sessionid', 'csrftoken']) {
    if (selected.has(name)) values[name] = selected.get(name).value;
    if (!valid(values[name])) delete values[name];
  }
  return {
    sessionid: values.sessionid || '', csrftoken: values.csrftoken || '',
    // Only an endpoint-scoped manager snapshot that includes the session may
    // be sent explicitly; document.cookie alone is never treated as complete.
    cookie: selected.has('sessionid') ? rows.map(row => `${row.name}=${row.value}`).join('; ') : '',
    source: selected.has('sessionid') ? 'gm-cookie' : values.sessionid ? 'document' : 'jar-only',
    signedSessionAvailable: selected.has('sessionid_sign'), cookieCount: rows.length,
    httpOnlyCookieCount: rows.filter(row => row.httpOnly).length,
  };
}
