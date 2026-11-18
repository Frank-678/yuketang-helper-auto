import { readCheckinCookies } from './checkin-protocol.js';

const names = ['sessionid', 'csrftoken'];
const valid = value => typeof value === 'string' && value.length > 0 && value.length < 8192 && !/[\r\n;\0]/.test(value);

export function selectCheckinSession(origin, visibleCookie = '', cookies = []) {
  const target = new URL('/api/v3/lesson/checkin', origin);
  const values = readCheckinCookies(visibleCookie), selected = {};
  for (const row of Array.isArray(cookies) ? cookies : []) {
    if (!names.includes(row?.name) || !valid(row.value)) continue;
    const domain = String(row.domain || target.hostname).replace(/^\./, '').toLowerCase();
    if (row.hostOnly ? domain !== target.hostname : target.hostname !== domain && !target.hostname.endsWith(`.${domain}`)) continue;
    const path = row.path || '/';
    if (target.pathname !== path && !(target.pathname.startsWith(path) && (path.endsWith('/') || target.pathname[path.length] === '/'))) continue;
    if (row.expirationDate != null && row.expirationDate * 1000 <= Date.now()) continue;
    if (row.partitionKey?.topLevelSite) {
      try { const site = new URL(row.partitionKey.topLevelSite); if (site.protocol !== 'https:' || !['yuketang.cn', target.hostname].includes(site.hostname)) continue; } catch { continue; }
    }
    if (!selected[row.name] || path.length > (selected[row.name].path || '/').length) selected[row.name] = row;
  }
  for (const name of names) {
    if (selected[name]) values[name] = selected[name].value;
    if (!valid(values[name])) delete values[name];
  }
  return {
    sessionid: values.sessionid || '', csrftoken: values.csrftoken || '',
    // Merge only the authentication cookies into the manager's complete jar.
    cookie: names.filter(name => selected[name]).map(name => `${name}=${selected[name].value}`).join('; '),
    source: selected.sessionid ? 'gm-cookie' : values.sessionid ? 'document' : 'jar-only',
  };
}
