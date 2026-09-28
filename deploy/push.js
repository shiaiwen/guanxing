/**
 * 本机构建后上传到服务器并重启观星进程。
 * 用法：在本项目目录执行 npm run deploy
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.GUANXING_SSH || 'admin@123.56.3.130';
const remote = process.env.GUANXING_REMOTE || '/opt/guanxing';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const webOnly = process.env.GUANXING_SYNC === 'web';

run(process.execPath, [path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);
if (webOnly) {
  run('ssh', [target, `mkdir -p ${remote} && rm -rf ${remote}/dist`]);
  run('scp', ['-r', 'dist', `${target}:${remote}/`]);
  console.log(`页面已同步到 ${target}:${remote}`);
  process.exit(0);
}
run('ssh', [target, `mkdir -p ${remote} && rm -rf ${remote}/dist ${remote}/server`]);
run('scp', ['-r', 'dist', 'server', 'package.json', `${target}:${remote}/`]);
run('scp', ['deploy/keep-alive.sh', `${target}:${remote}/keep-alive.sh`]);
run('ssh', [target, `chmod +x ${remote}/keep-alive.sh && sh -c '
if ss -lnt | grep -q ":17322"; then
  pid=$(ss -lntp 2>/dev/null | sed -n "s/.*:17322 .*pid=\\([0-9]*\\).*/\\1/p" | head -1)
  if [ -n "$pid" ]; then kill "$pid" || true; fi
  sleep 2
fi
if ! ss -lnt | grep -q ":17322"; then
  nohup ${remote}/keep-alive.sh >/dev/null 2>&1 &
fi
'`]);
console.log(`已同步到 ${target}:${remote}`);
