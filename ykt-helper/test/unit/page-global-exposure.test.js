import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('page unsafeWindow exposes only the intentional XHR/WebSocket interceptors', async () => {
  const files = (await walk(srcRoot)).filter(path => extname(path) === '.js');
  const findings = [];
  for (const path of files) {
    const source = await readFile(path, 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!/(?:unsafeWindow|gm\.uw)\s*(?:\.|\[)/.test(trimmed)) return;
      if (/gm\.uw\?*\.?(?:WebSocket|XMLHttpRequest)/.test(trimmed) && !/=/.test(trimmed)) return;
      if (/gm\.uw\.(?:WebSocket|XMLHttpRequest)\s*=/.test(trimmed)) return;
      if (/gm\.uw\?*\.(?:WebSocket|XMLHttpRequest)/.test(trimmed)) return;
      if (/const\s+\w+\s*=\s*gm\.uw\s*\|\|\s*window/.test(trimmed)) return;
      findings.push(`${relative(srcRoot, path)}:${index + 1}: ${trimmed}`);
    });
  }
  assert.deepEqual(findings, [], `unexpected page-global/unsafeWindow exposure:\n${findings.join('\n')}`);
});

test('production source does not publish custom helper objects onto window globals', async () => {
  const files = (await walk(srcRoot)).filter(path => extname(path) === '.js');
  const findings = [];
  const assignment = /\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/;
  const allowed = new Set(['MathJax', 'fetch']);
  for (const path of files) {
    const source = await readFile(path, 'utf8');
    source.split('\n').forEach((line, index) => {
      const match = line.match(assignment);
      if (!match || allowed.has(match[1])) return;
      findings.push(`${relative(srcRoot, path)}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(findings, [], `custom window globals found:\n${findings.join('\n')}`);
});
