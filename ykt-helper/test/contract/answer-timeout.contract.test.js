import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createXMLHttpRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const recorder = createXMLHttpRequestRecorder();
installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/timeout-lesson',
  storage: { Authorization: 'auth-token' },
});
globalThis.XMLHttpRequest = recorder.FakeXMLHttpRequest;

const { answerProblem, retryAnswer } = await import('../../src/tsm/answer.js');

test.after(() => uninstallBrowserGlobals());

test('answer request installs a finite positive XHR timeout', async () => {
  recorder.respond({ code: 0, data: {} });
  await answerProblem({ problemId: 1, problemType: 1 }, ['A']);
  const call = recorder.calls.at(-1);
  assert.ok(Number.isFinite(call.timeout));
  assert.ok(call.timeout > 0);
  assert.ok(call.timeout <= 60_000, `timeout should remain bounded, got ${call.timeout}`);
});

test('answer request timeout rejects instead of leaving the Promise pending', async () => {
  recorder.timeout();
  await assert.rejects(
    () => answerProblem({ problemId: 2, problemType: 1 }, ['B']),
    /超时|timeout/i,
  );
});

test('retry request timeout rejects instead of reporting a false success', async () => {
  recorder.timeout();
  await assert.rejects(
    () => retryAnswer({ problemId: 3, problemType: 1 }, ['C'], Date.now()),
    /超时|timeout/i,
  );
});
