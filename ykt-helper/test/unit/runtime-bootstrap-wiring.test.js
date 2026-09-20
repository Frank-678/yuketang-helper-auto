import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/index.js', import.meta.url), 'utf8');

function bodyOf(functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unterminated function ${functionName}`);
}

test('runtime activation never forces a second page load just to arm interceptors', () => {
  assert.doesNotMatch(source, /maybeAutoReloadOnMount/);
  assert.doesNotMatch(source, /Late mount detected; reloading once/);
  assert.doesNotMatch(bodyOf('startDesktopRuntime'), /location\.reload\(\)/);
  assert.doesNotMatch(bodyOf('bootCurrentRuntime'), /location\.reload\(\)/);
  assert.doesNotMatch(bodyOf('queueRuntimeBoot'), /location\.reload\(\)/);
});

test('network interceptors are armed before the route-dependent desktop runtime boot', () => {
  const mainStart = source.indexOf('(function main()');
  assert.notEqual(mainStart, -1);
  const main = source.slice(mainStart);
  const ws = main.indexOf('installWSInterceptor(');
  const xhr = main.indexOf('installXHRInterceptor(');
  const boot = main.indexOf('queueRuntimeBoot();');
  assert.ok(ws >= 0 && xhr >= 0 && boot >= 0);
  assert.ok(ws < boot, 'WebSocket interceptor must be armed before runtime boot');
  assert.ok(xhr < boot, 'XHR interceptor must be armed before runtime boot');
});

test('desktop runtime does not defer network interception until UI/runtime startup', () => {
  const desktopBody = bodyOf('startDesktopRuntime');
  assert.doesNotMatch(desktopBody, /installXHRInterceptor\(/);
  assert.doesNotMatch(desktopBody, /installWSInterceptor\(/);
  assert.match(desktopBody, /installToolbar\(/);
  assert.match(desktopBody, /startAutoAnswerLoop\(/);
});
