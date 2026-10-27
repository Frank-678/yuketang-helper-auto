import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: project, stdio: 'inherit' });
const input = path.join(project, 'dist/ykt-helper-1221.user.js');
const release = path.join(project, '../release');
fs.copyFileSync(input, path.join(release, 'ykt-helper-1221.user.js'));
fs.copyFileSync(input, path.join(release, 'ykt-helper.user.js'));

