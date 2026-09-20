import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.window) globalThis.window = {};
window.unsafeWindow = window;

const { queryAI } = await import('../../src/ai/openai.js');

const aiConfig = {
  profiles: [{
    id: 'audit',
    name: 'Audit',
    baseUrl: 'https://example.invalid/v1/chat/completions',
    apiKey: 'audit-only-placeholder',
    model: 'audit-model',
    visionModel: 'audit-model',
  }],
  activeProfileId: 'audit',
};

test('queryAI rejects when GM_xmlhttpRequest times out', async () => {
  window.GM_xmlhttpRequest = (options) => {
    queueMicrotask(() => options.ontimeout?.({ status: 0 }));
    return { abort() {} };
  };

  const outcome = await Promise.race([
    queryAI('timeout fault injection', aiConfig).then(
      () => ({ settled: true, resolved: true }),
      (error) => ({ settled: true, resolved: false, error }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ settled: false }), 150)),
  ]);

  assert.equal(
    outcome.settled,
    true,
    'queryAI stayed pending after the transport emitted ontimeout',
  );
  assert.equal(outcome.resolved, false, 'timeout must reject rather than resolve');
  assert.match(String(outcome.error?.message || outcome.error), /timeout|超时/i);
});
