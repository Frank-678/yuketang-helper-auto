import assert from 'node:assert/strict';
import test from 'node:test';
import { installBrowserGlobals, uninstallBrowserGlobals } from '../support/browser-harness.js';

installBrowserGlobals({ href: 'https://www.yuketang.cn/v2/web/index' });
const { repo } = await import('../../src/state/repo.js');

test.after(() => uninstallBrowserGlobals());

function resetLessonState() {
  repo.listeningLessons.clear();
  repo.lessonTokens.clear();
  repo.lessonSockets.clear();
  repo.activeLessons.clear();
  repo.autoJoinedLessons.clear();
  repo.forceAutoAnswerLessons.clear();
}

test('a stale socket close cannot disconnect a newer owner of the same lesson', () => {
  resetLessonState();
  const oldSocket = { id: 'managed-old' };
  const newSocket = { id: 'native-new' };

  repo.markLessonConnected('lesson-1', oldSocket, 'old-token');
  repo.markLessonAutoJoined('lesson-1', true);
  repo.markLessonConnected('lesson-1', newSocket, 'new-token');

  const result = repo.markLessonDisconnected('lesson-1', 'old-close', oldSocket);

  assert.equal(result?.disconnected, false);
  assert.equal(result?.reason, 'stale-owner');
  assert.equal(repo.lessonSockets.get('lesson-1'), newSocket);
  assert.equal(repo.lessonTokens.get('lesson-1'), 'new-token');
  assert.equal(repo.listeningLessons.has('lesson-1'), true);
});

test('the current socket owner can still disconnect and clear lesson-scoped policy state', () => {
  resetLessonState();
  const socket = { id: 'current' };

  repo.markLessonConnected('lesson-2', socket, 'token');
  repo.markLessonAutoJoined('lesson-2', true);
  repo.forceAutoAnswerLessons.add('lesson-2');

  const result = repo.markLessonDisconnected('lesson-2', 'closed', socket);

  assert.equal(result?.disconnected, true);
  assert.equal(repo.lessonSockets.has('lesson-2'), false);
  assert.equal(repo.lessonTokens.has('lesson-2'), false);
  assert.equal(repo.listeningLessons.has('lesson-2'), false);
  assert.equal(repo.autoJoinedLessons.has('lesson-2'), false);
  assert.equal(repo.forceAutoAnswerLessons.has('lesson-2'), false);
});
