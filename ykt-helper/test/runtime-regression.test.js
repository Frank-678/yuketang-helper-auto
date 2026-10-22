import test from 'node:test';
import assert from 'node:assert/strict';
import { environment, plain, tick, deferred } from './helpers/runtime.js';

for (const [label, type, input, expected, extra] of [
  ['negative', 4, '答案: -1', ['-1']],
  ['interval', 4, '答案: (-∞, 0]', ['(-∞, 0]']],
  ['expression', 4, '答案: x + y', ['x + y']],
  ['long blank', 4, '答案: ' + 'a'.repeat(80), ['a'.repeat(80)]],
  ['english answer', 1, 'Answer: B', ['B'], { options: [{ key: 'A' }, { key: 'B' }] }],
  ['invalid option', 1, '答案: Z', null, { options: [{ key: 'A' }, { key: 'B' }] }],
  ['string problem type', '1', '答案: ["B"]', ['B']],
  ['multiple blanks', 4, '答案: ["4","6"]', ['4', '6'], { blanks: [{}, {}] }],
  ['ambiguous blank boundary', 4, '答案: x + y', null, { blanks: [{}, {}] }],
]) test('bundled parser preserves ' + label, t => {
  const e = environment(t); assert.deepEqual(plain(e.a.parseAIAnswer({ problemType: type, ...extra }, input)), expected);
});

test('local drafts persist without pretending that the server has an answer; unrelated updates preserve input nodes', t => {
  const e = environment(t); const p = e.addProblem(), q = e.addProblem('Q');
  e.a.updateProblemList(); const input = e.w.document.querySelector('[data-problem-id="P"] textarea');
  input.value = '["B"]'; input.dispatchEvent(new e.w.Event('input', { bubbles: true }));
  e.a.actions.onAnswerProblem(q.problemId, ['A']);
  assert.equal(e.w.document.querySelector('[data-problem-id="P"] textarea'), input);
  assert.equal(input.value, '["B"]'); assert.equal(p.result, undefined);
  const work = e.a.storage.get(e.a.repo.storageKey('work', 'L1')); assert.equal(work.find(x => x.problemId === 'P').draftText, '["B"]');
});

test('ordinary AI answering sends exactly one generation and one normal submission', async t => {
  const e = environment(t, { autoAnswer: true }); const p = e.addProblem();
  await e.a.actions.handleAutoAnswer(p);
  assert.equal(e.aiRequests.length, 1); assert.equal(e.requests.length, 1);
  assert.match(e.requests[0].url, /\/answer$/); assert.deepEqual(plain(p.result), ['A']);
  assert.equal(e.a.repo.problemStatus.get('P').phase, 'confirmed');
});

test('a question closed while still queued continues through the allowed retry route', async t => {
  const e = environment(t, { autoAnswer: true }); const p = e.addProblem();
  const s = e.a.repo.problemStatus.get('P'); s.autoAnswerTime = e.w.Date.now();
  e.a.actions.onProblemFinished('P'); await e.a.actions.handleAutoAnswer(p);
  assert.equal(e.requests.length, 1); assert.match(e.requests[0].url, /\/retry$/); assert.deepEqual(plain(p.result), ['A']);
});

test('a manual submission during AI generation wins, including after teacher finish', async t => {
  let response; const e = environment(t, { autoAnswer: true }, { onAI: opt => { response = opt; } }); const p = e.addProblem();
  const task = e.a.actions.handleAutoAnswer(p); await tick();
  e.a.actions.onAnswerProblem('P', ['B']); e.a.actions.onProblemFinished('P');
  response.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: '答案: ["A"]' } }] }) });
  await task; assert.deepEqual(plain(p.result), ['B']); assert.equal(e.requests.length, 0); assert.deepEqual(plain(p.aiProposal), ['A']);
});

test('turning automatic answering off during AI preserves its paid result without submitting', async t => {
  let response; const e = environment(t, { autoAnswer: true }, { onAI: opt => { response = opt; } }); const p = e.addProblem();
  const task = e.a.actions.handleAutoAnswer(p); await tick(); e.a.ui.config.autoAnswer = false;
  response.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: '答案: ["A"]' } }] }) });
  await task; assert.equal(e.requests.length, 0); assert.equal(p.result, undefined); assert.deepEqual(plain(p.aiProposal), ['A']);
});

test('empty result arrays do not suppress automatic answering; local mode never submits', async t => {
  const e = environment(t, { autoAnswer: true, submissionPolicy: 'local' }); const p = e.addProblem('P', { result: [] });
  await e.a.actions.handleAutoAnswer(p); assert.equal(e.requests.length, 0); assert.deepEqual(plain(p.aiProposal), ['A']); assert.equal(e.a.hasSubmittedAnswer(p.result), false);
});

test('50026 falls back to retry only when policy permits', async t => {
  const respond = url => url.endsWith('/answer') ? { code: 50026, msg: 'closed' } : { code: 0, data: { success: ['P'] } };
  const e = environment(t, {}, { respond }); const p = e.addProblem();
  const result = await e.a.submitAnswer(p, ['A'], { policy: 'auto' }); assert.equal(result.route, 'retry'); assert.equal(e.requests.length, 2);
  const f = environment(t, {}, { respond }); const q = f.addProblem();
  await assert.rejects(f.a.submitAnswer(q, ['A'], { policy: 'normal' }), error => error.code === 50026); assert.equal(f.requests.length, 1); assert.equal(q.result, undefined);
});

test('an empty retry success list never updates the remote answer, even with the native interceptor installed', async t => {
  const e = environment(t, {}, { respond: () => ({ code: 0, data: { success: [] } }) }); const p = e.addProblem(); e.a.installXHRInterceptor();
  await assert.rejects(e.a.submitAnswer(p, ['A'], { forceRetry: true }), /未确认/);
  assert.equal(p.result, undefined); assert.equal(e.a.repo.problemStatus.get('P').done, false);
});

test('unparseable submission responses preserve the proposal and require reconciliation before another submission', async t => {
  const e = environment(t, {}, { respond: () => '<html>error</html>' }); const p = e.addProblem();
  await assert.rejects(e.a.submitAnswer(p, ['A']), error => error.unknown === true);
  assert.deepEqual(plain(p.pendingAnswer), ['A']); assert.equal(e.a.repo.problemStatus.get('P').needsReconciliation, true);
  await assert.rejects(e.a.submitAnswer(p, ['A']), /核实/); assert.equal(e.requests.length, 1);
  e.a.actions.onAnswerProblem('P', ['B']); assert.equal(e.a.repo.problemStatus.get('P').needsReconciliation, false); assert.deepEqual(plain(p.result), ['B']);
});

test('native submit timeout settles the task as unknown instead of leaving it hanging', async t => {
  const e = environment(t, {}, { respond: () => ({ hold: true }) }); const p = e.addProblem(); const task = e.a.submitAnswer(p, ['A']);
  await tick(); assert.equal(e.requests[0].timeout, 20000); assert.equal(typeof e.requests[0].ontimeout, 'function');
  e.requests[0].ontimeout(); await assert.rejects(task, error => error.unknown); assert.equal(e.a.repo.problemStatus.get('P').phase, 'unknown');
});

test('batch retries synchronize every confirmed ID, not just the first', async t => {
  const e = environment(t); const p = e.addProblem(), q = e.addProblem('Q'); e.a.installXHRInterceptor();
  const xhr = new e.w.XMLHttpRequest(); xhr.open('POST', '/api/v3/lesson/problem/retry', true); xhr.send(JSON.stringify({ problems: [{ problemId: 'P', result: ['A'] }, { problemId: 'Q', result: ['B'] }] }));
  await tick(); assert.deepEqual(plain(p.result), ['A']); assert.deepEqual(plain(q.result), ['B']);
});

test('fetch(Request) bodies are observed without consuming the original request', async t => {
  const e = environment(t, {}, { fetch: async () => ({ clone() { return this; }, json: async () => ({ code: 0 }) }) }); const p = e.addProblem(); e.a.installFetchInterceptor();
  const request = new e.w.Request('https://changjiang.yuketang.cn/api/v3/lesson/problem/answer', { method: 'POST', body: JSON.stringify({ problemId: 'P', result: ['B'] }) });
  await e.w.fetch(request); await tick(); assert.deepEqual(plain(p.result), ['B']); assert.equal(request.bodyUsed, false);
});

test('XHR.open preserves all optional native arguments', t => {
  const e = environment(t); e.a.installXHRInterceptor(); const xhr = new e.w.XMLHttpRequest(); xhr.open('GET', '/example', true, 'fixture-user', 'fixture-password'); assert.equal(xhr.openArguments.length, 5);
});

test('classroom events remain scoped even if two lessons reuse a question identifier', t => {
  const e = environment(t); e.addProblem(); e.addProblem('P', {}, 'L2');
  e.a.actions.onProblemFinished('P', { lessonId: 'L2' }); assert.equal(e.a.repo.forLesson('L2').problemStatus.get('P').finished, true); assert.equal(e.a.repo.problemStatus.get('P').finished, undefined);
  e.a.repo.currentLessonId = 'L2'; assert.equal(e.a.repo.presentations.size, 1); assert.equal(e.a.repo.problems.get('P').lessonId, 'L2');
});

test('unlock arriving before presentation data resumes after data loads, with no second timeline needed', t => {
  const e = environment(t, { autoAnswer: true });
  const event = { prob: 'P', sid: 'SP', pres: 'PR', dt: e.w.Date.now(), limit: 60 };
  e.a.actions.onUnlockProblem(event); assert.equal(e.a.repo.forLesson().pendingEvents.size, 1);
  e.a.actions.onPresentationLoaded('PR', { slides: [{ id: 'SP', problem: { problemId: 'P', problemType: 1, body: 'q', options: [{ key: 'A' }] } }] });
  assert.equal(e.a.repo.forLesson().pendingEvents.size, 0); assert.notEqual(e.a.repo.problemStatus.get('P').autoAnswerTime, null);
});

test('managed sockets are cleared after close and can reconnect', async t => {
  const e = environment(t); e.a.installWSInterceptor(); const first = e.a.connectOrAttachLessonWS({ lessonId: 'L1', auth: 'fixture-token' }); await tick();
  first.close(); assert.equal(e.a.repo.isLessonConnected('L1'), false);
  const second = e.a.connectOrAttachLessonWS({ lessonId: 'L1', auth: 'fixture-token' }); assert.notEqual(first, second);
});

test('automatic join can stop and restart, and settings changes apply to its running controller', async t => {
  const e = environment(t); let calls = 0; e.a.hooks({ lessons: async () => { calls++; return []; } });
  e.a.actions.startAutoJoinLoop(); await tick(); e.a.actions.stopAutoJoinLoop(); e.a.actions.startAutoJoinLoop(); await tick();
  assert.equal(calls, 2); e.a.actions.stopAutoJoinLoop();
  e.a.ui.config.autoJoinEnabled = true; e.a.ui.saveConfig(); assert.equal(e.a.repo.autoJoinRunning, true);
  e.a.ui.config.autoJoinEnabled = false; e.a.ui.saveConfig(); assert.equal(e.a.repo.autoJoinRunning, false);
});

test('a reset clears API keys and non-default audio/analysis fields without mutating defaults', t => {
  const e = environment(t, { customNotifyAudioSrc: 'data:audio/wav;base64,AAAA', aiAutoAnalyze: true });
  e.a.ui.config.ai.profiles[0].apiKey = 'fixture-secret'; e.a.ui.saveConfig(); assert.equal(e.a.ui.resetConfig(), true);
  assert.equal(e.a.ui.config.ai.profiles[0].apiKey, ''); assert.equal(e.a.ui.config.customNotifyAudioSrc, ''); assert.equal(e.a.ui.config.aiAutoAnalyze, false);
  const saved = e.a.storage.get('config'); assert.equal(saved.ai.profiles[0].apiKey, '');
});

test('settings preserve zero volume, zero random delay, and explicitly cleared vision model', async t => {
  const e = environment(t, { autoAnswerRandomDelay: 0 }); e.a.mountSettingsPanel(); const doc = e.w.document;
  assert.equal(doc.getElementById('ykt-input-random-delay').value, '0');
  doc.getElementById('ykt-input-notify-volume').value = '0'; doc.getElementById('ykt-ai-vision-model').value = '';
  doc.getElementById('ykt-btn-settings-save').click(); await tick();
  assert.equal(e.a.ui.config.notifyVolume, 0); assert.equal(e.a.ui.config.autoAnswerRandomDelay, 0); assert.equal(e.a.ui.config.ai.profiles[0].visionModel, '');
});

test('profile switching retains edited drafts and does not activate unsaved profiles', t => {
  const e = environment(t); e.a.ui.config.ai.profiles.push({ id: 'second', name: 'Second', apiKey: '', model: 'other' }); e.a.mountSettingsPanel();
  const doc = e.w.document, name = doc.getElementById('ykt-ai-profile-name'), select = doc.getElementById('ykt-ai-profile-select');
  name.value = 'Edited name'; select.value = 'second'; select.dispatchEvent(new e.w.Event('change'));
  assert.equal(e.a.ui.config.ai.activeProfileId, 'default'); select.value = 'default'; select.dispatchEvent(new e.w.Event('change')); assert.equal(name.value, 'Edited name');
});

test('one AI open operation produces a single paid request even if multiple UI events fire', async t => {
  const e = environment(t, { aiAutoAnalyze: true }); e.addProblem(); e.a.repo.currentSlideId = 'SP'; e.a.mountAIPanel(); e.a.ui._mountAll();
  e.w.dispatchEvent(new e.w.CustomEvent('ykt:ask-ai-for-slide', { detail: { slideId: 'SP', imageUrl: 'https://image.example.test/1.jpg' } }));
  e.w.dispatchEvent(new e.w.CustomEvent('ykt:open-ai')); await tick(); assert.equal(e.aiRequests.length, 1);
});

test('a late AI response cannot replace a newer page analysis', async t => {
  const e = environment(t); e.addProblem(); e.addProblem('Q'); e.a.mountAIPanel(); const first = deferred(), second = deferred(); let call = 0;
  e.a.hooks({ vision: () => (++call === 1 ? first.promise : second.promise) });
  e.w.dispatchEvent(new e.w.CustomEvent('ykt:open-ai', { detail: { slideId: 'SP' } })); const a = e.a.askAIFusionMode(); await tick();
  e.w.dispatchEvent(new e.w.CustomEvent('ykt:open-ai', { detail: { slideId: 'SQ' } })); const b = e.a.askAIFusionMode(); await tick();
  second.resolve('答案: ["B"]'); await b; first.resolve('答案: ["A"]'); await a;
  assert.match(e.w.document.getElementById('ykt-ai-answer').textContent, /B/); assert.doesNotMatch(e.w.document.getElementById('ykt-ai-answer').textContent, /\["A"\]/);
});

test('double OCR clicks share one in-flight request', async t => {
  const e = environment(t); e.addProblem(); e.a.repo.currentSlideId = 'SP'; e.a.updatePresentationList(); const d = deferred(); let calls = 0;
  e.a.hooks({ ocr: () => { calls++; return d.promise; } }); const a = e.a.recognizeCurrentSlideText(), b = e.a.recognizeCurrentSlideText(); await tick();
  assert.equal(calls, 1); d.resolve('recognized'); await Promise.all([a, b]);
});

test('a missing page in a multi-page question is reported before the model is called', async t => {
  const e = environment(t); e.addProblem(); e.addProblem('Q'); e.a.mountAIPanel(); e.a.hooks({ capture: async id => id === 'SP' ? 'data:image/jpeg;base64,/9j/a' : null });
  e.w.dispatchEvent(new e.w.CustomEvent('ykt:ask-ai-for-slides', { detail: { source: 'manual', slides: [{ slideId: 'SP' }, { slideId: 'SQ' }] } }));
  await e.a.askAIFusionMode(); assert.equal(e.aiRequests.length, 0); assert.match(e.w.document.getElementById('ykt-ai-error').textContent, /1 页图片失败/);
});

test('Markdown preserves TeX underscores and code without turning them into emphasis', t => {
  const e = environment(t); const html = e.a.mdToHtml('$x_1 + x_2$\n\n```python\nx_y_z=1\n```');
  assert.match(html, /x_1 \+ x_2/); assert.match(html, /x_y_z=1/); assert.doesNotMatch(html, /<em>/);
});

test('report pages merge later-loaded slides after the first successful collection', t => {
  const e = environment(t, {}, { url: 'https://changjiang.yuketang.cn/v2/web/student-lesson-report/fixture' });
  const list = e.w.document.createElement('section'); list.className = 'slides-list'; list.innerHTML = '<img src="https://thu-private-qn.yuketang.cn/slide/123/1.png">'; e.w.document.body.appendChild(list);
  e.a.ensureStaticReportPresentation(); list.insertAdjacentHTML('beforeend', '<img src="https://thu-private-qn.yuketang.cn/slide/123/2.png">'); e.a.ensureStaticReportPresentation();
  assert.equal([...e.a.repo.presentations.values()][0].slides.length, 2);
});

test('loading a scoped presentation cache hydrates slide and question indexes', t => {
  const e = environment(t); const data = { slides: [{ id: 'S2', problem: { problemId: 'P2', problemType: 1 } }] };
  e.a.storage.setMap(e.a.repo.storageKey('presentations', 'L2'), new Map([['PR2', data]])); e.a.repo.currentLessonId = 'L2'; e.a.repo.loadStoredPresentations();
  assert.equal(e.a.repo.slides.size, 1); assert.equal(e.a.repo.problems.size, 1);
});

test('storage failure never prevents the in-memory teacher-finished transition', t => {
  const e = environment(t); e.addProblem(); e.a.storage.set = () => { throw new Error('QuotaExceededError'); };
  assert.doesNotThrow(() => e.a.actions.onProblemFinished('P')); assert.equal(e.a.repo.problemStatus.get('P').finished, true);
});

test('ai=null configuration migrates before any deep field access', t => { const e = environment(t, { ai: null }); assert.equal(Array.isArray(e.a.ui.config.ai.profiles), true); });

for (const [mode, inWindow, expected] of [['on', false, 'fast-model'], ['off', true, 'fixture-model'], ['auto', true, 'fast-model'], ['auto', false, 'fixture-model']]) test(`quick ${mode}, window ${inWindow}, uses ${expected} in the actual request`, async t => {
  const e = environment(t, { autoAnswer: true, quickAnswerMode: mode, fastAnswerProfileId: 'fast' }); const p = e.addProblem();
  const date = new e.w.Date(e.w.Date.now()); const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  e.a.ui.config.answerPriorityTimes = inWindow ? [time] : [];
  e.a.ui.config.ai.profiles.push({ id: 'fast', apiKey: 'fixture-fast-key', baseUrl: 'https://ai.example.test/v1/chat/completions', model: 'fast-model', visionModel: 'fast-model' });
  await e.a.actions.handleAutoAnswer(p); assert.equal(JSON.parse(e.aiRequests[0].data).model, expected);
});

test('two tabs cannot independently generate and submit the same question', async t => {
  const sharedStorage = new Map(), locks = new Map();
  const e = environment(t, { autoAnswer: true }, { sharedStorage, locks }), f = environment(t, { autoAnswer: true }, { sharedStorage, locks });
  const p = e.addProblem(), q = f.addProblem(); await Promise.all([e.a.actions.handleAutoAnswer(p), f.a.actions.handleAutoAnswer(q)]);
  assert.equal(e.aiRequests.length + f.aiRequests.length, 1); assert.equal(e.requests.length + f.requests.length, 1);
});

test('save failure rolls runtime settings back and reports that persistence failed', t => {
  const e = environment(t); const previous = e.a.ui.config.autoAnswer;
  e.a.storage.set = () => { throw new Error('QuotaExceededError'); }; e.a.ui.config.autoAnswer = !previous;
  assert.equal(e.a.ui.saveConfig(), false); assert.equal(e.a.ui.config.autoAnswer, previous); assert.match(e.notices.at(-1)[0], /未保存/);
});

test('current courseware is quiet while another new publication is deduplicated', t => {
  const e = environment(t); e.a.ui.config.notifyProblems = true; let count = 0; e.a.ui.notifyPublish = () => { count++; }; e.a.repo.currentPresentationId = 'PR';
  assert.equal(e.a.actions.onPublishEvent({ category: 'courseware', dedupeKey: 'courseware:PR' }), false);
  e.a.actions.onPublishEvent({ category: 'courseware', dedupeKey: 'courseware:OTHER' }); e.a.actions.onPublishEvent({ category: 'courseware', dedupeKey: 'courseware:OTHER' }); assert.equal(count, 1);
});

test('finished untimed cards disappear and each remaining card opens its own question', t => {
  const e = environment(t); e.addProblem(); const q = e.addProblem('Q'); e.a.repo.problemStatus.get('P').endTime = null; e.a.repo.problemStatus.get('P').finished = true;
  e.a.updateActiveProblems(); const cards = e.w.document.querySelectorAll('.active-problem-card'); assert.equal(cards.length, 1);
  let detail; e.w.addEventListener('ykt:open-ai', ev => { detail = ev.detail; }); [...cards[0].querySelectorAll('button')].find(x => x.textContent === 'AI 解答').click(); assert.equal(detail.problemId, q.problemId);
});

test('danmu never overwrites a user draft and click alone never counts as dispatch', async t => {
  const e = environment(t); const doc = e.w.document; doc.body.insertAdjacentHTML('beforeend', '<input class="send__input"><button class="send__btn">send</button>'); const input = doc.querySelector('.send__input'); input.value = 'my draft';
  assert.equal((await e.a.sendDanmuText('auto', { root: doc })).reason, 'user-editing'); assert.equal(input.value, 'my draft');
  input.value = ''; assert.equal((await e.a.sendDanmuText('auto', { root: doc, awaitConfirmationMs: 10 })).sent, false);
});

test('a matching outbound frame confirms dispatch only for the correct lesson', async t => {
  const e = environment(t); const doc = e.w.document; doc.body.insertAdjacentHTML('beforeend', '<input class="send__input"><button class="send__btn">send</button>');
  doc.querySelector('.send__btn').onclick = () => {
    e.w.dispatchEvent(new e.w.CustomEvent('ykt:danmu-outbound', { detail: { lessonId: 'L2', message: { op: 'senddanmu', danmu: 'auto' } } }));
    e.w.dispatchEvent(new e.w.CustomEvent('ykt:danmu-outbound', { detail: { lessonId: 'L1', message: { op: 'senddanmu', danmu: 'auto' } } }));
  };
  const result = await e.a.sendDanmuText('auto', { root: doc, lessonId: 'L1' }); assert.equal(result.sent, true); assert.equal(result.confirmed, false);
});

test('a stuck image download has a bounded timeout and cannot leave answering stuck', async t => {
  const e = environment(t, { autoAnswer: true }); const p = e.addProblem(); const nativeTimeout = e.w.setTimeout;
  e.w.setTimeout = (fn, ms, ...rest) => nativeTimeout(fn, ms === 12000 ? 5 : ms, ...rest);
  e.w.Image = class { set src(value) { this.url = value; } };
  e.a.hooks({ capture: e.a.captureSlideImageOriginal });
  await e.a.actions.handleAutoAnswer(p); assert.equal(e.a.repo.problemStatus.get('P').answering, false); assert.equal(e.requests.length, 1);
});

test('an expired queue deadline is checked when dispatched, before a paid request is sent', async t => {
  let respond; const e = environment(t, {}, { onAI: opt => { respond = opt; } }); const cfg = e.a.ui.config.ai;
  const first = e.a.queryAIVision('/9j/AAAA', 'first', cfg); await tick();
  const second = e.a.queryAIVision('/9j/AAAA', 'second', cfg, { deadline: e.w.Date.now() + 10000 });
  const rejected = assert.rejects(second, error => error.name === 'DeadlineError');
  e.setNow(e.w.Date.now() + 20000); respond.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: '答案: ["A"]' } }] }) });
  await first; await rejected; assert.equal(e.aiRequests.length, 1);
});

test('JPEG images retain the matching MIME in the actual vision payload', async t => {
  const e = environment(t); await e.a.queryAIVision('data:image/jpeg;base64,/9j/AAAA', 'q', e.a.ui.config.ai);
  const payload = JSON.parse(e.aiRequests[0].data); const image = payload.messages.flatMap(x => Array.isArray(x.content) ? x.content : []).find(x => x.type === 'image_url');
  assert.match(image.image_url.url, /^data:image\/jpeg;base64,/);
});

test('refresh restores an interrupted task and local proposal without repeating the model call', async t => {
  const sharedStorage = new Map(), e = environment(t, { autoAnswer: true }, { sharedStorage }); const p = e.addProblem();
  p.aiProposal = ['B']; p.draftText = '["B"]'; p.updatedAt = e.w.Date.now(); const status = e.a.repo.problemStatus.get('P'); status.phase = 'generating'; e.a.repo.persistWork();
  const f = environment(t, { autoAnswer: true }, { sharedStorage }); const q = f.addProblem(); f.a.repo.loadWork();
  assert.equal(f.a.repo.problemStatus.get('P').answering, false);
  await f.a.actions.handleAutoAnswer(f.a.repo.problems.get('P')); assert.equal(f.aiRequests.length, 0); assert.equal(f.requests.length, 1); assert.deepEqual(plain(f.a.repo.problems.get('P').result), ['B']);
});

test('SPA route changes switch the classroom view without retaining the previous lesson data', async t => {
  const e = environment(t); e.addProblem(); e.a.installRuntimeRouteWatcher();
  e.w.history.pushState({}, '', '/lesson/fullscreen/v3/L2'); await tick();
  assert.equal(e.a.repo.currentLessonId, 'L2'); assert.equal(e.a.repo.problems.size, 0); assert.equal(e.a.repo.presentations.size, 0); assert.equal(e.a.repo.forLesson('L1').problems.size, 1);
});

test('internal submission observations cannot invalidate the same task during post-submit verification', async t => {
  const e = environment(t, { autoAnswer: true, quickAnswerMode: 'on', fastAnswerProfileId: 'default', answerVerification: true, verifyAnswerProfileId: 'verify' }); const p = e.addProblem();
  e.a.ui.config.ai.profiles.push({ id: 'verify', apiKey: 'fixture-verify', baseUrl: 'https://ai.example.test/v1/chat/completions', model: 'verify-model', visionModel: 'verify-model' }); e.a.installXHRInterceptor();
  await e.a.actions.handleAutoAnswer(p); assert.equal(e.aiRequests.length, 2); assert.equal(e.a.repo.problemStatus.get('P').verificationState, 'same'); assert.equal(e.requests.length, 1);
});

test('courseware titles remain text rather than executable HTML', t => {
  const e = environment(t); e.a.repo.setPresentation('PR', { title: '<img src=x onerror="window.probe=1">', slides: [] }); e.a.updatePresentationList();
  const title = e.w.document.querySelector('.presentation-title'); assert.equal(title.querySelector('img'), null); assert.match(title.textContent, /<img/);
});

test('automatic-join policy can schedule its own lesson without enabling the manual-lesson switch', t => {
  const e = environment(t, { autoJoinEnabled: true, autoAnswerOnAutoJoin: true, autoAnswer: false });
  e.addProblem('P', {}, 'L2'); e.a.repo.forLesson('L2').problemStatus.clear(); e.a.repo.markLessonAutoJoined('L2');
  e.a.actions.onUnlockProblem({ prob: 'P', sid: 'SP', pres: 'PRP', dt: e.w.Date.now(), limit: 60 }, { lessonId: 'L2' });
  assert.notEqual(e.a.repo.forLesson('L2').problemStatus.get('P').autoAnswerTime, null);
});

test('paused automatic-join answering stays paused across persistence and reload', t => {
  const sharedStorage = new Map(); const e = environment(t, { autoJoinEnabled: true, autoAnswerOnAutoJoin: true, autoAnswer: true }, { sharedStorage });
  e.a.ui.config.autoAnswer = false; e.a.ui.saveConfig(); assert.equal(e.a.storage.get('config').autoAnswerPaused, true);
});

test('late boot starts once without forced reloads or duplicate toolbars', async t => {
  const e = environment(t, {}, { fullBoot: true }); await tick(10);
  assert.equal(e.w.document.querySelectorAll('#ykt-helper-toolbar').length, 1);
  assert.deepEqual(e.errors.filter(x => /navigation|reload|uncaught/i.test(x)), []);
  assert.equal(e.aiRequests.length, 0);
});

test('existing manual drafts are never silently replaced by a later automatic task', async t => {
  const e = environment(t, { autoAnswer: true }); const p = e.addProblem(); e.a.repo.saveDraft('P', '["B"]');
  await e.a.actions.handleAutoAnswer(p); assert.equal(e.requests.length, 0); assert.equal(e.aiRequests.length, 0); assert.equal(p.result, undefined); assert.equal(e.a.repo.problemStatus.get('P').phase, 'manual-draft');
});

test('cached unfinished proposals are actually rescheduled on boot, not only restored into a dormant map', async t => {
  const sharedStorage = new Map(), e = environment(t, { autoAnswer: true }, { sharedStorage }); const p = e.addProblem();
  e.a.repo.setPresentation('PRP', { slides: [{ id: 'SP', problem: { problemId: 'P', problemType: 1, body: 'q', options: [{ key: 'A' }, { key: 'B' }] } }] });
  p.aiProposal = ['B']; p.updatedAt = e.w.Date.now(); e.a.repo.problemStatus.get('P').phase = 'generating'; e.a.repo.persistWork();
  const f = environment(t, { autoAnswer: true }, { sharedStorage }); f.a.actions.launchLessonHelper();
  assert.notEqual(f.a.repo.problemStatus.get('P').autoAnswerTime, null); f.a.actions.tickAutoAnswer(); await tick();
  assert.equal(f.aiRequests.length, 0); assert.equal(f.requests.length, 1); assert.deepEqual(plain(f.a.repo.problems.get('P').result), ['B']);
});

test('a newer unlimited extension wins over stale explicit deadline options', async t => {
  const e = environment(t); const p = e.addProblem(); e.a.repo.problemStatus.get('P').endTime = null;
  const out = await e.a.submitAnswer(p, ['A'], { policy: 'normal', endTime: e.w.Date.now() - 10000 }); assert.equal(out.route, 'answer');
});
