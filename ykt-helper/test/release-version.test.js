import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const expectedVersion = '1.21.6';

test('release metadata points to the 1.21.6 userscript artifact', async () => {
  const metadata = await readFile(new URL('../userscript.meta.js', import.meta.url), 'utf8');
  const rollupConfig = await readFile(new URL('../rollup.config.mjs', import.meta.url), 'utf8');

  assert.match(metadata, new RegExp(`@version\\s+${expectedVersion.replaceAll('.', '\\.')}\\b`));
  assert.match(rollupConfig, new RegExp(`ykt-helper-${expectedVersion.replaceAll('.', '')}\\.user\\.js`));
});
