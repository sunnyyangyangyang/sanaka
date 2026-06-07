#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "当前目录: $ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "没找到 git。请先安装 Git。"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "没找到 npm。请先安装 Node.js。"
  exit 1
fi

echo "设置 npm / Electron 镜像..."
npm config set registry https://registry.npmmirror.com
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

echo "拉取远程最新代码..."
git fetch origin
git reset --hard origin/main

echo "安装/修复依赖..."
if ! npm install; then
  echo "首次 npm install 失败，清理 node_modules 后重试一次..."
  rm -rf node_modules
  npm install
fi

echo "构建检查..."
npm run build

echo "完成。现在可以运行: npm start"
