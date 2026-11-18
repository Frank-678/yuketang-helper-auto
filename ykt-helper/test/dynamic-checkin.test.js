import test from 'node:test';
import assert from 'node:assert/strict';
import { environment, plain, tick, deferred } from './helpers/runtime.js';

const ok = (opt, lessonId = 'L1', extra = {}) => opt.onload({ status: 200, responseHeaders: 'Set-Auth: fixture-new-bearer', responseText: JSON.stringify({ code: 0, data: { lessonToken: 'fixture-new-lesson-token', lessonId } }), ...extra });

test('app checkin uses the script manager cookie jar and records a server acknowledgement', async t => {
  const e = environment(t); e.w.document.cookie = 'csrftoken=fixture-csrf';
  const r = await e.a.requestLessonCheckin('L1');
  assert.equal(e.gmRequests.length, 1); assert.equal(e.aiRequests.length, 0);
  const request = e.gmRequests[0]; assert.equal(request.anonymous, false); assert.equal(request.headers['x-uid'], 'fixture-user'); assert.equal(request.headers['x-csrftoken'], 'fixture-csrf');
  assert.deepEqual(plain(JSON.parse(request.data)), { source: 21, lessonId: 'L1', joinIfNotIn: true });
  assert.equal(r.confirmed, true); assert.equal(e.a.getLessonCheckinState('L1').phase, 'confirmed');
  assert.equal(e.a.repo.forLesson('L1').auth.token, 'fixture-lesson-token');
});

test('concurrent entry points and immediate repeat calls reuse a single completed checkin', async t => {
  const e = environment(t); const a = e.a.requestLessonCheckin('L1'), b = e.a.requestLessonCheckin('L1');
  assert.equal(a, b); await Promise.all([a, b]); await e.a.requestLessonCheckin('L1'); assert.equal(e.gmRequests.length, 1);
});

test('dynamic-code rejection is visible, does not connect, and is cooled down until a manual retry', async t => {
  const e = environment(t, {}, { onCheckin: opt => opt.onload({ status: 200, responseText: '{"code":50070,"msg":"DYNAMIC_QR_CHECK_IN_REFUSED"}' }) });
  await assert.rejects(e.a.actions.joinClassroom('L1'), error => error.code === 50070);
  assert.equal(e.a.getLessonCheckinState('L1').phase, 'refused'); assert.equal(e.a.repo.isLessonConnected('L1'), false);
  await assert.rejects(e.a.requestLessonCheckin('L1'), error => error.code === 50070); assert.equal(e.gmRequests.length, 1);
  await assert.rejects(e.a.requestLessonCheckin('L1', { force: true })); assert.equal(e.gmRequests.length, 2);
});

test('a stuck request has an independent timeout even if the script manager never calls back', async t => {
  const e = environment(t, {}, { onCheckin() {} });
  await assert.rejects(e.a.requestLessonCheckin('L1', { timeout: 5 }), error => error.unknown === true);
  assert.equal(e.a.getLessonCheckinState('L1').phase, 'unknown'); assert.equal(e.a.repo.forLesson('L1').auth, null);
});

test('turning the checkbox off uses the ordinary web channel and its response Set-Auth', async t => {
  let init;
  const e = environment(t, { dynamicQrCheckin: false }, { fetch: async (_, options) => { init = options; return { status: 200, text: async () => '{"code":0,"data":{"lessonToken":"web-token"}}', headers: { get: () => 'web-bearer' } }; } });
  const r = await e.a.actions.joinClassroom('L1');
  assert.equal(e.gmRequests.length, 0); assert.equal(JSON.parse(init.body).source, 9); assert.equal(init.credentials, 'include');
  assert.equal(r.channel, 'web'); assert.equal(e.a.repo.forLesson('L1').auth.setAuth, 'web-bearer');
});

test('missing client transport does not silently claim success or use a different channel', async t => {
  const e = environment(t); delete e.w.GM_xmlhttpRequest;
  await assert.rejects(e.a.requestLessonCheckin('L1'), /客户端请求能力/);
  assert.equal(e.a.getLessonCheckinState('L1').phase, 'failed'); assert.equal(e.a.repo.forLesson('L1').auth, null);
});

test('late replies after an account switch cannot populate the new account auth or attendance', async t => {
  let pending; const e = environment(t, {}, { onCheckin: opt => { pending = opt; } });
  const task = e.a.requestLessonCheckin('L1'); await tick(); e.w.document.cookie = 'user_id=another-user'; ok(pending);
  await assert.rejects(task, /账号已变化/);
  assert.equal(e.a.getLessonCheckinState('L1').phase, 'idle'); assert.equal(e.a.repo.forLesson('L1').auth, null);
});

test('separate classroom responses retain their own bearer tokens, including when the other lesson is visible', async t => {
  const e = environment(t, {}, { onCheckin: opt => {
    const id = JSON.parse(opt.data).lessonId; ok(opt, id, { responseHeaders: `Set-Auth: bearer-${id}` });
  } });
  await Promise.all([e.a.requestLessonCheckin('L1'), e.a.requestLessonCheckin('L2')]);
  const p = e.addProblem(); e.a.repo.currentLessonId = 'L2'; await e.a.submitAnswer(p, ['B'], { lessonId: 'L1' });
  assert.equal(e.requests[0].headers.Authorization, 'Bearer bearer-L1');
  assert.equal(e.a.repo.forLesson('L2').auth.setAuth, 'bearer-L2'); assert.equal(e.w.localStorage.getItem('Authorization'), null);
});

test('credentials are neither persisted into drafts nor written into diagnostic exports', async t => {
  const e = environment(t, {}, { onCheckin: opt => ok(opt, 'L1', { responseHeaders: 'Set-Auth: private-bearer-secret', responseText: '{"code":0,"data":{"lessonToken":"private-lesson-secret"}}' }) });
  e.addProblem(); await e.a.requestLessonCheckin('L1'); e.a.repo.persistWork('L1'); await tick();
  const saved = [...Array(e.w.localStorage.length)].map((_, i) => e.w.localStorage.getItem(e.w.localStorage.key(i))).join('\n');
  assert.doesNotMatch(saved, /private-bearer-secret|private-lesson-secret/);
  assert.doesNotMatch(e.a.exportDiagnostics(), /private-bearer-secret|private-lesson-secret/);
});

test('opening the checkin panel can manually sign into the current classroom and show the confirmed state', async t => {
  const e = environment(t); e.a.showCheckinPanel(true); await tick();
  const row = e.w.document.querySelector('#ykt-checkin-list [data-lesson-id="L1"]'); row.querySelector('button').click(); await tick();
  assert.match(e.w.document.querySelector('#ykt-checkin-list').textContent, /服务器已确认签到/);
  assert.equal(e.a.repo.isLessonConnected('L1')?.readyState, 1);
});

test('settings retain the dynamic-code choice and the panel follows it', async t => {
  const e = environment(t); e.a.mountSettingsPanel(); const field = e.w.document.getElementById('ykt-input-dynamic-qr-checkin');
  assert.equal(field.checked, true); field.checked = false; e.w.document.getElementById('ykt-btn-settings-save').click(); await tick();
  assert.equal(e.a.ui.config.dynamicQrCheckin, false); e.a.showCheckinPanel(true); assert.equal(e.w.document.getElementById('ykt-checkin-dynamic').checked, false);
});

test('automatic entry continues to another classroom if one checkin fails', async t => {
  const e = environment(t, {}, { onCheckin: opt => {
    const id = JSON.parse(opt.data).lessonId;
    if (id === 'L1') opt.onload({ status: 200, responseText: '{"code":50070,"msg":"DYNAMIC_QR_CHECK_IN_REFUSED"}' }); else ok(opt, id);
  } });
  e.a.hooks({ lessons: async () => [{ lessonId: 'L1', status: 1 }, { lessonId: 'L2', status: 1 }] });
  e.a.actions.startAutoJoinLoop(); await tick(); e.a.actions.stopAutoJoinLoop();
  assert.equal(e.gmRequests.length, 2); assert.equal(e.a.repo.forLesson('L1').checkin.phase, 'refused'); assert.equal(e.a.repo.forLesson('L2').checkin.phase, 'confirmed'); assert.equal(e.a.repo.autoJoinedLessons.has('L2'), true);
});

test('an account change while the course list is loading prevents signing into the old list', async t => {
  const gate = deferred(); const e = environment(t); e.a.hooks({ lessons: () => gate.promise }); e.a.actions.startAutoJoinLoop();
  e.w.document.cookie = 'user_id=new-account'; gate.resolve([{ lessonId: 'L1', status: 1 }]); await tick(); e.a.actions.stopAutoJoinLoop(); assert.equal(e.gmRequests.length, 0);
});

test('cancelling an in-flight app request settles it without a success notification', async t => {
  const e = environment(t, {}, { onCheckin() {} }); const controller = new e.w.AbortController();
  const task = e.a.requestLessonCheckin('L1', { signal: controller.signal }); await tick(); controller.abort();
  await assert.rejects(task, /取消/); assert.equal(e.a.getLessonCheckinState('L1').phase, 'unknown');
});

test('a final redirect cannot move credential handling or success acknowledgement to another host', async t => {
  const e = environment(t, {}, { onCheckin: opt => ok(opt, 'L1', { finalUrl: 'https://example.test/redirected' }) });
  await assert.rejects(e.a.requestLessonCheckin('L1'), /其他站点/); assert.equal(e.a.repo.forLesson('L1').auth, null);
});

test('an ordinary channel request can be cancelled even if a fetch mock ignores abort', async t => {
  const e = environment(t, {}, { fetch: () => new Promise(() => {}) }); const controller = new e.w.AbortController();
  const task = e.a.requestLessonCheckin('L1', { channel: 'web', signal: controller.signal }); await tick(); controller.abort(); await assert.rejects(task, /取消/);
});

test('automatic-join membership does not carry into another account', t => {
  const e = environment(t); e.a.repo.markLessonAutoJoined('L1'); assert.equal(e.a.repo.autoJoinedLessons.has('L1'), true);
  e.w.document.cookie = 'user_id=new-account'; assert.equal(e.a.repo.autoJoinedLessons.has('L1'), false);
});

test('an account change during the first automatic checkin prevents processing the rest of the old list', async t => {
  let first; const e = environment(t, {}, { onCheckin: opt => { first = opt; } });
  e.a.hooks({ lessons: async () => [{ lessonId: 'L1', status: 1 }, { lessonId: 'L2', status: 1 }] });
  e.a.actions.startAutoJoinLoop(); await tick(); e.w.document.cookie = 'user_id=new-account'; ok(first); await tick(); e.a.actions.stopAutoJoinLoop();
  assert.equal(e.gmRequests.length, 1); assert.equal(e.a.repo.forLesson('L2').checkin.phase, 'idle');
});
