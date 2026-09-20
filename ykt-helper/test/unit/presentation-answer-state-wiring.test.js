import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/ui/panels/presentation.js', import.meta.url), 'utf8');

test('presentation answered badge uses structural answer-state semantics', () => {
  assert.match(source, /hasSubmittedAnswer/);
  assert.doesNotMatch(source, /if\s*\(\s*s\.problem\.result\s*\)/);
});
