import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

function functionBody(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} missing`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.ok(end > start, `${name} body end missing`);
  return source.slice(start, end);
}

test('periodic reload is started from main after first-load network interception', () => {
  const desktop = functionBody('startDesktopRuntime', 'bootCurrentRuntime');
  assert.doesNotMatch(desktop, /startPeriodicReload\s*\(/);

  const mainStart = source.indexOf('(function main()');
  const main = source.slice(mainStart);
  const guardReturn = main.indexOf("if (guard.redirected || guard.reason === 'loop-prevented') return;");
  const wsInstall = main.indexOf('installWSInterceptor({');
  const xhrInstall = main.indexOf('installXHRInterceptor();');
  const reloadCall = main.indexOf('startPeriodicReload({ intervalMs: 1 * 60 * 1000');
  const boot = main.indexOf('queueRuntimeBoot();');

  assert.ok(guardReturn >= 0);
  assert.ok(wsInstall > guardReturn && xhrInstall > guardReturn);
  assert.ok(reloadCall > wsInstall && reloadCall > xhrInstall);
  assert.ok(boot > reloadCall);
});

test('periodic reload timer is singleton guarded', () => {
  assert.match(source, /let periodicReloadTimer = null;/);
  assert.match(source, /if \(periodicReloadTimer !== null\) return periodicReloadTimer;/);
  assert.match(source, /periodicReloadTimer = window\.setInterval/);
});

test('periodic reload keeps the lesson-page safety skip', () => {
  assert.ok(source.includes("if (skipLessonPages && /\\/lesson\\//.test(window.location.pathname)) {"));
});
