import assert from 'node:assert/strict';
import test from 'node:test';

const loadActiveLessons = () => import('../src/core/active-lessons.js');

test('syncs only active lessons and reports stale lessons for cleanup', async () => {
  const { syncActiveLessons } = await loadActiveLessons();

  const result = syncActiveLessons(
    [{ lessonId: 'old', status: 1 }, { lessonId: 'keep', status: 1 }],
    [
      { lessonId: 'keep', status: 1 },
      { lesson_id: 'new', status: '1' },
      { lessonId: 'future', status: 0 },
    ],
  );

  assert.deepEqual(result.active.map(x => x.lessonId), ['keep', 'new']);
  assert.deepEqual(result.added.map(x => x.lessonId), ['new']);
  assert.deepEqual(result.removed, ['old']);
});

test('deduplicates active lesson records by normalized lesson id', async () => {
  const { syncActiveLessons } = await loadActiveLessons();

  const result = syncActiveLessons([], [
    { id: 42, status: 1, title: 'first' },
    { lessonId: '42', status: 1, title: 'duplicate' },
  ]);

  assert.equal(result.active.length, 1);
  assert.equal(result.active[0].lessonId, '42');
  assert.equal(result.active[0].title, 'first');
});
