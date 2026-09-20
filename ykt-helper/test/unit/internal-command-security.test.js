import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTrustedUiEvent, trustedUiHandler } from '../../src/core/trusted-ui-event.js';

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path);
  }
  return out;
}

test('trusted UI guard rejects browser-synthetic events but keeps real/internal test calls', async () => {
  assert.equal(isTrustedUiEvent({ isTrusted: false }), false);
  assert.equal(isTrustedUiEvent({ isTrusted: true }), true);
  assert.equal(isTrustedUiEvent({}), true);
  assert.equal(isTrustedUiEvent(undefined), true);

  let calls = 0;
  const handler = trustedUiHandler(() => { calls += 1; return 'ok'; });
  assert.equal(handler({ isTrusted: false }), undefined);
  assert.equal(calls, 0);
  assert.equal(handler({ isTrusted: true }), 'ok');
  assert.equal(calls, 1);
});

test('privileged ykt internal command events are not exposed on window', async () => {
  const files = (await walk(srcRoot)).filter(path => extname(path) === '.js');
  const findings = [];
  for (const path of files) {
    const source = await readFile(path, 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (!/ykt:/.test(line)) return;
      if (/ykt:url-change/.test(line)) return; // public diagnostic URL-change signal only
      if (/window\.(?:addEventListener|dispatchEvent)/.test(line) || /new CustomEvent\(['"]ykt:/.test(line)) {
        findings.push(`${relative(srcRoot, path)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(findings, [], `window-exposed internal commands found:\n${findings.join('\n')}`);
});
