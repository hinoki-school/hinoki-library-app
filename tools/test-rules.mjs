import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const env = { ...process.env, CI: 'true' };
// Optional portable Java for this Windows workspace. CI/system Java otherwise.
const javaRoot = path.resolve('.test-tools/java');
if (fs.existsSync(javaRoot)) {
  const java = fs.readdirSync(javaRoot).map(name => path.join(javaRoot, name, 'bin')).find(bin => fs.existsSync(path.join(bin, 'java.exe')));
  if (java) {
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
    env[pathKey] = java + path.delimiter + (env[pathKey] || '');
  }
  env.FIREBASE_EMULATORS_PATH ||= path.resolve('.test-tools/emulators');
}
const child = spawn(process.execPath, [
  'node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:exec', '--only', 'firestore',
  '--project', 'demo-hinoki-library', 'node --test tests/firestore.test.mjs'
], { env, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
