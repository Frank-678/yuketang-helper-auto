import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSubmittedAnswer } from '../src/core/answer-state.js';

test('empty backend result containers are still unanswered', () => {
  for (const value of [null, undefined, '', '   ', [], {}, [''], { content: '', pics: [] }]) {
    assert.equal(hasSubmittedAnswer(value), false);
  }
});

test('non-empty answer payloads count as submitted', () => {
  assert.equal(hasSubmittedAnswer(['A']), true);
  assert.equal(hasSubmittedAnswer({ content: 'x', pics: [] }), true);
  assert.equal(hasSubmittedAnswer('A'), true);
  assert.equal(hasSubmittedAnswer(0), true);
});
