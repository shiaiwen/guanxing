#!/bin/sh
# 没有 systemd 时用这个脚本把观星进程留住：退出后 2 秒再拉起。
cd /opt/guanxing || exit 1
if command -v node >/dev/null 2>&1; then
  NODE=$(command -v node)
else
  NODE=/usr/bin/node
fi
while true; do
  "$NODE" server/index.js >> /opt/guanxing/guanxing.log 2>&1
  sleep 2
done
