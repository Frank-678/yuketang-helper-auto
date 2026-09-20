import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const suite = process.argv[2];
if (!suite || !/^[a-z0-9_-]+$/i.test(suite)) {
  console.error('Usage: node test/support/run-test-files.mjs <suite>');
  process.exit(2);
}

const dir = path.resolve('test', suite);
const files = fs.readdirSync(dir)
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => path.join(dir, name));

if (!files.length) {
  console.error('No test files found in', dir);
  process.exit(2);
}

for (const file of files) {
  console.log('\n=== isolated test file:', path.relative(process.cwd(), file), '===');
  const result = spawnSync(
    process.execPath,
    [
      '--import', './test/support/register-raw-loader.mjs',
      file,
    ],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
