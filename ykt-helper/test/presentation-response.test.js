import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePresentationResponse } from '../src/core/presentation-response.js';

test('the original URL supplies the optional presentation id without numeric coercion', () => {
  const data = { slides: [] };
  const parsed = parsePresentationResponse('/api/v3/lesson/presentation/fetch?presentation_id=900719925474099312345', { code: 0, data });
  assert.equal(parsed.id, '900719925474099312345');
  assert.equal(parsed.data, data);
  assert.equal(Object.hasOwn(data, 'id'), false);
});

test('query identity takes priority and supports both presentation query spellings', () => {
  for (const name of ['presentation_id', 'presentationId']) {
    const parsed = parsePresentationResponse(`/lesson/presentation/fetch?${name}=query-id`, { code: '0', data: { id: 'body-id', slides: [] } });
    assert.equal(parsed.id, 'query-id');
  }
});

test('body identifiers still work when no presentation query is present', () => {
  for (const name of ['id', 'presentationId', 'presentation_id']) assert.equal(parsePresentationResponse('/lesson/presentation', { code: 0, data: { [name]: 'body-id', slides: [] } }).id, 'body-id');
});

test('the legacy result envelope and raw slide payload both remain readable', () => {
  for (const json of [{ success: true, result: { id: 'P', slides: [] } }, { id: 'P', slides: [] }]) assert.equal(parsePresentationResponse('/lesson/presentation', json)?.id, 'P');
});

test('invalid, failed, or unidentifiable responses never create an undefined deck', () => {
  for (const json of [null, {}, { code: 500, data: { id: 'P', slides: [] } }, { code: 0, success: false, data: { id: 'P', slides: [] } }, { code: 0, data: { id: 'P', slides: {} } }, { code: 0, data: { slides: [] } }]) assert.equal(parsePresentationResponse('/lesson/presentation', json), null);
});
