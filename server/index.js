/**
 * 生产环境同时提供页面和 /api/report。
 * 开发时只提供接口，页面由 Vite 代理过来。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReport } from './engine.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.GUANXING_PORT || 17322);
const dev = process.env.GUANXING_DEV === '1';

const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.json', 'application/json; charset=utf-8'],
  ['.woff2', 'font/woff2']
]);

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function resolveStatic(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const root = path.resolve(distDir);
  const filePath = relative ? path.resolve(root, relative) : path.join(root, 'index.html');
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
  return filePath;
}

function sendFile(response, filePath) {
  response.writeHead(200, {
    'Content-Type': types.get(path.extname(filePath)) ?? 'application/octet-stream',
    'Cache-Control': path.extname(filePath) === '.html' ? 'no-store' : 'public, max-age=3600'
  });
  response.end(fs.readFileSync(filePath));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/api/report') {
    try {
      sendJson(response, 200, await loadReport());
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (dev) {
    response.writeHead(404);
    response.end();
    return;
  }
  const filePath = resolveStatic(url.pathname);
  if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(response, filePath);
    return;
  }
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    sendFile(response, indexPath);
    return;
  }
  response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('页面还没构建。先在本项目目录执行 npm run build。');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`观星服务 http://127.0.0.1:${port}/`);
});
