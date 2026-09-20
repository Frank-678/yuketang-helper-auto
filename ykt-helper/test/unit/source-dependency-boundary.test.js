import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

function moduleSpecifiers(source) {
  const values = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) values.push(match[1]);
  }
  return values;
}

test('active production src contains no TypeScript source files', async () => {
  const files = await walk(srcRoot);
  const tsFiles = files
    .filter(path => ['.ts', '.tsx', '.mts', '.cts'].includes(extname(path)))
    .map(path => relative(srcRoot, path));
  assert.deepEqual(tsFiles, []);
});

test('active JavaScript source imports only local modules or static assets', async () => {
  const files = (await walk(srcRoot)).filter(path => extname(path) === '.js');
  const bareImports = [];

  for (const path of files) {
    const source = await readFile(path, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      const local = specifier.startsWith('./') || specifier.startsWith('../');
      if (!local) {
        bareImports.push({ file: relative(srcRoot, path), specifier });
      }
    }
  }

  assert.deepEqual(
    bareImports,
    [],
    `active userscript source unexpectedly depends on npm/bare modules: ${JSON.stringify(bareImports)}`,
  );
});
