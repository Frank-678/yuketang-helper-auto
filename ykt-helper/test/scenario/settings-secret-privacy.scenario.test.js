import assert from 'node:assert/strict';
import test from 'node:test';
import settingsHtml from '../../src/ui/panels/settings.html';
import { createFakeElement, installBrowserGlobals, uninstallBrowserGlobals } from '../support/browser-harness.js';
import { installTemplateMaterializer } from '../support/html-form-harness.js';

const { window, document } = installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/settings-secret-privacy',
});

const privateValues = new Map();
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const gmGet = (key, fallback = null) => privateValues.has(key) ? clone(privateValues.get(key)) : fallback;
const gmSet = (key, value) => { privateValues.set(key, clone(value)); };
const gmDelete = key => { privateValues.delete(key); };
for (const [name, fn] of Object.entries({
  GM_getValue: gmGet,
  GM_setValue: gmSet,
  GM_deleteValue: gmDelete,
})) {
  globalThis[name] = fn;
  window[name] = fn;
}

window.navigator.wakeLock = {
  async request() {
    return {
      released: false,
      addEventListener() {},
      async release() { this.released = true; },
    };
  },
};

const restoreTemplateMaterializer = installTemplateMaterializer(document, settingsHtml, {
  rootId: 'ykt-settings-panel',
});
for (const id of ['ykt-btn-auto-answer', 'ykt-btn-bell']) {
  const button = createFakeElement('button');
  button.id = id;
  document.body.appendChild(button);
}

const { ui } = await import('../../src/ui/ui-api.js');
const { mountSettingsPanel } = await import('../../src/ui/panels/settings.js');
const { screenWakeLock } = await import('../../src/core/screen-wake-lock.js');

ui.toast = () => {};
ui.config.ai = {
  ...ui.config.ai,
  activeProfileId: 'p1',
  profiles: [{
    id: 'p1',
    name: 'Private Profile',
    baseUrl: 'https://api.example.test/v1/chat/completions',
    apiKey: 'PROFILE_DOM_SECRET',
    model: 'm',
    visionModel: 'v',
    temperature: '',
  }],
  ocrApi: 'https://ocr.example.test/v1/chat/completions',
  ocrApiKey: 'OCR_DOM_SECRET',
  translateApi: 'https://translate.example.test/v1/chat/completions',
  translateApiKey: 'TRANSLATE_DOM_SECRET',
  translateModel: 'tm',
};
ui.config.profiles = ui.config.ai.profiles;
ui.config.activeProfileId = 'p1';

const root = mountSettingsPanel();
assert.ok(root);

const byId = id => {
  const el = document.getElementById(id);
  assert.ok(el, `missing #${id}`);
  return el;
};

async function flushAsyncHandler() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}

test('opening settings never copies stored AI credentials into page-readable DOM inputs', () => {
  assert.equal(byId('kimi-api-key').value, '');
  assert.equal(byId('ykt-ai-ocr-api-key').value, '');
  assert.equal(byId('ykt-ai-translate-api-key').value, '');
  const bodyText = [
    byId('kimi-api-key').value,
    byId('ykt-ai-ocr-api-key').value,
    byId('ykt-ai-translate-api-key').value,
  ].join('|');
  assert.doesNotMatch(bodyText, /PROFILE_DOM_SECRET|OCR_DOM_SECRET|TRANSLATE_DOM_SECRET/);
});

test('blank secret fields preserve existing private credentials when saving unrelated settings', async () => {
  byId('kimi-api-key').value = '';
  byId('ykt-ai-ocr-api-key').value = '';
  byId('ykt-ai-translate-api-key').value = '';
  byId('ykt-ai-profile-name').value = 'Renamed Profile';

  byId('ykt-btn-settings-save').click();
  await flushAsyncHandler();

  assert.equal(ui.config.ai.profiles[0].apiKey, 'PROFILE_DOM_SECRET');
  assert.equal(ui.config.ai.ocrApiKey, 'OCR_DOM_SECRET');
  assert.equal(ui.config.ai.translateApiKey, 'TRANSLATE_DOM_SECRET');
  assert.equal(ui.config.ai.profiles[0].name, 'Renamed Profile');
});





test('changing a secret-bound endpoint without re-entering its key is rejected', async () => {
  ui.config.ai.profiles[0].baseUrl = 'https://api.example.test/v1/chat/completions';
  ui.config.ai.profiles[0].apiKey = 'PROFILE_DOM_SECRET';
  ui.config.ai.ocrApi = 'https://ocr.example.test/v1/chat/completions';
  ui.config.ai.ocrApiKey = 'OCR_DOM_SECRET';
  ui.config.ai.translateApi = 'https://translate.example.test/v1/chat/completions';
  ui.config.ai.translateApiKey = 'TRANSLATE_DOM_SECRET';

  // Re-open/sync the mounted panel so its non-secret fields reflect current config.
  byId('ykt-ai-profile-select').value = 'p1';
  byId('ykt-ai-base-url').value = 'https://attacker.example/v1/chat/completions';
  byId('kimi-api-key').value = '';
  byId('ykt-ai-ocr-api').value = 'https://attacker.example/ocr';
  byId('ykt-ai-ocr-api-key').value = '';
  byId('ykt-ai-translate-api').value = 'https://attacker.example/translate';
  byId('ykt-ai-translate-api-key').value = '';

  byId('ykt-btn-settings-save').click();
  await flushAsyncHandler();

  assert.equal(ui.config.ai.profiles[0].baseUrl, 'https://api.example.test/v1/chat/completions');
  assert.equal(ui.config.ai.profiles[0].apiKey, 'PROFILE_DOM_SECRET');
  assert.equal(ui.config.ai.ocrApi, 'https://ocr.example.test/v1/chat/completions');
  assert.equal(ui.config.ai.ocrApiKey, 'OCR_DOM_SECRET');
  assert.equal(ui.config.ai.translateApi, 'https://translate.example.test/v1/chat/completions');
  assert.equal(ui.config.ai.translateApiKey, 'TRANSLATE_DOM_SECRET');
});

test('explicit clear controls remove saved credentials only after Save', async () => {
  ui.config.ai.profiles[0].apiKey = 'PROFILE_DOM_SECRET';
  ui.config.ai.ocrApiKey = 'OCR_DOM_SECRET';
  ui.config.ai.translateApiKey = 'TRANSLATE_DOM_SECRET';

  byId('ykt-ai-api-key-clear').click();
  byId('ykt-ai-ocr-api-key-clear').click();
  byId('ykt-ai-translate-api-key-clear').click();

  assert.equal(ui.config.ai.profiles[0].apiKey, 'PROFILE_DOM_SECRET');
  assert.equal(ui.config.ai.ocrApiKey, 'OCR_DOM_SECRET');
  assert.equal(ui.config.ai.translateApiKey, 'TRANSLATE_DOM_SECRET');

  byId('ykt-btn-settings-save').click();
  await flushAsyncHandler();

  assert.equal(ui.config.ai.profiles[0].apiKey, '');
  assert.equal(ui.config.ai.ocrApiKey, '');
  assert.equal(ui.config.ai.translateApiKey, '');
});

test.after(async () => {
  await screenWakeLock.dispose();
  restoreTemplateMaterializer();
  for (const name of ['GM_getValue', 'GM_setValue', 'GM_deleteValue']) {
    delete globalThis[name];
    delete window[name];
  }
  uninstallBrowserGlobals();
});
