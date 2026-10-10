import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const actions = fs.readFileSync(new URL('../src/state/actions.js', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../src/state/auto-answer-runner.js', import.meta.url), 'utf8');
const list = fs.readFileSync(new URL('../src/ui/panels/problem-list.js', import.meta.url), 'utf8');

test('force AI explicitly allows resubmission', () => {
  assert.match(actions, /force:\s*true,[\s\S]{0,120}allowResubmit:\s*true,[\s\S]{0,120}source:\s*'manual'/);
});

test('manual problem-list submits bypass automatic delay', () => {
  const immediate = list.match(/autoGate:\s*false,\s*waitMs:\s*0/g) || [];
  assert.ok(immediate.length >= 3, `expected >=3 immediate submit call sites, got ${immediate.length}`);
});

test('live scheduling is not permanently blocked by a prior failed phase', () => {
  assert.doesNotMatch(actions, /status\.phase\s*!==\s*'failed'/);
});

test('runner treats null deadlines as untimed instead of epoch zero', () => {
  assert.match(runner, /rawEndTime === null[\s\S]{0,120}return false/);
});
