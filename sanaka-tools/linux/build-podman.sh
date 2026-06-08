#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR" && pwd)
REPO_DIR=$(CDPATH= cd -- "$ROOT_DIR/../.." && pwd)
IMAGE=${SANAKA_PODMAN_IMAGE:-docker.io/library/debian:stable-slim}
CONTAINER_WORKDIR=/work

if ! command -v podman >/dev/null 2>&1; then
  printf '%s\n' "未找到 podman。" >&2
  exit 1
fi

printf '%s\n' "使用 Podman 构建 Linux 客户机程序..."
printf '%s\n' "镜像: $IMAGE"

podman run --rm \
  -v "$REPO_DIR:$CONTAINER_WORKDIR:Z" \
  -w "$CONTAINER_WORKDIR" \
  "$IMAGE" \
  sh -lc '
    set -eu
    apt-get update
    apt-get install -y build-essential file
    SANAKA_OUTPUT="sanaka-tools/linux/build/sanaka-clipboard-Linux-x86_64" sh sanaka-tools/linux/build.sh
    cp sanaka-tools/linux/build/sanaka-clipboard-Linux-x86_64 sanaka-tools/linux/bin/sanaka-clipboard
    chmod +x sanaka-tools/linux/bin/sanaka-clipboard
    file sanaka-tools/linux/bin/sanaka-clipboard
  '

printf '%s\n' "完成: sanaka-tools/linux/bin/sanaka-clipboard"
