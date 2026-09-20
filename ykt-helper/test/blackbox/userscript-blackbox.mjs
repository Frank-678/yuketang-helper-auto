import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const artifactInput = process.env.BLACKBOX_ARTIFACT || 'dist/ykt-helper-1216.user.js';
const expectedVersion = process.env.BLACKBOX_EXPECTED_VERSION || '1.21.6';
const artifactPath = path.resolve(process.cwd(), artifactInput);
assert.ok(fs.existsSync(artifactPath), `missing userscript artifact: ${artifactPath}`);

const source = fs.readFileSync(artifactPath, 'utf8');

function metadataValues(key) {
  const pattern = new RegExp(`^//\\s+@${key}\\s+(.+)$`, 'gm');
  return [...source.matchAll(pattern)].map((match) => match[1].trim());
}

function assertArtifactContract() {
  assert.match(source, /^\s*\/\/ ==UserScript==/);
  assert.match(source, /\/\/ ==\/UserScript==/);
  assert.deepEqual(metadataValues('version'), [expectedVersion]);
  assert.deepEqual(metadataValues('run-at'), ['document-start']);

  const grants = new Set(metadataValues('grant'));
  for (const grant of [
    'GM_addStyle',
    'GM_notification',
    'GM_xmlhttpRequest',
    'GM_openInTab',
    'GM_getTab',
    'GM_getTabs',
    'GM_saveTab',
    'unsafeWindow'
  ]) {
    assert.ok(grants.has(grant), `missing userscript grant: ${grant}`);
  }

  const matches = metadataValues('match');
  assert.ok(matches.includes('https://www.yuketang.cn/m/v2*'));
  assert.ok(matches.some((value) => value.includes('/v2/web/*')));
  assert.ok(matches.some((value) => value.includes('/lesson/fullscreen/v3/*')));

  // Compile the final artifact as a script. This intentionally does not import src/**.
  assert.doesNotThrow(() => new Function(source));
}

const bootstrap = `
(() => {
  const records = {
    gmRequests: [],
    notifications: [],
    openedTabs: [],
    socketSends: []
  };
  Object.defineProperty(window, '__BLACKBOX_RECORDS__', { value: records, configurable: false });

  window.unsafeWindow = window;
  window.GM_addStyle = (css) => {
    const style = document.createElement('style');
    style.textContent = String(css ?? '');
    (document.head || document.documentElement).appendChild(style);
    return style;
  };
  window.GM_notification = (details) => {
    records.notifications.push(details);
    return { remove() {} };
  };
  window.GM_xmlhttpRequest = (details = {}) => {
    records.gmRequests.push({ method: details.method || 'GET', url: details.url || '' });
    queueMicrotask(() => {
      details.onload?.({
        status: 200,
        statusText: 'OK',
        responseText: '{}',
        response: '{}',
        finalUrl: details.url || '',
        responseHeaders: 'content-type: application/json'
      });
    });
    return { abort() {} };
  };
  window.GM_openInTab = (url) => {
    records.openedTabs.push(String(url));
    return { close() {} };
  };
  window.GM_getTab = (callback) => {
    const tab = {};
    callback?.(tab);
    return Promise.resolve(tab);
  };
  window.GM_getTabs = (callback) => {
    const tabs = {};
    callback?.(tabs);
    return Promise.resolve(tabs);
  };
  window.GM_saveTab = () => Promise.resolve();
  window.GM_info = { script: { version: ${JSON.stringify(expectedVersion)} } };

  window.jspdf = { jsPDF: class jsPDF {} };
  window.MathJax = { typesetPromise: () => Promise.resolve() };

  class MockWebSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      super();
      this.url = String(url);
      this.readyState = MockWebSocket.OPEN;
      queueMicrotask(() => this.dispatchEvent(new Event('open')));
    }
    send(data) { records.socketSends.push(data); }
    close() {
      this.readyState = MockWebSocket.CLOSED;
      this.dispatchEvent(new CloseEvent('close', { code: 1000, reason: 'blackbox' }));
    }
  }
  window.WebSocket = MockWebSocket;

  class MockNotification {
    static permission = 'denied';
    static requestPermission() { return Promise.resolve('denied'); }
    constructor(title, options) { records.notifications.push({ title, ...options }); }
    close() {}
  }
  window.Notification = MockNotification;
})();
`;

async function runScenario(browser, { name, url, verify }) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const requests = [];

  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    requests.push({ method: request.method(), url: request.url(), resourceType: request.resourceType() });
  });

  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.isNavigationRequest()) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><head><title>blackbox</title></head><body><main id="app"></main></body></html>'
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: '{"success":true,"data":{}}'
    });
  });

  await page.addInitScript({ content: `${bootstrap}\n${source}` });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(750);

  const state = await page.evaluate(() => ({
    url: location.href,
    bodyText: document.body?.innerText || '',
    records: window.__BLACKBOX_RECORDS__
  }));

  const unsafeWrites = requests.filter((request) =>
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())
  );
  assert.deepEqual(unsafeWrites, [], `${name}: startup unexpectedly issued write requests`);

  await verify({ page, state, requests, pageErrors, consoleErrors });

  assert.deepEqual(pageErrors, [], `${name}: uncaught page errors:\n${pageErrors.join('\n')}`);
  await context.close();
}

assertArtifactContract();

const browser = await chromium.launch({ headless: true });
try {
  await runScenario(browser, {
    name: 'mobile-index-route-rewrite',
    url: 'https://www.yuketang.cn/m/v2?blackbox=1#probe',
    verify: async ({ state }) => {
      assert.equal(
        state.url,
        'https://www.yuketang.cn/v2/web/index?blackbox=1#probe',
        'mobile index route must be rewritten to desktop route while preserving query/hash'
      );
    }
  });

  await runScenario(browser, {
    name: 'desktop-index-safe-startup',
    url: 'https://www.yuketang.cn/v2/web/index?blackbox=1',
    verify: async ({ state }) => {
      assert.equal(state.url, 'https://www.yuketang.cn/v2/web/index?blackbox=1');
      assert.ok(!state.bodyText.includes('AI 强制作答'), 'problem action UI leaked onto index page');
      assert.ok(!state.bodyText.includes('编辑补交'), 'problem submit UI leaked onto index page');
    }
  });

  await runScenario(browser, {
    name: 'lesson-route-safe-bootstrap',
    url: 'https://www.yuketang.cn/v2/web/lesson/123456789?blackbox=1',
    verify: async ({ state }) => {
      assert.equal(state.url, 'https://www.yuketang.cn/v2/web/lesson/123456789?blackbox=1');
    }
  });
} finally {
  await browser.close();
}

console.log(`Independent artifact black-box audit passed: ${artifactInput} (${expectedVersion}).`);
