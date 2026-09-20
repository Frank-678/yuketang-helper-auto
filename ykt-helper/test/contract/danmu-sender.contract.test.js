import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmDanmuSend, sendDanmuText } from '../../src/core/danmu-sender.js';

function controls({ disabled = false, ariaDisabled = null, click = null } = {}) {
  const events = [];
  const input = {
    value: '',
    ownerDocument: { defaultView: { Event: class Event { constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles; } } } },
    dispatchEvent(event) { events.push(event.type); return true; },
  };
  const button = {
    disabled,
    getAttribute(name) { return name === 'aria-disabled' ? ariaDisabled : null; },
    click: click || (() => {}),
  };
  const root = {
    querySelector(selector) {
      if (selector === '.send__input') return input;
      if (selector === '.send__btn') return button;
      return null;
    },
  };
  return { root, input, button, events };
}

test('empty and whitespace text is rejected before DOM lookup', async () => {
  assert.deepEqual(await sendDanmuText('', { root: null }), { sent: false, verified: false, text: '', reason: 'empty' });
  assert.deepEqual(await sendDanmuText('   ', { root: null }), { sent: false, verified: false, text: '   ', reason: 'empty' });
});

test('missing controls returns controls-unavailable', async () => {
  const root = { querySelector() { return null; } };
  assert.deepEqual(await sendDanmuText('x', { root }), { sent: false, verified: false, text: 'x', reason: 'controls-unavailable' });
});

test('disabled native button returns send-disabled', async () => {
  const { root } = controls({ disabled: true });
  assert.equal((await sendDanmuText('x', { root })).reason, 'send-disabled');
});

test('aria-disabled native button returns send-disabled', async () => {
  const { root } = controls({ ariaDisabled: 'true' });
  assert.equal((await sendDanmuText('x', { root })).reason, 'send-disabled');
});

test('missing click function returns send-unavailable', async () => {
  const { root, button } = controls();
  button.click = null;
  assert.equal((await sendDanmuText('x', { root })).reason, 'send-unavailable');
});

test('click exception returns send-error instead of leaking a pending send', async () => {
  const { root } = controls({ click: () => { throw new Error('boom'); } });
  const result = await sendDanmuText('x', { root, awaitConfirmationMs: 5 });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'send-error');
  assert.match(result.error.message, /boom/);
  assert.equal(confirmDanmuSend({ op: 'senddanmu', data: { text: 'x' } }), 0);
});

test('no outbound websocket confirmation returns send-unconfirmed', async () => {
  const { root } = controls();
  const result = await sendDanmuText('x', { root, awaitConfirmationMs: 1 });
  assert.equal(result.sent, false);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'send-unconfirmed');
});

test('successful click sets native input value and dispatches input/change before confirmation', async () => {
  let snapshot;
  const c = controls();
  c.button.click = () => {
    snapshot = { value: c.input.value, events: [...c.events] };
    confirmDanmuSend({ op: 'senddanmu', data: { text: 'hello' } });
  };
  const result = await sendDanmuText('hello', { root: c.root, awaitConfirmationMs: 50 });
  assert.deepEqual(snapshot, { value: 'hello', events: ['input', 'change'] });
  assert.deepEqual(result, { sent: true, verified: true, text: 'hello' });
});

const outboundVariants = [
  { op: 'senddanmu', data: { text: 'd' } },
  { type: 'send_barrage', payload: { barrage: 'd' } },
  { action: 'sendchat', message: { content: { danmu: 'd' } } },
  { op: 'sendmessage', msg: { text: 'd' } },
];
for (const message of outboundVariants) {
  test(`outbound variant confirms matching send: ${JSON.stringify(message)}`, async () => {
    const c = controls();
    c.button.click = () => confirmDanmuSend(message);
    const result = await sendDanmuText('d', { root: c.root, awaitConfirmationMs: 50 });
    assert.equal(result.sent, true);
    assert.equal(result.verified, true);
  });
}

test('unrelated websocket frame cannot confirm pending danmu', async () => {
  const c = controls();
  c.button.click = () => {
    assert.equal(confirmDanmuSend({ op: 'heartbeat', data: { text: 'x' } }), 0);
    assert.equal(confirmDanmuSend({ op: 'senddanmu', data: { text: 'other' } }), 0);
  };
  const result = await sendDanmuText('expected', { root: c.root, awaitConfirmationMs: 1 });
  assert.equal(result.reason, 'send-unconfirmed');
});

test('confirmation tolerates surrounding whitespace but preserves original outgoing text', async () => {
  const c = controls();
  c.button.click = () => confirmDanmuSend({ op: 'senddanmu', data: { text: ' hello ' } });
  const result = await sendDanmuText('hello', { root: c.root, awaitConfirmationMs: 50 });
  assert.deepEqual(result, { sent: true, verified: true, text: 'hello' });
});

test('two concurrent pending sends resolve only their matching websocket frames', async () => {
  const a = controls();
  const b = controls();
  a.button.click = () => {};
  b.button.click = () => {};
  const pa = sendDanmuText('A', { root: a.root, awaitConfirmationMs: 100 });
  const pb = sendDanmuText('B', { root: b.root, awaitConfirmationMs: 100 });
  assert.equal(confirmDanmuSend({ op: 'senddanmu', data: { text: 'B' } }), 1);
  assert.equal(confirmDanmuSend({ op: 'senddanmu', data: { text: 'A' } }), 1);
  assert.equal((await pa).text, 'A');
  assert.equal((await pb).text, 'B');
});
