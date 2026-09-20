import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStorage } from '../support/browser-harness.js';
import { StorageManager } from '../../src/core/storage.js';

function withStorage(entries, fn) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage(entries);
  try { return fn(); } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createPrivateStore(entries = {}) {
  const values = new Map(Object.entries(entries).map(([key, value]) => [key, clone(value)]));
  return {
    available: () => true,
    get(key, dv = null) {
      return values.has(key) ? clone(values.get(key)) : dv;
    },
    set(key, value) {
      values.set(key, clone(value));
      return true;
    },
    remove(key) {
      values.delete(key);
      return true;
    },
  };
}

const prefix = 'ykt-helper:';

test('legacy top-level profile is available under ai immediately after storage read', () => withStorage({
  [`${prefix}config`]: JSON.stringify({
    profiles: [{ id: 'legacy', name: 'Legacy', baseUrl: 'https://example.test', apiKey: 'secret', model: 'm', visionModel: 'v' }],
    activeProfileId: 'legacy',
    autoAnswer: true,
  }),
}, () => {
  const storage = new StorageManager(prefix);
  const cfg = storage.get('config', {});
  assert.equal(cfg.autoAnswer, true);
  assert.equal(cfg.ai.activeProfileId, 'legacy');
  assert.equal(cfg.ai.profiles[0].apiKey, 'secret');
}));

test('new ai profile remains authoritative when legacy mirrors disagree', () => withStorage({
  [`${prefix}config`]: JSON.stringify({
    profiles: [{ id: 'old', apiKey: 'old' }],
    activeProfileId: 'old',
    ai: {
      profiles: [{ id: 'new', name: 'New', baseUrl: 'https://new.test', apiKey: 'new-key', model: 'm', visionModel: 'v' }],
      activeProfileId: 'new',
    },
  }),
}, () => {
  const cfg = new StorageManager(prefix).get('config', {});
  assert.equal(cfg.ai.activeProfileId, 'new');
  assert.equal(cfg.ai.profiles[0].apiKey, 'new-key');
}));

test('separate legacy kimiApiKey is visible to runtime without settings panel mount', () => withStorage({
  [`${prefix}config`]: JSON.stringify({ autoAnswer: true }),
  [`${prefix}kimiApiKey`]: JSON.stringify('legacy-kimi-key'),
}, () => {
  const cfg = new StorageManager(prefix).get('config', {});
  assert.equal(cfg.ai.kimiApiKey, 'legacy-kimi-key');
  assert.equal(cfg.ai.profiles[0].apiKey, 'legacy-kimi-key');
}));

test('partial persisted ai config keeps all nested defaults after storage read', () => withStorage({
  [`${prefix}config`]: JSON.stringify({ ai: { model: 'custom' } }),
}, () => {
  const cfg = new StorageManager(prefix).get('config', {});
  assert.equal(cfg.ai.model, 'custom');
  assert.equal(typeof cfg.ai.ocrApi, 'string');
  assert.equal(typeof cfg.ai.translateApi, 'string');
  assert.ok(Array.isArray(cfg.ai.profiles));
}));

test('malformed persisted JSON falls back to a complete normalized config', () => withStorage({
  [`${prefix}config`]: '{bad json',
}, () => {
  const cfg = new StorageManager(prefix).get('config', {});
  assert.equal(typeof cfg.autoAnswer, 'boolean');
  assert.ok(cfg.ai);
  assert.ok(cfg.ai.profiles.length >= 1);
}));

test('non-config storage keys keep ordinary StorageManager semantics', () => withStorage({
  [`${prefix}other`]: JSON.stringify({ x: 1 }),
}, () => {
  const storage = new StorageManager(prefix);
  assert.deepEqual(storage.get('other'), { x: 1 });
  assert.equal(storage.get('missing', 42), 42);
}));

test('saving config stores AI secrets privately and keeps localStorage sanitized', () => withStorage({}, () => {
  const privateStore = createPrivateStore();
  const storage = new StorageManager(prefix, { privateStore });
  storage.set('config', {
    autoAnswer: true,
    ai: {
      activeProfileId: 'p1',
      kimiApiKey: 'legacy-secret',
      apiKey: 'legacy-api-secret',
      ocrApiKey: 'ocr-secret',
      translateApiKey: 'translate-secret',
      profiles: [
        { id: 'p1', name: 'Primary', baseUrl: 'https://example.test', apiKey: 'profile-secret', model: 'm' },
      ],
    },
    profiles: [
      { id: 'p1', name: 'Primary', baseUrl: 'https://example.test', apiKey: 'profile-secret', model: 'm' },
    ],
  });

  const persistedText = globalThis.localStorage.getItem(`${prefix}config`);
  assert.ok(persistedText);
  for (const secret of ['legacy-secret', 'legacy-api-secret', 'ocr-secret', 'translate-secret', 'profile-secret']) {
    assert.equal(persistedText.includes(secret), false, `localStorage leaked ${secret}`);
  }

  const reloaded = new StorageManager(prefix, { privateStore }).get('config', {});
  assert.equal(reloaded.ai.profiles[0].apiKey, 'profile-secret');
  assert.equal(reloaded.ai.ocrApiKey, 'ocr-secret');
  assert.equal(reloaded.ai.translateApiKey, 'translate-secret');
}));

test('legacy localStorage secrets migrate to private storage before local copies are scrubbed', () => withStorage({
  [`${prefix}config`]: JSON.stringify({
    ai: {
      activeProfileId: 'p1',
      kimiApiKey: 'legacy-in-config',
      ocrApiKey: 'legacy-ocr',
      translateApiKey: 'legacy-translate',
      profiles: [{ id: 'p1', apiKey: 'legacy-profile', model: 'm' }],
    },
  }),
  [`${prefix}kimiApiKey`]: JSON.stringify('legacy-separate'),
}, () => {
  const privateStore = createPrivateStore();
  const firstRead = new StorageManager(prefix, { privateStore }).get('config', {});
  assert.equal(firstRead.ai.profiles[0].apiKey, 'legacy-profile');
  assert.equal(firstRead.ai.ocrApiKey, 'legacy-ocr');
  assert.equal(firstRead.ai.translateApiKey, 'legacy-translate');

  const persistedText = globalThis.localStorage.getItem(`${prefix}config`);
  for (const secret of ['legacy-in-config', 'legacy-ocr', 'legacy-translate', 'legacy-profile']) {
    assert.equal(persistedText.includes(secret), false, `migration left ${secret} in config localStorage`);
  }
  assert.equal(globalThis.localStorage.getItem(`${prefix}kimiApiKey`), null);

  const secondRead = new StorageManager(prefix, { privateStore }).get('config', {});
  assert.equal(secondRead.ai.profiles[0].apiKey, 'legacy-profile');
  assert.equal(secondRead.ai.ocrApiKey, 'legacy-ocr');
  assert.equal(secondRead.ai.translateApiKey, 'legacy-translate');
}));

test('failed private migration never deletes the only local copy of a legacy secret', () => withStorage({
  [`${prefix}config`]: JSON.stringify({
    ai: { profiles: [{ id: 'p1', apiKey: 'must-survive' }], activeProfileId: 'p1' },
  }),
  [`${prefix}kimiApiKey`]: JSON.stringify('must-also-survive'),
}, () => {
  const privateStore = {
    available: () => true,
    get: (_key, dv = null) => dv,
    set: () => { throw new Error('private store unavailable'); },
    remove: () => true,
  };
  const cfg = new StorageManager(prefix, { privateStore }).get('config', {});
  assert.equal(cfg.ai.profiles[0].apiKey, 'must-survive');
  assert.match(globalThis.localStorage.getItem(`${prefix}config`), /must-survive/);
  assert.match(globalThis.localStorage.getItem(`${prefix}kimiApiKey`), /must-also-survive/);
}));


test('secret-bearing config fails closed when userscript private storage is unavailable', () => {
  const local = new Map();
  globalThis.localStorage = {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, String(value)); },
    removeItem(key) { local.delete(key); },
  };

  const privateStore = {
    available: () => false,
    get: () => null,
    set: () => false,
    remove: () => false,
  };

  const manager = new StorageManager('secure:', { privateStore });
  const config = {
    ai: {
      profiles: [{ id: 'p1', apiKey: 'PROFILE_TEST_SECRET' }],
      activeProfileId: 'p1',
      ocrApiKey: 'OCR_TEST_SECRET',
      translateApiKey: 'TRANSLATE_TEST_SECRET',
    },
  };

  assert.throws(() => manager.set('config', config), /private.*storage|私有.*存储/i);
  assert.equal(local.has('secure:config'), false);
});

test('legacy kimiApiKey fails closed when userscript private storage is unavailable', () => {
  const local = new Map();
  globalThis.localStorage = {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, String(value)); },
    removeItem(key) { local.delete(key); },
  };

  const privateStore = {
    available: () => false,
    get: () => null,
    set: () => false,
    remove: () => false,
  };

  const manager = new StorageManager('secure:', { privateStore });
  assert.throws(() => manager.set('kimiApiKey', 'LEGACY_TEST_SECRET'), /private.*storage|私有.*存储/i);
  assert.equal(local.has('secure:kimiApiKey'), false);
});


test('private profile key is not hydrated into a page-tampered endpoint', () => withStorage({
  [`${prefix}config`]: JSON.stringify({
    ai: {
      activeProfileId: 'p1',
      profiles: [{ id: 'p1', baseUrl: 'https://attacker.example/v1/chat/completions', apiKey: '', model: 'm' }],
    },
  }),
}, () => {
  const privateStore = createPrivateStore({
    [`${prefix}private-secrets:v1`]: {
      version: 1,
      profileApiKeys: { p1: 'PRIVATE_PROFILE_SECRET' },
      ocrApiKey: '',
      translateApiKey: '',
      legacyKimiApiKey: '',
    },
  });
  const cfg = new StorageManager(prefix, { privateStore }).get('config', {});
  const p = cfg.ai.profiles.find(x => x.id === 'p1');
  assert.notEqual(`${p.baseUrl}|${p.apiKey}`, 'https://attacker.example/v1/chat/completions|PRIVATE_PROFILE_SECRET');
}));


test('private profile endpoint binding overrides page-visible endpoint tampering', () => withStorage({}, () => {
  const privateStore = createPrivateStore();
  const manager = new StorageManager(prefix, { privateStore });
  manager.set('config', {
    ai: {
      activeProfileId: 'p1',
      profiles: [{
        id: 'p1',
        name: 'Primary',
        baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
        apiKey: 'PRIVATE_PROFILE_KEY',
        model: 'm',
        visionModel: 'v',
      }],
    },
  });

  const persisted = JSON.parse(globalThis.localStorage.getItem(`${prefix}config`));
  persisted.ai.profiles[0].baseUrl = 'https://attacker.example/v1/chat/completions';
  globalThis.localStorage.setItem(`${prefix}config`, JSON.stringify(persisted));

  const reloaded = new StorageManager(prefix, { privateStore }).get('config', {});
  assert.equal(reloaded.ai.profiles[0].baseUrl, 'https://api.moonshot.cn/v1/chat/completions');
  assert.equal(reloaded.ai.profiles[0].apiKey, 'PRIVATE_PROFILE_KEY');
  assert.equal(reloaded.ai.apiKey, 'PRIVATE_PROFILE_KEY');
}));

test('private OCR and translation endpoints override page-visible endpoint tampering', () => withStorage({}, () => {
  const privateStore = createPrivateStore();
  const manager = new StorageManager(prefix, { privateStore });
  manager.set('config', {
    ai: {
      activeProfileId: 'p1',
      profiles: [{
        id: 'p1',
        baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
        apiKey: 'PROFILE_KEY',
        model: 'm',
      }],
      ocrApi: 'https://ocr.example.test/v1/chat/completions',
      ocrApiKey: 'OCR_PRIVATE_KEY',
      translateApi: 'https://translate.example.test/v1/chat/completions',
      translateApiKey: 'TRANSLATE_PRIVATE_KEY',
    },
  });

  const persisted = JSON.parse(globalThis.localStorage.getItem(`${prefix}config`));
  persisted.ai.ocrApi = 'https://attacker.example/ocr';
  persisted.ai.translateApi = 'https://attacker.example/translate';
  globalThis.localStorage.setItem(`${prefix}config`, JSON.stringify(persisted));

  const reloaded = new StorageManager(prefix, { privateStore }).get('config', {});
  assert.equal(reloaded.ai.ocrApi, 'https://ocr.example.test/v1/chat/completions');
  assert.equal(reloaded.ai.ocrApiKey, 'OCR_PRIVATE_KEY');
  assert.equal(reloaded.ai.translateApi, 'https://translate.example.test/v1/chat/completions');
  assert.equal(reloaded.ai.translateApiKey, 'TRANSLATE_PRIVATE_KEY');
}));
