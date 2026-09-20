import assert from 'node:assert/strict';
import test from 'node:test';

import { isYuketangHostname, isYuketangUrl } from '../../src/core/yuketang-origin.js';

for (const host of [
  'www.yuketang.cn',
  'pro.yuketang.cn',
  'changjiang.yuketang.cn',
  'foo.yuketang.cn',
  'yuketang.cn',
]) {
  test('trusted Yuketang hostname: ' + host, () => {
    assert.equal(isYuketangHostname(host), true);
  });
}

for (const host of [
  'yuketang.cn.evil.example',
  'notyuketang.cn',
  'example.com',
  '',
]) {
  test('untrusted hostname: ' + host, () => {
    assert.equal(isYuketangHostname(host), false);
  });
}

test('relative and Yuketang absolute URLs are trusted', () => {
  assert.equal(isYuketangUrl('/api/v3/lesson/problem/answer', 'https://pro.yuketang.cn/web'), true);
  assert.equal(isYuketangUrl('wss://changjiang.yuketang.cn/wsapp/', 'https://www.yuketang.cn/'), true);
});

test('lookalike or external URLs are rejected even when path looks like classroom traffic', () => {
  assert.equal(isYuketangUrl('https://evil.example/api/v3/lesson/problem/answer', 'https://pro.yuketang.cn/'), false);
  assert.equal(isYuketangUrl('wss://evil.example/wsapp/', 'https://pro.yuketang.cn/'), false);
  assert.equal(isYuketangUrl('https://yuketang.cn.evil.example/slides', 'https://pro.yuketang.cn/'), false);
});
