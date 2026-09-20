import assert from 'node:assert/strict';
import test from 'node:test';

function resetGlobals() {
  delete globalThis.window;
  delete globalThis.document;
}

test.afterEach(() => resetGlobals());

test('ensureHtml2Canvas resolves a sandbox @require global even when unsafeWindow differs', async () => {
  const h2c = () => {};
  globalThis.window = {
    html2canvas: h2c,
    unsafeWindow: {},
  };
  globalThis.document = {
    head: { appendChild() { throw new Error('must not dynamically inject scripts'); } },
    scripts: [],
    createElement() { throw new Error('must not dynamically inject scripts'); },
  };

  const { ensureHtml2Canvas } = await import('../../src/core/env.js?runtime-deps-sandbox');
  assert.equal(await ensureHtml2Canvas(), h2c);
});

test('ensureHtml2Canvas fails explicitly when the pinned @require dependency is unavailable', async () => {
  globalThis.window = { unsafeWindow: {} };
  globalThis.document = {
    head: { appendChild() { throw new Error('must not dynamically inject scripts'); } },
    scripts: [],
    createElement() { throw new Error('must not dynamically inject scripts'); },
  };

  const { ensureHtml2Canvas } = await import('../../src/core/env.js?runtime-deps-missing');
  await assert.rejects(() => ensureHtml2Canvas(), /html2canvas.*未加载|html2canvas.*不可用/i);
});
