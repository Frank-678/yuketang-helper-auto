import assert from 'node:assert/strict';
import test from 'node:test';
import { formatProblemForAI, formatProblemForVision, parseAIAnswer } from '../../src/tsm/ai-format.js';

const TYPE_MAP = { 1: '单选题', 2: '多选题', 3: '投票题', 4: '填空题', 5: '主观题' };

const singleCases = [
  ['答案: A', ['A']],
  ['答案：B\n解释：x', ['B']],
  ['A', ['A']],
  ['选择C', ['C']],
  ['答案: D。因为...', ['D']],
  ['答案: a', null],
  ['答案: 1', null],
  ['', null],
];
for (const [raw, expected] of singleCases) {
  test(`single choice parses ${JSON.stringify(raw)}`, () => {
    assert.deepEqual(parseAIAnswer({ problemType: 1 }, raw), expected);
  });
}

const voteCases = [
  ['答案: A', ['A']],
  ['选择B', ['B']],
  ['答案：C', ['C']],
  ['答案: Z', ['Z']],
];
for (const [raw, expected] of voteCases) {
  test(`vote parses ${JSON.stringify(raw)}`, () => {
    assert.deepEqual(parseAIAnswer({ problemType: 3 }, raw), expected);
  });
}

const multiCases = [
  ['答案: A、B、C', ['A', 'B', 'C']],
  ['答案: C、A、C', ['A', 'C']],
  ['答案: A,B,D', ['A', 'B', 'D']],
  ['答案: A，C，D', ['A', 'C', 'D']],
  ['答案: ABC', ['A', 'B', 'C']],
  ['答案: B', ['B']],
  ['答案: 无', null],
];
for (const [raw, expected] of multiCases) {
  test(`multiple choice parses ${JSON.stringify(raw)}`, () => {
    assert.deepEqual(parseAIAnswer({ problemType: 2 }, raw), expected);
  });
}

const fillCases = [
  ['答案: 氧气,葡萄糖', ['氧气', '葡萄糖']],
  ['答案：42', ['42']],
  ['答案: hello world', ['hello', 'world']],
  ['填空题：答案: 北京', ['北京']],
  ['答案: 第一空\n第二空\n解释: test', ['第一空', '第二空']],
  ['答案:', null],
];
for (const [raw, expected] of fillCases) {
  test(`fill-in parses ${JSON.stringify(raw)}`, () => {
    assert.deepEqual(parseAIAnswer({ problemType: 4 }, raw), expected);
  });
}

test('long fill-in becomes subjective-style content object instead of being split', () => {
  const content = '这是一段超过五十个字符的长文本答案，用于验证长填空不会被错误拆成大量空格分隔的片段，而应完整保留原始内容。'.repeat(2);
  assert.deepEqual(parseAIAnswer({ problemType: 4 }, `答案: ${content}`), { content, pics: [] });
});

const subjectiveCases = [
  ['答案: 这是答案', { content: '这是答案', pics: [] }],
  ['答案：第一行\n第二行\n解释：略', { content: '第一行\n第二行', pics: [] }],
  ['主观题：答案: 结论', { content: '结论', pics: [] }],
  ['', null],
];
for (const [raw, expected] of subjectiveCases) {
  test(`subjective parses ${JSON.stringify(raw)}`, () => {
    assert.deepEqual(parseAIAnswer({ problemType: 5 }, raw), expected);
  });
}

test('unknown problem type never yields a submit-ready answer', () => {
  assert.equal(parseAIAnswer({ problemType: 999 }, '答案: A'), null);
});

test('formatProblemForAI strips duplicated leading type label', () => {
  const text = formatProblemForAI({ problemType: 1, body: '单选题：2+2=?', options: [{ key: 'A', value: '4' }] }, TYPE_MAP);
  assert.match(text, /题目：2\+2=\?/);
  assert.doesNotMatch(text, /题目：单选题/);
  assert.match(text, /A\. 4/);
  assert.match(text, /只选一个/);
});

test('formatProblemForVision includes text and options when text is available', () => {
  const text = formatProblemForVision({ problemType: 2, body: '多选题：选择正确项', options: [{ key: 'A', value: '甲' }, { key: 'B', value: '乙' }] }, TYPE_MAP, true);
  assert.match(text, /文本信息/);
  assert.match(text, /题目：选择正确项/);
  assert.match(text, /A\. 甲/);
  assert.match(text, /B\. 乙/);
  assert.match(text, /A、B、C/);
});
