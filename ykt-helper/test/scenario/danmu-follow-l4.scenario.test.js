import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFakeElement,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const { document } = installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/danmu-l4',
});

const input = createFakeElement('input');
input.className = 'send__input';
const button = createFakeElement('button');
button.className = 'send__btn';
document.body.appendChild(input);
document.body.appendChild(button);

const { confirmDanmuSend } = await import('../../src/core/danmu-sender.js');
const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { actions } = await import('../../src/state/actions.js');

const toasts = [];
const events = [];
let clicks = 0;
button.onclick = () => {
  clicks += 1;
  // Real sender already registered the pending confirmation before click().
  confirmDanmuSend({ op: 'senddanmu', data: { text: input.value } });
};

ui.toast = message => toasts.push(String(message));
ui.notifyClassroomEvent = event => { events.push(event); return true; };
ui.updateActiveProblems = () => {};
ui.updateProblemList = () => {};
ui.config.autoFollowDanmu = true;
repo.currentLessonId = 'danmu-l4';

function message(text, userId = 'classmate') {
  return { op: 'newdanmu', data: { danmu: text, userid: userId } };
}

async function feedBurst(entries, startAt, stepMs = 500) {
  const results = [];
  for (let i = 0; i < entries.length; i += 1) {
    now = startAt + i * stepMs;
    results.push(await actions.onDanmu(message(entries[i]), { lessonId: 'danmu-l4' }));
  }
  return results;
}

const realDateNow = Date.now;
let now = 0;
Date.now = () => now;

test.after(() => {
  Date.now = realDateNow;
  uninstallBrowserGlobals();
});

test('7 messages in 30 seconds follow the most frequent exact text and confirm through outbound websocket', async () => {
  const results = await feedBurst(['same', 'other', 'same', 'same', 'other', 'same', 'same'], 0);
  const final = results.at(-1);

  assert.equal(final.triggered, true);
  assert.equal(final.text, 'same');
  assert.equal(final.count, 5);
  assert.deepEqual(final.sendResult, { sent: true, verified: true, text: 'same' });
  assert.equal(clicks, 1);
  assert.equal(input.value, 'same');
  assert.ok(events.some(event => event.kind === 'danmu-follow-trigger'));
  assert.ok(toasts.some(text => text.includes('弹幕已自动跟发')));
});

test('one round permits at most two confirmed follows across real actions/sender chain', async () => {
  const second = await feedBurst(['second','second','x','second','x','second','second'], 10_000);
  assert.equal(second.at(-1).triggered, true);
  assert.equal(second.at(-1).text, 'second');
  assert.equal(clicks, 2);

  const third = await feedBurst(['third','third','third','y','third','y','third'], 20_000);
  assert.equal(third.at(-1).triggered, false);
  assert.equal(third.at(-1).reason, 'round-limit');
  assert.equal(clicks, 2);
});

test('continuous traffic gets a fresh quota once the one-minute hard round boundary is reached', async () => {
  // The gap from the previous message is well below 60 seconds; only the hard
  // absolute round duration should start the new round here.
  const nextRound = await feedBurst(['fresh','fresh','z','fresh','z','fresh','fresh'], 60_000);
  const final = nextRound.at(-1);

  assert.equal(final.triggered, true);
  assert.equal(final.text, 'fresh');
  assert.equal(final.sendResult?.verified, true);
  assert.equal(clicks, 3);
  assert.ok(events.some(event => event.kind === 'danmu-round-start'));
});

test('the sender own echo is consumed and cannot count toward a new burst', async () => {
  now = 64_000;
  const echo = await actions.onDanmu({ op: 'newdanmu', data: { danmu: 'fresh' } }, { lessonId: 'danmu-l4' });
  assert.equal(echo.triggered, false);
  assert.equal(echo.reason, 'own-echo');
  assert.equal(clicks, 3);
});
