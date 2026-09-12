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
  autoForceRetry: false,
  autoAnswerDelay: 3000,
  autoAnswerRandomDelay: 2000,
  // 刷新后恢复只针对刷新前已经出现并记录的题目，默认关闭以避免旧题误提交。
  autoRecoverUnanswered: false,
  // 过期恢复会调用 /retry，风险更高，必须由用户单独开启。
  autoRecoverExpired: false,
  // 扫描所有已缓存但从未解锁的未答题，默认关闭。
  autoScanUnanswered: false,
  answerPriorityWindows: [],
  fastAnswerProfileId: '',
  verifyAnswerProfileId: '',
  answerVerification: false,
  answerVerificationDelay: 0,
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
