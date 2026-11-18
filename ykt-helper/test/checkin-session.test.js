import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCheckinSession, normalizeSiteAuthorization } from '../src/core/checkin-session.js';
import fs from 'node:fs';
import { parseCurrentUserResponse } from '../src/core/current-user.js';
import { environment, tick } from './helpers/runtime.js';

const origin = 'https://changjiang.yuketang.cn';
const cookie = (name, value, extra = {}) => ({ name, value, domain: '.yuketang.cn', path: '/', httpOnly: true, ...extra });
const reply = (body, status = 200) => ({ status, text: async () => JSON.stringify(body), headers: { get: () => null } });
const refused = opt => opt.onload({ status: 200, responseText: '{"code":50000,"msg":"UNAUTHENTICATED"}' });
const noUid = e => { e.w.document.cookie = 'user_id=; Max-Age=0'; };

test('session selection retains all applicable same-site cookies with more specific paths first', () => {
  const selected = selectCheckinSession(origin, 'sessionid=visible; csrftoken=visible-csrf', [cookie('sessionid', 'root'), cookie('sessionid', 'api-session', { path: '/api' }), cookie('sessionid', 'other-page', { path: '/web' }), cookie('sessionid', 'other-host', { domain: 'pro.yuketang.cn' }), cookie('sessionid', 'attacker', { domain: '.example.test' }), cookie('sessionid', 'expired', { expirationDate: 1 }), cookie('routing_hint', 'same-site-value'), cookie('csrftoken', 'csrf')]);
  assert.equal(selected.sessionid, 'api-session'); assert.equal(selected.csrftoken, 'csrf');
  assert.equal(selected.cookie, 'sessionid=api-session; sessionid=root; routing_hint=same-site-value; csrftoken=csrf'); assert.equal(selected.source, 'gm-cookie');
});

test('invalid values and unrelated partition keys are never put in a session header', () => {
  const selected = selectCheckinSession(origin, '', [cookie('sessionid', 'bad\r\nheader'), cookie('sessionid', 'bad;cookie'), cookie('sessionid', 'wrong-partition', { partitionKey: { topLevelSite: 'https://example.test' } }), cookie('sessionid', 'wrong-host', { domain: 'yuketang.cn', hostOnly: true })]);
  assert.equal(selected.sessionid, ''); assert.equal(selected.cookie, ''); assert.equal(selected.source, 'jar-only');
});

test('current-user profile field precedence matches the verified client contract', () => {
  assert.equal(parseCurrentUserResponse({ data: { user_profile: { id: 'official-user', uid: 'unrelated-alias' } } }), 'official-user');
});

test('a manager-readable endpoint session retains its signature and companion cookies in the privileged request', async t => {
  const e = environment(t); let details;
  e.w.GM_cookie = { list(d, cb) { details = d; cb([cookie('sessionid', 'private-session'), cookie('csrftoken', 'private-csrf'), cookie('sessionid_sign', 'private-signature'), cookie('routing_hint', 'private-other')], null); } };
  await e.a.requestLessonCheckin('L1');
  const request = e.gmRequests[0]; assert.equal(details.url, origin + '/api/v3/lesson/checkin'); assert.equal(request.headers.sessionid, 'private-session'); assert.equal(request.headers['x-csrftoken'], 'private-csrf');
  assert.equal(request.cookie, 'sessionid=private-session; csrftoken=private-csrf; sessionid_sign=private-signature; routing_hint=private-other'); assert.equal(request.headers.Cookie, request.cookie); assert.equal(request.anonymous, false);
  assert.equal(request.cookiePartition.topLevelSite, 'https://yuketang.cn');
  assert.equal(request.redirect, 'error');
  assert.doesNotMatch(e.a.exportDiagnostics(), /private-session|private-csrf|private-signature|private-other/); assert.match(e.a.exportDiagnostics(), /"sessionHeaderAvailable":true/); assert.match(e.a.exportDiagnostics(), /"signedSessionAvailable":true/);
  const stored = [...Array(e.w.localStorage.length)].map((_, i) => e.w.localStorage.getItem(e.w.localStorage.key(i))).join('\n');
  assert.doesNotMatch(stored, /private-session|private-csrf|private-signature|private-other/);
});

test('site bearer normalization keeps one prefix and rejects invalid header values', () => {
  assert.equal(normalizeSiteAuthorization('site-token'), 'Bearer site-token'); assert.equal(normalizeSiteAuthorization(' Bearer site-token '), 'Bearer site-token');
  for (const value of [null, {}, false, '', 'null', 'undefined', 'Bearer ', 'Bearer Bearer site-token', 'x\r\ny', '中文']) assert.equal(normalizeSiteAuthorization(value), '');
});

test('a session requiring the signature, companion cookie and existing site bearer is forwarded intact', async t => {
  const e = environment(t, {}, { onCheckin: opt => {
    if (opt.headers.Authorization === 'Bearer private-site-token' && opt.headers.Cookie?.includes('sessionid_sign=private-sign') && opt.headers.Cookie?.includes('routing_hint=private-route')) opt.onload({ status: 200, responseText: '{"code":0,"data":{"lessonToken":"signed-session-token"}}' });
    else refused(opt);
  } });
  e.w.localStorage.setItem('Authorization', 'private-site-token');
  e.w.GM_cookie = { list(_, cb) { cb([cookie('sessionid', 'private-sid'), cookie('sessionid_sign', 'private-sign'), cookie('routing_hint', 'private-route')]); } };
  const result = await e.a.requestLessonCheckin('L1'); assert.equal(result.confirmed, true); assert.equal(e.gmRequests.length, 1);
  assert.equal(e.w.localStorage.getItem('Authorization'), 'private-site-token'); assert.match(e.a.exportDiagnostics(), /"authorizationAvailable":true/);
  assert.doesNotMatch(e.a.exportDiagnostics(), /private-site-token|private-sid|private-sign|private-route|signed-session-token/);
});

test('the browser retry retains the current-site bearer while the browser supplies its own cookies', async t => {
  let headers;
  const e = environment(t, {}, { onCheckin: refused, fetch: async (_, init) => { headers = init.headers; return reply({ code: 0, data: { lessonToken: 'browser-token' } }); } });
  e.w.localStorage.setItem('Authorization', 'Bearer existing-site-token');
  e.w.GM_cookie = { list(_, cb) { cb([cookie('sessionid', 'sid'), cookie('sessionid_sign', 'sign')]); } };
  await e.a.requestLessonCheckin('L1'); assert.equal(headers.Authorization, 'Bearer existing-site-token'); assert.equal(headers.Cookie, undefined);
  assert.equal(headers['User-Agent'], undefined); assert.equal(e.gmRequests[0].headers.Authorization, 'Bearer existing-site-token');
});

test('ordinary checkin also reuses the site bearer without requesting privileged cookies', async t => {
  let init; const e = environment(t, {}, { fetch: async (_, options) => { init = options; return reply({ code: 0, data: { lessonToken: 'web-token' } }); } });
  e.w.localStorage.setItem('Authorization', 'existing-web-token'); e.w.GM_cookie = { list() { throw new Error('must not be called'); } };
  await e.a.requestLessonCheckin('L1', { channel: 'web' }); assert.equal(init.headers.Authorization, 'Bearer existing-web-token'); assert.equal(init.headers.Cookie, undefined);
  assert.equal(JSON.parse(init.body).source, 9); assert.equal(e.gmRequests.length, 0);
});

test('cookie lookup uses the API path rather than taking an unrelated lesson-page session', async t => {
  const e = environment(t); e.w.GM_cookie = { list(details, cb) {
    cb(details.url.endsWith('/api/v3/lesson/checkin') ? [cookie('sessionid', 'api-session', { path: '/api' }), cookie('sessionid_sign', 'api-signature', { path: '/api' })] : [cookie('sessionid', 'lesson-session', { path: '/lesson' })]);
  } };
  await e.a.requestLessonCheckin('L1'); assert.equal(e.gmRequests[0].headers.sessionid, 'api-session'); assert.match(e.gmRequests[0].headers.Cookie, /sessionid_sign=api-signature/);
});

test('a partial cookie snapshot cannot replace the browser jar even when document.cookie contains a session', async t => {
  const e = environment(t); e.w.document.cookie = 'sessionid=visible-only'; e.w.GM_cookie = { list(_, cb) { cb([cookie('csrftoken', 'csrf-only')]); } };
  await e.a.requestLessonCheckin('L1'); assert.equal(e.gmRequests[0].headers.sessionid, 'visible-only');
  assert.equal(e.gmRequests[0].headers.Cookie, undefined); assert.equal(e.gmRequests[0].cookie, undefined);
});

test('companion cookies from other hosts, paths and partitions cannot enter the full cookie header', () => {
  const selected = selectCheckinSession(origin, '', [cookie('sessionid', 'current'), cookie('sessionid_sign', 'wrong-host', { domain: '.example.test' }), cookie('sessionid_sign', 'wrong-path', { path: '/lesson' }), cookie('sessionid_sign', 'wrong-partition', { partitionKey: { topLevelSite: 'https://example.test' } }), cookie('bad\nname', 'wrong-name')]);
  assert.equal(selected.cookie, 'sessionid=current'); assert.equal(selected.signedSessionAvailable, false); assert.equal(selected.cookieCount, 1);
});

test('transport setup exceptions cannot copy a credential-bearing error into diagnostics or UI', async t => {
  const e = environment(t, {}, { onCheckin() { throw new Error('Invalid Cookie private-session-signature and Bearer private-site-token'); } });
  e.w.localStorage.setItem('Authorization', 'private-site-token');
  await assert.rejects(e.a.requestLessonCheckin('L1'), error => error.unknown && !/private-session-signature|private-site-token/.test(error.message));
  assert.doesNotMatch(e.a.exportDiagnostics(), /private-session-signature|private-site-token/);
  assert.doesNotMatch(e.a.getLessonCheckinState('L1').lastError, /private-session-signature|private-site-token/);
});

test('the Cookie API target is explicitly matched without starting a classroom runtime on that JSON endpoint', async t => {
  const meta = fs.readFileSync(new URL('../userscript.meta.js', import.meta.url), 'utf8');
  assert.match(meta, /@match\s+https:\/\/\*\.yuketang\.cn\/api\/v3\/lesson\/checkin\s/);
  const e = environment(t, {}, { fullBoot: true, url: origin + '/api/v3/lesson/checkin' }); await tick();
  assert.equal(e.w.document.getElementById('ykt-toolbar'), null); assert.equal(e.w.__yktHelperDiag, undefined);
  assert.equal(e.w.XMLHttpRequest.prototype.__yktInstalled, undefined); assert.equal(e.w.fetch.__yktInstalled, undefined);
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
