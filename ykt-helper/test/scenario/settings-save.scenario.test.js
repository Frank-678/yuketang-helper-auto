import assert from 'node:assert/strict';
import test from 'node:test';
import settingsHtml from '../../src/ui/panels/settings.html';
import {
  createFakeElement,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';
import { installTemplateMaterializer } from '../support/html-form-harness.js';

const { window, document, localStorage } = installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/settings-contract',
});

let wakeRequests = 0;
let wakeReleases = 0;
let wakeReleaseListener = null;
window.navigator.wakeLock = {
  async request(kind) {
    assert.equal(kind, 'screen');
    wakeRequests += 1;
    return {
      released: false,
      addEventListener(type, listener) {
        if (type === 'release') wakeReleaseListener = listener;
      },
      async release() {
        if (this.released) return;
        this.released = true;
        wakeReleases += 1;
        wakeReleaseListener?.();
      },
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

let configChangedEvents = 0;
const { onInternalEvent } = await import('../../src/core/internal-events.js');
onInternalEvent('auto-answer-config-changed', () => { configChangedEvents += 1; });

const { ui } = await import('../../src/ui/ui-api.js');
const { mountSettingsPanel } = await import('../../src/ui/panels/settings.js');
const { screenWakeLock } = await import('../../src/core/screen-wake-lock.js');

const toasts = [];
ui.toast = message => toasts.push(String(message));

const root = mountSettingsPanel();
assert.ok(root, 'real settings panel should mount from the production template');

const byId = id => {
  const element = document.getElementById(id);
  assert.ok(element, `missing real settings control #${id}`);
  return element;
};

function setChecked(id, value) { byId(id).checked = !!value; }
function setValue(id, value) { byId(id).value = String(value); }
async function flushAsyncHandler() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}

test('real settings save persists toggles and immediately applies runtime side effects', async () => {
  setChecked('ykt-input-auto-join', true);
  setChecked('ykt-input-auto-join-auto-answer', false);
  setChecked('ykt-input-auto-answer', true);
  setChecked('ykt-input-auto-force-retry', true);
  setChecked('ykt-input-ai-auto-analyze', true);
  setChecked('ykt-input-auto-recover-unanswered', true);
  setChecked('ykt-input-auto-recover-expired', true);
  setChecked('ykt-input-auto-scan-unanswered', true);
  setChecked('ykt-input-answer-verification', true);
  setChecked('ykt-ai-pick-main-first', false);
  setChecked('ykt-input-auto-follow-danmu', true);
  setChecked('ykt-input-keep-screen-awake', true);
  setChecked('ykt-ui-tex', false);

  setValue('ykt-input-answer-delay', 7);
  setValue('ykt-input-random-delay', 2);
  setValue('ykt-input-answer-priority-times', '10:00, 14:30');
  setValue('ykt-input-verification-delay', 3);
  setValue('ykt-input-notify-duration', 9);
  setValue('ykt-input-notify-volume', 35);

  byId('ykt-btn-settings-save').click();
  await flushAsyncHandler();

  assert.equal(ui.config.autoJoinEnabled, true);
  assert.equal(ui.config.autoAnswerOnAutoJoin, false);
  assert.equal(ui.config.autoAnswer, true);
  assert.equal(ui.config.autoForceRetry, true);
  assert.equal(ui.config.aiAutoAnalyze, true);
  assert.equal(ui.config.autoRecoverUnanswered, true);
  assert.equal(ui.config.autoRecoverExpired, true);
  assert.equal(ui.config.autoScanUnanswered, true);
  assert.equal(ui.config.answerVerification, true);
  assert.equal(ui.config.aiSlidePickPriority, false);
  assert.equal(ui.config.autoFollowDanmu, true);
  assert.equal(ui.config.keepScreenAwake, true);
  assert.equal(ui.config.iftex, false);
  assert.equal(ui.config.autoAnswerDelay, 7000);
  assert.equal(ui.config.autoAnswerRandomDelay, 2000);
  assert.deepEqual(ui.config.answerPriorityWindows, [{ at: '10:00' }, { at: '14:30' }]);
  assert.equal(ui.config.answerVerificationDelay, 3000);
  assert.equal(ui.config.notifyPopupDuration, 9000);
  assert.equal(ui.config.notifyVolume, 0.35);

  const persisted = JSON.parse(localStorage.getItem('ykt-helper:config'));
  assert.equal(persisted.autoAnswer, true);
  assert.equal(persisted.autoJoinEnabled, true);
  assert.equal(persisted.autoAnswerOnAutoJoin, false);
  assert.equal(persisted.aiAutoAnalyze, true);
  assert.equal(persisted.aiSlidePickPriority, false);
  assert.equal(persisted.keepScreenAwake, true);
  assert.equal(configChangedEvents, 1);
  assert.equal(wakeRequests, 1);
  assert.equal(screenWakeLock.getState().enabled, true);
  assert.equal(screenWakeLock.getState().active, true);
  assert.equal(byId('ykt-btn-auto-answer').classList.contains('active'), true);
  assert.ok(toasts.some(message => message.includes('设置已保存')));

  // Verify the off-path as well: persisted false must not be lost to truthiness,
  // and an active wake-lock sentinel must be released immediately.
  setChecked('ykt-input-auto-answer', false);
  setChecked('ykt-input-keep-screen-awake', false);
  setChecked('ykt-input-ai-auto-analyze', false);
  setChecked('ykt-input-auto-join', false);
  byId('ykt-btn-settings-save').click();
  await flushAsyncHandler();

  const persistedOff = JSON.parse(localStorage.getItem('ykt-helper:config'));
  assert.equal(ui.config.autoAnswer, false);
  assert.equal(ui.config.keepScreenAwake, false);
  assert.equal(ui.config.aiAutoAnalyze, false);
  assert.equal(ui.config.autoJoinEnabled, false);
  assert.equal(persistedOff.autoAnswer, false);
  assert.equal(persistedOff.keepScreenAwake, false);
  assert.equal(persistedOff.aiAutoAnalyze, false);
  assert.equal(persistedOff.autoJoinEnabled, false);
  assert.equal(configChangedEvents, 2);
  assert.equal(wakeRequests, 1, 'disabling must not acquire a second wake lock');
  assert.equal(wakeReleases, 1);
  assert.equal(screenWakeLock.getState().enabled, false);
  assert.equal(screenWakeLock.getState().active, false);
  assert.equal(byId('ykt-btn-auto-answer').classList.contains('active'), false);
});


test('synthetic settings save cannot mutate persisted security-sensitive configuration', async () => {
  const beforeConfig = JSON.stringify(ui.config);
  const beforePersisted = localStorage.getItem('ykt-helper:config');

  setValue('ykt-ai-base-url', 'https://attacker.example/v1/chat/completions');
  setChecked('ykt-input-auto-answer', true);

  byId('ykt-btn-settings-save').dispatchEvent({
    type: 'click',
    isTrusted: false,
    target: byId('ykt-btn-settings-save'),
    currentTarget: byId('ykt-btn-settings-save'),
    preventDefault() {},
  });
  await flushAsyncHandler();

  assert.equal(JSON.stringify(ui.config), beforeConfig);
  assert.equal(localStorage.getItem('ykt-helper:config'), beforePersisted);
});

test('settings persistence failure rolls back changes and reports failure', async () => {
  const profile = ui.config.ai.profiles[0];
  const originalKey = profile.apiKey;
  const originalPersisted = localStorage.getItem('ykt-helper:config');
  const originalEvents = configChangedEvents;
  profile.apiKey = 'TEST_PRIVATE_STORAGE_FAILURE_KEY';
  const expectedConfig = JSON.stringify(ui.config);

  try {
    setChecked('ykt-input-auto-answer', !ui.config.autoAnswer);
    byId('ykt-btn-settings-save').click();
    await flushAsyncHandler();

    assert.equal(JSON.stringify(ui.config), expectedConfig);
    assert.equal(localStorage.getItem('ykt-helper:config'), originalPersisted);
    assert.equal(configChangedEvents, originalEvents);
    assert.ok(toasts.some(message => message.includes('设置保存失败')));
  } finally {
    ui.config.ai.profiles[0].apiKey = originalKey;
    profile.apiKey = originalKey;
  }
});

test('custom audio persistence failure restores the previous configuration', () => {
  const previousSrc = ui.config.customNotifyAudioSrc;
  const previousName = ui.config.customNotifyAudioName;
  const originalSaveConfig = ui.saveConfig;

  try {
    ui.saveConfig = () => false;
    assert.equal(ui.setCustomNotifyAudio({
      src: 'data:audio/test;base64,ZmFpbHVyZQ==',
      name: 'failed-save.wav',
    }), false);
    assert.equal(ui.config.customNotifyAudioSrc, previousSrc);
    assert.equal(ui.config.customNotifyAudioName, previousName);
  } finally {
    ui.saveConfig = originalSaveConfig;
  }
});

test.after(async () => {
  await screenWakeLock.dispose();
  restoreTemplateMaterializer();
  uninstallBrowserGlobals();
});
