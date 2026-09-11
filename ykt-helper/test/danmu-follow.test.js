import assert from 'node:assert/strict';
import test from 'node:test';

const loadDanmuFollow = () => import('../src/core/danmu-follow.js');

function tracker(options = {}) {
  return loadDanmuFollow().then(({ createDanmuFollowTracker }) => (
    createDanmuFollowTracker({
      windowSize: 7,
      windowMs: 30_000,
      roundGapMs: 60_000,
      maxSendsPerRound: 2,
      ...options,
    })
  ));
}

test('follows the most frequent text after seven messages inside thirty seconds', async () => {
  const follow = await tracker();
  const texts = ['甲', '乙', '甲', '丙', '甲', '丁', '乙'];
  texts.slice(0, -1).forEach((text, index) => follow.observe(text, index * 1000));

  const result = follow.observe(texts.at(-1), 6000);

  assert.deepEqual(result, {
    triggered: true,
    text: '甲',
    count: 3,
    sentCount: 1,
  });
});

test('uses the most recent text to break a frequency tie', async () => {
  const follow = await tracker();
  const texts = ['甲', '乙', '甲', '乙', '丙', '丁', '乙'];
  const result = texts.reduce((last, text, index) => follow.observe(text, index * 1000), null);

  assert.equal(result.triggered, true);
  assert.equal(result.text, '乙');
  assert.equal(result.count, 3);
});

test('does not trigger when the seven-message window exceeds thirty seconds', async () => {
  const follow = await tracker();
  const texts = ['甲', '乙', '甲', '丙', '甲', '丁', '乙'];
  const result = texts.reduce((last, text, index) => follow.observe(text, index * 5001), null);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'window');
});

test('starts a new round after a sixty-second gap', async () => {
  const follow = await tracker();

  follow.observe('同一文本', 0);
  follow.observe('同一文本', 1000);
  const result = follow.observe('同一文本', 61_001);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'window');
  assert.equal(result.count, 1);
});

test('allows only two automatic follows in one round', async () => {
  const follow = await tracker();
  const first = ['甲', '甲', '乙', '丙', '丁', '戊', '己'];

  first.slice(0, -1).forEach((text, index) => follow.observe(text, index));
  assert.equal(follow.observe(first.at(-1), 6).triggered, true);
  assert.equal(follow.observe('庚', 10).triggered, true);

  const result = follow.observe('辛', 11);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'round-limit');
});

test('does not follow the same text twice in one round', async () => {
  const follow = await tracker();
  const texts = ['重复', '重复', '甲', '乙', '丙', '丁', '戊'];
  texts.slice(0, -1).forEach((text, index) => follow.observe(text, index));
  assert.equal(follow.observe(texts.at(-1), 6).triggered, true);

  const result = follow.observe('重复', 7);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'already-followed');
});

test('keeps exact text matching and ignores empty danmu messages', async () => {
  const { createDanmuFollowTracker, extractDanmuMessage } = await loadDanmuFollow();
  const follow = createDanmuFollowTracker({ windowSize: 7, windowMs: 30_000 });

  assert.equal(follow.observe(' same', 0).triggered, false);
  assert.equal(follow.observe('same', 1).triggered, false);
  assert.equal(follow.observe(' same', 2).triggered, false);
  assert.equal(follow.observe('   ', 3).reason, 'empty');
  assert.equal(follow.observe('', 4).reason, 'empty');

  assert.deepEqual(extractDanmuMessage({ op: 'newdanmu', danmu: ' same', userid: 42 }), {
    text: ' same',
    userId: '42',
  });
  assert.deepEqual(extractDanmuMessage({
    op: 'newdanmu',
    msg: { danmu: '嵌套弹幕', userid: 43 },
  }), {
    text: '嵌套弹幕',
    userId: '43',
  });
  assert.equal(extractDanmuMessage({ op: 'chatmessage', danmu: 'same' }), null);
});

test('reports a barrage as sent only after an outbound frame confirms it', async () => {
  const { sendDanmuText, confirmDanmuSend } = await import('../src/core/danmu-sender.js');
  const events = [];
  const input = {
    value: '',
    dispatchEvent(event) {
      events.push(event.type);
      return true;
    },
  };
  const button = {
    disabled: false,
    click() {
      events.push('click');
    },
  };
  const root = {
    querySelector(selector) {
      if (selector === '.send__input') return input;
      if (selector === '.send__btn') return button;
      return null;
    },
  };

  const pending = sendDanmuText('跟上这条', { root, awaitConfirmationMs: 50 });
  assert.equal(confirmDanmuSend({ op: 'senddanmu', danmu: '跟上这条' }), 1);

  assert.deepEqual(await pending, {
    sent: true,
    verified: true,
    text: '跟上这条',
  });
  assert.deepEqual(events, ['input', 'change', 'click']);
});

test('reports an unconfirmed DOM click as a failed barrage send', async () => {
  const { sendDanmuText } = await import('../src/core/danmu-sender.js');
  const result = await sendDanmuText('没有出站帧', {
    awaitConfirmationMs: 1,
    root: {
      querySelector(selector) {
        if (selector === '.send__input') return { value: '', dispatchEvent() {} };
        if (selector === '.send__btn') return { disabled: false, click() {} };
        return null;
      },
    },
  });

  assert.deepEqual(result, {
    sent: false,
    verified: false,
    text: '没有出站帧',
    reason: 'send-unconfirmed',
  });
});

test('controller follows a selected text and ignores its own echoed message', async () => {
  const { createDanmuFollowController } = await loadDanmuFollow();
  const sent = [];
  let now = 0;
  const controller = createDanmuFollowController({
    now: () => now,
    send: text => {
      sent.push(text);
      return { sent: true, verified: true, text };
    },
  });

  const messages = ['甲', '跟上这条', '乙', '跟上这条', '丙', '跟上这条'];
  for (const [index, text] of messages.entries()) {
    now = index;
    await controller.handle({ op: 'newdanmu', danmu: text, userid: index + 1 });
  }
  now = 6;
  const triggered = await controller.handle({ op: 'newdanmu', danmu: '丁', userid: 9 });

  assert.equal(triggered.triggered, true);
  assert.equal(triggered.text, '跟上这条');
  assert.equal(triggered.sendResult.verified, true);
  assert.deepEqual(sent, ['跟上这条']);

  now = 7;
  const echo = await controller.handle({ op: 'newdanmu', danmu: '跟上这条' });
  assert.equal(echo.reason, 'own-echo');
  assert.deepEqual(sent, ['跟上这条']);
});

test('controller does not track or send while disabled', async () => {
  const { createDanmuFollowController } = await loadDanmuFollow();
  const sent = [];
  const controller = createDanmuFollowController({
    enabled: () => false,
    send: text => {
      sent.push(text);
      return { sent: true, verified: true, text };
    },
  });

  for (let i = 0; i < 8; i += 1) {
    const result = await controller.handle({ op: 'newdanmu', danmu: '不会跟发', userid: i });
    assert.equal(result.reason, 'disabled');
  }

  assert.deepEqual(sent, []);
});

test('keeps automatic barrage following opt-in by default', async () => {
  const { DEFAULT_CONFIG } = await import('../src/core/types.js');
  assert.equal(DEFAULT_CONFIG.autoFollowDanmu, false);
});
