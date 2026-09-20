// src/ai/kimi.js
import { gm } from '../core/env.js';
import { assertSafeApiEndpoint } from '../core/remote-endpoint.js';

// 将后端 problemType 数字映射为 Step1/Step2 使用的 question_type 字符串
// 约定：
// 1 -> single_choice   （单选）
// 2 -> multiple_choice （多选）
// 3 -> single_choice   （投票题按单选处理）
// 4 -> fill_in         （填空题）
// 5 -> subjective      （主观题 / 简答题）
function mapProblemTypeToQuestionType(problemType) {
  if (problemType == null) return null;
  const n = Number(problemType);
  switch (n) {
    case 1: return 'single_choice';
    case 2: return 'multiple_choice';
    case 3: return 'single_choice';
    case 4: return 'fill_in';
    case 5: return 'subjective';
    default: return null;
  }
}

function getActiveProfile(aiCfg, profileId = null) {
  const cfg = aiCfg || {};
  const profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];
  if (!profiles.length) {
    const legacyKey = cfg.kimiApiKey;
    if (!legacyKey) return null;
    return {
      id: 'legacy',
      name: 'Kimi Legacy',
      baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
      apiKey: legacyKey,
      model: 'moonshot-v1-8k',
      visionModel: 'moonshot-v1-8k-vision-preview',
    };
  }
  const activeId = profileId ?? cfg.activeProfileId;
  let p = profiles.find(profile => String(profile.id) === String(activeId));
  if (!p) p = profiles[0];
  if (!p.baseUrl) p.baseUrl = 'https://api.moonshot.cn/v1/chat/completions';
  return p;
}

function makeChatUrl(profile) {
//   const base = (profile.baseUrl || 'https://api.moonshot.cn').replace(/\/+$/,'');
//   return `${base}/v1/chat/completions`;   
    return assertSafeApiEndpoint(profile.baseUrl);
}

function sameEndpointOrigin(left, right) {
  const a = new URL(assertSafeApiEndpoint(left));
  const b = new URL(assertSafeApiEndpoint(right));
  return a.origin === b.origin;
}

function resolveServiceApiKey(label, dedicatedKey, serviceUrl, baseProfile) {
  const ownKey = String(dedicatedKey || '').trim();
  if (ownKey) return ownKey;
  const baseKey = String(baseProfile?.apiKey || '').trim();
  if (!baseKey) return '';
  const target = String(serviceUrl || '').trim();
  if (target && !sameEndpointOrigin(target, baseProfile?.baseUrl)) {
    throw new Error(`${label} 使用不同 API endpoint 时必须配置专用 API Key`);
  }
  return baseKey;
}

function withProfileTemperature(profile, payload) {
  const { temperature: _legacyTemperature, ...requestPayload } = payload;
  const rawTemperature = profile?.temperature;

  if (rawTemperature === '' || rawTemperature === undefined || rawTemperature === null) {
    return requestPayload;
  }

  const temperature = Number(rawTemperature);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error('Temperature 必须是 0 到 2 之间的数字，或留空使用模型默认值');
  }

  return { ...requestPayload, temperature };
}

// -----------------------------------------------
// Unified Prompt blocks for Text & Vision
// -----------------------------------------------
const BASE_SYSTEM_PROMPT = [
  '1) 任何时候优先遵循【用户输入（优先级最高）】中的明确要求；',
  '2) 当输入是课件页面（PPT）图像或题干文本时，先判断是否存在“明确题目”；',
  '3) 若存在明确题目，则输出以下格式的内容：',
  '   单选：格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个，如A',
  '   多选：格式要求：\n答案: [多个字母用顿号分开]\n解释: [选择理由]\n\n注意：格式如A、B、C',
  '   投票：格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个选项，如A',
  '   填空/主观题: 格式要求：答案: [直接给出答案内容]，解释: [补充说明]',
  '4) 若识别不到明确题目，直接使用回答用户输入的问题',
  '3) 如果PROMPT格式不正确，或者你只接收了图片，输出：',
  '   STATE: NO_PROMPT',
  '   SUMMARY: <介绍页面/上下文的主要内容>',
].join('\n');

// Vision 补充：识别题型与版面元素的步骤说明
const VISION_GUIDE = [
  '【视觉识别要求】',
  'A. 先判断是否为题目页面（是否有题干/选项/空格/问句等）',
  'B. 若是题目，尝试提取题干、选项与关键信息；',
  'C. 否则参考用户输入回答',
].join('\n');

const DEFAULT_AI_REQUEST_TIMEOUT_MS = 120000;

function resolveAIRequestTimeout(aiCfg, override) {
  const raw = override ?? aiCfg?.requestTimeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS;
  const timeout = Number(raw);
  if (!Number.isFinite(timeout) || timeout <= 0) return DEFAULT_AI_REQUEST_TIMEOUT_MS;
  return Math.max(10000, Math.min(300000, timeout));
}

function isAITimeoutError(error) {
  return /超时|timeout/i.test(String(error?.message || error || ''));
}

const AI_RATE_LIMIT_MAX_RETRIES = 2;
const aiRequestQueues = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function requestQueueKey(profile) {
  const url = new URL(makeChatUrl(profile));
  // The API key is already present in runtime memory.  Keeping it only as an
  // in-memory Map key lets profiles that share one account also share one
  // concurrency slot without logging or persisting the credential.
  return `${url.origin}\n${String(profile?.apiKey || '')}`;
}

async function withAIRequestSlot(profile, task) {
  const key = requestQueueKey(profile);
  const previous = aiRequestQueues.get(key) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => gate);
  aiRequestQueues.set(key, tail);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (aiRequestQueues.get(key) === tail) aiRequestQueues.delete(key);
  }
}

function retryAfterMs(response) {
  const headers = String(response?.responseHeaders || '');
  const headerMatch = headers.match(/(?:^|\r?\n)retry-after:\s*([0-9.]+)/i);
  if (headerMatch) {
    const seconds = Number(headerMatch[1]);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10000, seconds * 1000);
  }

  try {
    const body = JSON.parse(String(response?.responseText || '{}'));
    const message = String(body?.error?.message || body?.message || '');
    const match = message.match(/after\s+([0-9.]+)\s*(milliseconds?|ms|seconds?|s)\b/i);
    if (match) {
      const amount = Number(match[1]);
      if (Number.isFinite(amount) && amount >= 0) {
        const isMs = /^m/i.test(match[2]);
        return Math.min(10000, isMs ? amount : amount * 1000);
      }
    }
  } catch {}

  return null;
}

function httpErrorFromResponse(response) {
  const status = Number(response?.status);
  let message = `AI 请求失败: ${status || 'unknown'}`;
  let code = null;
  try {
    const data = JSON.parse(String(response?.responseText || '{}'));
    if (data?.error?.message) message += ` - ${data.error.message}`;
    else if (data?.message) message += ` - ${data.message}`;
    if (data?.error?.code) {
      code = data.error.code;
      message += ` (${code})`;
    }
  } catch {
    const raw = String(response?.responseText || '').trim();
    if (raw) message += ` - ${raw}`;
  }
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.retryAfterMs = retryAfterMs(response);
  return error;
}

function requestChatCompletion(profile, payload, debugLabel, timeoutMs) {
  const url = makeChatUrl(profile);
  return withAIRequestSlot(profile, async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await new Promise((resolve, reject) => {
          gm.xhr({
            method: 'POST',
            url,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${profile.apiKey}`,
            },
            data: JSON.stringify(withProfileTemperature(profile, payload)),
            timeout: timeoutMs,
            onload: (res) => {
              try {
                console.log(`[雨课堂助手]${debugLabel} Status:`, res.status);
                if (Number(res.status) !== 200) {
                  reject(httpErrorFromResponse(res));
                  return;
                }
                resolve(JSON.parse(res.responseText));
              } catch (error) {
                reject(new Error(`解析API响应失败: ${error.message}`));
              }
            },
            onerror: () => reject(new Error('网络请求失败')),
            ontimeout: () => reject(new Error('AI 请求超时')),
          });
        });
      } catch (error) {
        const rateLimited = Number(error?.status) === 429;
        if (!rateLimited || attempt >= AI_RATE_LIMIT_MAX_RETRIES) throw error;
        const waitMs = Number.isFinite(error?.retryAfterMs)
          ? Math.max(0, error.retryAfterMs)
          : Math.min(4000, 1000 * (attempt + 1));
        console.warn('[雨课堂助手][WARN][AI] 429 并发/限流，等待后重试', {
          attempt: attempt + 1,
          waitMs,
        });
        await sleep(waitMs);
      }
    }
  });
}



/**
 * 通用 OpenAI 协议文本模型调用
 */
export async function queryAI(question, aiCfg, options = {}) {
  const profile = getActiveProfile(aiCfg, options?.profileId);
  if (!profile || !profile.apiKey) {
    throw new Error('请先在设置中配置 AI API Key');
  }

  const model = profile.model || 'gpt-4o-mini';
  const timeoutMs = resolveAIRequestTimeout(aiCfg, options?.timeout);
  const data = await requestChatCompletion(
    profile,
    {
      model,
      messages: [
        { role: 'system', content: BASE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                '【文本模式说明】可能为题目文本，也可能为普通问答。请先执行决策闸，再回答。',
                '【用户输入（优先级最高）】',
                question || '（无）',
              ].join('\n'),
            },
          ],
        },
      ],
    },
    '[AI OpenAI]',
    timeoutMs,
  );

  const content = data.choices?.[0]?.message?.content;
  if (content) return content;
  throw new Error('AI返回内容为空');
}

// 通用 OpenAI 协议聊天请求封装（用于 Vision 两步调用）
function chatCompletion(profile, payload, debugLabel = '[AI OpenAI]', timeoutMs = DEFAULT_AI_REQUEST_TIMEOUT_MS) {
  return requestChatCompletion(profile, payload, debugLabel, timeoutMs);
}

async function singleStepVisionCall(profile, cleanBase64List, textPrompt, options = {}) {
  const visionModel = profile.visionModel || profile.model;
  const timeoutMs = resolveAIRequestTimeout(null, options.timeout);

  const visionTextHeader = [
    '【融合模式说明】你将看到一张课件/PPT截图与可选的附加文本。',
    VISION_GUIDE,
  ].join('\n');

  const imageBlocks = []
  for (const b64 of cleanBase64List) {
    imageBlocks.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${b64}` },
    });
  }

  const messages = [
    { role: 'system', content: BASE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        ...imageBlocks,
        {
          type: 'text',
          text: [
            visionTextHeader,
            '【用户输入（优先级最高）】',
            textPrompt || '（无）',
          ].join('\n'),
        },
      ],
    },
  ];

  const data = await chatCompletion(
    profile,
    {
      model: visionModel,
      messages,
    },
    '[AI OpenAI Vision 单步]',
    timeoutMs,
  );

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI返回内容为空');
  }
  console.log('[AI OpenAI Vision] 成功获取回答(单步)');
  return content;
}


/**
 * 通用 OpenAI 协议 Vision 模型（图像+文本）
 */
export async function queryAIVision(imageBase64, textPrompt, aiCfg, options = {}) {
  const {
    disableTwoStep = false,
    twoStepDebug = false,
    timeout = undefined,
    problemType = null,          // ← 新增：后端题型（数字或字符串都行）
    profileId = null,
  } = options || {};
  const timeoutMs = resolveAIRequestTimeout(aiCfg, timeout);

  const profile = getActiveProfile(aiCfg, profileId);
  if (!profile || !profile.apiKey) {
    throw new Error('请先在设置中配置 AI API Key');
  }

  // ===== 兼容单图 / 多图 =====
  const inputList = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const cleanBase64List = inputList
    .filter(Boolean)
    .map(x => String(x).replace(/^data:image\/[^;]+;base64,/, ''))
    .filter(x => !!x);
  if (cleanBase64List.length === 0) throw new Error('图像数据格式错误');

  const visionModel = profile.visionModel || profile.model;
  const textModel = profile.model;
  const hasSeparateTextModel = !!textModel && textModel !== visionModel;

  // -------- 0. 如果只有 VLM（或者显式关闭两步），回退到单步逻辑 --------
  if (!hasSeparateTextModel || disableTwoStep) {
    if (twoStepDebug) {
      console.log('[雨课堂助手][INFO][vision] use single-step vision', {
        hasSeparateTextModel,
        disableTwoStep,
      });
    }
    return singleStepVisionCall(profile, cleanBase64List, textPrompt, { timeout: timeoutMs });
  }

  if (twoStepDebug) {
    console.log('[雨课堂助手][INFO][vision] use TWO-STEP pipeline', {
      visionModel,
      textModel,
    });
  }

  // ===================== Step 1: Vision 抽结构化题目 =====================
  const STEP1_SYSTEM_PROMPT = `
你是一个“题目结构化助手”。你将看到课件截图和可选的附加文本，请从中提取出清晰的题目结构，并以 JSON 格式输出。

你不仅要识别文字（类似 OCR），还要理解图片里的内容（例如物体、颜色、形状、数量、相对位置等），并把这些与题目有关的信息转化为题干或补充说明的一部分。

【题型识别优先级】
1. 如果页面上出现了明确的题型标签文字，如：
   - "单选题"、"多选题"、"投票题"、"填空题"、"主观题" 等，
   请优先根据这些标签设置 question_type：
   - 单选题 / 投票题 -> "single_choice"
   - 多选题         -> "multiple_choice"
   - 填空题         -> "fill_in"
   - 主观题 / 简答题 / 论述题 -> "subjective"
2. 当没有明显题型标签时，再根据题干语义和版面结构推断题型。

【选项字母规则】
- 只有在页面上出现了清晰的选项字母（通常为 "A."、"B."、"C."、"D." 等）并跟随选项内容时，才能将 question_type 设为 "single_choice" 或 "multiple_choice"（或投票题对应的 "single_choice"）。
- 如果没有任何 A/B/C/D 这种选项字母，而问题又需要开放性自由回答，请优先将 question_type 设为 "subjective"。

请尽量识别：
- question_type: "single_choice" | "multiple_choice" | "fill_in" | "subjective" | "visual_only" | "unknown"
- stem: 题干文本（如果题干主要依赖图片，请用自然语言描述图片中与题目相关的内容，可保留数学公式信息）
- options: 一个对象，键为 "A"、"B"、"C"、"D" 等，值为选项内容文字（若不是选择题可为空对象）
- image_facts: （可选）一个字符串数组，列出与解题有关的关键图像事实，例如 ["图中是一根黄色的香蕉", "背景是白色"]。
- requires_image_for_solution: 布尔值。如果即使你尽力用文字描述图片，仍然很难仅凭文字保证答对（例如复杂几何图形或高度依赖精确位置关系的题目），请设为 true；如果你的文字描述已经足够让人类或文字模型解题，请设为 false。

输出示例（仅示例，不是固定模板）：
{
  "question_type": "single_choice",
  "stem": "根据图片中的水果，选择它的颜色。",
  "options": {
    "A": "红色",
    "B": "黄色",
    "C": "蓝色",
    "D": "绿色"
  },
  "image_facts": [
    "图片中是一根黄色的香蕉，背景为白色"
  ],
  "requires_image_for_solution": false
}

如果无法识别题目或截图并非题目，请尽量给出你能看到的内容，但仍然保持上述 JSON 结构（字段缺省时可以用 null、空对象或空数组）。
仅输出 JSON，不要任何额外文字。
`.trim();

  const step1Messages = [
    { role: 'system', content: STEP1_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        ...cleanBase64List.map(b64 => ({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${b64}` },
        })),
        textPrompt
          ? {
              type: 'text',
              text: `【辅助文本】\n${textPrompt}`,
            }
          : {
              type: 'text',
              text: '【辅助文本】（无额外文本，仅根据截图识别题目）',
            },
      ],
    },
  ];

  let structuredQuestion;
  try {
    const data1 = await chatCompletion(
      profile,
      {
        model: visionModel,
        messages: step1Messages,
      },
      '[AI OpenAI Vision Step1]',
      timeoutMs,
    );

    const content1 = data1.choices?.[0]?.message?.content || '';
    if (twoStepDebug) {
      console.log('[雨课堂助手][DEBUG][vision-step1] raw content:', content1);
    }

    const jsonMatch = content1.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON found in step1 result');

    structuredQuestion = JSON.parse(jsonMatch[0]);
  } catch (err) {
    if (isAITimeoutError(err)) throw err;
    console.warn('[雨课堂助手][WARN][vision-step1] failed, fallback to single-step', err);
    return singleStepVisionCall(profile, cleanBase64List, textPrompt, { timeout: timeoutMs });
  }

  if (!structuredQuestion || !structuredQuestion.stem) {
    console.warn('[雨课堂助手][WARN][vision-step1] invalid structuredQuestion, fallback');
    return singleStepVisionCall(profile, cleanBase64List, textPrompt, { timeout: timeoutMs });
  }

  if (twoStepDebug) {
    console.log('[雨课堂助手][INFO][vision-step1] structuredQuestion:', structuredQuestion);
  }

  // ========= 题型合并逻辑：后端 problemType 优先，其次 VLM 推断，全部缺失则回退 subjective =========
  const backendQuestionType = mapProblemTypeToQuestionType(problemType);
  const vlmQuestionType = structuredQuestion.question_type || null;

  let finalQuestionType = backendQuestionType || vlmQuestionType || null;

  // 如果 VLM 返回的是 unknown / visual_only 这类不太可用的类型，也当成“缺失”
  if (finalQuestionType === 'unknown' || finalQuestionType === 'visual_only') {
    finalQuestionType = null;
  }

  // 当后端和 VLM 都没有给出可用题型时，统一回退为主观题
  if (!finalQuestionType) {
    finalQuestionType = 'subjective';
  }

  if (twoStepDebug) {
    console.log('[雨课堂助手][INFO][vision-step1] questionType merged:', {
      problemType,
      backendQuestionType,
      vlmQuestionType,
      finalQuestionType,
    });
  }

  // 如果模型明确表示“必须依赖原始图像才能解题”，则回退到单步 Vision，避免纯文本推理丢失关键信息
  if (structuredQuestion.requires_image_for_solution === true) {
    console.warn('[雨课堂助手][INFO][vision] step1 says image is essential, fallback to single-step');
    return singleStepVisionCall(profile, cleanBase64List, textPrompt, { timeout: timeoutMs });
  }

  // ===================== Step 2: Text 模型纯文本推理解题 =====================
  const {
    question_type,
    stem,
    options: sqOptions = {},
    image_facts = [],
  } = structuredQuestion;

  let solvePrompt = '你是一个严谨的解题助手，请根据下面的题目进行推理解答：\n\n';

  solvePrompt += `【题干】\n${stem}\n\n`;

  const optionKeys = Object.keys(sqOptions);
  if (optionKeys.length > 0) {
    solvePrompt += '【选项】\n';
    for (const key of optionKeys) {
      solvePrompt += `${key}. ${sqOptions[key]}\n`;
    }
    solvePrompt += '\n';
  }

  solvePrompt += '请逐步推理，推理结果按以下格式输出：\n';

  if (finalQuestionType === 'single_choice') {
    solvePrompt += '答案: [单个大写字母]\n解释: [简要说明你的推理过程]\n';
  } else if (finalQuestionType === 'multiple_choice') {
    solvePrompt += '答案: [多个大写字母，用顿号分隔，如 A、C、D]\n解释: [简要说明你的推理过程]\n';
  } else if (finalQuestionType === 'fill_in') {
    solvePrompt += '答案: [直接给出需要填入的内容，多个空用逗号分隔]\n解释: [简要说明你的推理过程]\n';
  } else if (finalQuestionType === 'subjective') {
    solvePrompt += '答案: [完整回答]\n解释: [可选的补充说明]\n';
  }

  // 将图像关键信息一并提供给文本模型，用于弥补完全无图像输入的劣势
  if (Array.isArray(image_facts) && image_facts.length > 0) {
    solvePrompt += '【图像关键信息】\n';
    for (const fact of image_facts) {
      if (typeof fact === 'string' && fact.trim()) {
        solvePrompt += `- ${fact.trim()}\n`;
      }
    }
    solvePrompt += '\n';
  }

  const step2Messages = [
    {
      role: 'system',
      content:
        '你是一个解题助手，请严格按照用户指定的输出格式作答，尽量保证答案正确。',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: solvePrompt,
        },
      ],
    },
  ];

  try {
    const data2 = await chatCompletion(
      profile,
      {
        model: textModel,
        messages: step2Messages,
      },
      '[AI OpenAI Vision Step2]',
      timeoutMs,
    );

    const content2 = data2.choices?.[0]?.message?.content || '';
    if (!content2) {
      throw new Error('AI返回内容为空');
    }
    if (twoStepDebug) {
      console.log('[雨课堂助手][INFO][vision-step2] final content:', content2);
    }
    return content2;
  } catch (err) {
    if (isAITimeoutError(err)) throw err;
    console.warn('[雨课堂助手][WARN][vision-step2] failed, fallback to single-step', err);
    return singleStepVisionCall(profile, cleanBase64List, textPrompt, { timeout: timeoutMs });
  }
}

export async function queryOCRVision(imageBase64, aiCfg) {
  const cfg = aiCfg || {};
  const baseProfile = getActiveProfile(cfg);
  const resolvedApiKey = resolveServiceApiKey('OCR', cfg.ocrApiKey, cfg.ocrApi, baseProfile);
  if (!baseProfile || !resolvedApiKey) {
    throw new Error('请先在设置中填写可用的 OCR API Key 或 AI API Key');
  }

  const profile = {
    ...baseProfile,
    baseUrl: (cfg.ocrApi || '').trim() || baseProfile.baseUrl,
    apiKey: resolvedApiKey,
  };

  const cleanBase64 = String(imageBase64 || '').replace(/^data:image\/[^;]+;base64,/, '').trim();
  if (!cleanBase64) {
    throw new Error('OCR 图片内容为空');
  }

  const data = await chatCompletion(
    profile,
    {
      model: profile.visionModel || profile.model,
      messages: [
        {
          role: 'system',
          content: [
            '你是一个 OCR 助手。',
            '只提取图片中可见的文字内容，不要解题，不要总结，不要补充说明。',
            '尽量保留原有段落、标题、列表和换行。',
            '如果图片里没有可识别文字，只返回“未识别到文字”。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${cleanBase64}` },
            },
            {
              type: 'text',
              text: '请直接输出图片中的全部文字，保持结果可复制。',
            },
          ],
        },
      ],
    },
    '[AI OCR Vision]',
    60000,
  );

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OCR 接口未返回文本内容');
  }
  return String(content).trim();
}

export async function queryTranslationText(text, targetLanguage, aiCfg) {
  const cfg = aiCfg || {};
  const baseProfile = getActiveProfile(cfg);
  const resolvedApiKey = resolveServiceApiKey('翻译', cfg.translateApiKey, cfg.translateApi, baseProfile);
  if (!baseProfile || !resolvedApiKey) {
    throw new Error('请先在设置中填写可用的翻译 API Key 或 AI API Key');
  }

  const resolvedTargetLanguage = String(targetLanguage || '').trim();
  if (!resolvedTargetLanguage) {
    throw new Error('翻译目标语言不能为空');
  }

  const sourceText = String(text || '').trim();
  if (!sourceText) {
    throw new Error('没有可翻译的文字内容');
  }

  const profile = {
    ...baseProfile,
    baseUrl: (cfg.translateApi || '').trim() || baseProfile.baseUrl,
    apiKey: resolvedApiKey,
    model: (cfg.translateModel || '').trim() || baseProfile.model,
  };

  const data = await chatCompletion(
    profile,
    {
      model: profile.model,
      messages: [
        {
          role: 'system',
          content: [
            '你是一个专业翻译助手。',
            '只执行翻译，不要解释，不要总结，不要补充。',
            '尽量保留原文段落、列表、编号、公式和专有名词格式。',
            `将用户提供的文本翻译为：${resolvedTargetLanguage}。`,
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: sourceText,
            },
          ],
        },
      ],
    },
    '[AI Translate]',
    60000,
  );

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('翻译接口未返回文本内容');
  }
  return String(content).trim();
}