import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getFiniteDeadline,
  isProblemAnswered,
  isProblemExpired,
} from '../../src/core/problem-view-state.js';

const emptyAnswers = [null, undefined, '', '   ', [], {}, { content: '' }, { pics: [] }];
for (const value of emptyAnswers) {
  test(`empty problem.result ${JSON.stringify(value)} is not answered`, () => {
    assert.equal(isProblemAnswered({ result: value }, {}), false);
  });

  test(`empty status.myAnswer ${JSON.stringify(value)} is not answered`, () => {
    assert.equal(isProblemAnswered({ result: null }, { myAnswer: value }), false);
  });
}

const submittedAnswers = [
  ['A'],
  ['A', 'C'],
  'A',
  '  text  ',
  { content: 'subjective' },
  { pics: ['x'] },
  { answer: ['B'] },
];
for (const value of submittedAnswers) {
  test(`non-empty problem.result ${JSON.stringify(value)} is answered`, () => {
    assert.equal(isProblemAnswered({ result: value }, {}), true);
  });
}

test('non-empty status.myAnswer counts as answered when problem.result is empty', () => {
  assert.equal(isProblemAnswered({ result: [] }, { myAnswer: ['B'] }), true);
});

test('legacy status.answered=true remains a final compatibility fallback', () => {
  assert.equal(isProblemAnswered({ result: null }, { myAnswer: null, answered: true }), true);
});

test('legacy status.answered=false cannot override a real submitted result', () => {
  assert.equal(isProblemAnswered({ result: ['A'] }, { answered: false }), true);
});

const invalidDeadlines = [null, undefined, '', '   ', 0, '0', -1, '-1', 'bad', Number.NaN, Infinity, -Infinity];
for (const value of invalidDeadlines) {
  test(`invalid/untimed deadline ${JSON.stringify(value)} is ignored`, () => {
    assert.equal(getFiniteDeadline(value), undefined);
    assert.equal(isProblemExpired(10_000, value), false);
  });
}

test('getFiniteDeadline selects first valid positive finite candidate', () => {
  assert.equal(getFiniteDeadline(null, '', 'bad', 1234, 5678), 1234);
});

test('numeric string deadline is accepted', () => {
  assert.equal(getFiniteDeadline('1234'), 1234);
});

test('deadline in future is not expired', () => {
  assert.equal(isProblemExpired(999, 1000), false);
});

test('deadline equal to now is expired', () => {
  assert.equal(isProblemExpired(1000, 1000), true);
});

test('deadline in past is expired', () => {
  assert.equal(isProblemExpired(1001, 1000), true);
});

test('invalid earlier candidate does not hide later valid deadline', () => {
  assert.equal(isProblemExpired(2000, null, 'bad', '1500'), true);
});

test('first valid deadline wins when multiple sources disagree', () => {
  assert.equal(getFiniteDeadline(5000, 1000), 5000);
  assert.equal(isProblemExpired(3000, 5000, 1000), false);
});
