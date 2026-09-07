// src/core/runtime-mode.js

const MOBILE_ROUTE_PATTERN = /^\/m\/v2(?:\/|$)/;
const REDIRECT_LOOP_STORAGE_KEY = '__ykt_desktop_route_guard_target__';

export function isMobileReminderPath(pathname = '') {
  return MOBILE_ROUTE_PATTERN.test(String(pathname));
}

function normalizePart(value, prefix) {
  const text = String(value || '');
  if (!text || text.startsWith(prefix)) return text;
  return `${prefix}${text}`;
}

/**
 * Maps a mobile page to its desktop equivalent while preserving the page's
 * query string and hash.  A null result means that the route is already
 * desktop-compatible and must be left untouched.
 */
export function getDesktopRouteForMobileLocation({
  pathname = '',
  search = '',
  hash = '',
} = {}) {
  const currentPath = String(pathname);
  if (!isMobileReminderPath(currentPath)) return null;

  const mobileSuffix = currentPath.slice('/m/v2'.length);
  const desktopPath = mobileSuffix === '' || mobileSuffix === '/'
    ? '/v2/web/index'
    : `/v2/web${mobileSuffix}`;

  return `${desktopPath}${normalizePart(search, '?')}${normalizePart(hash, '#')}`;
}

function getDesktopRouteForNavigation(value, location) {
  if (value === undefined || value === null || value === '') return null;

  try {
    const url = new URL(String(value), location?.href || location?.origin || undefined);
    if (location?.origin && url.origin !== location.origin) return null;
    return getDesktopRouteForMobileLocation(url);
  } catch {
    return null;
  }
}

function clearRedirectLoopMarker(targetWindow) {
  try {
    targetWindow?.sessionStorage?.removeItem(REDIRECT_LOOP_STORAGE_KEY);
  } catch {}
}

function redirectCurrentMobileRoute(targetWindow) {
  const location = targetWindow?.location;
  const target = getDesktopRouteForMobileLocation(location);
  if (!target) {
    clearRedirectLoopMarker(targetWindow);
    return { redirected: false, reason: 'desktop-route' };
  }

  try {
    const storage = targetWindow?.sessionStorage;
    if (storage?.getItem(REDIRECT_LOOP_STORAGE_KEY) === target) {
      const message = '雨课堂仍将桌面页重定向到手机版。请在浏览器中启用“桌面版网站”后重新打开课程。';
      console.warn(`[雨课堂助手][WARN] ${message}`);
      try { targetWindow?.alert?.(message); } catch {}
      return { redirected: false, reason: 'loop-prevented' };
    }
    storage?.setItem(REDIRECT_LOOP_STORAGE_KEY, target);
  } catch {}

  location?.replace?.(target);
  return { redirected: true, reason: 'mobile-route' };
}

/**
 * Keeps the userscript desktop-only.  It catches the mobile landing route as
 * early as possible and also rewrites SPA/history/link navigation before the
 * host application can enter /m/v2.
 */
export function installDesktopRouteGuard({
  targetWindow = typeof window !== 'undefined' ? window : null,
  targetDocument = typeof document !== 'undefined' ? document : null,
} = {}) {
  const initialResult = redirectCurrentMobileRoute(targetWindow);
  if (initialResult.redirected || initialResult.reason === 'loop-prevented') return initialResult;

  const history = targetWindow?.history;
  const location = targetWindow?.location;
  for (const key of ['pushState', 'replaceState']) {
    const original = history?.[key];
    if (typeof original !== 'function') continue;
    history[key] = function (...args) {
      const replacement = getDesktopRouteForNavigation(args[2], location);
      if (replacement) args[2] = replacement;
      return original.apply(this, args);
    };
  }

  const redirectIfMobile = () => redirectCurrentMobileRoute(targetWindow);
  targetWindow?.addEventListener?.('popstate', redirectIfMobile);
  targetWindow?.addEventListener?.('hashchange', redirectIfMobile);

  targetDocument?.addEventListener?.('click', event => {
    if (event?.defaultPrevented || (event?.button !== undefined && event.button !== 0)
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = event.target?.closest?.('a[href]');
    if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute?.('download')) return;

    const replacement = getDesktopRouteForNavigation(anchor.href, location);
    if (!replacement) return;
    event.preventDefault();
    location?.assign?.(replacement);
  }, true);

  return initialResult;
}

/** Mobile routes are redirect-only; the assistant no longer runs a mobile runtime. */
export function getRuntimeMode(pathname = '') {
  return isMobileReminderPath(pathname) ? 'desktop-redirect' : 'desktop';
}

/** Root URLs are redirect entry points, not a full desktop runtime yet. */
export function shouldStartDesktopRuntime(pathname = '') {
  const normalizedPath = String(pathname);
  return normalizedPath !== '/' && normalizedPath !== ''
    && getRuntimeMode(normalizedPath) === 'desktop';
}
