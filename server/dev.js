import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function run(args, env) {
  const child = spawn(process.execPath, args, { cwd: rootDir, env, stdio: 'inherit' });
  children.push(child);
  child.once('exit', (code) => {
    shutdown();
    process.exitCode = code || 0;
  });
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // 进程已经退出。
    }
  }
}

process.once('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.once('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

run(['server/index.js'], { ...process.env, GUANXING_DEV: '1' });
run([path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')], process.env);
