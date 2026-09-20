import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFakeElement,
  createXMLHttpRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const { document } = installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/button-lesson',
  storage: { Authorization: 'auth-token' },
});

// The production panel template is tiny. Teach the fake DOM only how to mount its
// shell; all rows/buttons below are still created by the real problem-list module.
const baseCreateElement = document.createElement;
document.createElement = tagName => {
  const element = baseCreateElement(tagName);
  const descriptor = Object.getOwnPropertyDescriptor(element, 'innerHTML');
  Object.defineProperty(element, 'innerHTML', {
    get: descriptor.get,
    set(value) {
      descriptor.set.call(element, value);
      if (!String(value).includes('ykt-problem-list-panel')) return;
      const panel = createFakeElement('div');
      panel.id = 'ykt-problem-list-panel';
      panel.className = 'ykt-panel';
      const close = createFakeElement('span');
      close.id = 'ykt-problem-list-close';
      const list = createFakeElement('div');
      list.id = 'ykt-problem-list';
      list.className = 'problem-list';
      panel.appendChild(close);
      panel.appendChild(list);
      element.appendChild(panel);
    },
    configurable: true,
    enumerable: true,
  });
  return element;
};

const recorder = createXMLHttpRequestRecorder();
globalThis.XMLHttpRequest = recorder.FakeXMLHttpRequest;

const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { actions } = await import('../../src/state/actions.js');
const { updateProblemList } = await import('../../src/ui/panels/problem-list.js');

const toasts = [];
ui.toast = message => toasts.push(String(message));
ui.confirm = async () => true;
ui.updateActiveProblems = () => {};
ui.updateProblemList = () => {};
ui.notifyClassroomEvent = () => true;

function resetProblem(problemId = `button-q-${Math.random()}`) {
  repo.presentations.clear();
  repo.slides.clear();
  repo.problems.clear();
  repo.problemStatus.clear();
  repo.encounteredProblems.length = 0;
  repo.currentLessonId = 'button-lesson';
  toasts.length = 0;

  const problem = {
    problemId,
    problemType: 1,
    body: 'button integration question',
    options: [{ key: 'A', value: 'x' }],
    result: null,
    status: {},
  };
  repo.problems.set(problemId, problem);
  repo.encounteredProblems.push({
    problemId,
    problemType: 1,
    body: problem.body,
  });

  updateProblemList();
  const row = document.querySelector('.problem-row');
  assert.ok(row, 'real problem-list module should render a row');
  const textarea = row.querySelector('textarea');
  assert.ok(textarea);
  textarea.value = '["A"]';
  const buttons = row.querySelectorAll('button');
  const byText = text => {
    const button = buttons.find(candidate => candidate.textContent === text);
    assert.ok(button, `missing button ${text}`);
    return button;
  };
  return {
    problemId,
    row,
    submit: byText('提交'),
    forceRetry: byText('强制补交'),
    forceAI: byText('AI强制作答'),
  };
}

function callsSince(index) {
  return recorder.calls.slice(index);
}

test.after(() => uninstallBrowserGlobals());

test('synthetic Submit and Force AI clicks cannot cause network or answer side effects', async () => {
  const controls = resetProblem('synthetic-actions');
  const before = recorder.calls.length;
  const originalForceAIAnswer = actions.forceAIAnswer;
  let forceAICalls = 0;
  actions.forceAIAnswer = async () => { forceAICalls += 1; return { ok: true }; };

  const synthetic = target => ({
    type: 'click',
    isTrusted: false,
    target,
    currentTarget: target,
    preventDefault() {},
    stopPropagation() {},
  });

  try {
    await controls.submit.onclick?.(synthetic(controls.submit));
    await controls.forceRetry.onclick?.(synthetic(controls.forceRetry));
    await controls.forceAI.onclick?.(synthetic(controls.forceAI));
  } finally {
    actions.forceAIAnswer = originalForceAIAnswer;
  }

  assert.equal(recorder.calls.length, before);
  assert.equal(forceAICalls, 0);
});


test('double clicking Submit produces exactly one /answer mutation', async () => {
  const controls = resetProblem('double-submit');
  recorder.respond({ code: 0, data: {} });
  const before = recorder.calls.length;

  const first = controls.submit.click();
  const second = controls.submit.click();
  await Promise.all([first, second]);

  const calls = callsSince(before);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/v3/lesson/problem/answer');
});

test('an in-flight Submit blocks Force Retry and Force AI for the same problem', async () => {
  const controls = resetProblem('cross-action-lock');
  recorder.respond({ code: 0, data: {} });
  const before = recorder.calls.length;
  const originalForceAIAnswer = actions.forceAIAnswer;
  let forceAICalls = 0;
  actions.forceAIAnswer = async () => { forceAICalls += 1; return { ok: true }; };

  try {
    const submitPromise = controls.submit.click();
    const retryPromise = controls.forceRetry.click();
    const aiPromise = controls.forceAI.click();
    await Promise.all([submitPromise, retryPromise, aiPromise]);
  } finally {
    actions.forceAIAnswer = originalForceAIAnswer;
  }

  const calls = callsSince(before);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/v3/lesson/problem/answer');
  assert.equal(forceAICalls, 0);
  assert.ok(toasts.some(message => message.includes('已有操作正在进行')));
});

test('lock releases after success so Force Retry can run exactly once afterwards', async () => {
  const controls = resetProblem('lock-release-success');
  recorder.respond({ code: 0, data: {} });
  const before = recorder.calls.length;
  await controls.submit.click();

  recorder.respond({ code: 0, data: { success: ['lock-release-success'] } });
  await controls.forceRetry.click();

  const calls = callsSince(before);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/v3/lesson/problem/answer');
  assert.equal(calls[1].url, '/api/v3/lesson/problem/retry');
});

test('XHR timeout releases the UI lock so a later Submit can succeed', async () => {
  const controls = resetProblem('lock-release-timeout');
  const before = recorder.calls.length;

  recorder.timeout();
  await controls.submit.click();
  assert.ok(toasts.some(message => message.includes('超时')));

  // updateRow rebuilds editor controls only on success, so the original button is
  // still the active handler after the timeout failure.
  recorder.respond({ code: 0, data: {} });
  await controls.submit.click();

  const calls = callsSince(before);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/v3/lesson/problem/answer');
  assert.equal(calls[1].url, '/api/v3/lesson/problem/answer');
});
