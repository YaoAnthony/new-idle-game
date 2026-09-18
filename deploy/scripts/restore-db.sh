#!/usr/bin/env bash
#
# 从 S3 拿一份备份盖回去。会先停后端、把当前库另存一份，再替换。以 root 跑：
#   sudo /opt/new-idle-game/deploy/scripts/restore-db.sh s3://idle-game-backups/sqlite/app-20260916-093000.db.gz
set -euo pipefail

SRC="${1:?用法: restore-db.sh s3://bucket/sqlite/app-xxx.db.gz}"
DB_PATH="${DB_PATH:-/var/lib/idle-game/app.db}"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
aws s3 cp "$SRC" "$tmp/app.db.gz" --only-show-errors
gunzip "$tmp/app.db.gz"

systemctl stop idle-game-backend
cp "$DB_PATH" "$DB_PATH.before-restore-$(date -u +%Y%m%d-%H%M%S)"
rm -f "$DB_PATH-wal" "$DB_PATH-shm"
install -o idlegame -g idlegame -m 640 "$tmp/app.db" "$DB_PATH"
systemctl start idle-game-backend
echo "restored from $SRC"
