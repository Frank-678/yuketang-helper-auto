import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createXMLHttpRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const xhrRecorder = createXMLHttpRequestRecorder();
installBrowserGlobals({ href: 'https://www.yuketang.cn/lesson/fullscreen/v3/lesson-timeline' });
globalThis.XMLHttpRequest = xhrRecorder.FakeXMLHttpRequest;

const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { actions } = await import('../../src/state/actions.js');

ui.updateActiveProblems = () => {};
ui.updateProblemList = () => {};
ui.updatePresentationList = () => {};
ui.toast = () => {};
ui.notifyClassroomEvent = () => true;

let lessonSeq = 0;
function reset() {
  repo.presentations.clear();
  repo.slides.clear();
  repo.problems.clear();
  repo.problemStatus.clear();
  repo.encounteredProblems.length = 0;
  const lessonId = `lesson-timeline-${++lessonSeq}`;
  repo.currentLessonId = lessonId;
  Object.assign(ui.config, {
    autoAnswer: true,
    autoAnswerDelay: 0,
    autoAnswerRandomDelay: 0,
    autoForceRetry: false,
    notifyProblems: false,
  });
  ui.config.ai = {
    ...ui.config.ai,
    profiles: [{ id: 'none', apiKey: '' }],
    activeProfileId: 'none',
  };
  return lessonId;
}

function addProblem(id, slideId) {
  const problem = {
    problemId: id,
    problemType: 1,
    body: `${id}?`,
    options: [{ key: 'A', value: 'yes' }, { key: 'B', value: 'no' }],
    result: null,
  };
  repo.upsertProblem(problem);
  repo.upsertSlide({ id: slideId, problem });
  return problem;
}

async function waitFor(predicate, timeoutMs = 200) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  return false;
}

test.after(() => uninstallBrowserGlobals());

test('first timeline snapshot is historical baseline and never queues submission', async () => {
  const lessonId = reset();
  addProblem('baseline-q', 'baseline-s');
  const before = xhrRecorder.calls.length;

  actions.onFetchTimeline([
    { type: 'problem', prob: 'baseline-q', sid: 'baseline-s', pres: 'p1', dt: Date.now(), limit: 60 },
  ], { lessonId });

  const status = repo.problemStatus.get('baseline-q');
  assert.ok(status);
  assert.equal(status.autoAnswerQueued, false);
  assert.equal(status.autoAnswerTime, null);
  actions.tickAutoAnswer();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(xhrRecorder.calls.length, before);
});

test('a later timeline problem becomes live, attempts once, and never fabricates a submit without AI', async () => {
  const lessonId = reset();
  addProblem('old-q', 'old-s');
  actions.onFetchTimeline([
    { type: 'problem', prob: 'old-q', sid: 'old-s', pres: 'p1', dt: Date.now(), limit: 60 },
  ], { lessonId });

  const newProblem = addProblem('new-q', 'new-s');
  const before = xhrRecorder.calls.length;
  actions.onFetchTimeline([
    { type: 'problem', prob: 'old-q', sid: 'old-s', pres: 'p1', dt: Date.now(), limit: 60 },
    { type: 'problem', prob: 'new-q', sid: 'new-s', pres: 'p1', dt: Date.now(), limit: 60 },
  ], { lessonId });

  const status = repo.problemStatus.get('new-q');
  assert.ok(status);
  assert.equal(status.autoAnswerQueued, true);
  assert.ok(status.autoAnswerTime !== null);
  actions.tickAutoAnswer();
  assert.equal(await waitFor(() => repo.problemStatus.get('new-q')?.phase === 'failed'), true);
  const finalStatus = repo.problemStatus.get('new-q');
  assert.equal(finalStatus.attempts, 1);
  assert.match(finalStatus.lastError, /AI Profile|API Key/);
  assert.equal(xhrRecorder.calls.length - before, 0);
  assert.equal(newProblem.result, null);
});

test('the same timeline problem is never promoted twice', async () => {
  const lessonId = reset();
  addProblem('same-q', 'same-s');
  actions.onFetchTimeline([], { lessonId });

  const entry = { type: 'problem', prob: 'same-q', sid: 'same-s', pres: 'p1', dt: Date.now(), limit: 60 };
  actions.onFetchTimeline([entry], { lessonId });
  actions.tickAutoAnswer();
  assert.equal(await waitFor(() => repo.problemStatus.get('same-q')?.phase === 'failed'), true);
  const firstAttempts = repo.problemStatus.get('same-q')?.attempts;
  const afterFirst = xhrRecorder.calls.length;

  actions.onFetchTimeline([entry], { lessonId });
  actions.tickAutoAnswer();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(repo.problemStatus.get('same-q')?.attempts, firstAttempts);
  assert.equal(xhrRecorder.calls.length, afterFirst);
});

test('timeline baseline state is isolated per lesson', () => {
  reset();
  addProblem('a1', 'sa1');
  addProblem('b1', 'sb1');
  addProblem('a2', 'sa2');
  const lessonA = `lesson-a-${++lessonSeq}`;
  const lessonB = `lesson-b-${++lessonSeq}`;
  actions.onFetchTimeline([{ type: 'problem', prob: 'a1', sid: 'sa1' }], { lessonId: lessonA });
  actions.onFetchTimeline([{ type: 'problem', prob: 'b1', sid: 'sb1' }], { lessonId: lessonB });
  actions.onFetchTimeline([
    { type: 'problem', prob: 'a1', sid: 'sa1' },
    { type: 'problem', prob: 'a2', sid: 'sa2' },
  ], { lessonId: lessonA });

  assert.equal(repo.problemStatus.get('a2')?.autoAnswerQueued, true);
  assert.equal(repo.problemStatus.get('b1')?.autoAnswerQueued, false);
});
