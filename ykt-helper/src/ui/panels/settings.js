// settings.js (new version)
import tpl from './settings.html';
import { ui } from '../ui-context.js';
import { DEFAULT_CONFIG } from '../../core/types.js';
import { storage } from '../../core/storage.js';
import { screenWakeLock } from '../../core/screen-wake-lock.js';
import { trustedUiHandler } from '../../core/trusted-ui-event.js';
import { applyProfileForm, readReminderForm, syncReminderForm } from '../../core/settings-form.js';

let mounted = false;
let root;
let syncMountedForm = () => {};

// ---- AI Profile helpers ----
function ensureAIProfiles(configAI) {
  if (!configAI) return;

  // 只有 kimiApiKey 时创建第一个 profile
  if (!Array.isArray(configAI.profiles) || configAI.profiles.length === 0) {
    const legacyKey = configAI.kimiApiKey || configAI.apiKey || storage.get('kimiApiKey') || '';
    configAI.profiles = [
      {
        id: 'default',
        name: 'Kimi',
        baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
        apiKey: legacyKey,
        model: 'moonshot-v1-8k',
        visionModel: 'moonshot-v1-8k-vision-preview',
        temperature: '',
      },
    ];
    configAI.activeProfileId = 'default';
  }

  if (!configAI.activeProfileId) {
    configAI.activeProfileId = configAI.profiles[0].id;
  }
}

function getActiveProfile(configAI) {
  ensureAIProfiles(configAI);
  const list = configAI.profiles;
  const id = configAI.activeProfileId;
  return list.find(p => p.id === id) || list[0];
}

function parsePriorityTimes(value) {
  const raw = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (!raw.length) return [];

  const windows = [];
  for (const time of raw) {
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    windows.push({ at: `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` });
  }
  return windows;
}

// ------------------------------

export function mountSettingsPanel() {
  if (mounted) return root;

  // 注入 HTML
  root = document.createElement('div');
  root.innerHTML = tpl;
  document.body.appendChild(root.firstElementChild);
  root = document.getElementById('ykt-settings-panel');

  const aiCfg = ui.config.ai || (ui.config.ai = {});
  ensureAIProfiles(aiCfg);

  // === 获取所有 AI Profile 相关的 DOM ===
  const $profileSelect = root.querySelector('#ykt-ai-profile-select');
  const $profileAdd = root.querySelector('#ykt-ai-profile-add');
  const $profileDel = root.querySelector('#ykt-ai-profile-del');

  const $profileName = root.querySelector('#ykt-ai-profile-name');
  const $baseUrl = root.querySelector('#ykt-ai-base-url');
  const $api = root.querySelector('#kimi-api-key');
  const $apiClear = root.querySelector('#ykt-ai-api-key-clear');
  const $model = root.querySelector('#ykt-ai-model');
  const $visionModel = root.querySelector('#ykt-ai-vision-model');
  const $temperature = root.querySelector('#ykt-ai-temperature');
  const $ocrApi = root.querySelector('#ykt-ai-ocr-api');
  const $ocrApiKey = root.querySelector('#ykt-ai-ocr-api-key');
  const $ocrApiKeyClear = root.querySelector('#ykt-ai-ocr-api-key-clear');
  const $translateApi = root.querySelector('#ykt-ai-translate-api');
  const $translateApiKey = root.querySelector('#ykt-ai-translate-api-key');
  const $translateApiKeyClear = root.querySelector('#ykt-ai-translate-api-key-clear');
  const $translateModel = root.querySelector('#ykt-ai-translate-model');

  // === 其他 UI 原有字段 ===
  const $auto = root.querySelector('#ykt-input-auto-answer');
  const $autoJoin = root.querySelector('#ykt-input-auto-join');
  const $autoJoinAutoAnswer = root.querySelector('#ykt-input-auto-join-auto-answer');
  const $autoAnalyze = root.querySelector('#ykt-input-ai-auto-analyze');
  const $autoRecoverUnanswered = root.querySelector('#ykt-input-auto-recover-unanswered');
  const $autoRecoverExpired = root.querySelector('#ykt-input-auto-recover-expired');
  const $autoScanUnanswered = root.querySelector('#ykt-input-auto-scan-unanswered');
  const $autoForceRetry = root.querySelector('#ykt-input-auto-force-retry');
  const $delay = root.querySelector('#ykt-input-answer-delay');
  const $rand = root.querySelector('#ykt-input-random-delay');
  const $answerPriorityTimes = root.querySelector('#ykt-input-answer-priority-times');
  const $fastAnswerProfile = root.querySelector('#ykt-ai-fast-profile');
  const $answerVerification = root.querySelector('#ykt-input-answer-verification');
  const $verifyAnswerProfile = root.querySelector('#ykt-ai-verify-profile');
  const $verificationDelay = root.querySelector('#ykt-input-verification-delay');
  const $priority = root.querySelector('#ykt-ai-pick-main-first');
  const $notifyDur = root.querySelector('#ykt-input-notify-duration');
  const $notifyVol = root.querySelector('#ykt-input-notify-volume');
  const $notifyAll = root.querySelector('#ykt-input-notify-all');
  const $notifyProblemStart = root.querySelector('#ykt-input-notify-problem-start');
  const $notifyDanmuRoundStart = root.querySelector('#ykt-input-notify-danmu-round-start');
  const $notifyDanmuFollowTrigger = root.querySelector('#ykt-input-notify-danmu-follow-trigger');
  const $notifyAssessment = root.querySelector('#ykt-input-notify-assessment-publish');
  const $notifyCourseware = root.querySelector('#ykt-input-notify-courseware-publish');
  const $notifyOther = root.querySelector('#ykt-input-notify-other-publish');
  const $notifyLessonFinished = root.querySelector('#ykt-input-notify-lesson-finished');
  const $notifyAutoAnswerScheduled = root.querySelector('#ykt-input-notify-auto-answer-scheduled');
  const $notifyAutoAnswerStarted = root.querySelector('#ykt-input-notify-auto-answer-started');
  const $notifyAutoAnswerSucceeded = root.querySelector('#ykt-input-notify-auto-answer-succeeded');
  const $notifyAutoAnswerFailed = root.querySelector('#ykt-input-notify-auto-answer-failed');
  const $notifyNative = root.querySelector('#ykt-input-notify-native');
  const $notifyPopup = root.querySelector('#ykt-input-notify-popup');
  const $notifySound = root.querySelector('#ykt-input-notify-sound');
  const $autoFollowDanmu = root.querySelector('#ykt-input-auto-follow-danmu');
  const $keepScreenAwake = root.querySelector('#ykt-input-keep-screen-awake');
  const $iftex = root.querySelector('#ykt-ui-tex');

  const $audioFile = root.querySelector('#ykt-input-notify-audio-file');
  const $audioUrl  = root.querySelector('#ykt-input-notify-audio-url');
  const $applyUrl  = root.querySelector('#ykt-btn-apply-audio-url');
  const $preview   = root.querySelector('#ykt-btn-preview-audio');
  const $clear     = root.querySelector('#ykt-btn-clear-audio');
  const $audioName = root.querySelector('#ykt-tip-audio-name');
  const reminderFields = {
    notifyProblems: $notifyAll,
    notifyProblemStarts: $notifyProblemStart,
    notifyDanmuRoundStarts: $notifyDanmuRoundStart,
    notifyDanmuFollowTriggers: $notifyDanmuFollowTrigger,
    notifyAssessmentPublishes: $notifyAssessment,
    notifyCoursewarePublishes: $notifyCourseware,
    notifyOtherPublishes: $notifyOther,
    notifyLessonFinished: $notifyLessonFinished,
    notifyAutoAnswerScheduled: $notifyAutoAnswerScheduled,
    notifyAutoAnswerStarted: $notifyAutoAnswerStarted,
    notifyAutoAnswerSucceeded: $notifyAutoAnswerSucceeded,
    notifyAutoAnswerFailed: $notifyAutoAnswerFailed,
    notifyNative: $notifyNative,
    notifyPopup: $notifyPopup,
    notifySound: $notifySound,
  };

  function syncSecretField(input, hasStoredSecret, emptyPlaceholder) {
    if (!input) return;
    input.value = '';
    input.dataset.clearSecret = 'false';
    input.placeholder = hasStoredSecret
      ? '已安全保存；留空保持不变'
      : emptyPlaceholder;
  }

  function readSecretField(input, existingValue = '') {
    if (!input) return String(existingValue || '');
    if (input.dataset.clearSecret === 'true') return '';
    const entered = String(input.value || '').trim();
    return entered || String(existingValue || '');
  }

  function armSecretClear(input) {
    if (!input) return;
    input.value = '';
    input.dataset.clearSecret = 'true';
    input.placeholder = '保存设置后将清除此 Key';
  }

  function normalizedEndpoint(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try { return new URL(raw, window.location?.origin || location.origin).href; }
    catch { return raw; }
  }

  function endpointChanged(before, after) {
    return normalizedEndpoint(before) !== normalizedEndpoint(after);
  }

  function needsSecretReentry({ currentEndpoint, nextEndpoint, currentSecret, input }) {
    if (!String(currentSecret || '').trim()) return false;
    if (!endpointChanged(currentEndpoint, nextEndpoint)) return false;
    if (input?.dataset?.clearSecret === 'true') return false;
    return !String(input?.value || '').trim();
  }

  // Profile UI
  function refreshProfileSelect() {
    const ai = ui.config.ai;
    $profileSelect.innerHTML = '';
    ai.profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      if (p.id === ai.activeProfileId) opt.selected = true;
      $profileSelect.appendChild(opt);
    });
  }

  function refreshAnswerProfileSelects() {
    const ai = ui.config.ai;
    const configs = [
      [$fastAnswerProfile, '', '不使用快速模型', ui.config.fastAnswerProfileId],
      [$verifyAnswerProfile, '', '不使用复核模型', ui.config.verifyAnswerProfileId],
    ];

    for (const [select, emptyValue, emptyLabel, selectedId] of configs) {
      if (!select) continue;
      select.innerHTML = '';
      const empty = document.createElement('option');
      empty.value = emptyValue;
      empty.textContent = emptyLabel;
      select.appendChild(empty);
      ai.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name || profile.id;
        select.appendChild(option);
      });
      select.value = selectedId || '';
    }
  }

  function loadProfileToForm(profileId) {
    const p = ui.config.ai.profiles.find(x => x.id === profileId);
    if (!p) return;

    ui.config.ai.activeProfileId = p.id;

    $profileName.value = p.name || '';
    $baseUrl.value = p.baseUrl || '';
    syncSecretField($api, !!p.apiKey, '输入当前配置的 API Key');
    $model.value = p.model || '';
    $visionModel.value = p.visionModel || '';
    $temperature.value = p.temperature ?? '';
    $ocrApi.value = ui.config.ai.ocrApi || '';
    syncSecretField($ocrApiKey, !!ui.config.ai.ocrApiKey, '留空则复用当前 AI Profile 的 API Key');
    $translateApi.value = ui.config.ai.translateApi || '';
    syncSecretField($translateApiKey, !!ui.config.ai.translateApiKey, '留空则复用当前 AI Profile 的 API Key');
    $translateModel.value = ui.config.ai.translateModel || '';
  }

  // 初始化 Profile 下拉框
  refreshProfileSelect();
  refreshAnswerProfileSelects();
  loadProfileToForm(ui.config.ai.activeProfileId);

  // 切换 profile
  $profileSelect.addEventListener('change', () => {
    loadProfileToForm($profileSelect.value);
  });

  // 添加 profile
  $profileAdd.addEventListener('click', trustedUiHandler(() => {
    const id = `p_${Date.now().toString(36)}`;
    const newP = {
      id,
      name: 'new api key',
      baseUrl: 'https://api.openai.com/...',
      apiKey: '',
      model: 'gpt-4o-mini',
      visionModel: '',
      temperature: '',
    };
    ui.config.ai.profiles.push(newP);
    ui.config.ai.activeProfileId = id;

    refreshProfileSelect();
    refreshAnswerProfileSelects();
    loadProfileToForm(id);
  }));

  // 删除 profile
  $profileDel.addEventListener('click', trustedUiHandler(() => {
    const ai = ui.config.ai;
    if (ai.profiles.length <= 1) {
      ui.toast('至少保留一个配置', 2500);
      return;
    }
    const id = ai.activeProfileId;
    ai.profiles = ai.profiles.filter(p => p.id !== id);
    ai.activeProfileId = ai.profiles[0].id;

    refreshProfileSelect();
    refreshAnswerProfileSelects();
    loadProfileToForm(ai.activeProfileId);
  }));

  $apiClear?.addEventListener('click', trustedUiHandler(() => armSecretClear($api)));
  $ocrApiKeyClear?.addEventListener('click', trustedUiHandler(() => armSecretClear($ocrApiKey)));
  $translateApiKeyClear?.addEventListener('click', trustedUiHandler(() => armSecretClear($translateApiKey)));

  function syncFormFromConfig() {
    ensureAIProfiles(ui.config.ai || (ui.config.ai = {}));
    refreshProfileSelect();
    refreshAnswerProfileSelects();
    loadProfileToForm(ui.config.ai.activeProfileId);

    $autoJoin.checked = !!ui.config.autoJoinEnabled;
    $autoJoinAutoAnswer.checked = !!ui.config.autoAnswerOnAutoJoin;
    $auto.checked = !!ui.config.autoAnswer;
    $autoForceRetry.checked = !!ui.config.autoForceRetry;
    $autoAnalyze.checked = !!ui.config.aiAutoAnalyze;
    $autoRecoverUnanswered.checked = !!ui.config.autoRecoverUnanswered;
    $autoRecoverExpired.checked = !!ui.config.autoRecoverExpired;
    $autoScanUnanswered.checked = !!ui.config.autoScanUnanswered;
    $iftex.checked = !!ui.config.iftex;
    $delay.value = Math.floor((ui.config.autoAnswerDelay || 3000) / 1000);
    $rand.value = Math.floor((ui.config.autoAnswerRandomDelay || 1500) / 1000);
    $answerPriorityTimes.value = (Array.isArray(ui.config.answerPriorityWindows)
      ? ui.config.answerPriorityWindows
      : [])
      .map(item => typeof item === 'string' ? item : (item?.at || item?.time || ''))
      .filter(Boolean)
      .join(', ');
    $fastAnswerProfile.value = ui.config.fastAnswerProfileId || '';
    $answerVerification.checked = !!ui.config.answerVerification;
    $verifyAnswerProfile.value = ui.config.verifyAnswerProfileId || '';
    $verificationDelay.value = Math.floor((ui.config.answerVerificationDelay || 0) / 1000);
    $priority.checked = ui.config.aiSlidePickPriority !== false;
    $notifyDur.value = Math.floor((ui.config.notifyPopupDuration || 5000) / 1000);
    $notifyVol.value = Math.round(100 * (ui.config.notifyVolume ?? 0.6));
    syncReminderForm(reminderFields, ui.config);
    $autoFollowDanmu.checked = !!ui.config.autoFollowDanmu;
    $keepScreenAwake.checked = !!ui.config.keepScreenAwake;
    $audioName.textContent = ui.config.customNotifyAudioName
      ? `当前：${ui.config.customNotifyAudioName}`
      : '当前：使用内置“叮-咚”提示音';
  }

  syncMountedForm = syncFormFromConfig;
  syncFormFromConfig();

  function captureConfigSnapshot() {
    return JSON.parse(JSON.stringify(ui.config));
  }

  function restoreConfigSnapshot(snapshot) {
    for (const key of Object.keys(ui.config)) delete ui.config[key];
    Object.assign(ui.config, snapshot);
    syncFormFromConfig();
  }

  function reportConfigSaveFailure(snapshot) {
    restoreConfigSnapshot(snapshot);
    ui.toast('设置保存失败；本次修改未应用，请检查 userscript manager 私有存储权限', 5000);
  }

  // 保存设置

  root.querySelector('#ykt-btn-settings-save').addEventListener('click', trustedUiHandler(async () => {
    const previousConfig = captureConfigSnapshot();
    // --- 保存当前 Profile ---
    const ai = ui.config.ai;
    const pid = ai.activeProfileId;
    const p = ai.profiles.find(x => x.id === pid);
    if (!p) {
      ui.toast('当前 AI 配置不存在，请重新选择后保存', 3000);
      return;
    }

    const priorityWindows = parsePriorityTimes($answerPriorityTimes.value);
    if (priorityWindows === null) {
      ui.toast('时间点格式应为 HH:mm，例如 10:00, 14:30', 3000);
      return;
    }

    const nextProfileEndpoint = String($baseUrl.value || '').trim() || p.baseUrl || '';
    const nextOcrEndpoint = String($ocrApi.value || '').trim();
    const nextTranslateEndpoint = String($translateApi.value || '').trim();

    if (needsSecretReentry({
      currentEndpoint: p.baseUrl,
      nextEndpoint: nextProfileEndpoint,
      currentSecret: p.apiKey,
      input: $api,
    })) {
      ui.toast('修改 AI API URL 时必须重新输入 API Key，以确认新的密钥绑定', 4000);
      return;
    }

    if (needsSecretReentry({
      currentEndpoint: ai.ocrApi || p.baseUrl,
      nextEndpoint: nextOcrEndpoint || nextProfileEndpoint,
      currentSecret: ai.ocrApiKey,
      input: $ocrApiKey,
    })) {
      ui.toast('修改 OCR API URL 时必须重新输入 OCR API Key', 4000);
      return;
    }

    if (needsSecretReentry({
      currentEndpoint: ai.translateApi || p.baseUrl,
      nextEndpoint: nextTranslateEndpoint || nextProfileEndpoint,
      currentSecret: ai.translateApiKey,
      input: $translateApiKey,
    })) {
      ui.toast('修改翻译 API URL 时必须重新输入翻译 API Key', 4000);
      return;
    }

    const profileResult = applyProfileForm(p, {
      name: $profileName.value,
      baseUrl: nextProfileEndpoint,
      apiKey: readSecretField($api, p.apiKey),
      model: $model.value,
      visionModel: $visionModel.value,
      temperature: $temperature.value,
    });
    if (!profileResult.ok) {
      ui.toast('Temperature 必须是 0 到 2 之间的数字，或留空', 3000);
      return;
    }

    ai.ocrApi = $ocrApi.value.trim();
    ai.ocrApiKey = readSecretField($ocrApiKey, ai.ocrApiKey);
    ai.translateApi = $translateApi.value.trim();
    ai.translateApiKey = readSecretField($translateApiKey, ai.translateApiKey);
    ai.translateModel = $translateModel.value.trim();
    const curOpt = $profileSelect.querySelector(`option[value="${p.id}"]`);
    if (curOpt) curOpt.textContent = p.name || p.id;

    ai.kimiApiKey = p.apiKey;
    ui.config.autoJoinEnabled = !!$autoJoin.checked;
    ui.config.autoAnswerOnAutoJoin = !!$autoJoinAutoAnswer.checked;
    ui.config.autoAnswer = !!$auto.checked;
    ui.config.autoForceRetry = !!$autoForceRetry.checked;
    ui.config.aiAutoAnalyze = !!$autoAnalyze.checked;
    ui.config.autoRecoverUnanswered = !!$autoRecoverUnanswered.checked;
    ui.config.autoRecoverExpired = !!$autoRecoverExpired.checked;
    ui.config.autoScanUnanswered = !!$autoScanUnanswered.checked;
    ui.config.autoAnswerDelay = Math.max(1000, (+$delay.value || 0) * 1000);
    ui.config.autoAnswerRandomDelay = Math.max(0, (+$rand.value || 0) * 1000);
    ui.config.answerPriorityWindows = priorityWindows;
    ui.config.fastAnswerProfileId = $fastAnswerProfile.value || '';
    ui.config.answerVerification = !!$answerVerification.checked;
    ui.config.verifyAnswerProfileId = $verifyAnswerProfile.value || '';
    ui.config.answerVerificationDelay = Math.max(0, Math.min(60, (+$verificationDelay.value || 0))) * 1000;
    refreshAnswerProfileSelects();
    ui.config.iftex = !!$iftex.checked;
    ui.config.aiSlidePickPriority = !!$priority.checked;
    ui.config.notifyPopupDuration = Math.max(2000, (+$notifyDur.value || 0) * 1000);
    ui.config.notifyVolume = Math.max(0, Math.min(1, (+$notifyVol.value || 60) / 100));
    Object.assign(ui.config, readReminderForm(reminderFields));
    ui.config.autoFollowDanmu = !!$autoFollowDanmu.checked;
    ui.config.keepScreenAwake = !!$keepScreenAwake.checked;

    if (ui.saveConfig() === false) {
      reportConfigSaveFailure(previousConfig);
      return;
    }
    syncSecretField($api, !!p.apiKey, '输入当前配置的 API Key');
    syncSecretField($ocrApiKey, !!ai.ocrApiKey, '留空则复用当前 AI Profile 的 API Key');
    syncSecretField($translateApiKey, !!ai.translateApiKey, '留空则复用当前 AI Profile 的 API Key');
    document.getElementById('ykt-btn-bell')?.classList.toggle('active', ui.config.notifyProblems);
    ui.updateAutoAnswerBtn();
    const wakeLockStatus = await screenWakeLock.setEnabled(ui.config.keepScreenAwake);
    if (ui.config.keepScreenAwake && wakeLockStatus.reason === 'not-classroom') {
      ui.toast('设置已保存；进入课堂页后将尝试保持亮屏', 3000);
    } else if (ui.config.keepScreenAwake && wakeLockStatus.reason === 'unsupported') {
      ui.toast('设置已保存；当前浏览器不支持课堂保持亮屏', 3500);
    } else if (ui.config.keepScreenAwake && wakeLockStatus.reason === 'request-failed') {
      ui.toast('设置已保存；系统未允许保持亮屏，请检查省电模式或浏览器权限', 4000);
    } else {
      ui.toast('设置已保存');
    }
  }));

  //--------------------------------------
  //            重置为默认
  //--------------------------------------

  root.querySelector('#ykt-btn-settings-reset').addEventListener('click', trustedUiHandler(async () => {
    if (!confirm('确定要重置为默认设置吗？')) return;
    const previousConfig = captureConfigSnapshot();

    Object.assign(ui.config, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));

    ensureAIProfiles(ui.config.ai);

    ui.config.autoJoinEnabled = false;
    ui.config.autoAnswerOnAutoJoin = true;
    ui.config.autoRecoverUnanswered = false;
    ui.config.autoRecoverExpired = false;
    ui.config.autoScanUnanswered = false;
    syncFormFromConfig();

    if (ui.saveConfig() === false) {
      reportConfigSaveFailure(previousConfig);
      return;
    }
    document.getElementById('ykt-btn-bell')?.classList.toggle('active', ui.config.notifyProblems);
    ui.updateAutoAnswerBtn();
    await screenWakeLock.setEnabled(false);
    ui.toast('设置已重置');
  }));

  // 音频设置
  const MAX_SIZE = 2 * 1024 * 1024;

  if ($audioFile) {
    $audioFile.addEventListener('change', trustedUiHandler((e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > MAX_SIZE) {
        ui.toast('音频文件过大（>2MB）', 3000);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result;
        if (ui.setCustomNotifyAudio({ src, name: f.name }) === false) {
          ui.toast('设置保存失败，未应用自定义提示音', 4000);
          return;
        }
        $audioName.textContent = `当前：${f.name}`;
        ui._playNotifySound(ui.config.notifyVolume);
        ui.toast('已应用自定义提示音');
      };
      reader.readAsDataURL(f);
    }));
  }

  if ($applyUrl) {
    $applyUrl.addEventListener('click', trustedUiHandler(() => {
      const url = ($audioUrl.value || '').trim();
      if (!url) return ui.toast('请输入音频URL');

      if (!/^https?:\/\/|^data:audio\//i.test(url)) {
        ui.toast('URL 必须以 http/https 或 data:audio/ 开头');
        return;
      }

      if (ui.setCustomNotifyAudio({ src: url, name: '' }) === false) {
        ui.toast('设置保存失败，未应用自定义音频URL', 4000);
        return;
      }
      $audioName.textContent = '当前：（自定义URL）';
      ui._playNotifySound(ui.config.notifyVolume);
      ui.toast('已应用自定义音频URL');
    }));
  }

  if ($preview) {
    $preview.addEventListener('click', trustedUiHandler(() => {
      ui._playNotifySound(ui.config.notifyVolume);
    }));
  }

  if ($clear) {
    $clear.addEventListener('click', trustedUiHandler(() => {
      if (ui.setCustomNotifyAudio({ src: '', name: '' }) === false) {
        ui.toast('设置保存失败，未清除自定义提示音', 4000);
        return;
      }
      $audioName.textContent = '当前：使用内置“叮-咚”提示音';
      ui.toast('已清除自定义音频');
    }));
  }

  // 测试提醒
  const $btnTest = root.querySelector('#ykt-btn-test-notify');
  if ($btnTest) {
    $btnTest.addEventListener('click', trustedUiHandler(() => {
      const mockProblem = {
        problemId: 'TEST-001',
        body: '【测试题】这是一个测试提醒',
        options: [],
      };
      ui.notifyProblem(mockProblem, { thumbnail: null });
    }));
  }

  // 关闭按钮
  root.querySelector('#ykt-settings-close')
      .addEventListener('click', () => showSettingsPanel(false));

  mounted = true;
  return root;
}

export function showSettingsPanel(visible = true) {
  mountSettingsPanel();
  const panel = document.getElementById('ykt-settings-panel');
  if (!panel) return;
  if (visible) syncMountedForm();
  panel.classList.toggle('visible', !!visible);
}

export function toggleSettingsPanel() {
  mountSettingsPanel();
  const panel = document.getElementById('ykt-settings-panel');
  showSettingsPanel(!panel.classList.contains('visible'));
}
