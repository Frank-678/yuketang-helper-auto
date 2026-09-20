import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lessonSetHas,
  normalizeLessonId,
  shouldAutoAnswerForLesson,
} from '../../src/core/auto-answer-policy.js';

test('lesson id normalization handles strings, numbers and empty values', () => {
  assert.equal(normalizeLessonId(' 42 '), '42');
  assert.equal(normalizeLessonId(42), '42');
  assert.equal(normalizeLessonId(null), '');
  assert.equal(normalizeLessonId(undefined), '');
});

test('set membership is stable across numeric/string lesson id representation', () => {
  assert.equal(lessonSetHas(new Set(['42']), 42), true);
  assert.equal(lessonSetHas(new Set([42]), '42'), true);
  assert.equal(lessonSetHas(new Set(['0042']), 42), false);
  assert.equal(lessonSetHas(new Set(), 42), false);
});

const cases = [
  ['global autoAnswer enables any lesson', { lessonId: 42, config: { autoAnswer: true } }, true],
  ['empty lesson stays disabled when global is off', { lessonId: null, config: { autoAnswer: false } }, false],
  ['auto-joined string id matches numeric lesson id', {
    lessonId: 42,
    config: { autoAnswer: false, autoAnswerOnAutoJoin: true },
    autoJoinedLessons: new Set(['42']),
  }, true],
  ['auto-joined numeric legacy id matches string lesson id', {
    lessonId: '42',
    config: { autoAnswer: false, autoAnswerOnAutoJoin: true },
    autoJoinedLessons: new Set([42]),
  }, true],
  ['auto-join membership is ignored when autoAnswerOnAutoJoin is off', {
    lessonId: '42',
    config: { autoAnswer: false, autoAnswerOnAutoJoin: false },
    autoJoinedLessons: new Set(['42']),
  }, false],
  ['force set enables lesson regardless of auto-join switch', {
    lessonId: 42,
    config: { autoAnswer: false, autoAnswerOnAutoJoin: false },
    forceAutoAnswerLessons: new Set(['42']),
  }, true],
  ['unrelated lesson remains disabled', {
    lessonId: '43',
    config: { autoAnswer: false, autoAnswerOnAutoJoin: true },
    autoJoinedLessons: new Set(['42']),
    forceAutoAnswerLessons: new Set(['44']),
  }, false],
];

for (const [name, input, expected] of cases) {
  test(name, () => assert.equal(shouldAutoAnswerForLesson(input), expected));
}
