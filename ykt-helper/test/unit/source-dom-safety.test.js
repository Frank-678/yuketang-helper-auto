import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const presentationPath = path.resolve('src/ui/panels/presentation.js');

test('server-controlled presentation title is never interpolated into innerHTML', () => {
  const source = fs.readFileSync(presentationPath, 'utf8');
  assert.doesNotMatch(
    source,
    /titleEl\.innerHTML\s*=\s*`[\s\S]*?\$\{\s*presentation\.title[\s\S]*?`/,
  );
});
