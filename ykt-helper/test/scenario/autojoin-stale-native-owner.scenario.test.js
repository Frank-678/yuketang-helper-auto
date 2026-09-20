import assert from 'node:assert/strict';
import test from 'node:test';
import { installBrowserGlobals, uninstallBrowserGlobals } from '../support/browser-harness.js';
import { waitFor } from '../support/integration-fixtures.js';

class NativeOwnerSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor() {
    this.readyState = NativeOwnerSocket.OPEN;
    this.closeCalls = 0;
    this.__yktManaged = false;
  }

  close() {
    this.closeCalls += 1;
    this.readyState = NativeOwnerSocket.CLOSED;
  }
}

function responseJson(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get() { return null; } },
    async text() { return text; },
    async json() { return body; },
  };
}

test('AutoJoin stale-lesson pruning never disconnects a foreground native socket owner', async () => {
  const browser = installBrowserGlobals({
    href: 'https://www.yuketang.cn/v2/web/index',
    storage: { Authorization: 'token' },
  });

  const previousFetch = globalThis.fetch;
  const previousWebSocket = globalThis.WebSocket;
  const previousSetTimeout = globalThis.setTimeout;
  const previousClearTimeout = globalThis.clearTimeout;

  const fetchCalls = [];
  const fakeFetch = async (url) => {
    const href = String(url);
    fetchCalls.push(href);
    if (href.includes('/classroom/on-lesson')) {
      return responseJson({ data: { onLessonClassrooms: [] } });
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  globalThis.fetch = fakeFetch;
  browser.window.fetch = fakeFetch;

  // Prevent the normal 5-second recurring AutoJoin poll from running again;
  // the first loop is sufficient to exercise the removed-lesson branch.
  let timerSeq = 0;
  const blockedTimers = new Set();
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (Number(ms) === 5000) {
      const id = ++timerSeq;
      blockedTimers.add(id);
      return id;
    }
    return previousSetTimeout(fn, ms, ...args);
  };
  globalThis.clearTimeout = id => {
    if (blockedTimers.delete(id)) return;
    return previousClearTimeout(id);
  };

  globalThis.WebSocket = NativeOwnerSocket;
  browser.window.WebSocket = NativeOwnerSocket;

  const { repo } = await import('../../src/state/repo.js');
  const { actions } = await import('../../src/state/actions.js');

  repo.listeningLessons.clear();
  repo.lessonTokens.clear();
  repo.lessonSockets.clear();
  repo.activeLessons.clear();
  repo.autoJoinedLessons.clear();
  repo.forceAutoAnswerLessons.clear();
  repo.autoJoinRunning = false;

  const lessonId = 'foreground-native-stale';
  const native = new NativeOwnerSocket();
  native.__yktLessonId = lessonId;
  repo.activeLessons.set(lessonId, { lessonId, status: 1 });
  repo.markLessonConnected(lessonId, native, 'native-token');
  repo.markLessonAutoJoined(lessonId, false);

  try {
    actions.startAutoJoinLoop();
    assert.equal(await waitFor(() => fetchCalls.some(url => url.includes('/classroom/on-lesson')), 250), true);
    assert.equal(await waitFor(() => !repo.activeLessons.has(lessonId), 500), true,
      'the first AutoJoin sync must finish processing the removed lesson before assertions run');

    assert.equal(native.closeCalls, 0,
      'a lesson disappearing from the AutoJoin API must not close a foreground/native owner');
    assert.equal(repo.lessonSockets.get(lessonId), native);
    assert.equal(repo.listeningLessons.has(lessonId), true);
    assert.equal(repo.autoJoinedLessons.has(lessonId), false);
  } finally {
    actions.stopAutoJoinLoop();
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
    if (previousWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = previousWebSocket;
    globalThis.setTimeout = previousSetTimeout;
    globalThis.clearTimeout = previousClearTimeout;
    uninstallBrowserGlobals();
  }
});
