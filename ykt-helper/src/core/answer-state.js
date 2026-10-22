/** Server answers, local drafts and proposals deliberately have different fields. */
export function hasSubmittedAnswer(answer) {
  if (Array.isArray(answer)) return answer.length > 0 && answer.every(x => x !== null && x !== undefined && String(x).trim() !== '');
  if (answer && typeof answer === 'object') return !!String(answer.content ?? '').trim() || (Array.isArray(answer.pics) && answer.pics.length > 0);
  return answer !== null && answer !== undefined && String(answer).trim() !== '';
}
export function sameAnswer(problem, a, b) {
  const normalize = x => Array.isArray(x)
    ? (Number(problem?.problemType) === 2 ? x.map(String).sort() : x.map(String))
    : x && typeof x === 'object' ? { content: String(x.content ?? '').trim(), pics: x.pics || [] } : x;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
export function validateAnswer(problem, value) {
  const type = Number(problem?.problemType);
  if ([1, 2, 3].includes(type)) {
    if (!Array.isArray(value) || !value.length || (![2].includes(type) && value.length !== 1)) throw new Error('选项数量不正确');
    const allowed = (problem.options || []).map((x, i) => String(x.key ?? String.fromCharCode(65 + i)).toUpperCase());
    const out = [...new Set(value.map(x => String(x).trim().toUpperCase()))];
    if (out.some(x => !/^[A-Z]$/.test(x) || (allowed.length && !allowed.includes(x)))) throw new Error('答案含不存在的选项');
    return type === 2 ? out.sort() : out;
  }
  if (type === 4) {
    if (!Array.isArray(value) || !hasSubmittedAnswer(value)) throw new Error('填空答案应为非空字符串数组');
    if (problem.blanks?.length && problem.blanks.length !== value.length) throw new Error(`需要 ${problem.blanks.length} 个填空答案`);
    return value.map(String);
  }
  if (type === 5 && value && !Array.isArray(value) && hasSubmittedAnswer(value)) return { content: String(value.content ?? ''), pics: Array.isArray(value.pics) ? value.pics : [] };
  throw new Error('答案格式与题型不符');
}
