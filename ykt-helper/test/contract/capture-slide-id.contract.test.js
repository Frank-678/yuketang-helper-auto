import assert from 'node:assert/strict';
import test from 'node:test';

import { repo } from '../../src/state/repo.js';
function installImageCanvasHarness() {
  globalThis.window = { unsafeWindow: {} };
  globalThis.Image = class FakeImage {
    constructor() { this.width = 640; this.height = 360; }
    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onload?.());
    }
    get src() { return this._src; }
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext() { return { drawImage() {} }; },
        toDataURL() { return 'data:image/jpeg;base64,QUJD'; },
      };
    },
  };
}

test.beforeEach(() => {
  repo.slides.clear();
  installImageCanvasHarness();
});

test.afterEach(() => {
  repo.slides.clear();
  delete globalThis.Image;
  delete globalThis.document;
  delete globalThis.window;
});

test('captureSlideImage accepts numeric id when repo key is the equivalent string', async () => {
  repo.slides.set('42', { id: '42', cover: 'https://example.invalid/slide.jpg' });
  const { captureSlideImage } = await import('../../src/capture/screenshoot.js?slide-id-string-key');
  assert.equal(await captureSlideImage(42), 'QUJD');
});

test('captureSlideImage accepts string id when legacy repo key is numeric', async () => {
  repo.slides.set(42, { id: 42, cover: 'https://example.invalid/slide.jpg' });
  const { captureSlideImage } = await import('../../src/capture/screenshoot.js?slide-id-numeric-key');
  assert.equal(await captureSlideImage('42'), 'QUJD');
});
