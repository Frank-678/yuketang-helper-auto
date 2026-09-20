import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const envSource = fs.readFileSync(new URL('../../src/core/env.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../../src/index.js', import.meta.url), 'utf8');

test('Font Awesome runtime CSS is loaded through one SRI-protected helper', () => {
  assert.match(indexSource, /ensureFontAwesome/);
  assert.doesNotMatch(indexSource, /function\s+loadFA\s*\(/);
  assert.equal(indexSource.includes('cdnjs.cloudflare.com/ajax/libs/font-awesome'), false);

  assert.match(envSource, /font-awesome\/6\.4\.0\/css\/all\.min\.css/);
  assert.match(envSource, /sha512-iecdLmaskl7CVkqkXNQ\/ZH\/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT\/E0iPtmFIB46ZmdtAc9eNBvH0H\/ZpiBw==/);
  assert.match(envSource, /crossOrigin\s*=\s*['"]anonymous['"]/);
  assert.match(envSource, /referrerPolicy\s*=\s*['"]no-referrer['"]/);
});
