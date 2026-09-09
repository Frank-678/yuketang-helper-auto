import assert from 'node:assert/strict';
import test from 'node:test';

const loadDanmuFollow = () => import('../src/core/danmu-follow.js');

function tracker(options = {}) {
  return loadDanmuFollow().then(({ createDanmuFollowTracker }) => (
    createDanmuFollowTracker({
      windowSize: 7,
      threshold: 3,
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

test('emits a follow-trigger callback when the third identical barrage is reached', async () => {
  const { createDanmuFollowController } = await loadDanmuFollow();
  const followTriggers = [];
  let now = 0;
  const controller = createDanmuFollowController({
    now: () => now,
    onFollowTrigger: event => followTriggers.push(event),
    send: text => ({ sent: true, text }),
  });

  controller.handle({ op: 'newdanmu', danmu: '重复内容', userid: 1 });
  now = 1;
  controller.handle({ op: 'newdanmu', danmu: '重复内容', userid: 2 });
  now = 2;
  controller.handle({ op: 'newdanmu', danmu: '重复内容', userid: 3 });

  assert.deepEqual(followTriggers, [{
    triggered: true,
    text: '重复内容',
    count: 3,
    sentCount: 1,
    roundNumber: 1,
    at: 2,
  }]);
});

test('triggers when a text appears three times in the current seven-message window', async () => {
  const follow = await tracker();

  assert.equal(follow.observe('同学们好', 0).triggered, false);
  assert.equal(follow.observe('其他内容', 1).triggered, false);
  assert.equal(follow.observe('同学们好', 2).triggered, false);

  const result = follow.observe('同学们好', 3);

  assert.deepEqual(result, {
    triggered: true,
    text: '同学们好',
    count: 3,
    sentCount: 1,
  });
});

test('uses a sliding window and drops messages older than the latest seven', async () => {
  const follow = await tracker();

  follow.observe('重复', 0);
  follow.observe('重复', 1);
  follow.observe('甲', 2);
  follow.observe('乙', 3);
  follow.observe('丙', 4);
  follow.observe('丁', 5);
  follow.observe('戊', 6);

  const result = follow.observe('己', 7);

  assert.equal(result.triggered, false);
  assert.equal(result.count, 1);
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

  assert.equal(follow.observe('第一组', 0).triggered, false);
  assert.equal(follow.observe('第一组', 1).triggered, false);
  assert.equal(follow.observe('第一组', 2).triggered, true);
  assert.equal(follow.observe('第二组', 3).triggered, false);
  assert.equal(follow.observe('第二组', 4).triggered, false);
  assert.equal(follow.observe('第二组', 5).triggered, true);
  assert.equal(follow.observe('第三组', 6).triggered, false);
  assert.equal(follow.observe('第三组', 7).triggered, false);

  const result = follow.observe('第三组', 8);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'round-limit');
});

test('does not follow the same text twice in one round', async () => {
  const follow = await tracker();

  follow.observe('重复', 0);
  follow.observe('重复', 1);
  assert.equal(follow.observe('重复', 2).triggered, true);

  const result = follow.observe('重复', 3);

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'already-followed');
});

test('allows the same text again after the round resets', async () => {
  const follow = await tracker();

  follow.observe('重复', 0);
  follow.observe('重复', 1);
  assert.equal(follow.observe('重复', 2).triggered, true);

  follow.observe('新一轮', 62_000);
  follow.observe('重复', 62_001);
  follow.observe('重复', 62_002);
  const result = follow.observe('重复', 62_003);

  assert.equal(result.triggered, true);
  assert.equal(result.sentCount, 1);
});

test('keeps exact text matching and ignores empty danmu messages', async () => {
  const { createDanmuFollowTracker, extractDanmuMessage } = await loadDanmuFollow();
  const follow = createDanmuFollowTracker({ windowSize: 7, threshold: 3 });

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
  const { sendDanmuText } = await import('../src/core/danmu-sender.js');
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

  const result = sendDanmuText('跟上这条', { root });

  assert.deepEqual(result, { sent: true, text: '跟上这条' });
  assert.equal(input.value, '跟上这条');
  assert.deepEqual(events, ['input', 'change', 'click']);
});

test('reports when the classroom send controls are unavailable', async () => {
  const { sendDanmuText } = await import('../src/core/danmu-sender.js');
  const result = sendDanmuText('跟上这条', {
    root: { querySelector: () => null },
  });

  assert.deepEqual(result, { sent: false, text: '跟上这条', reason: 'controls-unavailable' });
});

test('controller follows a threshold event and ignores its own echoed message', async () => {
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

  controller.handle({ op: 'newdanmu', danmu: '跟上这条', userid: 7 });
  now = 1;
  controller.handle({ op: 'newdanmu', danmu: '跟上这条', userid: 8 });
  now = 2;
  const triggered = controller.handle({ op: 'newdanmu', danmu: '跟上这条', userid: 9 });

  assert.equal(triggered.triggered, true);
  assert.deepEqual(triggered.sendResult, { sent: true, text: '跟上这条' });
  assert.deepEqual(sent, ['跟上这条']);

  now = 3;
  const echo = controller.handle({ op: 'newdanmu', danmu: '跟上这条' });
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
    const result = controller.handle({ op: 'newdanmu', danmu: '不会跟发', userid: i });
    assert.equal(result.reason, 'disabled');
  }

  assert.deepEqual(sent, []);
});

test('keeps automatic barrage following opt-in by default', async () => {
  const { DEFAULT_CONFIG } = await import('../src/core/types.js');
  assert.equal(DEFAULT_CONFIG.autoFollowDanmu, false);
});
