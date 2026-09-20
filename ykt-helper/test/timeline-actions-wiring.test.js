import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const actionsSource = fs.readFileSync(path.join(here, '../src/state/actions.js'), 'utf8');
const trackerSource = fs.readFileSync(path.join(here, '../src/core/timeline-problem-tracker.js'), 'utf8');

test('classifies timeline problems per lesson before unlock handling', () => {
  assert.match(actionsSource, /createTimelineProblemTracker/);
  assert.match(actionsSource, /timelineProblemTracker\.classify\(timeline,\s*\{\s*lessonId/);
});

test('routes newly observed timeline problems through the tracker-selected source', () => {
  assert.match(actionsSource, /source:\s*entry\.source/);
  assert.match(trackerSource, /source:\s*isNew\s*\?\s*['"]timeline-live['"]\s*:\s*['"]timeline['"]/);
});

test('logs timeline classification so field tests can distinguish baseline from live deltas', () => {
  assert.match(actionsSource, /\[Timeline\].*分类/);
  assert.match(actionsSource, /liveNew/);
});
