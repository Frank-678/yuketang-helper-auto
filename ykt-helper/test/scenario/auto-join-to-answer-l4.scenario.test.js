import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGmRequestRecorder,
  createXMLHttpRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';
import {
  addChoiceProblem,
  installFakeImageCanvas,
  resetRepoState,
  waitFor,
} from '../support/integration-fixtures.js';

class NativeWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.sent = [];
    NativeWebSocket.instances.push(this);
  }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  emit(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) fn.call(this, event);
  }

  send(data) { this.sent.push(data); }
  close() { this.emit('close', {}); }
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

test('auto-join lesson -> managed WS unlock -> AI -> /answer works with global autoAnswer disabled', async () => {
  const gmRecorder = createGmRequestRecorder();
  const xhrRecorder = createXMLHttpRequestRecorder();
  const browser = installBrowserGlobals({
    href: 'https://www.yuketang.cn/v2/web/index',
    storage: { Authorization: 'token' },
    gmRequest: gmRecorder.fn,
  });
  const restoreImage = installFakeImageCanvas(browser.document);

  const previousFetch = globalThis.fetch;
  const previousWebSocket = globalThis.WebSocket;
  const previousXHR = globalThis.XMLHttpRequest;
  globalThis.WebSocket = NativeWebSocket;
  browser.window.WebSocket = NativeWebSocket;
  globalThis.XMLHttpRequest = xhrRecorder.FakeXMLHttpRequest;
  browser.window.XMLHttpRequest = xhrRecorder.FakeXMLHttpRequest;

  const fetchCalls = [];
  const fakeFetch = async (url, options = {}) => {
    const href = String(url);
    fetchCalls.push({ href, options });
    if (href.includes('/classroom/on-lesson')) {
      return responseJson({ data: { onLessonClassrooms: [{ lessonId: 'auto-lesson', status: 1 }] } });
    }
    if (href.includes('/lesson/checkin')) {
      return responseJson({ data: { lessonToken: 'auto-token' } });
    }
    throw new Error(`unexpected fetch: ${href}`);
  };
  globalThis.fetch = fakeFetch;
  browser.window.fetch = fakeFetch;

  const { repo } = await import('../../src/state/repo.js');
  const { ui } = await import('../../src/ui/ui-api.js');
  const { actions } = await import('../../src/state/actions.js');
  const { installWSInterceptor } = await import('../../src/net/ws-interceptor.js');

  resetRepoState(repo, 'foreground-page');
  NativeWebSocket.instances.length = 0;
  addChoiceProblem(repo, {
    problemId: 'auto-q',
    slideId: 'auto-s',
    presentationId: 'auto-p',
    lessonId: 'auto-lesson',
  });

  Object.assign(ui.config, {
    autoJoinEnabled: true,
    autoAnswer: false,
    autoAnswerOnAutoJoin: true,
    autoAnswerDelay: 0,
    autoAnswerRandomDelay: 0,
    autoForceRetry: false,
    notifyProblems: false,
    notifyPopup: false,
    notifyNative: false,
    notifySound: false,
  });
  ui.config.ai = {
    ...ui.config.ai,
    profiles: [{
      id: 'autojoin-ai',
      name: 'AutoJoin AI',
      baseUrl: 'https://ai.example/v1/chat/completions',
      apiKey: 'secret',
      model: 'same-model',
      visionModel: 'same-model',
      temperature: '',
    }],
    activeProfileId: 'autojoin-ai',
  };
  ui.updateActiveProblems = () => {};
  ui.updateProblemList = () => {};
  ui.notifyClassroomEvent = () => true;
  ui.toast = () => {};

  installWSInterceptor({ getRuntimeMode: () => 'desktop' });
  gmRecorder.respond({ choices: [{ message: { content: '答案: A' } }] }, 200);
  xhrRecorder.respond({ code: 0, data: {} }, 200);

  try {
    actions.startAutoJoinLoop();
    assert.equal(await waitFor(() => repo.autoJoinedLessons.has('auto-lesson'), 500), true,
      'auto-join should discover, check in, connect, and mark target lesson');

    assert.equal(NativeWebSocket.instances.length, 1);
    const socket = NativeWebSocket.instances[0];
    assert.equal(socket.__yktLessonId, 'auto-lesson');
    socket.emit('open', {});
    const hello = JSON.parse(socket.sent.at(-1));
    assert.equal(hello.op, 'hello');
    assert.equal(hello.lessonid, 'auto-lesson');
    assert.equal(hello.auth, 'auto-token');

    socket.emit('message', {
      data: JSON.stringify({
        op: 'unlockproblem',
        problem: 'auto-q',
        sid: 'auto-s',
        pres: 'auto-p',
        dt: Date.now(),
        limit: 60,
      }),
    });

    assert.equal(await waitFor(() => repo.problemStatus.get('auto-q')?.autoAnswerTime !== null, 250), true,
      'auto-joined lesson unlock should queue an answer even when global autoAnswer is off');
    actions.tickAutoAnswer();
    assert.equal(await waitFor(() => repo.problemStatus.get('auto-q')?.done === true, 500), true,
      'auto-joined lesson should complete AI answer');

    assert.equal(gmRecorder.calls.at(-1).url, 'https://ai.example/v1/chat/completions');
    const answerRequest = xhrRecorder.calls.at(-1);
    assert.equal(answerRequest.url, '/api/v3/lesson/problem/answer');
    assert.deepEqual(JSON.parse(answerRequest.body).result, ['A']);
    assert.ok(fetchCalls.some(call => call.href.includes('/classroom/on-lesson')));
    assert.ok(fetchCalls.some(call => call.href.includes('/lesson/checkin')));
  } finally {
    actions.stopAutoJoinLoop();
    restoreImage();
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
    if (previousWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = previousWebSocket;
    if (previousXHR === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = previousXHR;
    uninstallBrowserGlobals();
  }
});
