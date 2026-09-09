import assert from 'node:assert/strict';
import test from 'node:test';

const loadEditor = () => import('../src/state/answer-editor.js');

test('parses a structured JSON answer without changing its shape', async () => {
  const { parseEditableAnswer, formatEditableAnswer } = await loadEditor();

  assert.deepEqual(parseEditableAnswer(1, '["B"]'), ['B']);
  assert.deepEqual(parseEditableAnswer(4, '[" 1", "北京"]'), [' 1', '北京']);
  assert.deepEqual(parseEditableAnswer(5, '{"content":"说明","pics":[]}'), {
    content: '说明',
    pics: [],
  });
  assert.equal(formatEditableAnswer(['B']), '[\n  "B"\n]');
});

test('parses convenient plain-text answers according to the question type', async () => {
  const { parseEditableAnswer } = await loadEditor();

  assert.deepEqual(parseEditableAnswer(1, 'b'), ['B']);
  assert.deepEqual(parseEditableAnswer(2, 'A, C、D'), ['A', 'C', 'D']);
  assert.deepEqual(parseEditableAnswer(4, '第一空\n第二空'), ['第一空', '第二空']);
  assert.deepEqual(parseEditableAnswer(5, '这是主观题答案'), {
    content: '这是主观题答案',
    pics: [],
  });
});

test('rejects an empty or unusable edited answer', async () => {
  const { parseEditableAnswer } = await loadEditor();

  assert.equal(parseEditableAnswer(1, ''), null);
  assert.equal(parseEditableAnswer(2, '没有选项'), null);
  assert.equal(parseEditableAnswer(4, ' \n '), null);
  assert.equal(parseEditableAnswer(5, ' '), null);
});

test('builds a manual submit request that always bypasses the automatic wait', async () => {
  const { buildAnswerSubmitOptions } = await loadEditor();

  assert.deepEqual(buildAnswerSubmitOptions({ startTime: 1_000, endTime: 5_000 }, {
    lessonId: 'lesson-1',
    forceRetry: true,
  }), {
    startTime: 1_000,
    endTime: 5_000,
    forceRetry: true,
    lessonId: 'lesson-1',
    autoGate: false,
    waitMs: 0,
  });
});
