#!/usr/bin/env bash
#
# 把仓库根的 index.html 复制进 HarmonyOS 工程的 rawfile 目录。
#
#   harmony/entry/src/main/resources/rawfile/index.html 是【派生产物，勿手改】。
#   唯一事实来源永远是仓库根的 index.html；改这里的内容会在下一次同步时被覆盖。
#
# 用法（在仓库任意位置执行都可以）：
#   ./harmony/scripts/sync-rawfile.sh
#
set -euo pipefail

# 脚本自身所在目录 -> harmony/scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARMONY_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$HARMONY_DIR")"

SRC="$REPO_ROOT/index.html"
DEST_DIR="$HARMONY_DIR/entry/src/main/resources/rawfile"
DEST="$DEST_DIR/index.html"

if [ ! -f "$SRC" ]; then
  echo "::error::找不到应用本体 $SRC" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"

echo "已同步 $SRC -> $DEST"
echo "（该文件是派生产物，由 harmony/scripts/sync-rawfile.sh 生成，请勿手改）"
echo "大小：$(wc -c < "$DEST") 字节"
