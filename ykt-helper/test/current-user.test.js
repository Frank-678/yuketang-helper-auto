import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUserId, parseCurrentUserResponse, readPageUserIdentity } from '../src/core/current-user.js';
import { environment, deferred, tick } from './helpers/runtime.js';

const uid = '900719925474099312345';
const response = (body, status = 200) => ({ status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
function withoutUserCookie(e) { e.w.document.cookie = 'user_id=; Max-Age=0'; e.w.document.cookie = 'user_id=; Max-Age=0; Path=/'; }

test('own-profile responses support the public client profile envelopes and preserve long IDs', () => {
  for (const field of ['user_profile', 'user_info', 'user', 'profile', 'userInfo', 'userProfile', 'member']) {
    assert.equal(parseCurrentUserResponse({ code: 0, data: { [field]: { user_id: uid } } }), uid);
  }
  assert.equal(parseCurrentUserResponse(`{"code":0,"data":{"user_profile":{"id":${uid}}}}`), uid);
  assert.equal(parseCurrentUserResponse({ data: { data: { userId: uid } } }), uid);
  assert.equal(parseCurrentUserResponse({ user_profile: { uid } }), uid);
});

test('missing identities, unsafe numeric IDs, and negative profile acknowledgements cannot identify a user', () => {
  for (const value of [null, {}, true, false, 0, 9007199254740992, 'undefined', 'null', 'anonymous', 'u_fake', 'id\r\nheader']) assert.equal(normalizeUserId(value), null);
  for (const body of [{ code: 401, data: { id: uid } }, { code: 0, success: false, data: { id: uid } }, { data: { code: 50000, id: uid } }, { code: 0, data: { name: 'A user' } }, { code: 0, data: [{ id: uid }] }, { code: 0, data: { id: 9007199254740992 } }, '<html>login</html>']) assert.throws(() => parseCurrentUserResponse(body));
  assert.equal(parseCurrentUserResponse({ id: 'wrapper-id', user_profile: { id: uid } }), uid);
});

test('page identity reads cookie and supported page profiles without inventing an account', () => {
  assert.deepEqual(readPageUserIdentity('user_id=cookie-user', { YktUser: { id: uid } }), { userId: 'cookie-user', source: 'cookie' });
  assert.deepEqual(readPageUserIdentity('', { YktUser: { userId: uid } }), { userId: uid, source: 'page-user' });
  assert.deepEqual(readPageUserIdentity('', { __INITIAL_STATE__: { user: { id: uid } } }), { userId: uid, source: 'initial-state' });
  assert.equal(readPageUserIdentity('', {}), null);
});

test('a logged-in page without a user_id cookie resolves its own profile before checkin and passes the exact ID to the socket', async t => {
  const fetches = [], frames = [];
  const e = environment(t, {}, { fetch: async (url, init) => { fetches.push({ url, init }); return response(`{"code":0,"data":{"user_profile":{"id":${uid}}}}`); } });
  withoutUserCookie(e); e.w.document.cookie = 'sessionid=private-session';
  e.w.WebSocket.prototype.send = data => frames.push(JSON.parse(data));
  const result = await e.a.actions.joinClassroom('L1'); await tick();
  assert.equal(result.confirmed, true); assert.equal(e.gmRequests.length, 1); assert.equal(fetches.length, 1);
  assert.equal(fetches[0].url, 'https://changjiang.yuketang.cn/v/course_meta/user_info');
  assert.equal(fetches[0].init.credentials, 'include'); assert.equal(fetches[0].init.cache, 'no-store'); assert.equal(fetches[0].init.redirect, 'error');
  assert.equal(e.gmRequests[0].headers['x-uid'], uid); assert.equal(frames[0].userid, uid);
  assert.equal(e.a.getLessonCheckinState('L1').phase, 'confirmed');
  assert.doesNotMatch(e.a.exportDiagnostics(), /900719925474099312345|private-session|fixture-lesson-token/);
});

test('profile lookup falls back only through the three known current-user paths', async t => {
  const paths = [];
  const e = environment(t, {}, { fetch: async url => {
    const path = new URL(url).pathname; paths.push(path);
    if (path === '/v/course_meta/user_info') return response('not found', 404);
    if (path === '/api/v3/user/profile') return response({ code: 0, data: { name: 'Name without ID' } });
    return response({ data: { user_info: { userId: uid } } });
  } });
  withoutUserCookie(e); await e.a.requestLessonCheckin('L1');
  assert.deepEqual(paths, ['/v/course_meta/user_info', '/api/v3/user/profile', '/v2/api/web/userinfo']);
  assert.equal(e.gmRequests[0].headers['x-uid'], uid);
});

test('a known page account avoids extra profile requests and participates in account isolation', async t => {
  let fetches = 0;
  const e = environment(t, {}, { fetch: async () => { fetches++; throw new Error('must not fetch'); } });
  withoutUserCookie(e); e.w.YktUser = { id: uid };
  await e.a.requestLessonCheckin('L1');
  const account = e.a.repo.accountId; assert.equal(e.gmRequests[0].headers['x-uid'], uid); assert.equal(fetches, 0);
  e.w.YktUser = { id: 'second-page-user' }; assert.notEqual(e.a.repo.accountId, account); assert.equal(e.a.repo.forLesson('L1').auth, null);
});

test('ordinary web checkin does not require a user identity or call a profile endpoint', async t => {
  const urls = [];
  const e = environment(t, {}, { fetch: async url => { urls.push(url); return { ...response({ code: 0, data: { lessonToken: 'web-token' } }), headers: { get: () => null } }; } });
  withoutUserCookie(e); await e.a.requestLessonCheckin('L1', { channel: 'web' });
  assert.equal(urls.length, 1); assert.match(urls[0], /\/lesson\/checkin$/); assert.equal(e.gmRequests.length, 0);
});

test('definite login expiry prevents posting checkin and is reported as an identity failure', async t => {
  const urls = [];
  const e = environment(t, {}, { fetch: async url => { urls.push(url); return response({ code: 401, data: { id: uid } }, 401); } });
  withoutUserCookie(e);
  await assert.rejects(e.a.requestLessonCheckin('L1'), /登录已失效/);
  assert.equal(urls.length, 1); assert.equal(e.gmRequests.length, 0);
  const state = e.a.getLessonCheckinState('L1'); assert.equal(state.stage, 'identity'); assert.equal(state.code, 401); assert.equal(state.phase, 'failed');
  assert.match(e.a.exportDiagnostics(), /"stage":"identity"[^\n]*"requestSent":false/); assert.doesNotMatch(e.a.exportDiagnostics(), / checkin-start /);
});

test('a successful profile without an ID does not fabricate identity or claim the user is logged out', async t => {
  const e = environment(t, {}, { fetch: async () => response({ code: 0, data: { name: 'Name only' } }) });
  withoutUserCookie(e); await assert.rejects(e.a.requestLessonCheckin('L1'), /未能读取账号编号/);
  assert.equal(e.gmRequests.length, 0); assert.equal(e.a.repo.forLesson('L1').auth, null);
});

test('a stuck profile request times out independently even when fetch ignores abort', async t => {
  const e = environment(t, {}, { fetch: () => new Promise(() => {}) }); withoutUserCookie(e);
  await assert.rejects(e.a.requestLessonCheckin('L1', { timeout: 5 }), /读取当前账号超时/);
  assert.equal(e.gmRequests.length, 0); assert.equal(e.a.getLessonCheckinState('L1').phase, 'failed');
  assert.equal(e.a.getLessonCheckinState('L1').stage, 'identity');
});

test('cancellation while reading a profile settles without sending checkin', async t => {
  const e = environment(t, {}, { fetch: () => new Promise(() => {}) }); withoutUserCookie(e);
  const controller = new e.w.AbortController();
  const task = e.a.requestLessonCheckin('L1', { signal: controller.signal }); await tick(); controller.abort();
  await assert.rejects(task, /取消/); assert.equal(e.gmRequests.length, 0);
});

test('an already-cancelled checkin does not begin any identity request', async t => {
  let count = 0; const e = environment(t, {}, { fetch: async () => { count++; return response({ id: uid }); } }); withoutUserCookie(e);
  const controller = new e.w.AbortController(); controller.abort();
  await assert.rejects(e.a.requestLessonCheckin('L1', { signal: controller.signal }), /取消/);
  assert.equal(count, 0); assert.equal(e.gmRequests.length, 0);
});

test('a late profile from the old account cannot be used after a user_id switch', async t => {
  const gate = deferred(); const e = environment(t, {}, { fetch: () => gate.promise }); withoutUserCookie(e);
  const task = e.a.requestLessonCheckin('L1'); await tick(); e.w.document.cookie = 'user_id=second-user'; gate.resolve(response({ id: uid }));
  await assert.rejects(task, /账号已变化/); assert.equal(e.gmRequests.length, 0); assert.equal(e.a.repo.forLesson('L1').auth, null);
});

test('session-cookie changes also isolate late profile replies when user_id is unavailable', async t => {
  const gate = deferred(); const e = environment(t, {}, { fetch: () => gate.promise }); withoutUserCookie(e); e.w.document.cookie = 'sessionid=first-session';
  const account = e.a.repo.accountId, task = e.a.requestLessonCheckin('L1'); await tick();
  e.w.document.cookie = 'sessionid=second-session'; assert.notEqual(e.a.repo.accountId, account); gate.resolve(response({ id: uid }));
  await assert.rejects(task, /账号已变化/); assert.equal(e.gmRequests.length, 0); assert.equal(e.a.getLessonCheckinState('L1').phase, 'idle');
});

test('opaque sessions re-read identity instead of reusing a cached account or confirmed checkin', async t => {
  let calls = 0;
  const e = environment(t, {}, { fetch: async () => response({ code: 0, data: { id: ++calls === 1 ? uid : 'second-user' } }) }); withoutUserCookie(e);
  await e.a.requestLessonCheckin('L1'); await e.a.requestLessonCheckin('L1');
  assert.equal(calls, 2); assert.equal(e.gmRequests[0].headers['x-uid'], uid); assert.equal(e.gmRequests[1].headers['x-uid'], 'second-user');
});

test('the panel shows an identity lookup in progress and disables duplicate clicks', async t => {
  const gate = deferred(); const e = environment(t, {}, { fetch: () => gate.promise }); withoutUserCookie(e);
  e.a.showCheckinPanel(true); const task = e.a.requestLessonCheckin('L1'); await tick();
  const row = e.w.document.querySelector('#ykt-checkin-list [data-lesson-id="L1"]');
  assert.match(row.textContent, /正在识别当前登录账号/); assert.equal(row.querySelector('button').disabled, true);
  gate.resolve(response({ id: uid })); await task;
});

test('invalid destinations fail preflight before profile credentials can be requested', async t => {
  let count = 0;
  const e = environment(t, {}, { url: 'https://example.test/lesson/fullscreen/v3/L1', fetch: async () => { count++; return response({ id: uid }); } }); withoutUserCookie(e);
  await assert.rejects(e.a.requestLessonCheckin('L1'), /支持的雨课堂站点/); assert.equal(count, 0); assert.equal(e.gmRequests.length, 0);
});
