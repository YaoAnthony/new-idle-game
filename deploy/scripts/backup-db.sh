#!/usr/bin/env bash
#
# SQLite 热备份到 S3。用 sqlite3 的 .backup（在线一致快照，WAL 模式下不锁写），gzip 后按日期命名上传。
# 由 idle-game-backup.timer 每晚跑；也可手动：sudo -u idlegame /opt/new-idle-game/deploy/scripts/backup-db.sh
#
# 环境：DB_PATH（backend.env）、BACKUP_BUCKET / AWS_REGION（aws.env）。
# EC2 上给实例挂一个只能写这个桶的角色（deploy/aws/iam-ec2-backup-role-policy.json），机器上不放密钥。
# 保留期用 S3 生命周期规则（deploy/aws/s3-backup-lifecycle.json，30 天），脚本不管删。
set -euo pipefail

DB_PATH="${DB_PATH:-/var/lib/idle-game/app.db}"
: "${BACKUP_BUCKET:?需要 BACKUP_BUCKET}"
AWS_REGION="${AWS_REGION:-us-east-1}"

stamp=$(date -u +%Y%m%d-%H%M%S)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

sqlite3 "$DB_PATH" ".backup '$tmp/app.db'"
gzip -9 "$tmp/app.db"
aws s3 cp "$tmp/app.db.gz" "s3://$BACKUP_BUCKET/sqlite/app-$stamp.db.gz" --region "$AWS_REGION" --only-show-errors
echo "backup ok: s3://$BACKUP_BUCKET/sqlite/app-$stamp.db.gz ($(du -h "$tmp/app.db.gz" | cut -f1))"
