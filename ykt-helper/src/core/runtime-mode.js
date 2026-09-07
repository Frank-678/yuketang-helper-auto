// src/core/runtime-mode.js

const MOBILE_ROUTE_PATTERN = /^\/m\/v2(?:\/|$)/;
const DESKTOP_ENTRY_PATH_PATTERN = /^(?:\/|\/v2\/web(?:\/index)?\/?)$/;
const REDIRECT_LOOP_STORAGE_KEY = '__ykt_desktop_route_guard_target__';
const REDIRECT_LOOP_WINDOW_MS = 15 * 1000;

export function isMobileReminderPath(pathname = '') {
  return MOBILE_ROUTE_PATTERN.test(String(pathname));
}

function normalizePart(value, prefix) {
  const text = String(value || '');
  if (!text || text.startsWith(prefix)) return text;
  return `${prefix}${text}`;
}

function isDesktopEntryPath(pathname = '') {
  return DESKTOP_ENTRY_PATH_PATTERN.test(String(pathname));
}

/**
 * Rain Classroom's PC bundle sends portrait entry pages to /m/v2 when
 * innerWidth is less than innerHeight. Keep that one bootstrap check in
 * desktop mode without changing the browser's user agent or lesson pages.
 */
export function installDesktopViewportGuard({
  targetWindow = typeof window !== 'undefined' ? window : null,
} = {}) {
  const location = targetWindow?.location;
  if (!isDesktopEntryPath(location?.pathname)) return { applied: false, reason: 'not-desktop-entry' };

  const width = Number(targetWindow?.innerWidth);
  const height = Number(targetWindow?.innerHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width >= height) {
    return { applied: false, reason: 'not-portrait' };
  }

  try {
    Object.defineProperty(targetWindow, 'innerWidth', {
      configurable: true,
      get: () => height,
    });
    console.info('[雨课堂助手][INFO] 已保持竖屏桌面入口，阻止雨课堂切换到 /m/v2。');
    return { applied: true, reason: 'portrait-desktop-entry' };
  } catch (error) {
    console.warn('[雨课堂助手][WARN] 无法覆盖页面视口宽度，请启用浏览器的桌面网站模式。', error);
    return { applied: false, reason: 'viewport-override-failed' };
  }
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

function hasRecentRedirectMarker(targetWindow, target) {
  try {
    const value = targetWindow?.sessionStorage?.getItem(REDIRECT_LOOP_STORAGE_KEY);
    const marker = JSON.parse(value || 'null');
    return marker?.target === target
      && Number.isFinite(marker.at)
      && Date.now() - marker.at >= 0
      && Date.now() - marker.at < REDIRECT_LOOP_WINDOW_MS;
  } catch {
    return false;
  }
}

function recordRedirectMarker(targetWindow, target) {
  try {
    targetWindow?.sessionStorage?.setItem(REDIRECT_LOOP_STORAGE_KEY, JSON.stringify({
      target,
      at: Date.now(),
    }));
  } catch {}
}

function redirectCurrentMobileRoute(targetWindow) {
  const location = targetWindow?.location;
  const target = getDesktopRouteForMobileLocation(location);
  if (!target) {
    return { redirected: false, reason: 'desktop-route' };
  }

  if (hasRecentRedirectMarker(targetWindow, target)) {
    const message = '雨课堂仍将桌面页重定向到手机版。请在浏览器中启用“桌面版网站”后重新打开课程。';
    console.warn(`[雨课堂助手][WARN] ${message}`);
    try { targetWindow?.alert?.(message); } catch {}
    return { redirected: false, reason: 'loop-prevented' };
  }

  recordRedirectMarker(targetWindow, target);

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
