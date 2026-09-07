import assert from 'node:assert/strict';
import test from 'node:test';

const loadRuntimeMode = () => import('../src/core/runtime-mode.js');

function createRouteGuardHarness({
  pathname = '/v2/web/index',
  search = '',
  hash = '',
} = {}) {
  const listeners = new Map();
  const historyCalls = [];
  const alertCalls = [];
  const session = new Map();
  const location = {
    origin: 'https://changjiang.yuketang.cn',
    pathname,
    search,
    hash,
    replaceCalls: [],
    assignCalls: [],
    get href() {
      return `${this.origin}${this.pathname}${this.search}${this.hash}`;
    },
    replace(next) {
      this.replaceCalls.push(next);
    },
    assign(next) {
      this.assignCalls.push(next);
    },
  };
  const targetWindow = {
    location,
    history: {
      pushState(...args) {
        historyCalls.push({ kind: 'push', args });
      },
      replaceState(...args) {
        historyCalls.push({ kind: 'replace', args });
      },
    },
    sessionStorage: {
      getItem(key) { return session.get(key) ?? null; },
      setItem(key, value) { session.set(key, String(value)); },
      removeItem(key) { session.delete(key); },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    alert(message) {
      alertCalls.push(message);
    },
  };
  const targetDocument = {
    addEventListener(type, handler) {
      listeners.set(`document:${type}`, handler);
    },
  };

  return { targetWindow, targetDocument, location, historyCalls, alertCalls, listeners };
}

test('marks every mobile /m/v2 route for desktop redirection', async () => {
  const { getRuntimeMode } = await loadRuntimeMode();

  assert.equal(getRuntimeMode('/m/v2'), 'desktop-redirect');
  assert.equal(getRuntimeMode('/m/v2/lesson/42'), 'desktop-redirect');
  assert.equal(getRuntimeMode('/v2/web/lesson/42'), 'desktop');
});

test('converts mobile entry and lesson URLs to their desktop equivalents', async () => {
  const runtimeMode = await loadRuntimeMode();

  assert.equal(typeof runtimeMode.getDesktopRouteForMobileLocation, 'function');

  const { getDesktopRouteForMobileLocation } = runtimeMode;
  assert.equal(
    getDesktopRouteForMobileLocation({ pathname: '/m/v2', search: '?from=home', hash: '#notice' }),
    '/v2/web/index?from=home#notice',
  );
  assert.equal(
    getDesktopRouteForMobileLocation({ pathname: '/m/v2/lesson/42', search: '?source=push' }),
    '/v2/web/lesson/42?source=push',
  );
  assert.equal(
    getDesktopRouteForMobileLocation({ pathname: '/m/v2/lesson/42/slides/3', hash: '#slide' }),
    '/v2/web/lesson/42/slides/3#slide',
  );
  assert.equal(
    getDesktopRouteForMobileLocation({ pathname: '/v2/web/lesson/42' }),
    null,
  );
});

test('waits at the root entry and never starts desktop features before a mobile route is redirected', async () => {
  const { shouldStartDesktopRuntime } = await loadRuntimeMode();

  assert.equal(shouldStartDesktopRuntime('/'), false);
  assert.equal(shouldStartDesktopRuntime('/m/v2'), false);
  assert.equal(shouldStartDesktopRuntime('/m/v2/lesson/42'), false);
  assert.equal(shouldStartDesktopRuntime('/v2/web/lesson/42'), true);
});

test('redirects an initially loaded mobile URL to the matching desktop URL', async () => {
  const runtimeMode = await loadRuntimeMode();

  assert.equal(typeof runtimeMode.installDesktopRouteGuard, 'function');

  const { targetWindow, targetDocument, location } = createRouteGuardHarness({
    pathname: '/m/v2/lesson/42',
    search: '?source=home',
    hash: '#slide-3',
  });
  const result = runtimeMode.installDesktopRouteGuard({ targetWindow, targetDocument });

  assert.deepEqual(result, { redirected: true, reason: 'mobile-route' });
  assert.deepEqual(location.replaceCalls, ['/v2/web/lesson/42?source=home#slide-3']);
});

test('rewrites SPA, link, and history navigation away from mobile URLs', async () => {
  const runtimeMode = await loadRuntimeMode();

  assert.equal(typeof runtimeMode.installDesktopRouteGuard, 'function');

  const { targetWindow, targetDocument, location, historyCalls, listeners } = createRouteGuardHarness();
  const result = runtimeMode.installDesktopRouteGuard({ targetWindow, targetDocument });

  assert.deepEqual(result, { redirected: false, reason: 'desktop-route' });

  targetWindow.history.pushState({ lesson: 7 }, '', '/m/v2/lesson/7?via=push#question');
  assert.deepEqual(historyCalls, [{
    kind: 'push',
    args: [{ lesson: 7 }, '', '/v2/web/lesson/7?via=push#question'],
  }]);

  let prevented = false;
  listeners.get('document:click')({
    button: 0,
    defaultPrevented: false,
    target: {
      closest() {
        return { href: 'https://changjiang.yuketang.cn/m/v2/lesson/9?via=link', target: '' };
      },
    },
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.deepEqual(location.assignCalls, ['/v2/web/lesson/9?via=link']);

  let keyboardPrevented = false;
  listeners.get('document:click')({
    defaultPrevented: false,
    target: {
      closest() {
        return { href: 'https://changjiang.yuketang.cn/m/v2/lesson/11?via=keyboard', target: '' };
      },
    },
    preventDefault() { keyboardPrevented = true; },
  });
  assert.equal(keyboardPrevented, true);
  assert.deepEqual(location.assignCalls, [
    '/v2/web/lesson/9?via=link',
    '/v2/web/lesson/11?via=keyboard',
  ]);

  location.pathname = '/m/v2/lesson/10';
  listeners.get('popstate')();
  assert.deepEqual(location.replaceCalls, ['/v2/web/lesson/10']);
});

test('stops after one attempt when a server redirects the same route back to mobile', async () => {
  const runtimeMode = await loadRuntimeMode();

  assert.equal(typeof runtimeMode.installDesktopRouteGuard, 'function');

  const { targetWindow, targetDocument, location, alertCalls } = createRouteGuardHarness({ pathname: '/m/v2' });
  const originalWarn = console.warn;
  console.warn = () => {};
  let first;
  let second;
  try {
    first = runtimeMode.installDesktopRouteGuard({ targetWindow, targetDocument });
    second = runtimeMode.installDesktopRouteGuard({ targetWindow, targetDocument });
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(first, { redirected: true, reason: 'mobile-route' });
  assert.deepEqual(second, { redirected: false, reason: 'loop-prevented' });
  assert.deepEqual(location.replaceCalls, ['/v2/web/index']);
  assert.equal(alertCalls.length, 1);
  assert.match(alertCalls[0], /桌面版网站/);
});
