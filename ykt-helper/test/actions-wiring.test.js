import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const actionsSource = readFileSync(new URL('../src/state/actions.js', import.meta.url), 'utf8');

test('wires the auto-answer runner to the exported AI profile predicate', () => {
  assert.match(
    actionsSource,
    /const autoAnswerRunner = createAutoAnswerRunner\(\{[\s\S]*?hasActiveProfile:\s*hasActiveAIProfile,/
  );
});
