import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Runtime injection only. No real Firebase config is written into the checkout.
let config;
try { config = JSON.parse(process.env.HINOKI_FIREBASE_CONFIG || 'null'); }
catch { throw new Error('HINOKI_FIREBASE_CONFIG must be valid JSON. Configuration omitted from error output.'); }
if (!config || !['apiKey', 'authDomain', 'projectId', 'appId'].every(key => typeof config[key] === 'string' && config[key].trim())) {
  throw new Error('Set HINOKI_FIREBASE_CONFIG using the deployment secret. Its value is never logged.');
}
const fields = ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket', 'messagingSenderId', 'measurementId', 'databaseURL'];
config = Object.fromEntries(fields.filter(key => typeof config[key] === 'string').map(key => [key, config[key]]));
const root = process.cwd();
const output = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'hinoki-pages-'));
const relative = path.relative(root, output);
if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('Artifact output must be outside the repository.');
const files = ['index.html', 'app.js', 'domain.js', 'library-store.js', 'firebase-client.js', 'tools/seed-demo.js', 'tools/demo-data.js'];
for (const file of files) {
  await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await fs.copyFile(path.join(root, file), path.join(output, file));
}
await fs.writeFile(path.join(output, 'firebase-config.json'), JSON.stringify(config));
await fs.writeFile(path.join(output, '.nojekyll'), '');
if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `path=${output}\n`);
console.log('Pages artifact prepared outside the repository: ' + output);
