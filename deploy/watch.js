/**
 * 保存后自动构建并上传。页面改动只更新 dist，不重启进程。
 * 用法：在本项目目录执行 npm run sync，这个窗口保持开着。
 */
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let timer = null;
let running = false;
let queued = null;

function schedule(kind) {
  queued = queued === 'server' || kind === 'server' ? 'server' : 'web';
  clearTimeout(timer);
  timer = setTimeout(flush, 800);
}

function flush() {
  if (!queued) return;
  if (running) return;
  const kind = queued;
  queued = null;
  running = true;
  const env = { ...process.env };
  if (kind === 'web') env.GUANXING_SYNC = 'web';
  else delete env.GUANXING_SYNC;
  const child = spawn(process.execPath, ['deploy/push.js'], { cwd: rootDir, env, stdio: 'inherit' });
  child.on('exit', (code) => {
    running = false;
    if (code !== 0) console.error('同步失败，改完再保存一次即可重试');
    if (queued) flush();
  });
}

function bind(relativePath, kind) {
  watch(path.join(rootDir, relativePath), { recursive: true }, () => schedule(kind));
}

bind('src', 'web');
bind('server', 'server');
watch(path.join(rootDir, 'index.html'), () => schedule('web'));
console.log('正在监听。保存 src 或 server 后会自动同步到服务器，这个窗口不要关。');
