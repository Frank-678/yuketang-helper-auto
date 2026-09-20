import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createXMLHttpRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/42',
  storage: { Authorization: 'auth-token' },
});
const recorder = createXMLHttpRequestRecorder();
globalThis.XMLHttpRequest = recorder.FakeXMLHttpRequest;

const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { submitAnswer } = await import('../../src/tsm/answer.js');

test.after(() => uninstallBrowserGlobals());

function reset() {
  repo.autoJoinedLessons.clear();
  repo.forceAutoAnswerLessons.clear();
  repo.currentLessonId = null;
  Object.assign(ui.config, {
    autoAnswer: false,
    autoAnswerOnAutoJoin: false,
    autoAnswerDelay: 9999,
    autoAnswerRandomDelay: 0,
  });
}

async function captureConfiguredWait(run) {
  const realSetTimeout = globalThis.setTimeout;
  const waits = [];
  globalThis.setTimeout = (fn, ms) => {
    waits.push(ms);
    fn();
    return 1;
  };
  try {
    await run();
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  return waits;
}

test('auto-joined string id applies auto gate to numeric submit lesson id', async () => {
  reset();
  ui.config.autoAnswerOnAutoJoin = true;
  repo.autoJoinedLessons.add('42');
  recorder.respond({ code: 0, data: {} });

  const waits = await captureConfiguredWait(() => submitAnswer(
    { problemId: 1, problemType: 1 },
    ['A'],
    { lessonId: 42, autoGate: true, waitMs: 321 },
  ));

  assert.deepEqual(waits, [321]);
  assert.equal(recorder.calls.at(-1).url, '/api/v3/lesson/problem/answer');
});

test('legacy numeric force-set id applies policy to string submit lesson id', async () => {
  reset();
  repo.forceAutoAnswerLessons.add(42);
  recorder.respond({ code: 0, data: {} });

  const waits = await captureConfiguredWait(() => submitAnswer(
    { problemId: 2, problemType: 1 },
    ['B'],
    { lessonId: '42', autoGate: true, waitMs: 123 },
  ));

  assert.deepEqual(waits, [123]);
});

test('unrelated lesson skips the auto gate entirely', async () => {
  reset();
  ui.config.autoAnswerOnAutoJoin = true;
  repo.autoJoinedLessons.add('42');
  recorder.respond({ code: 0, data: {} });

  const waits = await captureConfiguredWait(() => submitAnswer(
    { problemId: 3, problemType: 1 },
    ['C'],
    { lessonId: 43, autoGate: true, waitMs: 777 },
  ));

  assert.deepEqual(waits, []);
});
