import assert from 'node:assert/strict';
import test from 'node:test';

// 这些消息格式取自雨课堂课堂页前端（lesson 3.3.236）的 processMessage 实现。
const loadPublishEvents = () => import('../src/core/publish-events.js');
const loadRealtimeDispatch = () => import('../src/core/realtime-dispatch.js');

test('routes a teacher ending a problem early to onProblemFinished', async () => {
  const { dispatchRealtimeMessage } = await loadRealtimeDispatch();
  const calls = [];
  const result = dispatchRealtimeMessage({ op: 'problemfinished', lessonid: 'L1', prob: 'P9', dt: 1 }, {
    handlers: { onProblemFinished: (problemId) => calls.push(problemId) },
  });
  assert.equal(result.handled, true);
  assert.deepEqual(calls, ['P9']);
});

test('routes a time extension with its problem payload to onExtendTime', async () => {
  const { dispatchRealtimeMessage } = await loadRealtimeDispatch();
  const calls = [];
  dispatchRealtimeMessage({ op: 'extendtime', problem: { prob: 'P9', extend: -1, limit: -1 } }, {
    handlers: { onExtendTime: (problem) => calls.push(problem) },
  });
  assert.deepEqual(calls, [{ prob: 'P9', extend: -1, limit: -1 }]);
});

test('does not treat the page\'s own probleminfo timer reply as a teacher publication', async () => {
  const { getRealtimeEvent } = await loadPublishEvents();
  assert.equal(getRealtimeEvent({ op: 'probleminfo', problemid: 'P9', dt: 1, limit: 60, now: 2 }), null);
});

test('reminds about quizzes and exams pushed as newquiz / newpaper', async () => {
  const { getRealtimeEvent } = await loadPublishEvents();
  for (const op of ['newquiz', 'newpaper']) {
    const event = getRealtimeEvent({ op, quiz: { quiz: 'Q1', title: '随堂测验', total: 5 } });
    assert.equal(event?.kind, 'publish', op);
    assert.equal(event.event.category, 'assessment', op);
  }
});

test('keeps slide navigation and presentation refreshes out of publish reminders', async () => {
  const { getRealtimeEvent } = await loadPublishEvents();
  for (const op of ['slidenav', 'showpresentation', 'presentationupdated', 'presentationcreated']) {
    assert.equal(getRealtimeEvent({ op, presentation: 'X1', slide: { sid: 's1' } }), null, op);
  }
});
