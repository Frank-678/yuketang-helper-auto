import assert from 'node:assert/strict';
import test from 'node:test';

test('uses the active profile temperature for a text completion', async (t) => {
  const originalWindow = globalThis.window;
  let requestPayload;

  globalThis.window = {
    GM_xmlhttpRequest(options) {
      requestPayload = JSON.parse(options.data);
      queueMicrotask(() => options.onload({
        status: 200,
        responseText: JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
      }));
    },
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  const { queryAI } = await import('../src/ai/openai.js');
  await queryAI('test', {
    profiles: [{
      id: 'profile-1',
      baseUrl: 'https://api.example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'test-model',
      temperature: 1,
    }],
    activeProfileId: 'profile-1',
  });

  assert.equal(requestPayload.temperature, 1);
});

test('omits temperature when the active profile leaves it blank', async (t) => {
  const originalWindow = globalThis.window;
  let requestPayload;

  globalThis.window = {
    GM_xmlhttpRequest(options) {
      requestPayload = JSON.parse(options.data);
      queueMicrotask(() => options.onload({
        status: 200,
        responseText: JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
      }));
    },
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  const { queryAI } = await import('../src/ai/openai.js');
  await queryAI('test', {
    profiles: [{
      id: 'profile-1',
      baseUrl: 'https://api.example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'test-model',
      temperature: '',
    }],
    activeProfileId: 'profile-1',
  });

  assert.equal(Object.hasOwn(requestPayload, 'temperature'), false);
});

test('uses the active profile temperature for a vision completion', async (t) => {
  const originalWindow = globalThis.window;
  let requestPayload;

  globalThis.window = {
    GM_xmlhttpRequest(options) {
      requestPayload = JSON.parse(options.data);
      queueMicrotask(() => options.onload({
        status: 200,
        responseText: JSON.stringify({
          choices: [{ message: { content: 'vision-ok' } }],
        }),
      }));
    },
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  const { queryAIVision } = await import('../src/ai/openai.js');
  await queryAIVision('aW1hZ2U=', 'test', {
    profiles: [{
      id: 'profile-1',
      baseUrl: 'https://api.example.test/v1/chat/completions',
      apiKey: 'test-key',
      model: 'test-model',
      visionModel: 'vision-model',
      temperature: 0.65,
    }],
    activeProfileId: 'profile-1',
  }, { disableTwoStep: true });

  assert.equal(requestPayload.temperature, 0.65);
});

test('uses an explicitly selected profile for a vision completion', async (t) => {
  const originalWindow = globalThis.window;
  let requestOptions;

  globalThis.window = {
    GM_xmlhttpRequest(options) {
      requestOptions = options;
      queueMicrotask(() => options.onload({
        status: 200,
        responseText: JSON.stringify({
          choices: [{ message: { content: 'fast-ok' } }],
        }),
      }));
    },
  };
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  const { queryAIVision } = await import('../src/ai/openai.js');
  await queryAIVision('aW1hZ2U=', 'test', {
    profiles: [
      {
        id: 'accurate',
        baseUrl: 'https://api.example.test/accurate',
        apiKey: 'accurate-key',
        model: 'accurate-model',
        visionModel: 'accurate-vision',
      },
      {
        id: 'fast',
        baseUrl: 'https://api.example.test/fast',
        apiKey: 'fast-key',
        model: 'fast-model',
        visionModel: 'fast-vision',
      },
    ],
    activeProfileId: 'accurate',
  }, { disableTwoStep: true, profileId: 'fast' });

  assert.equal(requestOptions.url, 'https://api.example.test/fast');
  assert.equal(requestOptions.headers.Authorization, 'Bearer fast-key');
  assert.equal(JSON.parse(requestOptions.data).model, 'fast-vision');
});
