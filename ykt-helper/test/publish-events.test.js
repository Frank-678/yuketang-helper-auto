import assert from 'node:assert/strict';
import test from 'node:test';

const loadPublishEvents = () => import('../src/core/publish-events.js');

test('classifies an exam or test group publication as an assessment reminder', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const event = classifyPublishEvent({
    op: 'publishproblem',
    quiz: { id: 'quiz-7', title: '第三章测试' },
  });

  assert.deepEqual(event, {
    category: 'assessment',
    dedupeKey: 'assessment:quiz-7',
    title: '考试/测试题组已发布',
    detail: '第三章测试',
  });
});

test('reads an assessment group nested inside a websocket data payload', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const event = classifyPublishEvent({
    op: 'sendproblem',
    data: { quiz: { id: 'quiz-42', name: '单元测验' } },
  });

  assert.deepEqual(event, {
    category: 'assessment',
    dedupeKey: 'assessment:quiz-42',
    title: '考试/测试题组已发布',
    detail: '单元测验',
  });
});

test('classifies a published presentation as a courseware reminder', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const event = classifyPublishEvent({
    op: 'publishpresentation',
    presentation: { id: 'ppt-9', title: '概率论第 2 讲' },
  });

  assert.deepEqual(event, {
    category: 'courseware',
    dedupeKey: 'courseware:ppt-9',
    title: '课件已发布',
    detail: '概率论第 2 讲',
  });
});

test('does not mistake a displayed slide for a newly published courseware item', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  assert.equal(classifyPublishEvent({
    op: 'showslide',
    data: { slide: { id: 'slide-2', title: '第 2 页' } },
  }), null);
});

test('does not treat opening an existing presentation as a courseware publication', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  assert.equal(classifyPublishEvent({
    op: 'openpresentation',
    presentation: { id: 'ppt-9', title: '概率论第 2 讲' },
  }), null);
});

test('keeps an unclassified publish event selectable as a generic release reminder', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const event = classifyPublishEvent({
    op: 'publishactivity',
    activity: { id: 'activity-5', title: '课堂活动' },
  });

  assert.deepEqual(event, {
    category: 'other',
    dedupeKey: 'other:activity-5',
    title: '课堂内容已发布',
    detail: '课堂活动',
  });
});

test('ignores ordinary websocket messages that are not publication events', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  assert.equal(classifyPublishEvent({ op: 'chatmessage', text: 'hello' }), null);
});

test('honors each publish-reminder category independently', async () => {
  const { isPublishReminderEnabled } = await loadPublishEvents();

  assert.equal(isPublishReminderEnabled({ category: 'assessment' }, {
    notifyAssessmentPublishes: false,
    notifyCoursewarePublishes: true,
    notifyOtherPublishes: true,
  }), false);
  assert.equal(isPublishReminderEnabled({ category: 'courseware' }, {
    notifyAssessmentPublishes: false,
    notifyCoursewarePublishes: true,
    notifyOtherPublishes: true,
  }), true);
  assert.equal(isPublishReminderEnabled({ category: 'other' }, {
    notifyAssessmentPublishes: false,
    notifyCoursewarePublishes: true,
    notifyOtherPublishes: false,
  }), false);
});

test('uses the existing bell switch as a global off switch for publish reminders', async () => {
  const { isPublishReminderEnabled } = await loadPublishEvents();

  assert.equal(isPublishReminderEnabled({ category: 'assessment' }, {
    notifyProblems: false,
    notifyAssessmentPublishes: true,
  }), false);
});

test('routes a group publication to the notification path rather than the answer path', async () => {
  const { getRealtimeEvent } = await loadPublishEvents();

  assert.deepEqual(getRealtimeEvent({
    op: 'sendproblem',
    quiz: { id: 'quiz-8', title: '随堂测试' },
  }), {
    kind: 'publish',
    event: {
      category: 'assessment',
      dedupeKey: 'assessment:quiz-8',
      title: '考试/测试题组已发布',
      detail: '随堂测试',
    },
  });
});

test('uses the protocol problemid to distinguish successive problem publications', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const first = classifyPublishEvent({ op: 'publishproblem', problemid: 'problem-101' });
  const second = classifyPublishEvent({ op: 'publishproblem', problemid: 'problem-102' });

  assert.equal(first.dedupeKey, 'assessment:problem-101');
  assert.equal(second.dedupeKey, 'assessment:problem-102');
  assert.notEqual(first.dedupeKey, second.dedupeKey);
});

test('uses a scalar problem value to distinguish successive problem publications', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const first = classifyPublishEvent({ op: 'sendproblem', problem: 'p1' });
  const second = classifyPublishEvent({ op: 'sendproblem', problem: 'p2' });

  assert.equal(first.dedupeKey, 'assessment:p1');
  assert.equal(second.dedupeKey, 'assessment:p2');
  assert.notEqual(first.dedupeKey, second.dedupeKey);
});

test('uses a scalar presentation value as the courseware dedupe key', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const event = classifyPublishEvent({
    op: 'publishpresentation',
    data: { presentation: 'ppt-101' },
  });

  assert.equal(event.dedupeKey, 'courseware:ppt-101');
});

test('does not mistake non-publish problem operations for a new assessment', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  for (const op of ['problemresult', 'closeproblem', 'showproblem', 'updateproblem']) {
    assert.equal(classifyPublishEvent({ op, problem: { id: 'problem-101' } }), null, op);
  }
});

test('keeps unlockproblem metadata when the protocol sends a scalar problem id', async () => {
  const { getRealtimeEvent } = await loadPublishEvents();

  const realtime = getRealtimeEvent({
    op: 'unlockproblem',
    problem: 'problem-101',
    sid: 'slide-5',
    pres: 'presentation-2',
    dt: 100,
    limit: 30,
  });

  assert.equal(realtime.kind, 'unlockproblem');
  assert.equal(realtime.problem.prob, 'problem-101');
  assert.equal(realtime.problem.sid, 'slide-5');
  assert.equal(realtime.problem.pres, 'presentation-2');
});

test('adds lesson and presentation context to a publication event', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const event = classifyPublishEvent({
    op: 'publishpresentation',
    presentation: { id: 'ppt-9', title: '概率论第 2 讲' },
  }, { lessonId: 'lesson-a' });

  assert.equal(event.lessonId, 'lesson-a');
  assert.equal(event.entityId, 'ppt-9');
  assert.equal(event.presentationId, 'ppt-9');
  assert.equal(event.dedupeKey, 'courseware:lesson-a:ppt-9');
});

test('recognizes a publication operation nested inside a websocket payload', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();

  const event = classifyPublishEvent({
    data: {
      type: 'publishpresentation',
      presentation: { id: 'ppt-nested', title: '嵌套课件' },
    },
  }, { lessonId: 'lesson-b' });

  assert.equal(event.category, 'courseware');
  assert.equal(event.lessonId, 'lesson-b');
  assert.equal(event.presentationId, 'ppt-nested');
});

test('suppresses only the publication of the presentation currently being viewed', async () => {
  const { classifyPublishEvent, isCurrentPublishEvent } = await loadPublishEvents();
  const current = classifyPublishEvent({
    op: 'publishpresentation',
    presentation: { id: 'ppt-current', title: '当前课件' },
  }, { lessonId: 'lesson-a' });
  const other = classifyPublishEvent({
    op: 'publishpresentation',
    presentation: { id: 'ppt-other', title: '另一个课件' },
  }, { lessonId: 'lesson-a' });
  const otherLesson = classifyPublishEvent({
    op: 'publishpresentation',
    presentation: { id: 'ppt-current', title: '另一课堂同 ID' },
  }, { lessonId: 'lesson-b' });

  assert.equal(isCurrentPublishEvent(current, {
    currentLessonId: 'lesson-a',
    currentPresentationId: 'ppt-current',
  }), true);
  assert.equal(isCurrentPublishEvent(other, {
    currentLessonId: 'lesson-a',
    currentPresentationId: 'ppt-current',
  }), false);
  assert.equal(isCurrentPublishEvent(otherLesson, {
    currentLessonId: 'lesson-a',
    currentPresentationId: 'ppt-current',
  }), false);
});

test('keeps identical publication IDs independent across lessons', async () => {
  const { classifyPublishEvent } = await loadPublishEvents();
  const first = classifyPublishEvent({
    op: 'publishpresentation',
    presentation: { id: 'same-id' },
  }, { lessonId: 'lesson-a' });
  const second = classifyPublishEvent({
    op: 'publishpresentation',
    presentation: { id: 'same-id' },
  }, { lessonId: 'lesson-b' });

  assert.notEqual(first.dedupeKey, second.dedupeKey);
});
