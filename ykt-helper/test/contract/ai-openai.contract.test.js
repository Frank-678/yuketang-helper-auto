import assert from 'node:assert/strict';
import test from 'node:test';
import { createGmRequestRecorder, installBrowserGlobals, uninstallBrowserGlobals } from '../support/browser-harness.js';

const recorder = createGmRequestRecorder();
installBrowserGlobals({ gmRequest: recorder.fn });
const { queryAI, queryAIVision, queryOCRVision, queryTranslationText } = await import('../../src/ai/openai.js');

test.after(() => uninstallBrowserGlobals());

function profile(overrides = {}) {
  return {
    id: 'main',
    name: 'Main',
    baseUrl: 'https://example.test/v1/chat/completions',
    apiKey: 'secret-key',
    model: 'text-model',
    visionModel: 'vision-model',
    ...overrides,
  };
}
function aiConfig(overrides = {}) {
  const p = profile(overrides.profile || {});
  return { profiles: [p], activeProfileId: p.id, ...overrides.config };
}

function response(content = '答案: A') {
  return { choices: [{ message: { content } }] };
}

test('text AI request uses active profile URL, bearer token and model', async () => {
  recorder.respond(response('ok'));
  const result = await queryAI('hello', aiConfig());
  assert.equal(result, 'ok');
  const call = recorder.calls.at(-1);
  assert.equal(call.method, 'POST');
  assert.equal(call.url, 'https://example.test/v1/chat/completions');
  assert.equal(call.headers.Authorization, 'Bearer secret-key');
  const payload = JSON.parse(call.data);
  assert.equal(payload.model, 'text-model');
  assert.match(payload.messages[1].content[0].text, /hello/);
});

test('temperature is omitted when profile temperature is empty', async () => {
  recorder.respond(response());
  await queryAI('q', aiConfig({ profile: { temperature: '' } }));
  const payload = JSON.parse(recorder.calls.at(-1).data);
  assert.equal('temperature' in payload, false);
});

test('temperature zero is preserved', async () => {
  recorder.respond(response());
  await queryAI('q', aiConfig({ profile: { temperature: 0 } }));
  const payload = JSON.parse(recorder.calls.at(-1).data);
  assert.equal(payload.temperature, 0);
});

for (const bad of [-0.1, 2.1, 'abc']) {
  test(`invalid temperature ${JSON.stringify(bad)} fails before network`, async () => {
    const before = recorder.calls.length;
    await assert.rejects(() => queryAI('q', aiConfig({ profile: { temperature: bad } })), /Temperature/);
    assert.equal(recorder.calls.length, before);
  });
}

test('missing API key fails explicitly before network', async () => {
  const before = recorder.calls.length;
  await assert.rejects(() => queryAI('q', aiConfig({ profile: { apiKey: '' } })), /API Key/);
  assert.equal(recorder.calls.length, before);
});

test('HTTP non-200 rejects and includes status', async () => {
  recorder.respond({ error: { message: 'bad key' } }, 401);
  await assert.rejects(() => queryAI('q', aiConfig()), /401/);
});

test('malformed JSON response rejects', async () => {
  recorder.respond('not-json', 200);
  await assert.rejects(() => queryAI('q', aiConfig()), /解析API响应失败/);
});

test('empty choices content rejects', async () => {
  recorder.respond({ choices: [{ message: { content: '' } }] }, 200);
  await assert.rejects(() => queryAI('q', aiConfig()), /AI返回内容为空/);
});

test('GM network error rejects', async () => {
  recorder.fail(new Error('offline'));
  await assert.rejects(() => queryAI('q', aiConfig()), /网络请求失败/);
});

test('single-step vision request carries image, prompt and vision model', async () => {
  recorder.respond(response('答案: B'));
  const cfg = aiConfig({ profile: { model: 'same-model', visionModel: 'same-model' } });
  const result = await queryAIVision('data:image/png;base64,QUJD', '题目文本', cfg, { disableTwoStep: true, problemType: 1 });
  assert.equal(result, '答案: B');
  const call = recorder.calls.at(-1);
  const payload = JSON.parse(call.data);
  assert.equal(payload.model, 'same-model');
  const blocks = payload.messages[1].content;
  assert.equal(blocks[0].type, 'image_url');
  assert.equal(blocks[0].image_url.url, 'data:image/png;base64,QUJD');
  assert.match(blocks.at(-1).text, /题目文本/);
});

test('vision strips data URL prefixes from every image and supports multiple images', async () => {
  recorder.respond(response('答案: C'));
  const cfg = aiConfig({ profile: { model: 'same', visionModel: 'same' } });
  await queryAIVision(['data:image/jpeg;base64,QQ==', 'Qg=='], 'p', cfg, { disableTwoStep: true });
  const payload = JSON.parse(recorder.calls.at(-1).data);
  const images = payload.messages[1].content.filter(x => x.type === 'image_url');
  assert.deepEqual(images.map(x => x.image_url.url), ['data:image/png;base64,QQ==', 'data:image/png;base64,Qg==']);
});

test('vision rejects empty image input before network', async () => {
  const before = recorder.calls.length;
  await assert.rejects(() => queryAIVision([], 'p', aiConfig()), /图像数据格式错误/);
  assert.equal(recorder.calls.length, before);
});


test('OCR cannot reuse the main private profile key on a different endpoint origin', async () => {
  const before = recorder.calls.length;
  const cfg = aiConfig({
    config: {
      ocrApi: 'https://attacker.example/v1/chat/completions',
      ocrApiKey: '',
    },
  });
  await assert.rejects(
    () => queryOCRVision('QUJD', cfg),
    /OCR.*API Key|endpoint|地址|跨.*endpoint|专用/i,
  );
  assert.equal(recorder.calls.length, before);
});

test('translation cannot reuse the main private profile key on a different endpoint origin', async () => {
  const before = recorder.calls.length;
  const cfg = aiConfig({
    config: {
      translateApi: 'https://attacker.example/v1/chat/completions',
      translateApiKey: '',
    },
  });
  await assert.rejects(
    () => queryTranslationText('hello', '中文', cfg),
    /翻译.*API Key|endpoint|地址|跨.*endpoint|专用/i,
  );
  assert.equal(recorder.calls.length, before);
});


test('text AI request uses the shared 120 second default timeout budget', async () => {
  recorder.respond(response('ok'));
  await queryAI('hello', aiConfig());
  assert.equal(recorder.calls.at(-1).timeout, 120000);
});

test('single-step vision uses the shared 120 second default timeout budget', async () => {
  recorder.respond(response('答案: A'));
  const cfg = aiConfig({ profile: { model: 'same-model', visionModel: 'same-model' } });
  await queryAIVision('QUJD', '题目文本', cfg, { disableTwoStep: true });
  assert.equal(recorder.calls.at(-1).timeout, 120000);
});

test('two-step vision timeout fails fast without launching an expensive fallback request', async () => {
  const before = recorder.calls.length;
  recorder.timeout();
  await assert.rejects(
    () => queryAIVision('QUJD', '题目文本', aiConfig(), { problemType: 1 }),
    /超时|timeout/i,
  );
  assert.equal(recorder.calls.length - before, 1);
});

test('step2 timeout does not trigger a third single-step request', async () => {
  const before = recorder.calls.length;
  recorder.respond({
    choices: [{
      message: {
        content: JSON.stringify({
          question_type: 'single_choice',
          stem: '1+1=?',
          options: { A: '1', B: '2' },
          image_facts: [],
          requires_image_for_solution: false,
        }),
      },
    }],
  });
  recorder.timeout();

  await assert.rejects(
    () => queryAIVision('QUJD', '题目文本', aiConfig(), { problemType: 1 }),
    /超时|timeout/i,
  );
  assert.equal(recorder.calls.length - before, 2);
});


test('same API credential is serialized so organization concurrency=1 is never exceeded by this script', async () => {
  const previous = window.GM_xmlhttpRequest;
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  window.GM_xmlhttpRequest = (options) => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    setTimeout(() => {
      active -= 1;
      options.onload?.({
        status: 200,
        responseText: JSON.stringify(response('ok')),
        responseHeaders: '',
      });
    }, 10);
    return { abort() {} };
  };

  try {
    const cfg = aiConfig();
    const results = await Promise.all([
      queryAI('first', cfg),
      queryAI('second', cfg),
    ]);
    assert.deepEqual(results, ['ok', 'ok']);
    assert.equal(calls, 2);
    assert.equal(maxActive, 1);
  } finally {
    window.GM_xmlhttpRequest = previous;
  }
});

test('429 organization concurrency response respects retry hint and succeeds without surfacing failure', async () => {
  const previous = window.GM_xmlhttpRequest;
  let calls = 0;
  window.GM_xmlhttpRequest = (options) => {
    calls += 1;
    queueMicrotask(() => {
      if (calls === 1) {
        options.onload?.({
          status: 429,
          responseText: JSON.stringify({
            error: {
              message: 'Your account organization concurrency: 1, request reached max organization concurrency: 1, please try again after 0 seconds',
            },
          }),
          responseHeaders: 'retry-after: 0\r\n',
        });
      } else {
        options.onload?.({
          status: 200,
          responseText: JSON.stringify(response('retried-ok')),
          responseHeaders: '',
        });
      }
    });
    return { abort() {} };
  };

  try {
    const result = await queryAI('retry me', aiConfig());
    assert.equal(result, 'retried-ok');
    assert.equal(calls, 2);
  } finally {
    window.GM_xmlhttpRequest = previous;
  }
});

test('non-rate-limit AI errors are not retried', async () => {
  const previous = window.GM_xmlhttpRequest;
  let calls = 0;
  window.GM_xmlhttpRequest = (options) => {
    calls += 1;
    queueMicrotask(() => options.onload?.({
      status: 401,
      responseText: JSON.stringify({ error: { message: 'bad key' } }),
      responseHeaders: '',
    }));
    return { abort() {} };
  };
  try {
    await assert.rejects(() => queryAI('no retry', aiConfig()), /401|bad key/);
    assert.equal(calls, 1);
  } finally {
    window.GM_xmlhttpRequest = previous;
  }
});
