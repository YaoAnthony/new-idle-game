#!/usr/bin/env bash
#
# 在服务器上发一版后端：拉 main → 装依赖 → 先 Core 再 Backend 构建 → 重启 → 健康检查。
# 以 idlegame 身份跑：  sudo -u idlegame /opt/new-idle-game/deploy/scripts/deploy-backend.sh
# 重启那一步要 sudo，server-setup.sh 已给 idlegame 放行了这一条命令。
#
# 为什么在服务器上构建而不是本地传 dist：better-sqlite3 是原生模块，要和这台机的 Node / 架构一致。
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/new-idle-game}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3001}"

cd "$APP_DIR"
echo "== 拉代码（$BRANCH）"
git fetch --prune origin
git checkout -q "$BRANCH"
git pull --ff-only origin "$BRANCH"
echo "   $(git log --oneline -1)"

echo "== Core"
(cd Core && npm ci --no-audit --no-fund && npm run build)

echo "== Backend（prebuild 会再跑一次 Core build，幂等）"
(cd Backend && npm ci --no-audit --no-fund && npm run build)

echo "== 重启"
sudo systemctl restart idle-game-backend
sleep 2

echo "== 健康检查"
for _ in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null; then
    curl -sS "http://127.0.0.1:$PORT/health"; echo
    echo "OK"
    exit 0
  fi
  sleep 2
done
echo "后端没起来，看日志：sudo journalctl -u idle-game-backend -n 100 --no-pager" >&2
exit 1
