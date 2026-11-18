import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const path = new URL('../', import.meta.url);
test('published stable and versioned scripts are byte-identical to the current build', () => {
  const built = fs.readFileSync(new URL('dist/ykt-helper-1222-beta3.user.js', path));
  for (const name of ['ykt-helper-dynamic-qr.user.js', 'ykt-helper-1222-beta3.user.js']) assert.equal(fs.readFileSync(new URL('../release/' + name, path)).equals(built), true, name + ' is stale; run npm run release');
  assert.match(built.toString('utf8'), /@version\s+1\.22\.2-beta\.3/);
  assert.match(built.toString('utf8'), /@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/Frank-678\/yuketang-helper-auto\/feat\/dynamic-qr-checkin\/release\/ykt-helper-dynamic-qr\.user\.js/);
});

