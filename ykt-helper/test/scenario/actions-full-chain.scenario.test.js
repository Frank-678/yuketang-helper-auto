import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGmRequestRecorder,
  createXMLHttpRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const gmRecorder = createGmRequestRecorder();
const xhrRecorder = createXMLHttpRequestRecorder();
const browser = installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/lesson-1',
  storage: { Authorization: 'token' },
  gmRequest: gmRecorder.fn,
});
globalThis.XMLHttpRequest = xhrRecorder.FakeXMLHttpRequest;

const originalCreateElement = browser.document.createElement;
browser.document.createElement = tagName => {
  if (String(tagName).toLowerCase() === 'canvas') {
    return {
      width: 0,
      height: 0,
      getContext() { return { drawImage() {} }; },
      toDataURL() { return 'data:image/jpeg;base64,QUJD'; },
    };
  }
  return originalCreateElement(tagName);
};

globalThis.Image = class FakeImage {
  constructor() { this.width = 16; this.height = 9; this.crossOrigin = ''; this.onload = null; this.onerror = null; }
  set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
  get src() { return this._src; }
};

const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { actions } = await import('../../src/state/actions.js');

const notifications = [];
const toasts = [];
ui.updateActiveProblems = () => {};
ui.updateProblemList = () => {};
ui.updatePresentationList = () => {};
ui.updateSlideView = () => {};
ui.notifyClassroomEvent = event => { notifications.push(event); return true; };
ui.notifyPublish = event => { notifications.push(event); return true; };
ui.toast = message => { toasts.push(String(message)); };

function resetRepo() {
  repo.presentations.clear();
  repo.slides.clear();
  repo.problems.clear();
  repo.problemStatus.clear();
  repo.encounteredProblems.length = 0;
  repo.listeningLessons.clear();
  repo.lessonTokens.clear();
  repo.lessonSockets.clear();
  repo.activeLessons.clear();
  repo.autoJoinedLessons.clear();
  repo.forceAutoAnswerLessons.clear();
  repo.currentPresentationId = null;
  repo.currentSlideId = null;
  repo.currentLessonId = 'lesson-1';
  notifications.length = 0;
  toasts.length = 0;

  Object.assign(ui.config, {
    autoAnswer: true,
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
      id: 'integration-ai',
      name: 'Integration AI',
      baseUrl: 'https://ai.example/v1/chat/completions',
      apiKey: 'secret',
      model: 'same-model',
      visionModel: 'same-model',
      temperature: '',
    }],
    activeProfileId: 'integration-ai',
  };
}

function addQuestion({ id = 'q1', slideId = 's1', result = null } = {}) {
  const problem = {
    problemId: id,
    problemType: 1,
    body: '2 + 2 = ?',
    options: [
      { key: 'A', value: '4' },
      { key: 'B', value: '5' },
    ],
    result,
    slideId,
    presentationId: 'p1',
    lessonId: 'lesson-1',
  };
  const slide = {
    id: slideId,
    cover: `https://img.example/${slideId}.jpg`,
    problem,
  };
  repo.upsertProblem(problem);
  repo.upsertSlide(slide);
  return { problem, slide };
}

async function waitFor(predicate, timeoutMs = 250) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  return false;
}

test.after(() => {
  delete globalThis.Image;
  uninstallBrowserGlobals();
});

test('L4 live unlock -> schedule -> actual AI request -> parse -> /answer -> done', async () => {
  resetRepo();
  const { problem } = addQuestion();
  gmRecorder.respond({ choices: [{ message: { content: '答案: A\n解释: 2+2=4' } }] }, 200);
  xhrRecorder.respond({ code: 0, data: {} }, 200);

  actions.onUnlockProblem({ prob: 'q1', sid: 's1', pres: 'p1', dt: Date.now(), limit: 60 }, {
    source: 'live',
    lessonId: 'lesson-1',
  });

  const queued = repo.problemStatus.get('q1');
  assert.ok(queued, 'live unlock should create status');
  assert.equal(queued.autoAnswerQueued, true);
  assert.equal(queued.phase, 'queued');
  assert.ok(queued.autoAnswerTime !== null);

  actions.tickAutoAnswer();
  assert.equal(await waitFor(() => repo.problemStatus.get('q1')?.done === true), true, 'auto answer should finish');

  assert.equal(gmRecorder.calls.at(-1).url, 'https://ai.example/v1/chat/completions');
  const aiPayload = JSON.parse(gmRecorder.calls.at(-1).data);
  assert.equal(aiPayload.model, 'same-model');
  assert.ok(aiPayload.messages[1].content.some(block => block.type === 'image_url'));

  const answerRequest = xhrRecorder.calls.at(-1);
  assert.equal(answerRequest.url, '/api/v3/lesson/problem/answer');
  assert.deepEqual(JSON.parse(answerRequest.body).result, ['A']);
  assert.deepEqual(problem.result, ['A']);
  assert.equal(repo.problemStatus.get('q1').phase, 'done');
  assert.ok(notifications.some(event => event.kind === 'auto-answer-started'));
  assert.ok(notifications.some(event => event.kind === 'auto-answer-succeeded'));
});

test('historical timeline source hydrates state but never queues AI or emits network traffic', async () => {
  resetRepo();
  addQuestion({ id: 'q-history', slideId: 's-history' });
  const gmBefore = gmRecorder.calls.length;
  const xhrBefore = xhrRecorder.calls.length;

  actions.onUnlockProblem({ prob: 'q-history', sid: 's-history', pres: 'p-history', dt: Date.now(), limit: 60 }, {
    source: 'timeline',
    lessonId: 'lesson-1',
  });

  const s = repo.problemStatus.get('q-history');
  assert.ok(s);
  assert.equal(s.autoAnswerQueued, false);
  assert.equal(s.autoAnswerTime, null);
  actions.tickAutoAnswer();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(gmRecorder.calls.length, gmBefore);
  assert.equal(xhrRecorder.calls.length, xhrBefore);
});

test('manual AI force re-answers an already completed problem and submits exactly once', async () => {
  resetRepo();
  const { problem } = addQuestion({ id: 'q-force', slideId: 's-force', result: ['B'] });
  gmRecorder.respond({ choices: [{ message: { content: '答案: A' } }] }, 200);
  xhrRecorder.respond({ code: 0, data: {} }, 200);
  const xhrBefore = xhrRecorder.calls.length;

  const result = await actions.forceAIAnswer('q-force', { lessonId: 'lesson-1' });
  assert.equal(result.ok, true);
  assert.equal(xhrRecorder.calls.length - xhrBefore, 1);
  assert.deepEqual(problem.result, ['A']);
  assert.ok(notifications.some(event => event.kind === 'auto-answer-started'));
  assert.ok(notifications.some(event => event.kind === 'auto-answer-succeeded'));
  assert.ok(toasts.some(message => message.includes('手动 AI 作答开始')));
});

test('manual parsed submit sends immediately once even when automatic delay is very large', async () => {
  resetRepo();
  const { problem } = addQuestion({ id: 'q-manual', slideId: 's-manual' });
  ui.config.autoAnswerDelay = 60_000;
  ui.config.autoAnswerRandomDelay = 60_000;
  xhrRecorder.respond({ code: 0, data: {} }, 200);
  const before = xhrRecorder.calls.length;
  const started = Date.now();

  const result = await actions.submitParsedAnswer(problem, ['B'], { forceRetry: false });
  const elapsed = Date.now() - started;
  assert.equal(result.ok, true);
  assert.equal(xhrRecorder.calls.length - before, 1);
  assert.ok(elapsed < 500, `manual submit unexpectedly waited ${elapsed} ms`);
  const req = xhrRecorder.calls.at(-1);
  assert.equal(req.url, '/api/v3/lesson/problem/answer');
  assert.deepEqual(JSON.parse(req.body).result, ['B']);
});

test('manual force retry uses /retry immediately and only once', async () => {
  resetRepo();
  const { problem } = addQuestion({ id: 'q-retry', slideId: 's-retry' });
  repo.problemStatus.set('q-retry', {
    lessonId: 'lesson-1', presentationId: 'p1', slideId: 's-retry', startTime: 1000, endTime: 2000,
    done: false, autoAnswerTime: null, answering: false, phase: 'queued', autoAnswerQueued: false, attempts: 0, lastError: '',
  });
  xhrRecorder.respond({ code: 0, data: { success: ['q-retry'] } }, 200);
  const before = xhrRecorder.calls.length;

  const result = await actions.submitParsedAnswer(problem, ['A'], { forceRetry: true });
  assert.equal(result.ok, true);
  assert.equal(result.route, 'retry');
  assert.equal(xhrRecorder.calls.length - before, 1);
  assert.equal(xhrRecorder.calls.at(-1).url, '/api/v3/lesson/problem/retry');
  const body = JSON.parse(xhrRecorder.calls.at(-1).body);
  assert.equal(body.problems.length, 1);
  assert.equal(body.problems[0].problemId, 'q-retry');
});
