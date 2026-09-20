const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function assertSafeApiEndpoint(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) throw new Error('API endpoint 地址不能为空');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('API endpoint 不是有效 URL');
  }

  if (url.username || url.password) {
    throw new Error('API endpoint 不允许在 URL 中嵌入凭据');
  }

  if (url.protocol === 'https:') return url.href;

  if (url.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(url.hostname)) {
    return url.href;
  }

  throw new Error('API endpoint 必须使用 HTTPS；仅 localhost/127.0.0.1/[::1] 可使用 HTTP');
}
