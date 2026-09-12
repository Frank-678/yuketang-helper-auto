import assert from 'node:assert/strict';
import test from 'node:test';

const loadDanmuFollow = () => import('../src/core/danmu-follow.js');

function tracker(options = {}) {
  return loadDanmuFollow().then(({ createDanmuFollowTracker }) => (
    createDanmuFollowTracker({
      windowSize: 7,
      burstWindowMs: 30_000,
      roundGapMs: 60_000,
      maxSendsPerRound: 2,
      ...options,
    })
  ));
}

test('reports a new round only after an adjacent gap of at least one minute', async () => {
  const { createDanmuRoundTracker } = await loadDanmuFollow();
  const rounds = createDanmuRoundTracker({ roundGapMs: 60_000 });

  assert.deepEqual(rounds.observe(0), {
    roundStarted: false,
    roundNumber: 1,
    at: 0,
  });
  assert.deepEqual(rounds.observe(59_999), {
    roundStarted: false,
    roundNumber: 1,
    at: 59_999,
  });
  assert.deepEqual(rounds.observe(119_998), {
    roundStarted: false,
    roundNumber: 1,
    at: 119_998,
  });
  assert.deepEqual(rounds.observe(179_998), {
    roundStarted: true,
    roundNumber: 2,
    at: 179_998,
  });
  assert.equal(rounds.observe(239_997).roundStarted, false);
});

test('emits a round-start callback even when automatic following is disabled', async () => {
  const { createDanmuFollowController } = await loadDanmuFollow();
  const roundStarts = [];
  let now = 0;
  const controller = createDanmuFollowController({
    enabled: () => false,
    now: () => now,
    onRoundStart: event => roundStarts.push(event),
  });

  controller.handle({ op: 'newdanmu', danmu: '第一轮', userid: 1 });
  now = 60_000;
  controller.handle({ op: 'newdanmu', danmu: '第二轮', userid: 2 });

  assert.equal(roundStarts.length, 1);
  assert.deepEqual(roundStarts[0], {
    roundStarted: true,
    roundNumber: 2,
    at: 60_000,
    text: '第二轮',
  });
});

test('emits a follow-trigger callback when a seven-message burst reaches a winner', async () => {
  const { createDanmuFollowController } = await loadDanmuFollow();
  const followTriggers = [];
  let now = 0;
  const controller = createDanmuFollowController({
    now: () => now,
    onFollowTrigger: event => followTriggers.push(event),
    send: text => ({ sent: true, text }),
  });

  for (let i = 0; i < 7; i += 1) {
    controller.handle({
      op: 'newdanmu',
      danmu: i % 2 === 0 ? '重复内容' : `其他内容${i}`,
      userid: i + 1,
    });
    now = i + 1;
  }

  assert.deepEqual(followTriggers, [{
    triggered: true,
    text: '重复内容',
    count: 4,
    sentCount: 1,
    roundNumber: 1,
    at: 6,
    batchSize: 7,
    burstWindowMs: 30_000,
  }]);
});

test('triggers after seven consecutive messages within thirty seconds', async () => {
  const follow = await tracker();

  for (let i = 0; i < 6; i += 1) {
    assert.equal(follow.observe(`内容${i}`, i * 5_000).triggered, false);
  }

  const result = follow.observe('内容6', 30_000);

  assert.equal(result.triggered, true);
  assert.equal(result.text, '内容6');
  assert.equal(result.count, 1);
  assert.equal(result.sentCount, 1);
  assert.equal(result.batchSize, 7);
  assert.equal(result.burstWindowMs, 30_000);
});

test('chooses the most frequent exact text in the seven-message burst', async () => {
  const follow = await tracker();

  const texts = ['甲', '乙', '甲', '丙', '甲', '丁', '乙'];
  let result;
  texts.forEach((text, index) => {
    result = follow.observe(text, index * 5_000);
  });

  assert.equal(result.triggered, true);
  assert.equal(result.text, '甲');
  assert.equal(result.count, 3);
});

test('uses the newest text when all seven burst messages are tied', async () => {
  const follow = await tracker();

  let result;
  for (let i = 0; i < 7; i += 1) {
    result = follow.observe(`唯一${i}`, i * 5_000);
  }

  assert.equal(result.triggered, true);
  assert.equal(result.text, '唯一6');
  assert.equal(result.count, 1);
});

test('does not trigger when seven messages span more than thirty seconds', async () => {
  const follow = await tracker();

  let result;
  for (let i = 0; i < 7; i += 1) {
    result = follow.observe(`慢速${i}`, i === 6 ? 30_001 : i * 5_000);
  }

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'burst-window');
});

test('starts a new round when the gap is at least one minute', async () => {
  const follow = await tracker();

  follow.observe('同一文本', 0);
  follow.observe('同一文本', 1);
  assert.equal(follow.observe('同一文本', 60_001).triggered, false);

  const result = follow.observe('同一文本', 60_002);

  assert.equal(result.triggered, false);
  assert.equal(result.count, 2);
});

test('allows only two automatic follows in one round', async () => {
  const follow = await tracker();

  const fillBatch = (label, start) => {
    let result;
    for (let i = 0; i < 7; i += 1) result = follow.observe(label, start + i);
    return result;
  };

  assert.equal(fillBatch('第一组', 0).triggered, true);
  assert.equal(fillBatch('第二组', 10).triggered, true);

  const result = fillBatch('第三组', 20);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'round-limit');
});

test('does not follow the same text twice in one round', async () => {
  const follow = await tracker();

  for (let i = 0; i < 7; i += 1) follow.observe('重复', i);
  let result;
  for (let i = 0; i < 7; i += 1) result = follow.observe('重复', 10 + i);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'already-followed');
});

test('allows the same text again after the round resets', async () => {
  const follow = await tracker();

  for (let i = 0; i < 7; i += 1) follow.observe('重复', i);

  let result;
  for (let i = 0; i < 7; i += 1) result = follow.observe('重复', 60_006 + i);

  assert.equal(result.triggered, true);
  assert.equal(result.sentCount, 1);
});

test('keeps exact text matching and ignores empty danmu messages', async () => {
  const { createDanmuFollowTracker, extractDanmuMessage } = await loadDanmuFollow();
  const follow = createDanmuFollowTracker({ windowSize: 7, burstWindowMs: 30_000 });

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

test('sends a follow-up through the classroom input and send button', async () => {
  const { confirmDanmuSend, sendDanmuText } = await import('../src/core/danmu-sender.js');
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
  const result = await pending;

  assert.deepEqual(result, { sent: true, verified: true, text: '跟上这条' });
  assert.equal(input.value, '跟上这条');
  assert.deepEqual(events, ['input', 'change', 'click']);
});

test('reports when the classroom send controls are unavailable', async () => {
  const { sendDanmuText } = await import('../src/core/danmu-sender.js');
  const result = await sendDanmuText('跟上这条', {
    root: { querySelector: () => null },
  });

  assert.deepEqual(result, {
    sent: false,
    verified: false,
    text: '跟上这条',
    reason: 'controls-unavailable',
  });
});

test('controller follows the burst winner and ignores its own echoed message', async () => {
  const { createDanmuFollowController } = await import('../src/core/danmu-follow.js');
  const sent = [];
  let now = 0;
  const controller = createDanmuFollowController({
    now: () => now,
    send: text => {
      sent.push(text);
      return { sent: true, text };
    },
  });

  let triggered;
  for (let i = 0; i < 7; i += 1) {
    now = i;
    triggered = await controller.handle({
      op: 'newdanmu',
      danmu: i < 3 ? '跟上这条' : `其他${i}`,
      userid: i + 7,
    });
  }

  assert.equal(triggered.triggered, true);
  assert.deepEqual(triggered.sendResult, { sent: true, text: '跟上这条' });
  assert.deepEqual(sent, ['跟上这条']);

  now = 7;
  const echo = await controller.handle({ op: 'newdanmu', danmu: '跟上这条' });
  assert.equal(echo.reason, 'own-echo');
  assert.deepEqual(sent, ['跟上这条']);
});

test('controller does not track or send while disabled', async () => {
  const { createDanmuFollowController } = await import('../src/core/danmu-follow.js');
  const sent = [];
  const controller = createDanmuFollowController({
    enabled: () => false,
    send: text => {
      sent.push(text);
      return { sent: true, text };
    },
  });

  for (let i = 0; i < 3; i += 1) {
    const result = await controller.handle({ op: 'newdanmu', danmu: '不会跟发', userid: i });
    assert.equal(result.reason, 'disabled');
  }

  assert.deepEqual(sent, []);
});

test('keeps automatic barrage following opt-in by default', async () => {
  const { DEFAULT_CONFIG } = await import('../src/core/types.js');
  assert.equal(DEFAULT_CONFIG.autoFollowDanmu, false);
});
