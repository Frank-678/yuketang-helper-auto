import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const activeProblemsSource = readFileSync(
  new URL('../src/ui/panels/active-problems.js', import.meta.url),
  'utf8'
);
const presentationSource = readFileSync(
  new URL('../src/ui/panels/presentation.js', import.meta.url),
  'utf8'
);
const problemListSource = readFileSync(
  new URL('../src/ui/panels/problem-list.js', import.meta.url),
  'utf8'
);

test('does not render duplicate question cards in the active-problems overlay', () => {
  assert.match(activeProblemsSource, /root\.style\.display\s*=\s*['"]none['"]/);
  assert.doesNotMatch(activeProblemsSource, /active-problem-card/);
  assert.doesNotMatch(activeProblemsSource, /AI\s*强制作答/);
  assert.doesNotMatch(activeProblemsSource, /编辑\/补交/);
});

test('renders force-answer actions only for the currently selected problem slide', () => {
  assert.match(presentationSource, /if \(slide\.problem\)/);
  assert.match(presentationSource, /forceAI\.textContent\s*=\s*['"]AI 强制作答['"]/);
  assert.match(presentationSource, /editAnswer\.textContent\s*=\s*['"]编辑\/补交['"]/);
});

test('keeps the original problem-list route and adds AI force-answer beside force retry', () => {
  assert.match(problemListSource, /btnGo\.textContent\s*=\s*['"]查看['"]/);
  assert.match(problemListSource, /btnForceAI\.textContent\s*=\s*['"]AI强制作答['"]/);
  assert.match(problemListSource, /btnForceRetry\.textContent\s*=\s*['"]强制补交['"]/);
});
