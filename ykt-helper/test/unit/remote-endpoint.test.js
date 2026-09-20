import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSafeApiEndpoint } from '../../src/core/remote-endpoint.js';

for (const url of [
  'https://api.example.com/v1/chat/completions',
  'https://api.example.com:8443/custom?x=1',
  'http://localhost:11434/v1/chat/completions',
  'http://127.0.0.1:8000/v1/chat/completions',
  'http://[::1]:8080/v1/chat/completions',
]) {
  test('safe AI endpoint accepted: ' + url, () => {
    assert.equal(assertSafeApiEndpoint(url), new URL(url).href);
  });
}

for (const url of [
  'http://api.example.com/v1/chat/completions',
  'ftp://api.example.com/model',
  'file:///tmp/model',
  'data:text/plain,hello',
  'javascript:alert(1)',
  'https://user:pass@example.com/v1/chat/completions',
]) {
  test('unsafe AI endpoint rejected: ' + url, () => {
    assert.throws(() => assertSafeApiEndpoint(url), /endpoint|HTTPS|安全|协议|凭据/i);
  });
}

test('blank or malformed endpoint is rejected', () => {
  assert.throws(() => assertSafeApiEndpoint(''), /endpoint|URL|地址/i);
  assert.throws(() => assertSafeApiEndpoint('not a url'), /endpoint|URL|地址/i);
});
