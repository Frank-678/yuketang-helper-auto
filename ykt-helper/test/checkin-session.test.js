import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCheckinSession } from '../src/core/checkin-session.js';
import { parseCurrentUserResponse } from '../src/core/current-user.js';
import { environment, tick } from './helpers/runtime.js';

const origin = 'https://changjiang.yuketang.cn';
const cookie = (name, value, extra = {}) => ({ name, value, domain: '.yuketang.cn', path: '/', httpOnly: true, ...extra });
const reply = (body, status = 200) => ({ status, text: async () => JSON.stringify(body), headers: { get: () => null } });
const refused = opt => opt.onload({ status: 200, responseText: '{"code":50000,"msg":"UNAUTHENTICATED"}' });
const noUid = e => { e.w.document.cookie = 'user_id=; Max-Age=0'; };

test('session selection keeps only current-site authentication cookies and the most specific applicable path', () => {
  const selected = selectCheckinSession(origin, 'sessionid=visible; csrftoken=visible-csrf', [cookie('sessionid', 'root'), cookie('sessionid', 'api-session', { path: '/api' }), cookie('sessionid', 'other-page', { path: '/web' }), cookie('sessionid', 'other-host', { domain: 'pro.yuketang.cn' }), cookie('sessionid', 'attacker', { domain: '.example.test' }), cookie('sessionid', 'expired', { expirationDate: 1 }), cookie('password', 'unrelated-secret'), cookie('csrftoken', 'csrf')]);
  assert.equal(selected.sessionid, 'api-session'); assert.equal(selected.csrftoken, 'csrf');
  assert.equal(selected.cookie, 'sessionid=api-session; csrftoken=csrf'); assert.equal(selected.source, 'gm-cookie');
});

test('invalid values and unrelated partition keys are never put in a session header', () => {
  const selected = selectCheckinSession(origin, '', [cookie('sessionid', 'bad\r\nheader'), cookie('sessionid', 'bad;cookie'), cookie('sessionid', 'wrong-partition', { partitionKey: { topLevelSite: 'https://example.test' } }), cookie('sessionid', 'wrong-host', { domain: 'yuketang.cn', hostOnly: true })]);
  assert.equal(selected.sessionid, ''); assert.equal(selected.cookie, ''); assert.equal(selected.source, 'jar-only');
});

test('current-user profile field precedence matches the verified client contract', () => {
  assert.equal(parseCurrentUserResponse({ data: { user_profile: { id: 'official-user', uid: 'unrelated-alias' } } }), 'official-user');
});

test('a manager-readable HttpOnly session is passed in the app header and merged without replacing the full cookie jar', async t => {
  const e = environment(t); let details;
  e.w.GM_cookie = { list(d, cb) { details = d; cb([cookie('sessionid', 'private-session'), cookie('csrftoken', 'private-csrf'), cookie('password', 'private-other')], null); } };
  await e.a.requestLessonCheckin('L1');
  const request = e.gmRequests[0]; assert.equal(details.url, e.w.location.href); assert.equal(request.headers.sessionid, 'private-session'); assert.equal(request.headers['x-csrftoken'], 'private-csrf');
  assert.equal(request.cookie, 'sessionid=private-session; csrftoken=private-csrf'); assert.equal(request.headers.Cookie, undefined); assert.equal(request.anonymous, false);
  assert.equal(request.cookiePartition.topLevelSite, 'https://yuketang.cn');
  assert.doesNotMatch(e.a.exportDiagnostics(), /private-session|private-csrf|private-other/); assert.match(e.a.exportDiagnostics(), /"sessionHeaderAvailable":true/);
  const stored = [...Array(e.w.localStorage.length)].map((_, i) => e.w.localStorage.getItem(e.w.localStorage.key(i))).join('\n');
  assert.doesNotMatch(stored, /private-session|private-csrf|private-other/);
});

test('promise-based cookie APIs can supply the same current-site session', async t => {
  const e = environment(t); e.w.GM = { cookie: { list: async () => [cookie('sessionid', 'promise-session')] } };
  await e.a.requestLessonCheckin('L1'); assert.equal(e.gmRequests[0].headers.sessionid, 'promise-session');
});

test('unavailable or denied cookie APIs retain readable cookies and do not block app checkin', async t => {
  const e = environment(t); e.w.document.cookie = 'sessionid=readable-session';
  e.w.GM_cookie = { list(_, cb) { cb([], 'API denied'); } };
  await e.a.requestLessonCheckin('L1'); assert.equal(e.gmRequests[0].headers.sessionid, 'readable-session'); assert.equal(e.gmRequests[0].cookie, undefined);
  assert.match(e.a.exportDiagnostics(), /"cookieApi":"denied"/);
});

test('a cookie API that never calls back has an independent bounded fallback', async t => {
  const e = environment(t); e.w.GM_cookie = { list() {} };
  const session = await e.a.resolveCheckinSession({ timeout: 5, guard() {} });
  assert.equal(session.cookieApi, 'timeout'); assert.equal(session.sessionid, '');
});

test('cancelling while cookies are read prevents the first checkin request', async t => {
  const e = environment(t); e.w.GM_cookie = { list() {} }; const controller = new e.w.AbortController();
  const task = e.a.requestLessonCheckin('L1', { signal: controller.signal }); await tick(); controller.abort();
  await assert.rejects(task, /取消/); assert.equal(e.gmRequests.length, 0); assert.equal(e.a.getLessonCheckinState('L1').stage, 'session');
});

test('an account switch during cookie lookup discards the old account session', async t => {
  let callback; const e = environment(t); e.w.GM_cookie = { list(_, cb) { callback = cb; } };
  const task = e.a.requestLessonCheckin('L1'); await tick(); e.w.document.cookie = 'user_id=second-user'; callback([cookie('sessionid', 'old-session')]);
  await assert.rejects(task, /账号已变化/); assert.equal(e.gmRequests.length, 0); assert.equal(e.a.repo.forLesson('L1').auth, null);
});

test('the reported profile-success then GM-50000 failure can recover through the browser session without changing source 21', async t => {
  const fetches = [];
  const e = environment(t, {}, { onCheckin: refused, fetch: async (url, init) => {
    fetches.push({ url, init });
    return url.endsWith('/user_info') ? reply({ code: 0, data: { user_profile: { id: 'real-user' } } }) : reply({ code: 0, data: { lessonToken: 'browser-lesson-token' } });
  } }); noUid(e);
  const result = await e.a.actions.joinClassroom('L1');
  assert.equal(result.confirmed, true); assert.equal(result.channel, 'app'); assert.equal(result.transport, 'browser'); assert.equal(e.gmRequests.length, 1);
  const posts = fetches.filter(x => x.init.method === 'POST'); assert.equal(posts.length, 1);
  assert.equal(JSON.parse(posts[0].init.body).source, 21); assert.equal(posts[0].init.headers['x-client'], 'app'); assert.equal(posts[0].init.headers['x-uid'], 'real-user');
  assert.equal(posts[0].init.headers['User-Agent'], undefined); assert.equal(posts[0].init.credentials, 'include'); assert.equal(posts[0].init.redirect, 'error');
  assert.equal(e.a.getLessonCheckinState('L1').transport, 'browser'); assert.match(e.a.exportDiagnostics(), /checkin-transport-fallback/);
});

test('two authentication rejections cannot be called expired web login or a successful checkin', async t => {
  let posts = 0;
  const e = environment(t, {}, { onCheckin: refused, fetch: async (_, init) => {
    if (init.method === 'POST') { posts++; return reply({ code: 50000 }); }
    return reply({ code: 0, data: { user_profile: { id: 'real-user' } } });
  } }); noUid(e);
  await assert.rejects(e.a.requestLessonCheckin('L1'), error => error.code === 50000 && /网页账号读取正常，但签到鉴权失败/.test(error.message) && !/重新登录|登录已失效/.test(error.message));
  assert.equal(posts, 1); assert.equal(e.gmRequests.length, 1); assert.equal(e.a.repo.forLesson('L1').auth, null); assert.equal(e.a.getLessonCheckinState('L1').phase, 'failed');
});

test('a definite GM HTTP authentication rejection is eligible for only one browser attempt', async t => {
  let posts = 0;
  const e = environment(t, {}, { onCheckin: opt => opt.onload({ status: 401, responseText: '' }), fetch: async () => { posts++; return reply({ code: 0, data: { lessonToken: 'browser-token' } }); } });
  await e.a.requestLessonCheckin('L1'); assert.equal(posts, 1); assert.equal(e.gmRequests.length, 1);
});

test('dynamic-QR refusal and ambiguous server errors never cause a transport retry', async t => {
  let posts = 0;
  const e = environment(t, {}, { onCheckin: opt => opt.onload({ status: 200, responseText: '{"code":50070}' }), fetch: async () => { posts++; throw new Error('must not retry'); } });
  await assert.rejects(e.a.requestLessonCheckin('L1'), error => error.code === 50070); assert.equal(posts, 0);
  e.w.GM_xmlhttpRequest = opt => { e.gmRequests.push(opt); opt.onload({ status: 503, responseText: '{"code":50000}' }); };
  await assert.rejects(e.a.requestLessonCheckin('L1', { force: true }), error => error.unknown); assert.equal(posts, 0);
});

test('a timeout in the first transport remains unknown and is never automatically resent', async t => {
  let posts = 0;
  const e = environment(t, {}, { onCheckin() {}, fetch: async () => { posts++; return reply({}); } });
  await assert.rejects(e.a.requestLessonCheckin('L1', { timeout: 20 }), error => error.unknown); assert.equal(posts, 0); assert.equal(e.gmRequests.length, 1);
});

test('the browser fallback can be cancelled even when its fetch ignores abort', async t => {
  const e = environment(t, {}, { onCheckin: refused, fetch: () => new Promise(() => {}) }); const controller = new e.w.AbortController();
  const task = e.a.requestLessonCheckin('L1', { signal: controller.signal }); await tick(); controller.abort();
  await assert.rejects(task, /取消/); assert.equal(e.a.getLessonCheckinState('L1').phase, 'unknown'); assert.equal(e.gmRequests.length, 1);
});

test('an account switch before the first authentication rejection blocks the fallback', async t => {
  let posts = 0;
  const e = environment(t, {}, { onCheckin: opt => { e.w.document.cookie = 'user_id=second-user'; refused(opt); }, fetch: async () => { posts++; return reply({}); } });
  await assert.rejects(e.a.requestLessonCheckin('L1'), /账号已变化/); assert.equal(posts, 0); assert.equal(e.gmRequests.length, 1);
});

test('browser fallback redirects are rejected instead of confirming another site response', async t => {
  const e = environment(t, {}, { onCheckin: refused, fetch: async () => ({ ...reply({ code: 0, data: { lessonToken: 'wrong' } }), url: 'https://example.test/redirected' }) });
  await assert.rejects(e.a.requestLessonCheckin('L1'), error => error.unknown); assert.equal(e.a.repo.forLesson('L1').auth, null);
});
