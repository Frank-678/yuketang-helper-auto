import assert from 'node:assert/strict';
import test from 'node:test';

const loadRunner = () => import('../src/state/auto-answer-runner.js');

function createRunnerHarness(overrides = {}) {
  const calls = { capture: [], query: [], submit: [], status: [] };
  const dependencies = {
    typeMap: { 1: '单选题' },
    hasActiveProfile: () => true,
    makeDefaultAnswer: () => ['A'],
    captureSlideImage: async slideId => {
      calls.capture.push(slideId);
      return 'base64-image';
    },
    captureProblemForVision: async () => 'fallback-image',
    formatProblemForVision: () => 'prompt',
    queryAIVision: async image => {
      calls.query.push(image);
      return '答案: A';
    },
    parseAIAnswer: () => ['A'],
    submitAnswer: async (problem, result, options) => {
      calls.submit.push({ problem, result, options });
      return { route: options.forceRetry ? 'retry' : 'answer' };
    },
    onStatusChange: status => calls.status.push({ ...status }),
    notify: () => {},
    toast: () => {},
    showPopup: () => {},
    now: () => 2_000,
    ...overrides,
  };
  return { calls, dependencies };
}

test('manual force runs AI and submits without the automatic wait gate', async () => {
  const { createAutoAnswerRunner } = await loadRunner();
  const { calls, dependencies } = createRunnerHarness();
  const runner = createAutoAnswerRunner(dependencies);
  const problem = { problemId: 'problem-7', problemType: 1, body: '1+1=?' };
  const status = {
    presentationId: 'pres-1',
    slideId: 'slide-1',
    startTime: 1_000,
    endTime: 5_000,
    phase: 'queued',
    answering: false,
    done: false,
  };

  const result = await runner.run(problem, status, {
    force: true,
    lessonId: 'lesson-1',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls.submit[0].options, {
    startTime: 1_000,
    endTime: 5_000,
    forceRetry: false,
    lessonId: 'lesson-1',
    autoGate: false,
    waitMs: 0,
  });
  assert.equal(status.done, true);
  assert.equal(status.answering, false);
  assert.equal(status.phase, 'done');
});

test('manual force uses the retry route when the deadline has passed', async () => {
  const { createAutoAnswerRunner } = await loadRunner();
  const { calls, dependencies } = createRunnerHarness({ now: () => 6_000 });
  const runner = createAutoAnswerRunner(dependencies);
  const problem = { problemId: 'problem-7', problemType: 1, body: '1+1=?' };
  const status = {
    slideId: 'slide-1',
    startTime: 1_000,
    endTime: 5_000,
    phase: 'queued',
    answering: false,
    done: false,
  };

  const result = await runner.run(problem, status, { force: true, lessonId: 'lesson-1' });

  assert.equal(result.ok, true);
  assert.equal(calls.submit[0].options.forceRetry, true);
  assert.equal(result.route, 'retry');
});

test('does not start a second AI request while the same problem is answering', async () => {
  const { createAutoAnswerRunner } = await loadRunner();
  const { calls, dependencies } = createRunnerHarness();
  const runner = createAutoAnswerRunner(dependencies);
  const problem = { problemId: 'problem-7', problemType: 1, body: '1+1=?' };
  const status = { slideId: 'slide-1', phase: 'answering', answering: true, done: false };

  const result = await runner.run(problem, status, { force: true, lessonId: 'lesson-1' });

  assert.deepEqual(result, { ok: false, reason: 'answering' });
  assert.deepEqual(calls.capture, []);
  assert.deepEqual(calls.submit, []);
});

test('keeps a failed request retryable and records the error', async () => {
  const { createAutoAnswerRunner } = await loadRunner();
  const { calls, dependencies } = createRunnerHarness({
    queryAIVision: async () => { throw new Error('network down'); },
  });
  const runner = createAutoAnswerRunner(dependencies);
  const problem = { problemId: 'problem-7', problemType: 1, body: '1+1=?' };
  const status = { slideId: 'slide-1', phase: 'queued', answering: false, attempts: 0, done: false };

  const result = await runner.run(problem, status, { force: true, lessonId: 'lesson-1' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'error');
  assert.equal(status.phase, 'failed');
  assert.equal(status.answering, false);
  assert.equal(status.attempts, 1);
  assert.match(status.lastError, /network down/);
  assert.equal(calls.status.at(-1).phase, 'failed');
});
