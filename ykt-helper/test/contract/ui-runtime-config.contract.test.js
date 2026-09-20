import assert from 'node:assert/strict';
import test from 'node:test';
import { installBrowserGlobals, uninstallBrowserGlobals } from '../support/browser-harness.js';

const prefix = 'ykt-helper:';
installBrowserGlobals({
  href: 'https://www.yuketang.cn/v2/web/index',
  storage: {
    [`${prefix}config`]: JSON.stringify({
      autoAnswer: true,
      autoRecoverExpired: true,
      ai: {
        model: 'custom-model',
        kimiApiKey: 'new-inline-key',
        profiles: [{
          id: 'new',
          name: 'New',
          baseUrl: 'https://new.example/v1/chat/completions',
          apiKey: 'new-key',
          model: 'custom-model',
          visionModel: 'custom-vision',
        }],
        activeProfileId: 'new',
      },
    }),
    [`${prefix}kimiApiKey`]: JSON.stringify('legacy-key'),
  },
});

const { storage } = await import('../../src/core/storage.js');
const normalized = storage.get('config', {});
const { ui } = await import('../../src/ui/ui-api.js');

test.after(() => uninstallBrowserGlobals());

test('ui runtime config preserves the normalized storage contract before settings mount', () => {
  for (const key of [
    'autoJoinEnabled',
    'autoAnswerOnAutoJoin',
    'autoAnswer',
    'autoForceRetry',
    'aiAutoAnalyze',
    'autoRecoverUnanswered',
    'autoRecoverExpired',
    'autoScanUnanswered',
    'answerVerification',
    'aiSlidePickPriority',
    'autoFollowDanmu',
    'keepScreenAwake',
    'iftex',
  ]) {
    assert.equal(ui.config[key], normalized[key], `${key} drifted between storage normalization and UI runtime`);
  }

  assert.equal(ui.config.ai.activeProfileId, normalized.ai.activeProfileId);
  assert.equal(ui.config.ai.profiles[0].apiKey, 'new-key');
  assert.equal(ui.config.ai.kimiApiKey, normalized.ai.kimiApiKey);
  assert.equal(ui.config.ai.kimiApiKey, 'new-inline-key');
  assert.equal(ui.config.ai.model, 'custom-model');
  assert.equal(ui.config.autoAnswer, true);
  assert.equal(ui.config.autoRecoverExpired, true);
});

test('legacy standalone key cannot replace explicit modern AI credentials', () => {
  assert.equal(ui.config.ai.profiles[0].apiKey, 'new-key');
  assert.equal(ui.config.ai.kimiApiKey, 'new-inline-key');
  assert.equal(ui.config.ai.activeProfileId, 'new');
});
