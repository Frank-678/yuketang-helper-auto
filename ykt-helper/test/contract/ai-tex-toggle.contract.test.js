import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeElement, installBrowserGlobals, uninstallBrowserGlobals } from '../support/browser-harness.js';

const browser = installBrowserGlobals({ href: 'https://www.yuketang.cn/v2/web/index' });
const { document, window } = browser;
const answer = createFakeElement('div');
answer.id = 'ykt-ai-answer';
document.body.appendChild(answer);

const { ui } = await import('../../src/ui/ui-api.js');
const { setAIAnswer } = await import('../../src/ui/panels/ai.js');

let typesetCalls = 0;
window.MathJax = {
  config: {},
  startup: { promise: Promise.resolve() },
  typesetPromise: async elements => {
    typesetCalls += 1;
    assert.deepEqual(elements, [answer]);
  },
};

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

test.after(() => uninstallBrowserGlobals());

test('iftex=false renders safe HTML but never invokes MathJax', async () => {
  typesetCalls = 0;
  ui.config.iftex = false;
  answer.classList.add('tex-enabled');
  setAIAnswer('公式 $x^2$');
  await flushAsync();
  assert.equal(typesetCalls, 0);
  assert.equal(answer.classList.contains('tex-enabled'), false);
  assert.match(answer.innerHTML, /x\^2/);
});

test('iftex=true invokes MathJax once and marks answer as TeX enabled', async () => {
  typesetCalls = 0;
  ui.config.iftex = true;
  setAIAnswer('公式 $x^2$');
  await flushAsync();
  assert.equal(typesetCalls, 1);
  assert.equal(answer.classList.contains('tex-enabled'), true);
});
