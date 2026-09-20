import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import { normalizeRuntimeConfig } from '../../src/core/config-normalization.js';
import { REMINDER_SETTING_KEYS } from '../../src/core/reminder-preferences.js';

const VISIBLE_BOOLEAN_DEFAULTS = {
  autoJoinEnabled: false,
  autoAnswerOnAutoJoin: true,
  autoAnswer: false,
  autoForceRetry: false,
  aiAutoAnalyze: false,
  autoRecoverUnanswered: false,
  autoRecoverExpired: false,
  autoScanUnanswered: false,
  answerVerification: false,
  aiSlidePickPriority: true,
  autoFollowDanmu: false,
  keepScreenAwake: false,
  iftex: true,
};

test('every visible non-reminder checkbox has an explicit boolean default', () => {
  for (const [key, expected] of Object.entries(VISIBLE_BOOLEAN_DEFAULTS)) {
    assert.equal(typeof DEFAULT_CONFIG[key], 'boolean', `${key} must have an explicit boolean default`);
    assert.equal(DEFAULT_CONFIG[key], expected, `${key} default drifted from the settings contract`);
  }
});

test('every reminder checkbox has an explicit boolean default', () => {
  for (const key of REMINDER_SETTING_KEYS) {
    assert.equal(typeof DEFAULT_CONFIG[key], 'boolean', `${key} must have an explicit boolean default`);
  }
});

test('fresh normalized runtime config uses the same visible-toggle defaults', () => {
  const config = normalizeRuntimeConfig({});
  for (const [key, expected] of Object.entries(VISIBLE_BOOLEAN_DEFAULTS)) {
    assert.equal(config[key], expected, `${key} fresh-runtime default differs from settings reset semantics`);
  }
  for (const key of REMINDER_SETTING_KEYS) {
    assert.equal(config[key], DEFAULT_CONFIG[key], `${key} reminder default differs after normalization`);
  }
});

test('persisted false/true choices survive normalization without truthiness coercion', () => {
  const saved = Object.fromEntries(
    Object.keys(VISIBLE_BOOLEAN_DEFAULTS).map((key, index) => [key, index % 2 === 0]),
  );
  const config = normalizeRuntimeConfig(saved);
  for (const [key, value] of Object.entries(saved)) {
    assert.equal(config[key], value, `${key} persisted boolean was not preserved`);
  }
});
