import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import { normalizeRuntimeConfig } from '../../src/core/config-normalization.js';

function p(id, apiKey = '') {
  return { id, name: id, baseUrl: `https://${id}.example/v1/chat/completions`, apiKey, model: `${id}-text`, visionModel: `${id}-vision`, temperature: '' };
}

test('defaults are deep-cloned and contain an authoritative ai profile list', () => {
  const cfg = normalizeRuntimeConfig({});
  assert.ok(Array.isArray(cfg.ai.profiles));
  assert.ok(cfg.ai.profiles.length >= 1);
  assert.equal(cfg.ai.activeProfileId, cfg.ai.profiles[0].id);
  cfg.ai.profiles[0].name = 'mutated';
  assert.notEqual(DEFAULT_CONFIG.profiles[0].name, 'mutated');
});

test('new-format ai.profiles wins over legacy top-level profiles', () => {
  const cfg = normalizeRuntimeConfig({
    profiles: [p('legacy', 'legacy-key')],
    activeProfileId: 'legacy',
    ai: { profiles: [p('new', 'new-key')], activeProfileId: 'new' },
  });
  assert.deepEqual(cfg.ai.profiles.map(x => x.id), ['new']);
  assert.equal(cfg.ai.activeProfileId, 'new');
  assert.equal(cfg.ai.profiles[0].apiKey, 'new-key');
});

test('legacy top-level profiles migrate into ai without opening settings UI', () => {
  const cfg = normalizeRuntimeConfig({ profiles: [p('legacy', 'k')], activeProfileId: 'legacy' });
  assert.equal(cfg.ai.profiles[0].id, 'legacy');
  assert.equal(cfg.ai.profiles[0].apiKey, 'k');
  assert.equal(cfg.ai.activeProfileId, 'legacy');
});

test('legacy activeProfileId falling outside list falls back to first profile', () => {
  const cfg = normalizeRuntimeConfig({ profiles: [p('a', 'ka'), p('b', 'kb')], activeProfileId: 'missing' });
  assert.equal(cfg.ai.activeProfileId, 'a');
});

test('legacy standalone kimi key populates first profile when no profile has a key', () => {
  const cfg = normalizeRuntimeConfig({}, { legacyKimiApiKey: 'legacy-key' });
  assert.equal(cfg.ai.profiles[0].apiKey, 'legacy-key');
  assert.equal(cfg.ai.kimiApiKey, 'legacy-key');
});

test('legacy kimi key does not overwrite an explicitly configured profile key', () => {
  const cfg = normalizeRuntimeConfig({ ai: { profiles: [p('a', 'explicit')], activeProfileId: 'a' } }, { legacyKimiApiKey: 'legacy-key' });
  assert.equal(cfg.ai.profiles[0].apiKey, 'explicit');
});

test('ai.kimiApiKey migrates into profile when profile list is absent', () => {
  const cfg = normalizeRuntimeConfig({ ai: { kimiApiKey: 'inside-ai' } });
  assert.equal(cfg.ai.profiles[0].apiKey, 'inside-ai');
});

test('nested ai defaults survive a partial persisted ai object', () => {
  const cfg = normalizeRuntimeConfig({ ai: { model: 'custom-model' } });
  assert.equal(cfg.ai.model, 'custom-model');
  assert.equal(cfg.ai.ocrApi, DEFAULT_CONFIG.ai.ocrApi);
  assert.equal(cfg.ai.translateApi, DEFAULT_CONFIG.ai.translateApi);
  assert.equal(cfg.ai.maxTokens, DEFAULT_CONFIG.ai.maxTokens);
});

test('top-level defaults survive partial persisted config', () => {
  const cfg = normalizeRuntimeConfig({ autoAnswer: true });
  assert.equal(cfg.autoAnswer, true);
  assert.equal(cfg.autoAnswerDelay, DEFAULT_CONFIG.autoAnswerDelay);
  assert.equal(cfg.autoAnswerRandomDelay, DEFAULT_CONFIG.autoAnswerRandomDelay);
  assert.equal(cfg.keepScreenAwake, DEFAULT_CONFIG.keepScreenAwake);
});

test('multiple profiles and active selection are preserved exactly', () => {
  const cfg = normalizeRuntimeConfig({ ai: { profiles: [p('a', 'ka'), p('b', 'kb'), p('c', 'kc')], activeProfileId: 'b' } });
  assert.deepEqual(cfg.ai.profiles.map(x => x.id), ['a', 'b', 'c']);
  assert.equal(cfg.ai.activeProfileId, 'b');
  assert.equal(cfg.ai.profiles.find(x => x.id === 'b').apiKey, 'kb');
});

test('legacy mirrors stay synchronized with authoritative ai profile state', () => {
  const cfg = normalizeRuntimeConfig({ ai: { profiles: [p('x', 'kx')], activeProfileId: 'x' } });
  assert.deepEqual(cfg.profiles, cfg.ai.profiles);
  assert.equal(cfg.activeProfileId, cfg.ai.activeProfileId);
  assert.notEqual(cfg.profiles, cfg.ai.profiles);
});

test('invalid saved config value does not crash normalization', () => {
  for (const value of [null, undefined, false, 0, 'bad']) {
    const cfg = normalizeRuntimeConfig(value);
    assert.ok(cfg.ai);
    assert.ok(Array.isArray(cfg.ai.profiles));
  }
});
