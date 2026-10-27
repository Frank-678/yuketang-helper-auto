import test from 'node:test';
import assert from 'node:assert/strict';
import { environment, plain, tick, deferred } from './helpers/runtime.js';

const requestURL = '/api/v3/lesson/presentation/fetch?presentation_id=900719925474099312345&lesson_id=L1';
const presentationId = '900719925474099312345';
const deck = () => ({ title: '概率论课件', slides: [{ id: 'slide-1', index: 1, thumbnail: 'https://image.example.test/1-thumb.jpg', cover: 'https://image.example.test/1.jpg' }] });
const response = json => ({ ok: true, status: 200, clone() { return this; }, json: async () => json });

for (const envelope of ['data', 'result']) test(`XHR captures a real-style ${envelope} payload without a body id and renders its slides`, async t => {
  const e = environment(t, { showAllSlides: true }, { respond: () => ({ code: 0, [envelope]: deck() }) });
  e.a.installXHRInterceptor();
  const xhr = new e.w.XMLHttpRequest(); xhr.open('GET', requestURL); xhr.send();
  await tick();
  assert.equal(e.a.repo.presentations.size, 1);
  assert.equal(e.a.repo.presentations.get(presentationId)?.title, '概率论课件');
  assert.equal(e.w.document.querySelectorAll('#ykt-presentation-list .slide-thumb').length, 1);
  assert.equal(e.w.document.querySelector('#ykt-presentation-list .no-presentations'), null);
  e.w.document.querySelector('#ykt-presentation-list .slide-thumb').click();
  assert.equal(e.a.repo.currentSlideId, 'slide-1');
  assert.equal(e.w.document.querySelector('#ykt-slide-view img')?.src, 'https://image.example.test/1.jpg');
});

for (const inputKind of ['string', 'URL', 'Request']) test(`fetch(${inputKind}) captures slides identified by the request query, including long ids`, async t => {
  const e = environment(t, { showAllSlides: true }, { fetch: async () => response({ code: 0, data: deck() }) });
  e.a.installFetchInterceptor();
  const url = new e.w.URL(requestURL, e.w.location.href);
  const input = inputKind === 'string' ? url.href : inputKind === 'URL' ? url : new e.w.Request(url.href);
  const res = await e.w.fetch(input); await tick();
  assert.equal(e.a.repo.presentations.get(presentationId)?.slides.length, 1);
  assert.equal(e.w.document.querySelectorAll('#ykt-presentation-list .slide-thumb').length, 1);
  assert.equal((await res.json()).data.title, '概率论课件');
  if (inputKind === 'Request') assert.equal(input.bodyUsed, false);
});

test('fetch accepts the legacy success/result presentation envelope', async t => {
  const e = environment(t, {}, { fetch: async () => response({ success: true, result: deck() }) });
  e.a.installFetchInterceptor(); await e.w.fetch(requestURL); await tick();
  assert.equal(e.a.repo.presentations.get(presentationId)?.slides.length, 1);
});

test('captured presentation releases a pending teacher event without a second unlock', async t => {
  const data = deck(); data.slides[0].problem = { problemId: 'P1', problemType: 1, body: '请选择', options: [{ key: 'A', value: '甲' }, { key: 'B', value: '乙' }] };
  const e = environment(t, { autoAnswer: true }, { respond: () => ({ code: 0, data }) });
  e.a.actions.onUnlockProblem({ prob: 'P1', sid: 'slide-1', pres: presentationId, dt: e.w.Date.now(), limit: 60 });
  assert.equal(e.a.repo.forLesson().pendingEvents.size, 1);
  e.a.installXHRInterceptor(); const xhr = new e.w.XMLHttpRequest(); xhr.open('GET', requestURL); xhr.send(); await tick();
  assert.equal(e.a.repo.forLesson().pendingEvents.size, 0);
  assert.notEqual(e.a.repo.problemStatus.get('P1')?.autoAnswerTime, null);
  assert.notEqual(e.a.repo.problemStatus.get('P1')?.autoAnswerTime, undefined);
  assert.equal(e.a.repo.problems.get('P1')?.lessonId, 'L1');
});

test('a delayed presentation response retains the request classroom after navigation', async t => {
  const gate = deferred(); const e = environment(t, {}, { fetch: () => gate.promise });
  e.a.installFetchInterceptor(); const pending = e.w.fetch(requestURL);
  e.a.repo.currentLessonId = 'L2'; gate.resolve(response({ code: 0, data: deck() })); await pending; await tick();
  assert.equal(e.a.repo.forLesson('L1').presentations.size, 1);
  assert.equal(e.a.repo.forLesson('L2').presentations.size, 0);
});

test('a failed presentation response does not populate the viewer', async t => {
  const e = environment(t, {}, { fetch: async () => response({ code: 403, data: { ...deck(), id: presentationId } }) });
  e.a.installFetchInterceptor(); await e.w.fetch(requestURL); await tick();
  assert.equal(e.a.repo.presentations.size, 0);
});

test('presentation capture keeps confirmed remote answers distinct from local drafts', async t => {
  const data = deck(); data.slides[0].problem = { problemId: 'P1', problemType: 1, result: ['A'] };
  const e = environment(t, {}, { respond: () => ({ code: 0, data }) });
  e.a.installXHRInterceptor(); const xhr = new e.w.XMLHttpRequest(); xhr.open('GET', requestURL); xhr.send(); await tick();
  assert.deepEqual(plain(e.a.repo.problems.get('P1')?.remoteAnswer), ['A']);
  assert.equal(e.a.repo.problems.get('P1')?.draftRevision ?? 0, 0);
});

for (const transport of ['XHR', 'fetch']) test(`${transport} discards a late presentation response after the account changes`, async t => {
  const gate = deferred();
  const e = environment(t, {}, { respond: () => gate.promise, fetch: () => gate.promise });
  const firstAccount = e.a.repo.accountId;
  let pending;
  if (transport === 'XHR') {
    e.a.installXHRInterceptor(); const xhr = new e.w.XMLHttpRequest(); xhr.open('GET', requestURL); xhr.send();
  } else { e.a.installFetchInterceptor(); pending = e.w.fetch(requestURL); }
  e.w.document.cookie = 'user_id=second-fixture-user';
  assert.notEqual(e.a.repo.accountId, firstAccount);
  gate.resolve(transport === 'XHR' ? { code: 0, data: deck() } : response({ code: 0, data: deck() }));
  if (pending) await pending;
  await tick();
  assert.equal(e.a.repo.presentations.size, 0);
  assert.equal(e.a.storage.getMap(e.a.repo.storageKey('presentations')).size, 0);
});

test('XHR responseType=json captures the same contract as responseText', async t => {
  const e = environment(t, {}, { respond: (_, __, xhr) => {
    const json = { code: 0, data: deck() }; xhr.response = json; return json;
  } });
  e.a.installXHRInterceptor(); const xhr = new e.w.XMLHttpRequest(); xhr.open('GET', requestURL); xhr.responseType = 'json'; xhr.send(); await tick();
  assert.equal(e.a.repo.presentations.get(presentationId)?.slides.length, 1);
});

test('a missing thumbnail falls back to the full-size cover', t => {
  const e = environment(t, { showAllSlides: true }); const data = deck(); delete data.slides[0].thumbnail;
  e.a.actions.onPresentationLoaded(presentationId, data);
  assert.equal(e.w.document.querySelector('.slide-thumb img')?.src, 'https://image.example.test/1.jpg');
});

test('image failures try the cover and preserve a selectable page when every URL fails', t => {
  const e = environment(t, { showAllSlides: true }); e.a.actions.onPresentationLoaded(presentationId, deck());
  const thumb = e.w.document.querySelector('.slide-thumb'); const img = thumb.querySelector('img');
  img.dispatchEvent(new e.w.Event('error'));
  assert.equal(img.src, 'https://image.example.test/1.jpg');
  img.dispatchEvent(new e.w.Event('error'));
  assert.equal(thumb.isConnected, true);
  assert.match(thumb.textContent, /图片暂不可用/);
  thumb.click(); assert.equal(e.a.repo.currentSlideId, 'slide-1');
});

test('question-only view explains a filtered empty deck and offers the all-pages switch', t => {
  const e = environment(t, { showAllSlides: false }); e.a.actions.onPresentationLoaded(presentationId, deck());
  assert.equal(e.w.document.querySelectorAll('.slide-thumb').length, 0);
  assert.match(e.w.document.querySelector('.no-problem-slides')?.textContent, /当前仅显示题目页/);
  e.w.document.querySelector('.no-problem-slides button').click();
  assert.equal(e.a.ui.config.showAllSlides, true);
  assert.equal(e.w.document.querySelectorAll('.slide-thumb').length, 1);
});

test('SPA classroom changes render cached pages and clear the old slide preview immediately', t => {
  const e = environment(t, { showAllSlides: true }); e.a.actions.onPresentationLoaded(presentationId, deck());
  e.w.document.querySelector('.slide-thumb').click();
  const nextDeck = { title: '第二节课', slides: [{ id: 'L2-slide', cover: 'https://image.example.test/L2.jpg' }] };
  e.a.storage.setMap(e.a.repo.storageKey('presentations', 'L2'), new Map([['L2-presentation', nextDeck]]));
  e.w.history.pushState({}, '', '/lesson/fullscreen/v3/L2'); e.a.actions.launchLessonHelper();
  assert.equal(e.a.repo.currentLessonId, 'L2');
  assert.match(e.w.document.querySelector('#ykt-presentation-list')?.textContent, /第二节课/);
  assert.doesNotMatch(e.w.document.querySelector('#ykt-presentation-list')?.textContent, /概率论课件/);
  assert.equal(e.w.document.querySelector('#ykt-slide-view img'), null);
});

for (const transport of ['XHR', 'fetch']) test(`${transport} ignores an HTTP failure even if the JSON body claims success`, async t => {
  const json = { code: 0, data: { ...deck(), id: presentationId } };
  const e = environment(t, {}, { respond: () => ({ ...json, httpStatus: 403 }), fetch: async () => ({ ...response(json), ok: false, status: 403 }) });
  if (transport === 'XHR') {
    e.a.installXHRInterceptor(); const xhr = new e.w.XMLHttpRequest(); xhr.open('GET', requestURL); xhr.send();
  } else { e.a.installFetchInterceptor(); await e.w.fetch(requestURL); }
  await tick(); assert.equal(e.a.repo.presentations.size, 0);
});
