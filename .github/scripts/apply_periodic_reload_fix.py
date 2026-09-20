from pathlib import Path

root = Path('ykt-helper')
p = root / 'src/index.js'
s = p.read_text(encoding='utf-8')

anchor = "function startPeriodicReload(opts = {}) {\n  try {"
assert anchor in s, 'periodic reload function anchor missing'
if 'let periodicReloadTimer = null;' not in s:
    s = s.replace(
        anchor,
        "let periodicReloadTimer = null;\n\nfunction startPeriodicReload(opts = {}) {\n  try {\n    if (periodicReloadTimer !== null) return periodicReloadTimer;",
        1,
    )

old_interval = "      window.setInterval(() => {"
assert old_interval in s, 'periodic reload interval anchor missing'
s = s.replace(old_interval, "      periodicReloadTimer = window.setInterval(() => {", 1)

old_tail = "  }, intervalMs);\n  } catch {}\n}"
new_tail = "  }, intervalMs);\n    return periodicReloadTimer;\n  } catch {\n    return null;\n  }\n}"
assert old_tail in s, 'periodic reload tail changed'
s = s.replace(old_tail, new_tail, 1)

call = "  startPeriodicReload({ intervalMs: 1 * 60 * 1000, onlyWhenHidden: false, skipLessonPages: true });\n"
assert s.count(call) == 1, f'unexpected periodic reload call count: {s.count(call)}'
s = s.replace(call, '', 1)

main_anchor = """  if (guard.redirected || guard.reason === 'loop-prevented') return;

  // WebSocket needs to be patched at document-start."""
assert main_anchor in s, 'main guard anchor changed'
s = s.replace(
    main_anchor,
    """  if (guard.redirected || guard.reason === 'loop-prevented') return;

  // Periodic refresh is a base service, not a desktop-runtime side effect.
  // It keeps running across SPA route changes, but each tick still skips /lesson/ pages.
  startPeriodicReload({ intervalMs: 1 * 60 * 1000, onlyWhenHidden: false, skipLessonPages: true });

  // WebSocket needs to be patched at document-start.""",
    1,
)

p.write_text(s, encoding='utf-8')

(root / 'test/periodic-reload-wiring.test.js').write_text(r"""import assert from 'node:assert/strict';
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

test('periodic reload is started from main instead of desktop runtime', () => {
  const desktop = functionBody('startDesktopRuntime', 'bootCurrentRuntime');
  assert.doesNotMatch(desktop, /startPeriodicReload\s*\(/);

  const mainStart = source.indexOf('(function main()');
  const main = source.slice(mainStart);
  const guardReturn = main.indexOf("if (guard.redirected || guard.reason === 'loop-prevented') return;");
  const reloadCall = main.indexOf('startPeriodicReload({ intervalMs: 1 * 60 * 1000');
  const wsInstall = main.indexOf('installWSInterceptor({');
  assert.ok(guardReturn >= 0 && reloadCall > guardReturn && wsInstall > reloadCall);
});

test('periodic reload timer is singleton guarded', () => {
  assert.match(source, /let periodicReloadTimer = null;/);
  assert.match(source, /if \(periodicReloadTimer !== null\) return periodicReloadTimer;/);
  assert.match(source, /periodicReloadTimer = window\.setInterval/);
});

test('periodic reload keeps the lesson-page safety skip', () => {
  assert.ok(source.includes("if (skipLessonPages && /\\/lesson\\//.test(window.location.pathname)) {"));
});
""", encoding='utf-8')
