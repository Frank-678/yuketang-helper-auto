import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineProblemTracker, getTimelineProblemKey } from '../src/core/timeline-problem-tracker.js';

test('uses a stable problem id when the timeline provides one', () => {
  assert.equal(getTimelineProblemKey({ type: 'problem', prob: 42 }), 'problem:42');
  assert.equal(getTimelineProblemKey({ type: 'problem', problem: { problemId: 'abc' } }), 'problem:abc');
});

test('treats the first timeline snapshot as a historical baseline', () => {
  const tracker = createTimelineProblemTracker();
  const result = tracker.classify([
    { type: 'problem', prob: 1 },
    { type: 'problem', prob: 2 },
  ], { lessonId: 'lesson-a' });

  assert.deepEqual(result.map(entry => entry.source), ['timeline', 'timeline']);
  assert.deepEqual(result.map(entry => entry.phase), ['baseline', 'baseline']);
});

test('promotes only newly appearing problems in later snapshots to live events', () => {
  const tracker = createTimelineProblemTracker();
  tracker.classify([{ type: 'problem', prob: 1 }], { lessonId: 'lesson-a' });

  const result = tracker.classify([
    { type: 'problem', prob: 1 },
    { type: 'problem', prob: 2 },
  ], { lessonId: 'lesson-a' });

  assert.equal(result[0].source, 'timeline');
  assert.equal(result[0].isNew, false);
  assert.equal(result[1].source, 'timeline-live');
  assert.equal(result[1].isNew, true);
});

test('does not repeatedly promote the same timeline problem', () => {
  const tracker = createTimelineProblemTracker();
  tracker.classify([], { lessonId: 'lesson-a' });
  assert.equal(tracker.classify([{ type: 'problem', prob: 9 }], { lessonId: 'lesson-a' })[0].source, 'timeline-live');
  assert.equal(tracker.classify([{ type: 'problem', prob: 9 }], { lessonId: 'lesson-a' })[0].source, 'timeline');
});

test('keeps timeline baselines isolated by lesson', () => {
  const tracker = createTimelineProblemTracker();
  tracker.classify([{ type: 'problem', prob: 1 }], { lessonId: 'lesson-a' });
  tracker.classify([{ type: 'problem', prob: 8 }], { lessonId: 'lesson-b' });

  assert.equal(tracker.classify([{ type: 'problem', prob: 2 }], { lessonId: 'lesson-a' })[0].source, 'timeline-live');
  assert.equal(tracker.classify([{ type: 'problem', prob: 8 }], { lessonId: 'lesson-b' })[0].source, 'timeline');
});

test('uses presentation, slide and timestamp as a conservative fallback key', () => {
  const tracker = createTimelineProblemTracker();
  tracker.classify([], { lessonId: 'lesson-a' });
  const piece = { type: 'problem', pres: 'p', sid: 's', dt: 123 };
  assert.equal(tracker.classify([piece], { lessonId: 'lesson-a' })[0].source, 'timeline-live');
  assert.equal(tracker.classify([piece], { lessonId: 'lesson-a' })[0].source, 'timeline');
});
