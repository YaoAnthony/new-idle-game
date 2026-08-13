# ---- 构建阶段 ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 用 build args 覆盖 .env.production 里的生产域名，换成本地 Docker 地址
ARG VITE_FRONTEND_URL=http://localhost:4002
ARG VITE_GOOGLE_REDIRECT_URI=http://localhost:4002/callback
# VITE_BACKEND_API_URL=/api 已在 .env.production 中，无需重复

ENV VITE_FRONTEND_URL=$VITE_FRONTEND_URL
ENV VITE_GOOGLE_REDIRECT_URI=$VITE_GOOGLE_REDIRECT_URI

RUN npm run build

# ---- 运行阶段 ----
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
