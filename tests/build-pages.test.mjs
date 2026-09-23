import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function build(value) {
  return spawnSync(process.execPath, ['tools/build-pages.mjs'], {
    encoding: 'utf8', env: { ...process.env, HINOKI_FIREBASE_CONFIG: value, GITHUB_OUTPUT: '', RUNNER_TEMP: os.tmpdir() }
  });
}
test('publishing fails closed when configuration is missing', () => {
  const result = build('null');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /deployment secret/);
});
test('malformed configuration never appears in error output', () => {
  const result = build('invalid-json-PRIVATE_SENTINEL');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr + result.stdout, /PRIVATE_SENTINEL/);
});
test('publishing copies only app resources and writes config outside checkout', () => {
  const result = build(JSON.stringify({ apiKey: 'test-only-placeholder', authDomain: 'demo.example.test', projectId: 'demo-hinoki-library', appId: 'test-only-app', unexpectedField: 'must-not-publish' }));
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.trim().split('repository: ')[1];
  assert.ok(output && path.resolve(output).startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(!path.resolve(output).startsWith(process.cwd() + path.sep));
  const config = JSON.parse(fs.readFileSync(path.join(output, 'firebase-config.json'), 'utf8'));
  assert.equal(config.projectId, 'demo-hinoki-library');
  assert.equal(config.unexpectedField, undefined);
  assert.deepEqual(fs.readdirSync(output).sort(), ['.nojekyll', 'app.js', 'domain.js', 'firebase-client.js', 'firebase-config.json', 'index.html', 'library-store.js', 'tools'].sort());
  assert.equal(fs.existsSync('firebase-config.json'), false);
  // Only the unique directory just created by this test is removed.
  fs.rmSync(output, { recursive: true });
});
