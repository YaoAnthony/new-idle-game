#!/usr/bin/env bash
#
# 新机器一次性初始化（Ubuntu 24.04，EC2 t4g.small / Lightsail 2 GB 都行）。
# 以有 sudo 的用户跑：  bash server-setup.sh
#
# 做的事：装 Node 22 + 原生模块的编译工具 + Caddy + sqlite3 + aws cli；建 idlegame 用户和目录；
# clone 仓库到 /opt/new-idle-game；装 systemd 单元。**不启动后端**——backend.env 里的密钥要你先填。
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/YaoAnthony/new-idle-game.git}"
APP_DIR=/opt/new-idle-game
DATA_DIR=/var/lib/idle-game
CONF_DIR=/etc/idle-game

echo "== 1/6 系统包"
sudo apt-get update -y
sudo apt-get install -y curl git build-essential python3 sqlite3 unzip ca-certificates \
  debian-keyring debian-archive-keyring apt-transport-https

echo "== 2/6 Node 22（NodeSource）"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v && npm -v

echo "== 3/6 Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y && sudo apt-get install -y caddy
fi

echo "== 4/6 aws cli（备份脚本用；EC2 走实例角色，不用配密钥）"
if ! command -v aws >/dev/null; then
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64) URL=https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip ;;
    *)       URL=https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip ;;
  esac
  tmp=$(mktemp -d); curl -fsSL "$URL" -o "$tmp/awscli.zip"; unzip -q "$tmp/awscli.zip" -d "$tmp"
  sudo "$tmp/aws/install"; rm -rf "$tmp"
fi

echo "== 5/6 用户、目录、仓库"
id -u idlegame >/dev/null 2>&1 || sudo useradd --system --create-home --shell /usr/sbin/nologin idlegame
sudo mkdir -p "$DATA_DIR" "$CONF_DIR" "$APP_DIR"
sudo chown idlegame:idlegame "$DATA_DIR" "$APP_DIR"
sudo chmod 750 "$CONF_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u idlegame git clone "$REPO_URL" "$APP_DIR"
fi
if [ ! -f "$CONF_DIR/backend.env" ]; then
  sudo cp "$APP_DIR/deploy/backend.env.example" "$CONF_DIR/backend.env"
  sudo chown root:idlegame "$CONF_DIR/backend.env"; sudo chmod 640 "$CONF_DIR/backend.env"
fi
if [ ! -f "$CONF_DIR/aws.env" ]; then
  sudo cp "$APP_DIR/deploy/aws.env.example" "$CONF_DIR/aws.env"
  sudo chown root:idlegame "$CONF_DIR/aws.env"; sudo chmod 640 "$CONF_DIR/aws.env"
fi
# deploy-backend.sh 里那一句 systemctl restart 要 sudo；只放行这一条命令
echo "idlegame ALL=(root) NOPASSWD: /usr/bin/systemctl restart idle-game-backend" | sudo tee /etc/sudoers.d/idlegame >/dev/null
sudo chmod 440 /etc/sudoers.d/idlegame

echo "== 6/6 systemd 单元 + Caddyfile"
sudo cp "$APP_DIR"/deploy/systemd/idle-game-backend.service /etc/systemd/system/
sudo cp "$APP_DIR"/deploy/systemd/idle-game-backup.service /etc/systemd/system/
sudo cp "$APP_DIR"/deploy/systemd/idle-game-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable idle-game-backend >/dev/null
if ! grep -q "reverse_proxy 127.0.0.1:3001" /etc/caddy/Caddyfile 2>/dev/null; then
  sudo cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
fi

cat <<MSG

初始化完成。接下来手动做三件事：
  1. sudo nano $CONF_DIR/backend.env   —— 填 AUTH_JWT_SECRET（openssl rand -base64 48）、CORS_ORIGIN、GOOGLE_CLIENT_ID
  2. sudo nano /etc/caddy/Caddyfile     —— 把 api.example.com 换成你的域名，然后 sudo systemctl reload caddy
  3. sudo -u idlegame $APP_DIR/deploy/scripts/deploy-backend.sh   —— 首次构建并启动
  备份定时：sudo systemctl enable --now idle-game-backup.timer（先在 $CONF_DIR/aws.env 填 BACKUP_BUCKET）
MSG
