export function isYuketangHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  return host === 'yuketang.cn' || host.endsWith('.yuketang.cn');
}

export function isYuketangUrl(input, baseHref = globalThis.location?.href || 'https://www.yuketang.cn/') {
  try {
    const url = input instanceof URL ? input : new URL(String(input || ''), baseHref);
    return isYuketangHostname(url.hostname);
  } catch {
    return false;
  }
}
