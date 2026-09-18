#!/usr/bin/env bash
#
# 在**本机**发前端：按 .env.local 里的 VITE_BACKEND_TARGET 构建 → 同步到 S3 → 刷 CloudFront。
#   deploy/scripts/deploy-frontend.sh            # 用 .env.local 里的目标
#   deploy/scripts/deploy-frontend.sh cloud      # 强制打云端后端（正常发布用这个）
#
# 为什么在本机构建：public/music 那 530 MB 不在 git 里，曲库注册表是构建时扫目录生成的，
# 只有有音乐文件的机器才能构出完整的曲库。
#
# 缓存策略：assets/ 带内容 hash → 一年不过期；index.html 不缓存（发版立刻生效）；
# 其余 public/ 里没 hash 的文件（音频、头像、UI 图）缓存一天。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/deploy/aws.env"
: "${FRONTEND_BUCKET:?aws.env 里要有 FRONTEND_BUCKET}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?aws.env 里要有 CLOUDFRONT_DISTRIBUTION_ID}"
export AWS_PROFILE="${AWS_PROFILE:-default}" AWS_REGION="${AWS_REGION:-us-east-1}"

TARGET="${1:-}"
cd "$ROOT/Frontend-3D"
if [ ! -f .env.local ]; then
  echo "没有 Frontend-3D/.env.local——先 cp deploy/frontend.env.example Frontend-3D/.env.local 并填好" >&2
  exit 1
fi

echo "== 构建（VITE_BACKEND_TARGET=${TARGET:-按 .env.local}）"
if [ -n "$TARGET" ]; then
  VITE_BACKEND_TARGET="$TARGET" npm run build
else
  npm run build
fi
[ -f dist/index.html ] || { echo "dist/index.html 不存在，构建失败" >&2; exit 1; }

echo "== 上传 assets/（长缓存）"
aws s3 sync dist/assets "s3://$FRONTEND_BUCKET/assets" --delete \
  --cache-control "public, max-age=31536000, immutable" --only-show-errors

echo "== 上传其余文件（一天缓存；音乐 530 MB 首次慢，之后只传变化的）"
aws s3 sync dist "s3://$FRONTEND_BUCKET" --delete \
  --exclude "assets/*" --exclude "index.html" \
  --cache-control "public, max-age=86400" --only-show-errors

echo "== 上传 index.html（不缓存）"
aws s3 cp dist/index.html "s3://$FRONTEND_BUCKET/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" --content-type "text/html; charset=utf-8" --only-show-errors

echo "== 刷 CloudFront"
aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "/index.html" "/" \
  --query 'Invalidation.Id' --output text
echo "OK"
