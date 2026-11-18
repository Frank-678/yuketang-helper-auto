import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveLessonResponse } from '../src/core/live-lessons.js';
import { environment, tick, deferred } from './helpers/runtime.js';

const response = (body, status = 200) => ({ status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const list = items => ({ code: 0, data: { onLessonClassrooms: items } });

test('the dedicated on-lesson list does not require a redundant status field and retains long identifiers', () => {
  const rows = parseLiveLessonResponse('{"code":0,"data":{"onLessonClassrooms":[{"lessonId":900719925474099312345,"name":"Course"},{"lesson_id":"L2","status":2},{"id":"L2"}]}}');
  assert.deepEqual(rows.map(x => x.lessonId), ['900719925474099312345', 'L2']);
  assert.equal(rows[0].name, 'Course'); assert.equal(rows[0].status, 1); assert.equal(rows[1].status, 1);
});

test('successfully empty data is distinguished from errors and unknown response structures', () => {
  assert.deepEqual(parseLiveLessonResponse(list([])), []);
  assert.deepEqual(parseLiveLessonResponse({ success: true, result: [] }), []);
  for (const body of [{ code: 50000, data: { onLessonClassrooms: [] } }, { code: 0, success: false, data: [] }, { code: false, data: [] }, { code: 0, data: {} }, { data: [] }, '<html>login</html>']) assert.throws(() => parseLiveLessonResponse(body));
});

test('a nonempty server list without usable lesson IDs is an error instead of a false empty result', () => {
  for (const item of [{ name: 'Course' }, { id: 9007199254740992 }, { lessonId: '../other' }, { id: 0 }]) assert.throws(() => parseLiveLessonResponse(list([item])), /有效课堂编号/);
});

test('live lesson requests use the current browser session and the existing site bearer', async t => {
  const calls = []; const e = environment(t, {}, { fetch: async (url, init) => { calls.push({ url, init }); return response(list([{ lessonId: 'L2' }])); } });
  e.w.localStorage.setItem('Authorization', 'Bearer private-site-token');
  const rows = await e.a.getOnLesson(); assert.equal(rows[0].lessonId, 'L2'); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://changjiang.yuketang.cn/api/v3/classroom/on-lesson');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer private-site-token'); assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.redirect, 'error'); assert.equal(calls[0].init.cache, 'no-store');
  assert.doesNotMatch(e.a.exportDiagnostics(), /private-site-token/);
});

test('a confirmed empty primary list does not probe aliases for a different answer', async t => {
  let calls = 0; const e = environment(t, {}, { fetch: async () => { calls++; return response(list([])); } });
  assert.deepEqual(Array.from(await e.a.getOnLesson()), []); assert.equal(calls, 1);
  assert.match(e.a.exportDiagnostics(), /live-lessons-loaded[^\n]*"count":0/);
});

test('a business authentication error is exposed and never converted into no courses', async t => {
  let calls = 0; const e = environment(t, {}, { fetch: async () => { calls++; return response({ code: 50000, msg: 'private-server-message', data: { onLessonClassrooms: [] } }); } });
  await assert.rejects(e.a.getOnLesson(), error => error.code === 50000 && /登录态校验/.test(error.message)); assert.equal(calls, 1);
  assert.match(e.a.exportDiagnostics(), /live-lessons-failed[^\n]*"code":50000/); assert.doesNotMatch(e.a.exportDiagnostics(), /private-server-message/);
});

test('an HTTP authentication error stops without trying unrelated aliases', async t => {
  let calls = 0; const e = environment(t, {}, { fetch: async () => { calls++; return response({}, 401); } });
  await assert.rejects(e.a.getOnLesson(), error => error.status === 401); assert.equal(calls, 1);
});

test('legacy aliases are used only when the primary endpoint is missing', async t => {
  const calls = []; const e = environment(t, {}, { fetch: async url => { calls.push(url); return calls.length === 1 ? response({}, 404) : response({ code: 0, result: [{ lesson_id: 'L2' }] }); } });
  const rows = await e.a.getOnLesson(); assert.equal(rows[0].lessonId, 'L2'); assert.equal(calls.length, 2);
  assert.match(calls[1], /\/mooc-api\/v1\/lms\/classroom\/on-lesson$/);
});

test('all missing endpoints and malformed successful responses remain visible failures', async t => {
  let calls = 0; const e = environment(t, {}, { fetch: async () => { calls++; return response({}, 404); } });
  await assert.rejects(e.a.getOnLesson(), error => error.status === 404); assert.equal(calls, 3);
  e.w.fetch = async () => response('<html>not-json</html>');
  await assert.rejects(e.a.getOnLesson(), error => error.reason === 'invalid-json');
});

test('a fetch that ignores abort is still bounded by the independent list timeout', async t => {
  const e = environment(t, {}, { fetch: () => new Promise(() => {}) });
  await assert.rejects(e.a.getOnLesson({ timeout: 5 }), error => error.reason === 'timeout');
  assert.match(e.a.exportDiagnostics(), /live-lessons-failed[^\n]*"reason":"timeout"/);
});

test('list reads can be cancelled before or during a stuck fetch', async t => {
  let calls = 0; const e = environment(t, {}, { fetch: () => { calls++; return new Promise(() => {}); } });
  const first = new e.w.AbortController(); first.abort();
  await assert.rejects(e.a.getOnLesson({ signal: first.signal }), error => error.reason === 'cancelled'); assert.equal(calls, 0);
  const second = new e.w.AbortController(), task = e.a.getOnLesson({ signal: second.signal }); await tick(); second.abort();
  await assert.rejects(task, error => error.reason === 'cancelled'); assert.equal(calls, 1);
});

test('a delayed list response from a previous account is discarded', async t => {
  const gate = deferred(); const e = environment(t, {}, { fetch: () => gate.promise });
  const task = e.a.getOnLesson(); await tick(); e.w.document.cookie = 'user_id=second-user'; gate.resolve(response(list([{ id: 'old-lesson' }])));
  await assert.rejects(task, error => error.reason === 'account-changed');
  assert.doesNotMatch(e.a.exportDiagnostics(), /live-lessons-loaded/);
});

test('the panel renders API entries without status and shows a busy refresh button', async t => {
  let calls = 0; const gate = deferred(); const e = environment(t, {}, { fetch: () => { calls++; return gate.promise; } }); e.a.hooks({ lessons: e.a.getOnLesson });
  e.a.showCheckinPanel(true); await tick();
  const button = e.w.document.getElementById('ykt-checkin-refresh'); assert.equal(button.disabled, true); assert.match(button.textContent, /正在刷新/);
  button.click(); assert.equal(calls, 1);
  gate.resolve(response(list([{ lessonId: 'L2', name: '<b>Course</b>' }]))); await tick();
  const row = e.w.document.querySelector('#ykt-checkin-list [data-lesson-id="L2"]'); assert.ok(row); assert.match(row.textContent, /<b>Course<\/b>/); assert.equal(row.querySelector('b'), null);
  assert.equal(button.disabled, false); assert.match(e.w.document.querySelector('#ykt-checkin-panel [role="status"]').textContent, /已读取 1 个/);
});

test('the panel displays a failed refresh distinctly and supports a successful retry', async t => {
  let calls = 0; const e = environment(t, {}, { fetch: async () => response(++calls === 1 ? { code: 50000 } : list([{ lessonId: 'L2' }])) });
  e.a.repo.currentLessonId = null; e.a.hooks({ lessons: e.a.getOnLesson }); e.a.showCheckinPanel(true); await tick();
  const panel = e.w.document.getElementById('ykt-checkin-panel'); assert.match(panel.textContent, /课堂列表读取失败/); assert.match(panel.textContent, /50000/); assert.doesNotMatch(panel.textContent, /暂无正在上课/);
  e.w.document.getElementById('ykt-checkin-refresh').click(); await tick();
  assert.ok(e.w.document.querySelector('#ykt-checkin-list [data-lesson-id="L2"]')); assert.doesNotMatch(panel.textContent, /课堂列表读取失败/);
});

test('a successful empty list is labelled as successfully read rather than failed', async t => {
  const e = environment(t, {}, { fetch: async () => response(list([])) }); e.a.repo.currentLessonId = null; e.a.hooks({ lessons: e.a.getOnLesson });
  e.a.showCheckinPanel(true); await tick(); const panel = e.w.document.getElementById('ykt-checkin-panel');
  assert.match(panel.textContent, /课堂列表读取成功：当前没有正在上课/); assert.doesNotMatch(panel.textContent, /读取失败/);
});

test('switching accounts during panel refresh cannot show the old list or keep refresh disabled', async t => {
  const gate = deferred(); const e = environment(t, {}, { fetch: () => gate.promise }); e.a.hooks({ lessons: e.a.getOnLesson });
  e.a.showCheckinPanel(true); await tick(); e.w.document.cookie = 'user_id=second-user'; e.a.renderCheckinList();
  gate.resolve(response(list([{ lessonId: 'old-account-lesson' }]))); await tick();
  assert.equal(e.w.document.querySelector('[data-lesson-id="old-account-lesson"]'), null); assert.equal(e.w.document.getElementById('ykt-checkin-refresh').disabled, false);
});

test('automatic entry consumes normalized server on-lesson entries without requiring status', async t => {
  const e = environment(t, {}, { fetch: async () => response(list([{ lessonId: 'L2' }])) }); e.a.hooks({ lessons: e.a.getOnLesson });
  e.a.actions.startAutoJoinLoop(); await tick(); e.a.actions.stopAutoJoinLoop();
  assert.equal(e.gmRequests.length, 1); assert.equal(JSON.parse(e.gmRequests[0].data).lessonId, 'L2'); assert.equal(e.a.repo.autoJoinedLessons.has('L2'), true);
});

test('list diagnostics omit response bodies and credentials and reject unsupported destinations', async t => {
  const e = environment(t, {}, { fetch: async () => response(list([{ lessonId: 'private-lesson-id', name: 'private-course-name', teacher: 'private-teacher' }])) });
  e.w.localStorage.setItem('Authorization', 'private-site-token'); await e.a.getOnLesson();
  assert.doesNotMatch(e.a.exportDiagnostics(), /private-lesson-id|private-course-name|private-teacher|private-site-token/);
  let calls = 0; const other = environment(t, {}, { url: 'https://example.test/lesson/fullscreen/v3/L1', fetch: async () => { calls++; return response(list([])); } });
  await assert.rejects(other.a.getOnLesson(), /支持的雨课堂站点/); assert.equal(calls, 0);
});
