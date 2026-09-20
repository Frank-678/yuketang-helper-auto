import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createXMLHttpRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const recorder = createXMLHttpRequestRecorder();
installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/transport-lesson',
  storage: { Authorization: 'auth-token' },
});
globalThis.XMLHttpRequest = recorder.FakeXMLHttpRequest;

const { answerProblem, retryAnswer, submitAnswer } = await import('../../src/tsm/answer.js');

test.after(() => uninstallBrowserGlobals());

const payloadCases = [
  [1, ['A']],
  [2, ['A', 'C']],
  [3, ['B']],
  [4, ['foo', 'bar']],
  [5, { content: 'subjective answer', pics: [] }],
];
for (const [problemType, result] of payloadCases) {
  test(`answer endpoint preserves result payload for problemType=${problemType}`, async () => {
    recorder.respond({ code: 0, data: {} });
    const before = recorder.calls.length;
    const response = await answerProblem({ problemId: 100 + problemType, problemType }, result, { dt: 123456 });
    assert.equal(response.code, 0);
    assert.equal(recorder.calls.length - before, 1);
    const call = recorder.calls.at(-1);
    assert.equal(call.method, 'POST');
    assert.equal(call.url, '/api/v3/lesson/problem/answer');
    assert.equal(call.headers.Authorization, 'Bearer auth-token');
    assert.equal(call.headers.xtbz, 'ykt');
    assert.equal(call.headers['X-Client'], 'h5');
    assert.deepEqual(JSON.parse(call.body), {
      problemId: 100 + problemType,
      problemType,
      dt: 123456,
      result,
    });
  });
}

test('custom headers override defaults without removing required defaults', async () => {
  recorder.respond({ code: 0 });
  await answerProblem({ problemId: 1, problemType: 1 }, ['A'], {
    dt: 1,
    headers: { Authorization: 'Bearer override', 'X-Test': 'yes' },
  });
  const headers = recorder.calls.at(-1).headers;
  assert.equal(headers.Authorization, 'Bearer override');
  assert.equal(headers['X-Test'], 'yes');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('business error from /answer rejects and exposes message/code', async () => {
  recorder.respond({ code: 4001, msg: 'answer rejected' });
  await assert.rejects(
    () => answerProblem({ problemId: 1, problemType: 1 }, ['A']),
    /answer rejected \(4001\)/,
  );
});

test('malformed JSON from /answer rejects', async () => {
  recorder.respond('not json');
  await assert.rejects(
    () => answerProblem({ problemId: 1, problemType: 1 }, ['A']),
    /解析响应失败/,
  );
});

test('network failure from /answer rejects', async () => {
  recorder.fail(new Error('offline'));
  await assert.rejects(
    () => answerProblem({ problemId: 1, problemType: 1 }, ['A']),
    /网络请求失败/,
  );
});

test('HTTP error must not be accepted as success even if body incorrectly says code=0', async () => {
  recorder.respond({ code: 0, data: {} }, 500);
  await assert.rejects(
    () => answerProblem({ problemId: 1, problemType: 1 }, ['A']),
    /HTTP|500|请求失败/,
  );
});

test('retry endpoint sends one problems entry with exact simulated dt', async () => {
  recorder.respond({ code: 0, data: { success: [88] } });
  const response = await retryAnswer({ problemId: 88, problemType: 2 }, ['A', 'B'], 9999);
  assert.equal(response.code, 0);
  const call = recorder.calls.at(-1);
  assert.equal(call.url, '/api/v3/lesson/problem/retry');
  assert.deepEqual(JSON.parse(call.body), {
    problems: [{ problemId: 88, problemType: 2, dt: 9999, result: ['A', 'B'] }],
  });
});

test('retry business error rejects', async () => {
  recorder.respond({ code: 7001, msg: 'retry rejected' });
  await assert.rejects(
    () => retryAnswer({ problemId: 88, problemType: 1 }, ['A'], 100),
    /retry rejected \(7001\)/,
  );
});

test('retry requires server success list to contain current problem id', async () => {
  recorder.respond({ code: 0, data: { success: [999] } });
  await assert.rejects(
    () => retryAnswer({ problemId: 88, problemType: 1 }, ['A'], 100),
    /服务器未返回成功信息/,
  );
});

test('retry rejects when success list is missing', async () => {
  recorder.respond({ code: 0, data: {} });
  await assert.rejects(
    () => retryAnswer({ problemId: 88, problemType: 1 }, ['A'], 100),
    /服务器未返回成功信息/,
  );
});

test('submitAnswer normal path does not wait when autoGate=false', async () => {
  recorder.respond({ code: 0, data: {} });
  const started = Date.now();
  const result = await submitAnswer(
    { problemId: 7, problemType: 1 },
    ['A'],
    { startTime: 1, endTime: Date.now() + 60_000, autoGate: false, waitMs: 60_000 },
  );
  assert.equal(result.route, 'answer');
  assert.ok(Date.now() - started < 500);
});

test('submitAnswer forceRetry chooses retry and computes dt from startTime + offset', async () => {
  recorder.respond({ code: 0, data: { success: [7] } });
  const result = await submitAnswer(
    { problemId: 7, problemType: 1 },
    ['A'],
    { startTime: 10_000, endTime: 20_000, retryDtOffsetMs: 2_500, forceRetry: true, autoGate: false },
  );
  assert.equal(result.route, 'retry');
  const body = JSON.parse(recorder.calls.at(-1).body);
  assert.equal(body.problems[0].dt, 12_500);
});

test('after deadline without explicit forceRetry still uses ordinary answer route', async () => {
  recorder.respond({ code: 0, data: {} });
  const result = await submitAnswer(
    { problemId: 7, problemType: 1 },
    ['A'],
    { startTime: 1, endTime: 2, forceRetry: false, autoGate: false },
  );
  assert.equal(result.route, 'answer');
  assert.equal(recorder.calls.at(-1).url, '/api/v3/lesson/problem/answer');
});


for (const [code, msg, expected] of [
  [50028, 'LESSON_PROBLEM_ALREADY_ANSWERED', /已提交过|强制补交|50028/],
  [50026, 'LESSON_PROBLEM_FINISHED', /已结束|强制补交|50026/],
]) {
  test(`answer endpoint translates server state ${code} into actionable retry guidance`, async () => {
    recorder.respond({ code, msg });
    await assert.rejects(
      () => answerProblem({ problemId: 77, problemType: 4 }, ['x']),
      error => {
        assert.match(String(error?.message || ''), expected);
        assert.equal(error?.code, code);
        return true;
      },
    );
  });
}
