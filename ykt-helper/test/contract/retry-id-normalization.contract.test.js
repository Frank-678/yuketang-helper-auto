import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createXMLHttpRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const recorder = createXMLHttpRequestRecorder();
installBrowserGlobals({ href: 'https://www.yuketang.cn/lesson/fullscreen/v3/retry-id' });
globalThis.XMLHttpRequest = recorder.FakeXMLHttpRequest;
const { retryAnswer } = await import('../../src/tsm/answer.js');

test.after(() => uninstallBrowserGlobals());

const equivalentIdCases = [
  [88, ['88']],
  ['88', [88]],
  [88, ['0088', '88']],
];
for (const [problemId, success] of equivalentIdCases) {
  test(`retry accepts equivalent server success id for local ${JSON.stringify(problemId)} vs ${JSON.stringify(success)}`, async () => {
    recorder.respond({ code: 0, data: { success } });
    const response = await retryAnswer({ problemId, problemType: 1 }, ['A'], 1000);
    assert.equal(response.code, 0);
  });
}

test('retry still rejects a genuinely different success id', async () => {
  recorder.respond({ code: 0, data: { success: ['89'] } });
  await assert.rejects(
    () => retryAnswer({ problemId: 88, problemType: 1 }, ['A'], 1000),
    /服务器未返回成功信息/,
  );
});
