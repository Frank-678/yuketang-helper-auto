import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const actionsSource = fs.readFileSync(path.join(here, '../src/state/actions.js'), 'utf8');
const runnerSource = fs.readFileSync(path.join(here, '../src/state/auto-answer-runner.js'), 'utf8');

test('live unlock retries when problem or slide data has not arrived yet', () => {
  assert.match(actionsSource, /LIVE_UNLOCK_RETRY_DELAY_MS/);
  assert.match(actionsSource, /LIVE_UNLOCK_RETRY_LIMIT/);
  assert.match(actionsSource, /liveRetryCount\s*=\s*0/);
  assert.match(actionsSource, /!problem \|\| !slide[\s\S]*?notifyProblemStart/);
  assert.match(actionsSource, /setTimeout\([\s\S]*?onUnlockProblem[\s\S]*?liveRetryCount:\s*liveRetryCount \+ 1/);
});

test('live unlock exhaustion surfaces a visible auto-answer diagnostic', () => {
  assert.match(actionsSource, /实时新题数据[\s\S]*?仍未加载/);
  assert.match(actionsSource, /自动作答未启动/);
});

test('auto-answer runner exposes a visible start diagnostic independent of reminder preferences', () => {
  assert.match(runnerSource, /toast\?\.\(source === 'manual' \? '手动 AI 作答开始' : '自动作答开始'/);
  assert.match(runnerSource, /\[雨课堂助手\]\[INFO\]\[AutoAnswer\] 开始作答/);
});

test('danmu follow shows visible success or failure diagnostics', () => {
  assert.match(actionsSource, /弹幕已自动跟发/);
  assert.match(actionsSource, /弹幕自动跟发失败/);
  assert.match(actionsSource, /result\.sendResult\?\.reason/);
});
