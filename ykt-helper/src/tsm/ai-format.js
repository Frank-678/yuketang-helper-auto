import { validateAnswer } from '../core/answer-state.js';
function cleanProblemBody(body, problemType, TYPE_MAP) {
  if (!body) return '';
  
  const typeLabel = TYPE_MAP[problemType];
  if (!typeLabel) return body;
  
  // 去除题目开头的类型标识，如 "填空题：" "单选题：" 等
  const pattern = new RegExp(`^${typeLabel}[：:\\s]+`, 'i');
  return body.replace(pattern, '').trim();
}

// 改进的 AI prompt 格式化函数
export function formatProblemForAI(problem, TYPE_MAP) {
  const problemType = TYPE_MAP[problem.problemType] || '题目';
  
  const cleanBody = cleanProblemBody(problem.body, problem.problemType, TYPE_MAP);
  
  let q = `分析以下${problemType}并按格式回答：\n\n题目：${cleanBody}`;
  
  if (problem.options?.length) {
    q += '\n选项：';
    for (const o of problem.options) q += `\n${o.key}. ${o.value}`;
  }

  // 根据题目类型给出精确的格式要求
  switch (problem.problemType) {
    case 1: // 单选题
      q += `\n\n格式要求：\n答案: [单个字母]\n解释: [简要说明]\n\n注意：只选一个选项，答案为大写字母如A`;
      break;

    case 2: // 多选题
      q += `\n\n格式要求：\n答案: [多个字母用顿号分开]\n解释: [简要说明]\n\n注意：可选多个，格式如A、B、C`;
      break;

    case 3: // 投票题
      q += `\n\n格式要求：\n答案: [单个字母]\n解释: [简要说明]\n\n注意：只选一个选项，答案为大写字母`;
      break;

    case 4: // 填空题
      q += `\n\n这是一道填空题。

重要说明：
- 题目内容已经去除了"填空题："等标识
- 你只需要分析题目要求，给出需要填入的答案
- 不要在答案中重复任何题目类型的字样

格式要求：
答案: [直接给出需要填入的内容]
解释: [简要说明]

示例：
如果题目是"光合作用的产物是___和___"
答案: 氧气,葡萄糖
解释: 光合作用产生氧气和葡萄糖

多个填空用逗号分开`;
      break;

    case 5: // 主观题
      q += `\n\n格式要求：\n答案: [完整回答]\n解释: [补充说明，可选]\n\n注意：直接回答问题，不要重复题目`;
      break;

    default:
      q += `\n\n格式要求：\n答案: [你的答案]\n解释: [详细解释]`;
  }

  return q;
}

// 改进的融合模式 prompt 格式化函数
export function formatProblemForVision(problem, TYPE_MAP, hasTextInfo = false) {
  const problemType = TYPE_MAP[problem.problemType] || '题目';
  
  let basePrompt = hasTextInfo 
    ? `结合文本信息和图片内容分析${problemType}，按格式回答：`
    : `观察图片内容，识别${problemType}并按格式回答：`;

  if (hasTextInfo && problem.body) {
    // ✅ 清理题目内容
    const cleanBody = cleanProblemBody(problem.body, problem.problemType, TYPE_MAP);
    
    basePrompt += `\n\n【文本信息】\n题目：${cleanBody}`;
    if (problem.options?.length) {
      basePrompt += '\n选项：';
      for (const o of problem.options) basePrompt += `\n${o.key}. ${o.value}`;
    }
    basePrompt += '\n\n若图片内容与文本冲突，以图片为准。';
  }

  // 根据题目类型添加具体格式要求
  switch (problem.problemType) {
    case 1: // 单选题
      basePrompt += `\n\n格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个，如A`;
      break;

    case 2: // 多选题
      basePrompt += `\n\n格式要求：\n答案: [多个字母用顿号分开]\n解释: [选择理由]\n\n注意：格式如A、B、C`;
      break;

    case 3: // 投票题
      basePrompt += `\n\n格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个选项`;
      break;

    case 4: // 填空题
      basePrompt += `\n\n这是一道填空题。

重要说明：
- 题目内容已经处理，不含"填空题"等字样
- 观察图片和文本，找出需要填入的内容
- 答案中不要出现任何题目类型标识

格式要求：
答案: [直接给出填空内容]
解释: [简要说明]

示例：
答案: 氧气,葡萄糖
解释: 光合作用的产物

多个填空用逗号分开`;
      break;

    case 5: // 主观题
      basePrompt += `\n\n格式要求：\n答案: [完整回答]\n解释: [补充说明]\n\n注意：直接回答，不要重复题目`;
      break;

    default:
      basePrompt += `\n\n格式要求：\n答案: [你的答案]\n解释: [详细解释]`;
  }

  return basePrompt;
}

export function formatProblemForDisplay(problem, TYPE_MAP) {
  let s = `${TYPE_MAP[problem.problemType] || '题目'}：${problem.body || ''}`;
  if (problem.options?.length) {
    s += '\n\n选项：';
    for (const o of problem.options) s += `\n${o.key}. ${o.value}`;
  }
  return s;
}

// 改进的答案解析函数
export function parseAIAnswer(problem, response) {
  try {
    const type = Number(problem.problemType);
    let text = String(response || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const label = text.match(/(?:^|\n)\s*(?:\*\*)?(?:答案|answer)\s*[:：]\s*(?:\*\*)?/i);
    if (label) text = text.slice(label.index + label[0].length).split(/\n\s*(?:解释|解析|说明|explanation)\s*[:：]/i)[0].trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch {}
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && Object.hasOwn(parsed, 'answer')) parsed = parsed.answer;
    if ([1, 2, 3].includes(type)) {
      if (!Array.isArray(parsed)) {
        const clean = text.replace(/^(?:选择|选项|选)\s*/, '').trim().toUpperCase();
        if (!/^[A-Z](?:[\s,，、;；]*[A-Z])*$/.test(clean)) return null;
        parsed = clean.match(/[A-Z]/g);
      }
    } else if (type === 4 && !Array.isArray(parsed)) {
      const count = problem.blanks?.length || 1;
      if (count === 1) parsed = [typeof parsed === 'string' || typeof parsed === 'number' ? String(parsed) : text];
      else {
        const lines = text.split(/\n+/).map(x => x.replace(/^\s*\d+[.、)]\s*/, '').trim()).filter(Boolean);
        if (lines.length === count) parsed = lines;
        else {
          const parts = text.split(/[,，;；]/).map(x => x.trim());
          if (parts.length !== count || parts.some(x => /[()[\]{}]/.test(x))) return null;
          parsed = parts;
        }
      }
    } else if (type === 5 && (!parsed || typeof parsed !== 'object')) parsed = { content: typeof parsed === 'string' ? parsed : text, pics: [] };
    return validateAnswer(problem, parsed);
  } catch { return null; }
}
