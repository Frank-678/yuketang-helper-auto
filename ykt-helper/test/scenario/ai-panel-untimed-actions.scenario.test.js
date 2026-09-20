import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFakeElement,
  createGmRequestRecorder,
  installBrowserGlobals,
  uninstallBrowserGlobals,
} from '../support/browser-harness.js';

const gmRecorder = createGmRequestRecorder();
const browser = installBrowserGlobals({
  href: 'https://www.yuketang.cn/lesson/fullscreen/v3/ai-panel-lesson',
  gmRequest: gmRecorder.fn,
});
const { document, window } = browser;

function make(id, tag = 'div') {
  const el = createFakeElement(tag);
  el.id = id;
  return el;
}

// Mount the real ai.js handlers against a minimal DOM representation of the real template.
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
    state: { currSlide: { sid: 'untimed-slide', type: 'problem', index: 1 } },
    watch() { return () => {}; },
  },
};
document.body.appendChild(app);

const originalCreateElement = document.createElement;
document.createElement = tagName => {
  if (String(tagName).toLowerCase() === 'canvas') {
    return {
      width: 0,
      height: 0,
      getContext() { return { drawImage() {} }; },
      toDataURL() { return 'data:image/jpeg;base64,QUJD'; },
    };
  }
  return originalCreateElement(tagName);
};

globalThis.Image = class FakeImage {
  constructor() { this.width = 16; this.height = 9; this.onload = null; this.onerror = null; this._src = ''; }
  set src(value) { this._src = String(value); queueMicrotask(() => this.onload?.()); }
  get src() { return this._src; }
};

const { repo } = await import('../../src/state/repo.js');
const { ui } = await import('../../src/ui/ui-api.js');
const { actions } = await import('../../src/state/actions.js');
const { mountAIPanel, askAIFusionMode } = await import('../../src/ui/panels/ai.js');

ui.toast = () => {};
ui.config.aiSlidePickPriority = true;
ui.config.iftex = false;
ui.config.ai = {
  ...ui.config.ai,
  profiles: [{
    id: 'untimed-ai',
    name: 'Untimed AI',
    baseUrl: 'https://ai.example/v1/chat/completions',
    apiKey: 'secret',
    model: 'model',
    visionModel: 'vision',
    temperature: '',
  }],
  activeProfileId: 'untimed-ai',
};

const problem = {
  problemId: 'untimed-q',
  problemType: 1,
  body: 'untimed question',
  options: [{ key: 'A', value: 'yes' }, { key: 'B', value: 'no' }],
  result: null,
  slideId: 'untimed-slide',
  presentationId: 'untimed-p',
  lessonId: 'ai-panel-lesson',
  endTime: null,
};
repo.currentLessonId = 'ai-panel-lesson';
repo.currentSlideId = 'untimed-slide';
repo.slides.set('untimed-slide', {
  id: 'untimed-slide',
  cover: 'https://img.example/untimed.jpg',
  problem,
});
repo.problems.set(problem.problemId, problem);

mountAIPanel();

async function prepareContext(deadline) {
  problem.endTime = deadline;
  repo.problemStatus.set(problem.problemId, {
    lessonId: 'ai-panel-lesson',
    slideId: 'untimed-slide',
    endTime: deadline,
    done: false,
    answering: false,
    phase: 'queued',
    autoAnswerTime: null,
    autoAnswerQueued: false,
  });
  // The panel's vision client may take a structured-analysis first step and
  // then fall back to the ordinary vision request. Supply both external
  // responses so this test reaches the button/deadline behavior it targets.
  gmRecorder.respond({ choices: [{ message: { content: '答案: A' } }] }, 200);
  gmRecorder.respond({ choices: [{ message: { content: '答案: A' } }] }, 200);
  await askAIFusionMode();
  assert.deepEqual(JSON.parse(document.getElementById('ykt-ai-answer-edit').value), ['A']);
}

const untimedValues = [null, undefined, ''];

for (const deadline of untimedValues) {
  test(`edited AI answer treats ${String(deadline)} as untimed and uses normal submit`, async () => {
    await prepareContext(deadline);
    const originalSubmit = actions.submitParsedAnswer;
    const calls = [];
    let confirms = 0;
    window.confirm = () => { confirms += 1; return true; };
    actions.submitParsedAnswer = async (_problem, answer, options) => {
      calls.push({ answer, options });
      return { ok: true, route: 'answer' };
    };
    try {
      await document.getElementById('ykt-ai-submit').click();
    } finally {
      actions.submitParsedAnswer = originalSubmit;
    }
    assert.equal(confirms, 0, 'untimed problem must not ask for expired retry confirmation');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.forceRetry, false);
  });

  test(`AI force answer treats ${String(deadline)} as untimed and does not force retry`, async () => {
    await prepareContext(deadline);
    const originalForce = actions.forceAIAnswer;
    const calls = [];
    let confirms = 0;
    window.confirm = () => { confirms += 1; return true; };
    actions.forceAIAnswer = async (problemId, options) => {
      calls.push({ problemId, options });
      return { ok: true, answer: ['A'], route: 'answer' };
    };
    try {
      await document.getElementById('ykt-ai-force-answer').click();
    } finally {
      actions.forceAIAnswer = originalForce;
    }
    assert.equal(confirms, 0, 'untimed problem must not ask for expired retry confirmation');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.forceRetry, false);
  });
}

test.after(() => {
  document.createElement = baseCreateElement;
  delete globalThis.Image;
  uninstallBrowserGlobals();
});
