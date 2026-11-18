import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckinRequest, parseCheckinResponse, CheckinError } from '../src/core/checkin-protocol.js';

const common = { origin: 'https://changjiang.yuketang.cn', lessonId: '900719925474099312345', userId: '900719925474099399999', cookie: 'user_id=1; csrftoken=csrf-fixture; sessionid=session=fixture' };

test('the app contract preserves long identifiers and includes the complete client identity', () => {
  const r = buildCheckinRequest(common);
  assert.equal(r.url, 'https://changjiang.yuketang.cn/api/v3/lesson/checkin');
  assert.deepEqual(r.payload, { source: 21, lessonId: common.lessonId, joinIfNotIn: true });
  assert.equal(r.headers['x-uid'], common.userId); assert.equal(r.headers['x-client'], 'app');
  assert.equal(r.headers['User-Agent'], 'Android'); assert.match(r.headers.xtua, /client=app/);
  assert.equal(r.headers.sessionid, 'session=fixture'); assert.equal(r.headers['x-csrftoken'], 'csrf-fixture');
  assert.equal(Object.hasOwn(r.headers, 'Cookie'), false);
});

test('the ordinary channel sends its own source value without forbidden client headers', () => {
  const r = buildCheckinRequest({ ...common, channel: 'web' });
  assert.equal(r.payload.source, 9); assert.equal(r.headers['x-client'], 'h5'); assert.equal(r.headers['User-Agent'], undefined);
});

test('credentials can only be sent to an exact supported HTTPS rain classroom host', () => {
  for (const origin of ['https://changjiang.yuketang.cn.attacker.test', 'http://changjiang.yuketang.cn', 'https://example.test', 'https://changjiang.yuketang.cn:8443']) assert.throws(() => buildCheckinRequest({ ...common, origin }), CheckinError);
  for (const host of ['www', 'pro', 'changjiang', 'huanghe']) assert.equal(new URL(buildCheckinRequest({ ...common, origin: `https://${host}.yuketang.cn` }).url).hostname, `${host}.yuketang.cn`);
});

test('invalid lesson ids and missing app identities fail before a request is constructed', () => {
  for (const lessonId of ['', undefined, '../../other', 'L1\nheader']) assert.throws(() => buildCheckinRequest({ ...common, lessonId }), CheckinError);
  assert.throws(() => buildCheckinRequest({ ...common, userId: null, cookie: '' }), /账号/);
});

test('successful checkin requires code zero and a lesson token; Set-Auth is case insensitive', () => {
  const r = parseCheckinResponse({ status: 200, body: '{"code":0,"data":{"lessonToken":"lesson-token","lessonId":"L1"}}', lessonId: 'L1', channel: 'app', headers: 'content-type: application/json\r\nSeT-AuTh: Bearer bearer-token\r\n' });
  assert.deepEqual(r, { token: 'lesson-token', setAuth: 'bearer-token', lessonId: 'L1', channel: 'app', confirmed: true, code: 0 });
});

test('dynamic-code refusal retains the real business code even if a token is present', () => {
  assert.throws(() => parseCheckinResponse({ status: 200, body: { code: 50070, msg: 'DYNAMIC_QR_CHECK_IN_REFUSED', data: { lessonToken: 'not-success' } }, lessonId: 'L1', channel: 'app' }), e => e.code === 50070 && !e.unknown);
});

test('HTML, missing or boolean status codes, and missing tokens remain unknown', () => {
  for (const body of ['<html>login</html>', {}, { code: false, data: { lessonToken: 't' } }, { code: true }, { code: ' ' }, { code: 0, data: {} }]) assert.throws(() => parseCheckinResponse({ status: 200, body, lessonId: 'L1', channel: 'app' }), e => e.unknown === true);
});

test('a response token for another classroom is never accepted', () => {
  assert.throws(() => parseCheckinResponse({ status: 200, body: { code: 0, data: { lessonId: 'L2', lessonToken: 't' } }, lessonId: 'L1', channel: 'app' }), e => e.unknown && /另一课堂/.test(e.message));
});

test('an HTTP failure is not transformed into a successful checkin by its JSON body', () => {
  assert.throws(() => parseCheckinResponse({ status: 503, body: { code: 0, data: { lessonToken: 't' } }, lessonId: 'L1' }), e => e.status === 503 && e.unknown);
});

test('an explicit negative attendance flag overrides a nominal success envelope', () => {
  for (const field of ['checkedIn', 'isCheckedIn', 'is_checked_in']) assert.throws(() => parseCheckinResponse({ status: 200, body: { code: 0, data: { lessonToken: 't', [field]: false } }, lessonId: 'L1' }), e => e.unknown);
});
