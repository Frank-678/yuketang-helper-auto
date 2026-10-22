// settings.js (new version)
import tpl from './settings.html';
import { ui } from '../ui-api.js';
import { DEFAULT_CONFIG } from '../../core/types.js';
import { storage } from '../../core/storage.js';
import { screenWakeLock } from '../../core/screen-wake-lock.js';
import { applyProfileForm, readReminderForm, syncReminderForm } from '../../core/settings-form.js';
import { downloadDiagnostics } from '../../core/diagnostics.js';

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

// ------------------------------

export function mountSettingsPanel() {
  if (mounted) return root;

  // 注入 HTML
  root = document.createElement('div');
  root.innerHTML = tpl;
  document.body.appendChild(root.firstElementChild);
  root = document.getElementById('ykt-settings-panel');

  let draftAi = JSON.parse(JSON.stringify(ui.config.ai));
  let formDirty = false;
  root.addEventListener('input', () => { formDirty = true; });
  const aiCfg = draftAi;
  ensureAIProfiles(aiCfg);

  // === 获取所有 AI Profile 相关的 DOM ===
  const $profileSelect = root.querySelector('#ykt-ai-profile-select');
  const $profileAdd = root.querySelector('#ykt-ai-profile-add');
  const $profileDel = root.querySelector('#ykt-ai-profile-del');

  const $profileName = root.querySelector('#ykt-ai-profile-name');
  const $baseUrl = root.querySelector('#ykt-ai-base-url');
  const $api = root.querySelector('#kimi-api-key');
  const $model = root.querySelector('#ykt-ai-model');
  const $visionModel = root.querySelector('#ykt-ai-vision-model');
  const $temperature = root.querySelector('#ykt-ai-temperature');
  const $ocrApi = root.querySelector('#ykt-ai-ocr-api');
  const $ocrApiKey = root.querySelector('#ykt-ai-ocr-api-key');
  const $translateApi = root.querySelector('#ykt-ai-translate-api');
  const $translateApiKey = root.querySelector('#ykt-ai-translate-api-key');
  const $translateModel = root.querySelector('#ykt-ai-translate-model');

  // === 其他 UI 原有字段 ===
  const $submissionPolicy = root.querySelector('#ykt-submission-policy');
  const $quickMode = root.querySelector('#ykt-quick-mode');
  const $quickTimes = root.querySelector('#ykt-quick-times');
  const $fastProfile = root.querySelector('#ykt-fast-profile');
  const $verifyProfile = root.querySelector('#ykt-verify-profile');
  const $verification = root.querySelector('#ykt-answer-verify');
  const $auto = root.querySelector('#ykt-input-auto-answer');
  const $autoJoin = root.querySelector('#ykt-input-auto-join');
  const $autoJoinAutoAnswer = root.querySelector('#ykt-input-auto-join-auto-answer');
  const $autoAnalyze = root.querySelector('#ykt-input-ai-auto-analyze');
  const $delay = root.querySelector('#ykt-input-answer-delay');
  const $rand = root.querySelector('#ykt-input-random-delay');
  const $priority = root.querySelector('#ykt-ai-pick-main-first');
  const $notifyDur = root.querySelector('#ykt-input-notify-duration');
  const $notifyVol = root.querySelector('#ykt-input-notify-volume');
  const $notifyAll = root.querySelector('#ykt-input-notify-all');
  const $notifyProblemStart = root.querySelector('#ykt-input-notify-problem-start');
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

  // Profile UI
  function refreshProfileSelect() {
    const ai = draftAi;
    $profileSelect.innerHTML = '';
    refreshRoleProfiles();
    ai.profiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      if (p.id === ai.activeProfileId) opt.selected = true;
      $profileSelect.appendChild(opt);
    });
  }

  function refreshRoleProfiles() {
    for (const [select, value] of [[$fastProfile, ui.config.fastAnswerProfileId], [$verifyProfile, ui.config.verifyAnswerProfileId]]) {
      const selected = select.value || value || '';
      select.replaceChildren();
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = '不单独指定'; select.appendChild(empty);
      for (const p of draftAi.profiles) { const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name || p.id; select.appendChild(opt); }
      select.value = draftAi.profiles.some(p => p.id === selected) ? selected : '';
    }
  }

  function loadProfileToForm(profileId) {
    const p = draftAi.profiles.find(x => x.id === profileId);
    if (!p) return;

    draftAi.activeProfileId = p.id;

    $profileName.value = p.name || '';
    $baseUrl.value = p.baseUrl || '';
    $api.value = p.apiKey || '';
    $model.value = p.model || '';
    $visionModel.value = p.visionModel || '';
    $temperature.value = p.temperature ?? '';
    $ocrApi.value = draftAi.ocrApi || '';
    $ocrApiKey.value = draftAi.ocrApiKey || '';
    $translateApi.value = draftAi.translateApi || '';
    $translateApiKey.value = draftAi.translateApiKey || '';
    $translateModel.value = draftAi.translateModel || '';
  }

  // 初始化 Profile 下拉框
  refreshProfileSelect();
  loadProfileToForm(draftAi.activeProfileId);

  // 切换 profile
  function retainProfileForm() {
    const current = draftAi.profiles.find(p => p.id === draftAi.activeProfileId);
    if (!current) return true;
    return applyProfileForm(current, { name: $profileName.value, baseUrl: $baseUrl.value, apiKey: $api.value, model: $model.value, visionModel: $visionModel.value, temperature: $temperature.value }).ok;
  }
  $profileSelect.addEventListener('change', () => {
    if (!retainProfileForm()) { $profileSelect.value = draftAi.activeProfileId; ui.toast('请先修正 Temperature'); return; }
    formDirty = true;
    loadProfileToForm($profileSelect.value);
  });

  // 添加 profile
  $profileAdd.addEventListener('click', () => {
    if (!retainProfileForm()) return ui.toast('请先修正 Temperature');
    formDirty = true;
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
    draftAi.profiles.push(newP);
    draftAi.activeProfileId = id;

    refreshProfileSelect();
    loadProfileToForm(id);
  });

  // 删除 profile
  $profileDel.addEventListener('click', () => {
    const ai = draftAi;
    if (ai.profiles.length <= 1) {
      ui.toast('至少保留一个配置', 2500);
      return;
    }
    const id = ai.activeProfileId;
    ai.profiles = ai.profiles.filter(p => p.id !== id);
    ai.activeProfileId = ai.profiles[0].id;

    refreshProfileSelect();
    loadProfileToForm(ai.activeProfileId);
  });

  function syncFormFromConfig() {
    if (formDirty) return;
    draftAi = JSON.parse(JSON.stringify(ui.config.ai));
    ensureAIProfiles(draftAi || (draftAi = {}));
    refreshProfileSelect();
    loadProfileToForm(draftAi.activeProfileId);

    $submissionPolicy.value = ui.config.submissionPolicy || 'auto';
    $quickMode.value = ui.config.quickAnswerMode || 'auto';
    $quickTimes.value = Array.isArray(ui.config.answerPriorityTimes) ? ui.config.answerPriorityTimes.join(', ') : ui.config.answerPriorityTimes || '';
    $fastProfile.value = ui.config.fastAnswerProfileId || '';
    $verifyProfile.value = ui.config.verifyAnswerProfileId || '';
    $verification.checked = !!ui.config.answerVerification;
    $autoJoin.checked = !!ui.config.autoJoinEnabled;
    $autoJoinAutoAnswer.checked = !!ui.config.autoAnswerOnAutoJoin;
    $auto.checked = !!ui.config.autoAnswer;
    $autoAnalyze.checked = !!ui.config.aiAutoAnalyze;
    $iftex.checked = !!ui.config.iftex;
    $delay.value = Math.floor((ui.config.autoAnswerDelay ?? 3000) / 1000);
    $rand.value = Math.floor((ui.config.autoAnswerRandomDelay ?? 1500) / 1000);
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

  // 保存设置

  root.querySelector('#ykt-btn-settings-save').addEventListener('click', async () => {
    const times = $quickTimes.value.split(/[,，\s]+/).filter(Boolean);
    if (times.some(t => !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(t))) return ui.toast('快答时间请使用 HH:MM，例如 10:00, 14:30');
    // --- 保存当前 Profile ---
    const ai = draftAi;
    const pid = ai.activeProfileId;
    const p = ai.profiles.find(x => x.id === pid);
    if (!p) {
      ui.toast('当前 AI 配置不存在，请重新选择后保存', 3000);
      return;
    }

    const profileResult = applyProfileForm(p, {
      name: $profileName.value,
      baseUrl: $baseUrl.value,
      apiKey: $api.value,
      model: $model.value,
      visionModel: $visionModel.value,
      temperature: $temperature.value,
    });
    if (!profileResult.ok) {
      ui.toast('Temperature 必须是 0 到 2 之间的数字，或留空', 3000);
      return;
    }

    ai.ocrApi = $ocrApi.value.trim();
    ai.ocrApiKey = $ocrApiKey.value.trim();
    ai.translateApi = $translateApi.value.trim();
    ai.translateApiKey = $translateApiKey.value.trim();
    ai.translateModel = $translateModel.value.trim();
    const curOpt = $profileSelect.querySelector(`option[value="${p.id}"]`);
    if (curOpt) curOpt.textContent = p.name || p.id;

    ai.kimiApiKey = p.apiKey;

    ui.config.submissionPolicy = $submissionPolicy.value;
    ui.config.quickAnswerMode = $quickMode.value;
    ui.config.answerPriorityTimes = times;
    ui.config.fastAnswerProfileId = $fastProfile.value;
    ui.config.verifyAnswerProfileId = $verifyProfile.value;
    ui.config.answerVerification = $verification.checked;
    ui.config.autoJoinEnabled = !!$autoJoin.checked;
    ui.config.autoAnswerOnAutoJoin = !!$autoJoinAutoAnswer.checked;
    ui.config.autoAnswer = !!$auto.checked;
    ui.config.aiAutoAnalyze = !!$autoAnalyze.checked;
    ui.config.autoAnswerDelay = Math.max(1000, (+$delay.value || 0) * 1000);
    ui.config.autoAnswerRandomDelay = Math.max(0, (+$rand.value || 0) * 1000);
    ui.config.iftex = !!$iftex.checked;
    ui.config.aiSlidePickPriority = !!$priority.checked;
    ui.config.notifyPopupDuration = Math.max(2000, (+$notifyDur.value || 0) * 1000);
    ui.config.notifyVolume = Math.max(0, Math.min(1, ($notifyVol.value === '' ? 60 : +$notifyVol.value) / 100));
    Object.assign(ui.config, readReminderForm(reminderFields));
    ui.config.autoFollowDanmu = !!$autoFollowDanmu.checked;
    ui.config.keepScreenAwake = !!$keepScreenAwake.checked;

    ui.config.ai = JSON.parse(JSON.stringify(draftAi));
    if (!ui.saveConfig()) return;
    formDirty = false;
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
  });

  //--------------------------------------
  //            重置为默认
  //--------------------------------------

  root.querySelector('#ykt-btn-settings-reset').addEventListener('click', async () => {
    if (!confirm('确定要重置为默认设置吗？')) return;

    if (!ui.resetConfig()) return;
    formDirty = false;
    draftAi = JSON.parse(JSON.stringify(ui.config.ai));
    syncFormFromConfig();

    document.getElementById('ykt-btn-bell')?.classList.toggle('active', ui.config.notifyProblems);
    ui.updateAutoAnswerBtn();
    await screenWakeLock.setEnabled(false);
    ui.toast('设置已重置');
  });

  root.querySelector('#ykt-btn-export-diag')?.addEventListener('click', () => {
    downloadDiagnostics({ version: __SCRIPT_VERSION__, autoAnswer: !!ui.config.autoAnswer, autoJoin: !!ui.config.autoJoinEnabled });
    ui.toast('诊断日志已导出');
  });

  // 音频设置
  const MAX_SIZE = 2 * 1024 * 1024;

  if ($audioFile) {
    $audioFile.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > MAX_SIZE) {
        ui.toast('音频文件过大（>2MB）', 3000);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result;
        if (!ui.setCustomNotifyAudio({ src, name: f.name })) return;
        $audioName.textContent = `当前：${f.name}`;
        ui._playNotifySound(ui.config.notifyVolume);
        ui.toast('已应用自定义提示音');
      };
      reader.readAsDataURL(f);
    });
  }

  if ($applyUrl) {
    $applyUrl.addEventListener('click', () => {
      const url = ($audioUrl.value || '').trim();
      if (!url) return ui.toast('请输入音频URL');

      if (!/^https?:\/\/|^data:audio\//i.test(url)) {
        ui.toast('URL 必须以 http/https 或 data:audio/ 开头');
        return;
      }

      if (!ui.setCustomNotifyAudio({ src: url, name: '' })) return;
      $audioName.textContent = '当前：（自定义URL）';
      ui._playNotifySound(ui.config.notifyVolume);
      ui.toast('已应用自定义音频URL');
    });
  }

  if ($preview) {
    $preview.addEventListener('click', () => {
      ui._playNotifySound(ui.config.notifyVolume);
    });
  }

  if ($clear) {
    $clear.addEventListener('click', () => {
      if (!ui.setCustomNotifyAudio({ src: '', name: '' })) return;
      $audioName.textContent = '当前：使用内置“叮-咚”提示音';
      ui.toast('已清除自定义音频');
    });
  }

  // 测试提醒
  const $btnTest = root.querySelector('#ykt-btn-test-notify');
  if ($btnTest) {
    $btnTest.addEventListener('click', () => {
      const mockProblem = {
        problemId: 'TEST-001',
        body: '【测试题】这是一个测试提醒',
        options: [],
      };
      ui.notifyProblem(mockProblem, { thumbnail: null });
    });
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
