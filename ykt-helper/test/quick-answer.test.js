import test from 'node:test';
import assert from 'node:assert/strict';
import { environment, plain, tick, deferred } from './helpers/runtime.js';

function nativePage(e, slideId = 'SP') {
  const watchers = new Set();
  const store = { state: { currSlide: { sid: slideId } }, watch(_, callback) { watchers.add(callback); return () => watchers.delete(callback); } };
  e.w.document.querySelector('#app').__vue__ = { $store: store };
  e.a.mountQuickAnswerControl();
  return { store, setSlide(sid) { store.state.currSlide = { sid }; for (const callback of [...watchers]) callback(); } };
}
const editor = e => e.w.document.querySelector('#ykt-quick-answer-panel');
const fields = e => [...editor(e).querySelectorAll('.ykt-quick-fields textarea')];
const text = e => editor(e).querySelector('.ykt-quick-status').textContent;
function openNative(e) { e.w.document.querySelector('#ykt-page-answer-control button').click(); }
function type(e, value, index = 0) { const input = fields(e)[index]; input.value = value; input.dispatchEvent(new e.w.Event('input', { bubbles: true })); }
function submit(e) { editor(e).querySelector('.ykt-quick-submit').click(); }

test('the native page entry follows the actual slide, including normal and unknown pages', t => {
  const e = environment(t); e.addProblem(); const page = nativePage(e, 'ordinary');
  const anchor = e.w.document.querySelector('#ykt-page-answer-control');
  assert.equal(anchor.classList.contains('hidden'), true);
  page.setSlide('SP'); assert.equal(anchor.classList.contains('hidden'), false);
  openNative(e); assert.equal(editor(e).classList.contains('visible'), true);
  page.setSlide('unknown'); assert.equal(anchor.classList.contains('hidden'), true); assert.equal(editor(e).classList.contains('visible'), false);
});

test('late Vue readiness and repeated mounting install one page entry', t => {
  const e = environment(t); e.addProblem(); e.a.mountQuickAnswerControl(); e.a.mountQuickAnswerControl();
  assert.equal(e.w.document.querySelectorAll('#ykt-page-answer-control').length, 1);
  nativePage(e); e.a.refreshQuickAnswerControl();
  assert.equal(e.w.document.querySelector('#ykt-page-answer-control').classList.contains('hidden'), false);
});

test('a question selected in the assistant viewer offers the same direct entry', t => {
  const e = environment(t); e.addProblem();
  e.a.actions.navigateTo('PRP', 'SP');
  e.w.document.querySelector('#ykt-problem-view .ykt-force-answer-button').click();
  assert.equal(editor(e).classList.contains('visible'), true);
  assert.match(editor(e).textContent, /手动强制提交/);
  e.a.repo.setPresentation('PR-plain', { slides: [{ id: 'plain', cover: 'https://image.example.test/plain.jpg' }] });
  e.a.actions.navigateTo('PR-plain', 'plain');
  assert.equal(e.w.document.querySelector('#ykt-problem-view .ykt-force-answer-button'), null);
});

test('a typed choice goes straight to retry even while the question is still open', async t => {
  const e = environment(t, { submissionPolicy: 'local' }); const p = e.addProblem(); nativePage(e); openNative(e); type(e, 'b'); submit(e); await tick();
  assert.equal(e.requests.length, 1); assert.match(e.requests[0].url, /\/problem\/retry$/);
  assert.deepEqual(plain(JSON.parse(e.requests[0].body).problems[0]), { problemId: 'P', problemType: 1, dt: e.w.Date.now() + 1000, result: ['B'] });
  assert.deepEqual(plain(p.result), ['B']); assert.match(text(e), /已确认强制提交成功/); assert.equal(e.aiRequests.length, 0);
});

test('multi-choice letters are validated and packaged as a sorted result array', async t => {
  const e = environment(t); e.addProblem('P', { problemType: 2, options: 'ABCD'.split('').map(key => ({ key })) }); nativePage(e); openNative(e); type(e, 'dc,a'); submit(e); await tick();
  assert.deepEqual(plain(JSON.parse(e.requests[0].body).problems[0].result), ['A', 'C', 'D']);
});

for (const answer of ['42', '-1', '[0,1]', '(-∞, 0]', 'x + y']) test(`a typed blank preserves ${answer} without JSON or comma reinterpretation`, async t => {
  const e = environment(t); e.addProblem('P', { problemType: 4, blanks: [{}] }); nativePage(e); openNative(e); type(e, answer); submit(e); await tick();
  assert.deepEqual(plain(JSON.parse(e.requests[0].body).problems[0].result), [answer]);
});

test('known blank positions get separate inputs and are submitted in order', async t => {
  const e = environment(t); e.addProblem('P', { problemType: 4, blanks: [{}, {}] }); nativePage(e); openNative(e);
  assert.equal(fields(e).length, 2); type(e, '-1'); type(e, '[0,1]', 1); submit(e); await tick();
  assert.deepEqual(plain(JSON.parse(e.requests[0].body).problems[0].result), ['-1', '[0,1]']);
});

test('subjective answers are wrapped as content and pics', async t => {
  const e = environment(t); e.addProblem('P', { problemType: 5 }); nativePage(e); openNative(e); type(e, '第一行\n第二行'); submit(e); await tick();
  assert.deepEqual(plain(JSON.parse(e.requests[0].body).problems[0].result), { content: '第一行\n第二行', pics: [] });
});

test('invalid choices and incomplete blanks remain local without a network request', async t => {
  const e = environment(t); const p = e.addProblem(); nativePage(e); openNative(e); type(e, 'Z'); submit(e); await tick();
  assert.equal(e.requests.length, 0); assert.match(text(e), /不存在的选项/); assert.equal(p.draftText, 'Z');
  const f = environment(t); f.addProblem('P', { problemType: 4, blanks: [{}, {}] }); nativePage(f); openNative(f); type(f, '1'); submit(f); await tick();
  assert.equal(f.requests.length, 0); assert.match(text(f), /非空字符串数组/);
});

test('an empty retry success list retains the draft and does not show success', async t => {
  const e = environment(t, {}, { respond: () => ({ code: 0, data: { success: [] } }) }); const p = e.addProblem(); nativePage(e); openNative(e); type(e, 'B'); submit(e); await tick();
  assert.equal(p.result, undefined); assert.equal(p.draftText, 'B'); assert.match(text(e), /未确认/); assert.doesNotMatch(text(e), /已确认强制提交成功/);
});

test('a duplicate click creates only one request and restores controls after server response', async t => {
  const gate = deferred(); const e = environment(t, {}, { respond: () => gate.promise }); e.addProblem(); nativePage(e); openNative(e); type(e, 'B'); submit(e); submit(e); await tick();
  assert.equal(e.requests.length, 1); assert.equal(editor(e).querySelector('.ykt-quick-submit').disabled, true);
  gate.resolve({ code: 0, data: { success: ['P'] } }); await tick();
  assert.equal(editor(e).querySelector('.ykt-quick-submit').disabled, false); assert.match(text(e), /已确认强制提交成功/);
});

test('switching the native page before a click cannot submit the editor old question', async t => {
  const e = environment(t); e.addProblem(); const page = nativePage(e); openNative(e); type(e, 'B');
  page.store.state.currSlide = { sid: 'ordinary' }; submit(e); await tick();
  assert.equal(e.requests.length, 0); assert.match(text(e), /页面、题目或账号已变化/);
});

test('a stale viewer button cannot open under a different account', t => {
  const e = environment(t); e.addProblem(); e.a.actions.navigateTo('PRP', 'SP');
  const oldButton = e.w.document.querySelector('#ykt-problem-view .ykt-force-answer-button');
  e.w.document.cookie = 'user_id=second-fixture-user'; e.addProblem(); oldButton.click();
  assert.equal(editor(e)?.classList.contains('visible'), false);
});

test('the same confirmed answer can be explicitly forced again after teacher finish', async t => {
  const e = environment(t); e.addProblem('P', { result: ['B'] }); e.a.actions.onProblemFinished('P'); nativePage(e); openNative(e); submit(e); await tick();
  assert.equal(e.requests.length, 1); assert.match(e.requests[0].url, /\/retry$/); assert.match(text(e), /已确认强制提交成功/);
});

test('closing and reopening the editor restores per-blank drafts without submitting', t => {
  const e = environment(t); const p = e.addProblem('P', { problemType: 4, blanks: [{}, {}] }); nativePage(e); openNative(e); type(e, '-1'); type(e, '[0,1]', 1);
  editor(e).querySelector('[aria-label="关闭答案输入"]').click(); openNative(e);
  assert.deepEqual(fields(e).map(input => input.value), ['-1', '[0,1]']); assert.equal(e.requests.length, 0); assert.equal(p.result, undefined);
});

test('changing the assistant viewer page closes its editor while preserving the draft', t => {
  const e = environment(t); const p = e.addProblem(); e.a.mountQuickAnswerControl();
  e.a.actions.navigateTo('PRP', 'SP'); e.w.document.querySelector('#ykt-problem-view .ykt-force-answer-button').click(); type(e, 'B');
  e.a.repo.setPresentation('plain', { slides: [{ id: 'ordinary', cover: 'https://image.example.test/plain.jpg' }] });
  e.a.actions.navigateTo('plain', 'ordinary');
  assert.equal(editor(e).classList.contains('visible'), false); assert.equal(p.draftText, 'B'); assert.equal(e.requests.length, 0);
});
