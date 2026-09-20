import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFakeElement,
  createGmRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';
import { waitFor } from '../support/integration-fixtures.js';

const gmRecorder = createGmRequestRecorder();
const browser = installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/auto-analyze-lesson',
  gmRequest: gmRecorder.fn,
});
const { document } = browser;

function make(id, tag = 'div') {
  const el = createFakeElement(tag);
  el.id = id;
  return el;
}

const baseCreateElement = document.createElement;
document.createElement = tagName => {
  const element = baseCreateElement(tagName);
  const descriptor = Object.getOwnPropertyDescriptor(element, 'innerHTML');
  Object.defineProperty(element, 'innerHTML', {
    get: descriptor.get,
    set(value) {
      descriptor.set.call(element, value);
      if (!String(value).includes('ykt-ai-answer-panel')) return;
      const panel = make('ykt-ai-answer-panel');
      panel.className = 'ykt-panel';
      for (const child of [
        make('ykt-ai-close', 'button'),
        make('ykt-ai-ask', 'button'),
        make('ykt-ai-force-answer', 'button'),
        make('ykt-ai-submit', 'button'),
        make('ykt-ai-reset-edit', 'button'),
        make('ykt-ai-error'),
        make('ykt-ai-loading'),
        make('ykt-ai-answer'),
        make('ykt-ai-edit-section'),
        make('ykt-ai-answer-edit', 'textarea'),
        make('ykt-ai-validate'),
        make('ykt-ai-custom-prompt', 'textarea'),
        make('ykt-ai-question-display'),
        make('ykt-ai-selected'),
        make('ykt-ai-selected-thumb', 'img'),
        make('ykt-ai-selected-thumbs'),
        make('ykt-ai-text-status'),
      ]) panel.appendChild(child);
      element.appendChild(panel);
    },
    configurable: true,
    enumerable: true,
  });
  return element;
};

const app = make('app');
app.__vue__ = {
  $store: {
    state: { currSlide: { sid: 'auto-slide', type: 'problem', index: 1 } },
    watch() { return () => {}; },
  },
};
document.body.appendChild(app);

const panelAwareCreateElement = document.createElement;
document.createElement = tagName => {
  if (String(tagName).toLowerCase() === 'canvas') {
    return {
      width: 0,
      height: 0,
      getContext() { return { drawImage() {} }; },
      toDataURL() { return 'data:image/jpeg;base64,QUJD'; },
    };
  }
  return panelAwareCreateElement(tagName);
};

globalThis.Image = class FakeImage {
  constructor() { this.width = 16; this.height = 9; this.onload = null; this.onerror = null; this._src = ''; }
  set src(value) { this._src = String(value); queueMicrotask(() => this.onload?.()); }
  get src() { return this._src; }
};

const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { showAIPanel } = await import('../../src/ui/panels/ai.js');

ui.toast = () => {};
ui.config.aiSlidePickPriority = true;
ui.config.iftex = false;
ui.config.ai = {
  ...ui.config.ai,
  profiles: [{
    id: 'auto-analyze-ai',
    name: 'Auto Analyze AI',
    baseUrl: 'https://ai.example/v1/chat/completions',
    apiKey: 'secret',
    model: 'model',
    visionModel: 'vision',
    temperature: '',
  }],
  activeProfileId: 'auto-analyze-ai',
};

const problem = {
  problemId: 'auto-analyze-q',
  problemType: 1,
  body: 'auto analyze question',
  options: [{ key: 'A', value: 'yes' }, { key: 'B', value: 'no' }],
  result: null,
  slideId: 'auto-slide',
  presentationId: 'auto-p',
  lessonId: 'auto-analyze-lesson',
};
repo.currentLessonId = 'auto-analyze-lesson';
repo.currentSlideId = 'auto-slide';
repo.slides.set('auto-slide', {
  id: 'auto-slide',
  cover: 'https://img.example/auto-slide.jpg',
  problem,
});
repo.problems.set(problem.problemId, problem);

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

test.after(() => {
  document.createElement = baseCreateElement;
  delete globalThis.Image;
  uninstallBrowserGlobals();
});

test('aiAutoAnalyze=false opens the panel without emitting an AI request', async () => {
  ui.config.aiAutoAnalyze = false;
  const before = gmRecorder.calls.length;
  showAIPanel(true);
  await flushMicrotasks();
  assert.equal(gmRecorder.calls.length, before);
});

test('aiAutoAnalyze=true automatically analyzes the current slide once when the panel opens', async () => {
  ui.config.aiAutoAnalyze = true;
  const before = gmRecorder.calls.length;
  // The vision client may attempt a structured first pass before falling back.
  gmRecorder.respond({ choices: [{ message: { content: '答案: A' } }] }, 200);
  gmRecorder.respond({ choices: [{ message: { content: '答案: A' } }] }, 200);
  showAIPanel(true);
  assert.equal(await waitFor(() => gmRecorder.calls.length >= before + 2, 500), true);
  const calls = gmRecorder.calls.slice(before);
  assert.ok(calls.length >= 1);
  assert.ok(calls.every(call => call.url === 'https://ai.example/v1/chat/completions'));
});
