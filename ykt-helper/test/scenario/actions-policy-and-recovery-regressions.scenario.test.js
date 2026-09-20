import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/42',
  storage: { Authorization: 'token' },
});

const { storage } = await import('../../src/core/storage.js');
const { createProblemRecoveryStore } = await import('../../src/state/auto-answer-recovery.js');
const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { actions } = await import('../../src/state/actions.js');

ui.updateActiveProblems = () => {};
ui.updateProblemList = () => {};
ui.notifyClassroomEvent = () => true;
ui.notifyPublish = () => true;
ui.toast = () => {};

function resetRuntime(lessonId = '42') {
  repo.presentations.clear();
  repo.slides.clear();
  repo.problems.clear();
  repo.problemStatus.clear();
  repo.encounteredProblems.length = 0;
  repo.autoJoinedLessons.clear();
  repo.forceAutoAnswerLessons.clear();
  repo.currentLessonId = String(lessonId);

  Object.assign(ui.config, {
    autoAnswer: false,
    autoAnswerOnAutoJoin: true,
    autoAnswerDelay: 60_000,
    autoAnswerRandomDelay: 0,
    autoForceRetry: false,
    notifyProblems: false,
    notifyPopup: false,
    notifyNative: false,
    notifySound: false,
  });
}

function addQuestion({ lessonId, problemId, slideId, result = null }) {
  const problem = {
    problemId,
    problemType: 1,
    body: 'policy/recovery regression',
    options: [{ key: 'A', value: 'A' }],
    result,
    slideId,
    presentationId: 'p-regression',
    lessonId: String(lessonId),
  };
  repo.upsertProblem(problem);
  repo.upsertSlide({ id: slideId, cover: 'https://img.example/test.jpg', problem });
  return problem;
}

test.after(() => uninstallBrowserGlobals());

test('actions scheduler honors legacy numeric autoJoined lesson ids through the shared policy', () => {
  resetRuntime('42');
  addQuestion({ lessonId: '42', problemId: 'policy-q', slideId: 'policy-s' });

  // Simulate runtime state persisted/constructed by an older build.
  repo.autoJoinedLessons.add(42);

  actions.onUnlockProblem({
    prob: 'policy-q',
    sid: 'policy-s',
    pres: 'p-regression',
    dt: Date.now(),
    limit: 60,
  }, {
    source: 'live',
    lessonId: '42',
  });

  const status = repo.problemStatus.get('policy-q');
  assert.ok(status);
  assert.equal(status.autoAnswerQueued, true);
  assert.ok(status.autoAnswerTime !== null, 'legacy numeric membership must still schedule auto-answer');
});

for (const emptyResult of [[], {}]) {
  test(`empty result ${JSON.stringify(emptyResult)} remains recoverable instead of deleting persistence`, () => {
    const lessonId = `empty-${Array.isArray(emptyResult) ? 'array' : 'object'}`;
    resetRuntime(lessonId);
    ui.config.autoAnswer = true;
    addQuestion({ lessonId, problemId: 'empty-q', slideId: 'empty-s', result: emptyResult });

    actions.onUnlockProblem({
      prob: 'empty-q',
      sid: 'empty-s',
      pres: 'p-regression',
      dt: Date.now(),
      limit: 60,
    }, {
      source: 'live',
      lessonId,
    });

    const persisted = createProblemRecoveryStore({ storage, lessonId }).get('empty-q');
    assert.ok(persisted, 'empty result must keep the pending recovery record');
    assert.equal(persisted.done, false);
    assert.equal(persisted.autoAnswerQueued, true);
  });
}
