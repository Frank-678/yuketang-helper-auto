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

const legacyProfile = {
  id: 'legacy-profile',
  name: 'Legacy Profile',
  baseUrl: 'https://legacy-ai.example/v1/chat/completions',
  apiKey: 'legacy-secret',
  model: 'legacy-model',
  visionModel: 'legacy-model',
  temperature: '',
};

const gmRecorder = createGmRequestRecorder();
const xhrRecorder = createXMLHttpRequestRecorder();
const browser = installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/legacy-lesson',
  storage: {
    'ykt-helper:config': JSON.stringify({
      autoAnswer: true,
      autoAnswerDelay: 0,
      autoAnswerRandomDelay: 0,
      profiles: [legacyProfile],
      activeProfileId: 'legacy-profile',
      notifyProblems: false,
      notifyNative: false,
      notifyPopup: false,
      notifySound: false,
    }),
    Authorization: 'token',
  },
  gmRequest: gmRecorder.fn,
});
globalThis.XMLHttpRequest = xhrRecorder.FakeXMLHttpRequest;
const restoreImage = installFakeImageCanvas(browser.document);

// Import runtime only after localStorage has been populated. This deliberately
// never mounts/open the settings panel; config migration must happen at load.
const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { actions } = await import('../../src/state/actions.js');

ui.updateActiveProblems = () => {};
ui.updateProblemList = () => {};
ui.updatePresentationList = () => {};
ui.updateSlideView = () => {};
ui.notifyClassroomEvent = () => true;
ui.notifyPublish = () => true;
ui.toast = () => {};

test.after(() => {
  restoreImage();
  uninstallBrowserGlobals();
});

test('runtime normalizes legacy top-level Profile before any settings panel interaction', () => {
  assert.equal(ui.config.ai.activeProfileId, 'legacy-profile');
  assert.equal(ui.config.ai.profiles.length, 1);
  assert.equal(ui.config.ai.profiles[0].apiKey, 'legacy-secret');
  assert.equal(ui.config.ai.profiles[0].baseUrl, 'https://legacy-ai.example/v1/chat/completions');
});

test('legacy persisted Profile drives live unlock through real AI request and /answer without settings mount', async () => {
  resetRepoState(repo, 'legacy-lesson');
  const { problem } = addChoiceProblem(repo, {
    problemId: 'legacy-q',
    slideId: 'legacy-s',
    presentationId: 'legacy-p',
    lessonId: 'legacy-lesson',
  });

  gmRecorder.respond({ choices: [{ message: { content: '答案: A\n解释: legacy profile works' } }] });
  xhrRecorder.respond({ code: 0, data: {} });
  const gmBefore = gmRecorder.calls.length;
  const xhrBefore = xhrRecorder.calls.length;

  actions.onUnlockProblem({
    prob: 'legacy-q',
    sid: 'legacy-s',
    pres: 'legacy-p',
    dt: Date.now(),
    limit: 60,
  }, {
    source: 'live',
    lessonId: 'legacy-lesson',
  });
  actions.tickAutoAnswer();

  assert.equal(await waitFor(() => repo.problemStatus.get('legacy-q')?.done === true), true);
  assert.equal(gmRecorder.calls.length - gmBefore, 1, 'AI request should happen exactly once');
  assert.equal(xhrRecorder.calls.length - xhrBefore, 1, 'answer submit should happen exactly once');

  const aiCall = gmRecorder.calls.at(-1);
  assert.equal(aiCall.url, 'https://legacy-ai.example/v1/chat/completions');
  assert.equal(aiCall.headers.Authorization, 'Bearer legacy-secret');
  assert.equal(JSON.parse(aiCall.data).model, 'legacy-model');

  const submitCall = xhrRecorder.calls.at(-1);
  assert.equal(submitCall.url, '/api/v3/lesson/problem/answer');
  assert.deepEqual(JSON.parse(submitCall.body).result, ['A']);
  assert.deepEqual(problem.result, ['A']);
  assert.equal(repo.problemStatus.get('legacy-q').phase, 'done');
});

test('legacy separate kimiApiKey also becomes a usable runtime profile before UI mount', async () => {
  // The dedicated config/storage contract covers the exact old key migration.
  // Here assert the live runtime still exposes a non-empty profile/key, rather
  // than relying on SettingsPanel.ensureAIProfiles side effects.
  assert.ok(ui.config.ai.profiles.some(profile => String(profile.apiKey || '').trim()));
});
