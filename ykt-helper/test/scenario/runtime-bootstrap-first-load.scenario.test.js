import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

class NativeWebSocket {
  constructor(url = 'wss://example.invalid/ws') {
    this.url = url;
    this.listeners = new Map();
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  send() {}
  close() {}
}

class NativeXMLHttpRequest {
  constructor() {
    this.listeners = new Map();
    this.responseText = '';
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  open() {}
  send() {}
}

test('first load arms network hooks once, never force-reloads, and periodic refresh skips lesson pages', async () => {
  const { window, document } = installBrowserGlobals({
    href: 'https://changjiang.yuketang.cn/v2/web/index',
  });

  let reloadCount = 0;
  const intervals = [];
  window.location.reload = () => { reloadCount += 1; };
  window.setInterval = (fn, ms) => {
    intervals.push({ fn, ms });
    return intervals.length;
  };
  window.clearInterval = () => {};

  // Simulate document-start: network hooks must be armed before body/runtime UI exists.
  document.body = null;
  window.WebSocket = NativeWebSocket;
  window.XMLHttpRequest = NativeXMLHttpRequest;
  globalThis.WebSocket = NativeWebSocket;
  globalThis.XMLHttpRequest = NativeXMLHttpRequest;

  try {
    await import(`../../src/index.js?runtime-first-load=${Date.now()}`);

    assert.notEqual(window.WebSocket, NativeWebSocket, 'WebSocket should be wrapped on the first execution');
    assert.notEqual(window.XMLHttpRequest, NativeXMLHttpRequest, 'XMLHttpRequest should be wrapped on the first execution');
    assert.equal(reloadCount, 0, 'runtime activation must not require a forced second page load');
    assert.equal(intervals.length, 1, 'periodic reload base service should be installed exactly once');
    assert.equal(intervals[0].ms, 60_000);

    // Non-lesson pages are allowed to refresh on the periodic tick.
    window.location.pathname = '/v2/web/index';
    intervals[0].fn();
    assert.equal(reloadCount, 1, 'non-lesson page should refresh on the periodic tick');

    // The same base service must never interrupt an active lesson page.
    window.location.pathname = '/lesson/fullscreen/v3/lesson-123';
    intervals[0].fn();
    assert.equal(reloadCount, 1, 'lesson page must be excluded from periodic refresh');
  } finally {
    uninstallBrowserGlobals();
    delete globalThis.WebSocket;
  }
});
