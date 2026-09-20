import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGmRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const gmRecorder = createGmRequestRecorder();
const browser = installBrowserGlobals({
  href: 'https://www.yuketang.cn/v2/web/index',
  gmRequest: gmRecorder.fn,
});

function addElement(id, tag = 'div') {
  const el = browser.document.createElement(tag);
  el.id = id;
  browser.document.body.appendChild(el);
  return el;
}

const app = addElement('app');
app.__vue__ = {
  $store: {
    state: { currSlide: { sid: 'main-slide', type: 'ppt', index: 1 } },
    watch() { return () => {}; },
  },
};
const presentationPanel = addElement('ykt-presentation-panel');
presentationPanel.classList.add('visible');
addElement('ykt-ai-error');
addElement('ykt-ai-loading');
addElement('ykt-ai-answer');
addElement('ykt-ai-edit-section');
addElement('ykt-ai-custom-prompt', 'textarea');

const originalCreateElement = browser.document.createElement;
browser.document.createElement = tagName => {
  if (String(tagName).toLowerCase() !== 'canvas') return originalCreateElement(tagName);
  let source = '';
  return {
    width: 0,
    height: 0,
    getContext() {
      return {
        drawImage(img) { source = String(img?._src || img?.src || ''); },
      };
    },
    toDataURL() {
      const marker = source.includes('main') ? 'TUFJTg==' : 'UFJFUw==';
      return `data:image/jpeg;base64,${marker}`;
    },
  };
};

globalThis.Image = class FakeImage {
  constructor() {
    this.width = 16;
    this.height = 9;
    this.crossOrigin = '';
    this.onload = null;
    this.onerror = null;
    this._src = '';
  }
  set src(value) {
    this._src = String(value);
    queueMicrotask(() => this.onload?.());
  }
  get src() { return this._src; }
};

const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { askAIFusionMode } = await import('../../src/ui/panels/ai.js');

ui.toast = () => {};
ui.config.iftex = false;
ui.config.ai = {
  ...ui.config.ai,
  profiles: [{
    id: 'priority-test',
    name: 'Priority Test',
    baseUrl: 'https://ai.example/v1/chat/completions',
    apiKey: 'secret',
    model: 'model',
    visionModel: 'vision',
    temperature: '',
  }],
  activeProfileId: 'priority-test',
};

function resetSlides() {
  repo.slides.clear();
  repo.problemStatus.clear();
  repo.encounteredProblems.length = 0;
  repo.currentSlideId = 'presentation-slide';
  repo.slides.set('main-slide', {
    id: 'main-slide',
    title: 'Main',
    cover: 'https://img.example/main.jpg',
  });
  repo.slides.set('presentation-slide', {
    id: 'presentation-slide',
    title: 'Presentation',
    cover: 'https://img.example/presentation.jpg',
  });
}

function lastImageUrl() {
  const payload = JSON.parse(gmRecorder.calls.at(-1).data);
  const blocks = payload.messages.flatMap(message => Array.isArray(message.content) ? message.content : []);
  return blocks.find(block => block?.type === 'image_url')?.image_url?.url || '';
}

async function runWithPriority(value) {
  resetSlides();
  ui.config.aiSlidePickPriority = value;
  // Non-question slides use the two-step vision path. The first deliberately
  // falls back; the second completes it, so this scenario tests page selection
  // rather than hanging on an incomplete network fixture.
  gmRecorder.respond({ choices: [{ message: { content: '分析完成' } }] }, 200);
  gmRecorder.respond({ choices: [{ message: { content: '最终分析完成' } }] }, 200);
  await askAIFusionMode();
  return lastImageUrl();
}

test.after(() => {
  browser.document.createElement = originalCreateElement;
  delete globalThis.Image;
  uninstallBrowserGlobals();
});

test('checked main-page priority sends the main-page slide image to AI', async () => {
  const imageUrl = await runWithPriority(true);
  assert.match(imageUrl, /TUFJTg==$/);
});

test('unchecked main-page priority sends the presentation-panel slide image to AI', async () => {
  const imageUrl = await runWithPriority(false);
  assert.match(imageUrl, /UFJFUw==$/);
});

test('legacy string presentation priority remains compatible', async () => {
  const imageUrl = await runWithPriority('presentation');
  assert.match(imageUrl, /UFJFUw==$/);
});
