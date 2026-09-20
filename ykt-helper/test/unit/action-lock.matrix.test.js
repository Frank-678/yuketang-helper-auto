import assert from 'node:assert/strict';
import test from 'node:test';
import { createKeyedActionLock } from '../../src/core/action-lock.js';

test('first acquire succeeds and duplicate acquire fails until release', () => {
  const lock = createKeyedActionLock();
  assert.equal(lock.acquire('q1'), true);
  assert.equal(lock.acquire('q1'), false);
  assert.equal(lock.isPending('q1'), true);
  assert.equal(lock.size, 1);
  assert.equal(lock.release('q1'), true);
  assert.equal(lock.isPending('q1'), false);
  assert.equal(lock.acquire('q1'), true);
});

test('number and string forms of same problem id share one lock', () => {
  const lock = createKeyedActionLock();
  assert.equal(lock.acquire(88), true);
  assert.equal(lock.acquire('88'), false);
  assert.equal(lock.release('88'), true);
});

test('different problem ids can proceed independently', () => {
  const lock = createKeyedActionLock();
  assert.equal(lock.acquire('q1'), true);
  assert.equal(lock.acquire('q2'), true);
  assert.equal(lock.size, 2);
});

test('invalid/blank keys cannot be acquired', () => {
  const lock = createKeyedActionLock();
  for (const key of [null, undefined, '', '   ']) {
    assert.equal(lock.acquire(key), false);
  }
  assert.equal(lock.size, 0);
});

test('release is idempotent and never removes another key', () => {
  const lock = createKeyedActionLock();
  lock.acquire('q1');
  lock.acquire('q2');
  assert.equal(lock.release('missing'), false);
  assert.equal(lock.release('q1'), true);
  assert.equal(lock.release('q1'), false);
  assert.equal(lock.isPending('q2'), true);
});

test('clear releases every in-flight key', () => {
  const lock = createKeyedActionLock();
  for (let i = 0; i < 20; i++) lock.acquire(`q${i}`);
  assert.equal(lock.size, 20);
  lock.clear();
  assert.equal(lock.size, 0);
  assert.equal(lock.acquire('q1'), true);
});
