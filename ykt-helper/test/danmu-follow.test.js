import assert from 'node:assert/strict';
import test from 'node:test';
import { createDanmuFollowTracker, createDanmuFollowController, extractDanmuMessage } from '../src/core/danmu-follow.js';
function batch(tracker, texts, at = 0) { return texts.map((x, i) => tracker.observe(x, at + i)).at(-1); }
test('requires seven messages within thirty seconds and chooses the most frequent full text', () => {
  const t = createDanmuFollowTracker();
  for (let i = 0; i < 6; i++) assert.equal(t.observe('same', i).triggered, false);
  const x = t.observe('other', 6); assert.equal(x.triggered, true); assert.equal(x.text, 'same'); assert.equal(x.count, 6);
});
test('ties choose the last occurrence and all distinct texts choose the latest', () => {
  const t = createDanmuFollowTracker(); assert.equal(batch(t, ['a', 'b', 'a', 'b', 'a', 'b', 'x']).text, 'b');
  t.reset(); assert.equal(batch(t, ['a', 'b', 'c', 'd', 'e', 'f', 'g']).text, 'g');
});
test('old messages outside the thirty second window do not count', () => {
  const t = createDanmuFollowTracker(); for (let i = 0; i < 6; i++) t.observe('a', i);
  assert.equal(t.observe('a', 30006).triggered, false);
});
test('reservations enforce two sends per absolute minute, even before asynchronous completion', () => {
  const t = createDanmuFollowTracker(); const a = batch(t, Array(7).fill('a')); const b = batch(t, Array(7).fill('b'), 10);
  assert.equal(a.triggered, true); assert.equal(b.triggered, true); assert.equal(batch(t, Array(7).fill('c'), 20).reason, 'round-limit');
  t.settle(a.token, { sent: true }); t.settle(b.token, { sent: true }); assert.equal(t.getSnapshot().sentCount, 2);
  const fresh = batch(t, Array(7).fill('a'), 60000); assert.equal(fresh.triggered, true);
});
test('same text is suppressed in one round; a definite failure rolls back its reservation', () => {
  const t = createDanmuFollowTracker(); const first = batch(t, Array(7).fill('a')); t.settle(first.token, { sent: false });
  const second = batch(t, Array(7).fill('a'), 10); assert.equal(second.triggered, true); t.settle(second.token, { sent: true });
  assert.equal(batch(t, Array(7).fill('a'), 20).reason, 'already-followed');
});
test('a late result from the previous round cannot consume new-round quota', () => {
  const t = createDanmuFollowTracker(); const first = batch(t, Array(7).fill('a')); batch(t, Array(7).fill('b'), 60000); t.settle(first.token, { sent: true }); assert.equal(t.getSnapshot().sentCount, 0);
});
test('controller awaits the sender and never counts its own messages', async () => {
  const sent = []; const c = createDanmuFollowController({ getCurrentUserId: () => 'self', send: async text => { sent.push(text); return { sent: true }; } });
  assert.equal((await c.handle({ op: 'newdanmu', danmu: 'a', userid: 'self' })).reason, 'own');
  for (let i = 0; i < 7; i++) await c.handle({ op: 'newdanmu', danmu: 'a', userid: 'other' });
  assert.deepEqual(sent, ['a']); assert.equal(c.getSnapshot().tracker.sentCount, 1);
});
test('disabled and notification-only controllers never send; parser retains identity', async () => {
  const c = createDanmuFollowController({ enabled: false, send: () => { throw new Error('must not send'); } });
  assert.equal((await c.handle({ op: 'newdanmu', danmu: 'x' })).triggered, false);
  assert.deepEqual(extractDanmuMessage({ op: 'newdanmu', data: { danmu: 'x', userid: 12 } }), { text: 'x', userId: '12' });
});
