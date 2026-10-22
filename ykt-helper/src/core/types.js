// src/core/types.js
import { REMINDER_DEFAULTS } from './reminder-preferences.js';

export const PROBLEM_TYPE_MAP = {
  1: '单选题',
  2: '多选题',
  3: '投票题',
  4: '填空题',
  5: '主观题',
};

export const DEFAULT_CONFIG = {
  ...REMINDER_DEFAULTS,
  autoAnswer: false,
  autoAnswerPaused: false,
  submissionPolicy: 'auto',
  quickAnswerMode: 'auto',
  answerPriorityTimes: '',
  fastAnswerProfileId: '',
  verifyAnswerProfileId: '',
  answerVerification: false,
  autoJoinEnabled: false,
  autoAnswerOnAutoJoin: true,
  aiAutoAnalyze: false,
  customNotifyAudioSrc: '',
  customNotifyAudioName: '',
  notifyVolume: 0.6,
  notifyPopupDuration: 5000,
  autoAnswerDelay: 3000,
  autoAnswerRandomDelay: 2000,
  autoFollowDanmu: false,
  keepScreenAwake: false,
  iftex: true,
  ai: {
    provider: 'kimi', 
    kimiApiKey: '', 
    apiKey: '', 
    endpoint: 'https://api.moonshot.cn/v1/chat/completions', 
    model: 'moonshot-v1-8k', 
    visionModel: 'moonshot-v1-8k-vision-preview', 
    ocrApi: '',
    ocrApiKey: '',
    translateApi: '',
    translateApiKey: '',
    translateModel: '',
    maxTokens: 1000,
  },
  profiles: [
    {
      id: 'default',
      name: 'Kimi',
      baseUrl: 'https://api.moonshot.cn/v1/chat/completions', 
      apiKey: '',                     
      model: 'moonshot-v1-8k',
      visionModel: 'moonshot-v1-8k-vision-preview',
      temperature: '',
    },
  ],
  activeProfileId: 'default',
  showAllSlides: false,
  maxPresentations: 5,
};

export function makeDefaultConfig() { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
export function normalizeConfig(raw) {
  const defaults = makeDefaultConfig();
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const ai = value.ai && typeof value.ai === 'object' && !Array.isArray(value.ai) ? value.ai : {};
  const result = { ...defaults, ...value, ai: { ...defaults.ai, ...ai } };
  const profiles = ai.profiles || value.profiles || defaults.profiles;
  result.ai.profiles = JSON.parse(JSON.stringify(Array.isArray(profiles) && profiles.length ? profiles : defaults.profiles));
  result.ai.activeProfileId = ai.activeProfileId || value.activeProfileId || result.ai.profiles[0].id;
  if (!['auto', 'on', 'off'].includes(result.quickAnswerMode)) result.quickAnswerMode = 'auto';
  if (!['auto', 'normal', 'local'].includes(result.submissionPolicy)) result.submissionPolicy = 'auto';
  return result;
}
