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
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/recover-live',
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
  constructor() {
    this.width = 16;
    this.height = 9;
    this.crossOrigin = '';
    this.onload = null;
    this.onerror = null;
  }
  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src() { return this._src; }
};

const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { actions } = await import('../../src/state/actions.js');

ui.updateActiveProblems = () => {};
ui.updateProblemList = () => {};
ui.notifyClassroomEvent = () => true;
ui.toast = () => {};

function recoveryStorageKey(lessonId) {
  return `ykt-helper:auto-answer-recovery:${lessonId}`;
}

function configureRuntime({ recoverExpired = false } = {}) {
  Object.assign(ui.config, {
    autoAnswer: true,
    autoAnswerDelay: 0,
    autoAnswerRandomDelay: 0,
    autoForceRetry: false,
    autoRecoverUnanswered: true,
    autoRecoverExpired: recoverExpired,
    autoScanUnanswered: false,
    notifyProblems: false,
    notifyPopup: false,
    notifyNative: false,
    notifySound: false,
  });
  ui.config.ai = {
    ...ui.config.ai,
    profiles: [{
      id: 'recovery-ai',
      name: 'Recovery AI',
      baseUrl: 'https://ai.example/v1/chat/completions',
      apiKey: 'secret',
      model: 'same-model',
      visionModel: 'same-model',
      temperature: '',
    }],
    activeProfileId: 'recovery-ai',
  };
}

function resetRepo(lessonId, { recoverExpired = false } = {}) {
  repo.presentations.clear();
  repo.slides.clear();
  repo.problems.clear();
  repo.problemStatus.clear();
  repo.encounteredProblems.length = 0;
  repo.currentPresentationId = null;
  repo.currentSlideId = null;
  repo.currentLessonId = lessonId;
  configureRuntime({ recoverExpired });
}

function addQuestion({ lessonId, problemId, slideId, result = null }) {
  const problem = {
    problemId,
    problemType: 1,
    body: '2 + 2 = ?',
    options: [
      { key: 'A', value: '4' },
      { key: 'B', value: '5' },
    ],
    result,
    slideId,
    presentationId: 'p-recovery',
    lessonId,
  };
  const slide = {
    id: slideId,
    cover: `https://img.example/${slideId}.jpg`,
    problem,
  };
  repo.upsertProblem(problem);
  repo.upsertSlide(slide);
  return problem;
}

function seedRecovery({
  lessonId,
  problemId,
  slideId,
  phase = 'answering',
  startTime = Date.now() - 5_000,
  endTime = Date.now() + 60_000,
  autoAnswerQueued = true,
}) {
  localStorage.setItem(recoveryStorageKey(lessonId), JSON.stringify([{
    lessonId,
    problemId,
    presentationId: 'p-recovery',
    slideId,
    startTime,
    endTime,
    phase,
    autoAnswerTime: null,
    autoAnswerQueued,
    attempts: 1,
    lastError: '',
    done: false,
    updatedAt: Date.now(),
  }]));
}

function readRecovery(lessonId) {
  return JSON.parse(localStorage.getItem(recoveryStorageKey(lessonId)) || '[]');
}

async function waitFor(predicate, timeoutMs = 300) {
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

test('interrupted answering record resumes after refresh, submits once, and is removed from recovery storage', async () => {
  const lessonId = 'recover-live';
  const problemId = 'recover-q1';
  const slideId = 'recover-s1';
  resetRepo(lessonId);
  const problem = addQuestion({ lessonId, problemId, slideId });
  seedRecovery({ lessonId, problemId, slideId, phase: 'answering' });

  const gmBefore = gmRecorder.calls.length;
  const xhrBefore = xhrRecorder.calls.length;
  gmRecorder.respond({ choices: [{ message: { content: '答案: A' } }] }, 200);
  xhrRecorder.respond({ code: 0, data: {} }, 200);

  const restored = actions.restorePendingProblemStatuses();
  assert.equal(restored, 1);
  const status = repo.problemStatus.get(problemId);
  assert.ok(status);
  assert.equal(status.recoveredFrom, 'answering');
  assert.equal(status.phase, 'queued');
  assert.equal(status.recoveryForceRetry, false);
  assert.ok(status.autoAnswerTime !== null);

  actions.tickAutoAnswer();
  assert.equal(await waitFor(() => repo.problemStatus.get(problemId)?.done === true), true);

  assert.equal(gmRecorder.calls.length - gmBefore, 1);
  assert.equal(xhrRecorder.calls.length - xhrBefore, 1);
  assert.equal(xhrRecorder.calls.at(-1).url, '/api/v3/lesson/problem/answer');
  assert.deepEqual(problem.result, ['A']);
  assert.deepEqual(readRecovery(lessonId), []);

  actions.tickAutoAnswer();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(gmRecorder.calls.length - gmBefore, 1, 'completed recovery must not ask AI twice');
  assert.equal(xhrRecorder.calls.length - xhrBefore, 1, 'completed recovery must not submit twice');
});

test('expired interrupted record stays inert when expired recovery is not explicitly enabled', async () => {
  const lessonId = 'recover-expired-off';
  const problemId = 'recover-q2';
  const slideId = 'recover-s2';
  resetRepo(lessonId, { recoverExpired: false });
  addQuestion({ lessonId, problemId, slideId });
  seedRecovery({
    lessonId,
    problemId,
    slideId,
    phase: 'answering',
    startTime: Date.now() - 120_000,
    endTime: Date.now() - 60_000,
  });

  const gmBefore = gmRecorder.calls.length;
  const xhrBefore = xhrRecorder.calls.length;
  const restored = actions.restorePendingProblemStatuses();
  assert.equal(restored, 1);

  const status = repo.problemStatus.get(problemId);
  assert.ok(status);
  assert.equal(status.autoAnswerTime, null);
  assert.equal(status.recoveryForceRetry, false);

  actions.tickAutoAnswer();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(gmRecorder.calls.length, gmBefore);
  assert.equal(xhrRecorder.calls.length, xhrBefore);
  assert.equal(readRecovery(lessonId).length, 1, 'stopped recovery stays available for explicit user action');
});

test('expired interrupted record uses /retry exactly once only when expired recovery is explicitly enabled', async () => {
  const lessonId = 'recover-expired-on';
  const problemId = 'recover-q3';
  const slideId = 'recover-s3';
  resetRepo(lessonId, { recoverExpired: true });
  const problem = addQuestion({ lessonId, problemId, slideId });
  seedRecovery({
    lessonId,
    problemId,
    slideId,
    phase: 'answering',
    startTime: Date.now() - 120_000,
    endTime: Date.now() - 60_000,
  });

  const gmBefore = gmRecorder.calls.length;
  const xhrBefore = xhrRecorder.calls.length;
  gmRecorder.respond({ choices: [{ message: { content: '答案: A' } }] }, 200);
  xhrRecorder.respond({ code: 0, data: { success: [problemId] } }, 200);

  actions.restorePendingProblemStatuses();
  const status = repo.problemStatus.get(problemId);
  assert.ok(status);
  assert.equal(status.recoveryForceRetry, true);
  assert.ok(status.autoAnswerTime !== null);

  actions.tickAutoAnswer();
  assert.equal(await waitFor(() => repo.problemStatus.get(problemId)?.done === true), true);

  assert.equal(gmRecorder.calls.length - gmBefore, 1);
  assert.equal(xhrRecorder.calls.length - xhrBefore, 1);
  const request = xhrRecorder.calls.at(-1);
  assert.equal(request.url, '/api/v3/lesson/problem/retry');
  assert.deepEqual(JSON.parse(request.body).problems[0].result, ['A']);
  assert.deepEqual(problem.result, ['A']);
  assert.deepEqual(readRecovery(lessonId), []);

  actions.tickAutoAnswer();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(xhrRecorder.calls.length - xhrBefore, 1);
});
