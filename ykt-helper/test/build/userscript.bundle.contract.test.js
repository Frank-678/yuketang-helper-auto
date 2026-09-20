import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const distPath = path.resolve('dist/ykt-helper-1216.user.js');

function bundle() {
  assert.ok(fs.existsSync(distPath), `built userscript missing: ${distPath}`);
  return fs.readFileSync(distPath, 'utf8');
}

test('build output is a single userscript file with metadata header', () => {
  const text = bundle();
  assert.match(text.slice(0, 500), /==UserScript==/);
  assert.match(text, /@name\s+AI雨课堂助手（JS版）/);
  assert.match(text, /@run-at\s+document-start/);
});

test('metadata grants private userscript storage for AI credentials', () => {
  const text = bundle();
  assert.match(text, /@grant\s+GM_getValue/);
  assert.match(text, /@grant\s+GM_setValue/);
  assert.match(text, /@grant\s+GM_deleteValue/);
});

test('metadata covers desktop root, web, mobile and lesson entries for all supported domains', () => {
  const text = bundle();
  for (const domain of ['www.yuketang.cn', 'pro.yuketang.cn', 'changjiang.yuketang.cn']) {
    assert.match(text, new RegExp(`@match\\s+https:\\/\\/${domain.replaceAll('.', '\\.')}/`));
    assert.match(text, new RegExp(`@match\\s+https:\\/\\/${domain.replaceAll('.', '\\.')}/web`));
    assert.match(text, new RegExp(`@match\\s+https:\\/\\/${domain.replaceAll('.', '\\.')}/m/v2\\*`));
  }
  assert.match(text, /@match\s+https:\/\/\*\.yuketang\.cn\/lesson\/fullscreen\/v3\/\*/);
});

test('bundle contains realtime event handling and timeline live classification', () => {
  const text = bundle();
  assert.match(text, /unlockproblem/i);
  assert.match(text, /fetchtimeline/i);
  assert.match(text, /timeline-live/i);
  assert.match(text, /newdanmu/i);
});

test('bundle contains AI request, parser and submit endpoints', () => {
  const text = bundle();
  assert.match(text, /GM_xmlhttpRequest/);
  assert.match(text, /chat\/completions/);
  assert.match(text, /parseAIAnswer/);
  assert.match(text, /\/api\/v3\/lesson\/problem\/answer/);
  assert.match(text, /\/api\/v3\/lesson\/problem\/retry/);
});

test('bundle contains automatic, manual-force and recovery lifecycle markers', () => {
  const text = bundle();
  assert.match(text, /auto-answer-started/);
  assert.match(text, /auto-answer-succeeded/);
  assert.match(text, /auto-answer-failed/);
  assert.match(text, /auto-answer-recovery/);
  assert.match(text, /allowResubmit/);
});

test('bundle contains periodic refresh, wake lock and danmu follow logic', () => {
  const text = bundle();
  assert.match(text, /periodic/i);
  assert.match(text, /wakeLock|wake lock/i);
  assert.match(text, /sendDanmu|danmu/i);
});

test('bundle stays a lightweight browser userscript without Windows desktop product code', () => {
  const text = bundle();
  assert.doesNotMatch(text, /electron/i);
  assert.doesNotMatch(text, /BrowserWindow/);
  assert.doesNotMatch(text, /ykt-helper-win/);
  assert.doesNotMatch(text, /powershell\.exe/i);
  assert.doesNotMatch(text, /windows installer/i);
});

test('bundle does not import runtime modules after Rollup packaging', () => {
  const text = bundle();
  assert.doesNotMatch(text, /^\s*import\s/m);
  assert.doesNotMatch(text, /^\s*export\s/m);
});

test('historical release files remain separate from generated dist output', () => {
  assert.equal(path.basename(distPath), 'ykt-helper-1216.user.js');
  assert.ok(!distPath.includes(`${path.sep}release${path.sep}`));
});


test('remote runtime JavaScript dependencies are exact-version metadata requirements', () => {
  const text = bundle();
  assert.match(text, /@require\s+https:\/\/cdn\.jsdelivr\.net\/npm\/html2canvas@1\.4\.1\/dist\/html2canvas\.min\.js/);
  assert.match(text, /@require\s+https:\/\/cdn\.jsdelivr\.net\/npm\/jspdf@2\.5\.1\/dist\/jspdf\.umd\.min\.js/);
  assert.match(text, /@require\s+https:\/\/cdn\.jsdelivr\.net\/npm\/mathjax@3\.2\.2\/es5\/tex-svg\.min\.js/);
  assert.equal(text.includes('html2canvas.hertzen.com'), false);
  assert.doesNotMatch(text, /mathjax@3\/es5/);
});

test('bundle does not dynamically inject remote JavaScript tags at runtime', () => {
  const text = bundle();
  assert.doesNotMatch(text, /document\.createElement\(["']script["']\)/);
  assert.doesNotMatch(text, /Failed to load:\s*\$\{src\}/);
});


test('metadata declares Tampermonkey connect permissions for built-in and custom AI endpoints', () => {
  const text = bundle();
  const connectPermissions = text.split(/\r?\n/)
    .filter(line => line.startsWith('// @connect'))
    .map(line => line.slice('// @connect'.length).trim());
  for (const domain of [
    'api.moonshot.cn',
    'api.openai.com',
    'api.deepseek.com',
    'openrouter.ai',
    'generativelanguage.googleapis.com',
    'localhost',
    '127.0.0.1',
  ]) {
    assert.ok(connectPermissions.includes(domain), 'missing @connect ' + domain);
  }
  assert.ok(connectPermissions.includes('*'));
});


test('pinned @require dependencies carry exact SHA-256 integrity hashes', () => {
  const text = bundle();
  assert.match(text, /html2canvas@1\.4\.1\/dist\/html2canvas\.min\.js#sha256=6H5VB5QyLldKH9oMFUmjxw2uWpPZETQXpCkBaDjquMs=/);
  assert.match(text, /jspdf@2\.5\.1\/dist\/jspdf\.umd\.min\.js#sha256=mMzxeqEMILsTAXYmGPzJtqs6Tn8mtgcdZNC0EVTfOHU=/);
  assert.match(text, /mathjax@3\.2\.2\/es5\/tex-svg\.min\.js#sha256=5FOQtjyN31BBQmvTsCf1iypgSa37N8n\+8Kyn81mgUxg=/);
});
