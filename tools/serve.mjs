import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
// Only app resources; never expose .git, credentials, dependency trees, or tests.
const allowed = new Set(['index.html', 'app.js', 'domain.js', 'library-store.js', 'firebase-client.js', 'tools/demo-data.js', 'tools/seed-demo.js']);
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  res.setHeader('Cache-Control', 'no-store');
  if (name === 'firebase-config.json') {
    const config = process.env.HINOKI_FIREBASE_CONFIG;
    res.writeHead(config ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(config || '{}');
    return;
  }
  if (!allowed.has(name)) { res.writeHead(404); res.end(); return; }
  try {
    const content = await fs.readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': (types[path.extname(name)] || 'text/plain') + '; charset=utf-8' });
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Library preview: http://127.0.0.1:' + (process.env.PORT || 4173)));
