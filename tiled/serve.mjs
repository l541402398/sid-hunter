// 零依赖静态服务器：从项目根目录提供服务，用于预览 tiled/preview.html
// 用法：node tiled/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.argv[2] || 8788);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.tmj': 'application/json', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const target = url.startsWith('/assets/')
    ? join(root, 'online/public', url)
    : join(root, url === '/' ? '/tiled/preview.html' : url);
  const file = normalize(target);
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found: ' + url);
  }
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/tiled/preview.html`));
