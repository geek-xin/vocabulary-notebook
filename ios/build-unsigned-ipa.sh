#!/usr/bin/env bash
#
# 构建 **未签名** iOS ipa。
#
# 用途：仓库内不含证书与描述文件，CI（GitHub Actions macos runner）用本脚本产出
#       unsigned ipa，用户自行用 Xcode / AltStore / Sideloadly 签名后安装。
#
# 用法：
#   ./ios/build-unsigned-ipa.sh
#   MARKETING_VERSION=2026.10.01 CURRENT_PROJECT_VERSION=20261001 ./ios/build-unsigned-ipa.sh
#
# 可用环境变量覆盖：
#   MARKETING_VERSION          CFBundleShortVersionString（默认取工程里的值）
#   CURRENT_PROJECT_VERSION    CFBundleVersion（默认取工程里的值）
#   SCHEME                     默认 App
#   CONFIGURATION              默认 Release
#   DERIVED_DATA               默认 <repo>/ios/build
#   OUTPUT_DIR                 默认 <repo>/ios/output
#
# 产物：<OUTPUT_DIR>/vocabulary-notebook-<版本>-unsigned.ipa
#
# 依赖：macOS + Xcode（xcodebuild、zip、PlistBuddy）。
# **本机（无 Xcode）无法执行**，只做过 bash -n 语法检查与打包逻辑离线演练。
#
# CI 提示：本工程用 SPM（ios/App/CapApp-SPM），首次解析会联网拉取
#   capacitor-swift-pm 8.5.2，runner 需可访问 github.com。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT="${SCRIPT_DIR}/App/App.xcodeproj"
WORKSPACE="${SCRIPT_DIR}/App/App.xcworkspace"
SCHEME="${SCHEME:-App}"
CONFIGURATION="${CONFIGURATION:-Release}"
DERIVED_DATA="${DERIVED_DATA:-${SCRIPT_DIR}/build}"
OUTPUT_DIR="${OUTPUT_DIR:-${SCRIPT_DIR}/output}"
MARKETING_VERSION="${MARKETING_VERSION:-}"
CURRENT_PROJECT_VERSION="${CURRENT_PROJECT_VERSION:-}"

command -v xcodebuild >/dev/null 2>&1 || {
  echo "错误：找不到 xcodebuild。本脚本必须在装有 Xcode 的 macOS 上运行。" >&2
  exit 1
}
[ -d "$PROJECT" ] || { echo "错误：找不到工程 $PROJECT" >&2; exit 1; }

# 本工程用 SPM（CapApp-SPM），没有 App.xcworkspace。
# 若将来切成 CocoaPods 模板会多出 App.xcworkspace，这里自动优先用它。
XCODE_CONTAINER_ARGS=()
if [ -d "$WORKSPACE" ]; then
  XCODE_CONTAINER_ARGS=(-workspace "$WORKSPACE")
else
  XCODE_CONTAINER_ARGS=(-project "$PROJECT")
fi

mkdir -p "$DERIVED_DATA" "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"

# 版本号：命令行传入则覆盖工程设置（CI 用这个把 tag 版本注入 ipa）
BUILD_SETTINGS=()
if [ -n "$MARKETING_VERSION" ]; then
  BUILD_SETTINGS+=("MARKETING_VERSION=$MARKETING_VERSION")
fi
if [ -n "$CURRENT_PROJECT_VERSION" ]; then
  BUILD_SETTINGS+=("CURRENT_PROJECT_VERSION=$CURRENT_PROJECT_VERSION")
fi

echo "==> 构建 $SCHEME ($CONFIGURATION, iphoneos, 未签名)"
echo "    容器: ${XCODE_CONTAINER_ARGS[*]}"
echo "    版本: MARKETING_VERSION=${MARKETING_VERSION:-<工程默认>} CURRENT_PROJECT_VERSION=${CURRENT_PROJECT_VERSION:-<工程默认>}"

xcodebuild \
  "${XCODE_CONTAINER_ARGS[@]}" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  EXPANDED_CODE_SIGN_IDENTITY="" \
  build \
  ${BUILD_SETTINGS[@]+"${BUILD_SETTINGS[@]}"}

PRODUCTS_DIR="$DERIVED_DATA/Build/Products/$CONFIGURATION-iphoneos"
APP_PATH="$(find "$PRODUCTS_DIR" -maxdepth 1 -name '*.app' -print -quit)"
[ -n "$APP_PATH" ] || { echo "错误：在 $PRODUCTS_DIR 下没找到 .app" >&2; exit 1; }
echo "==> 已构建: $APP_PATH"

# 打包成 Payload/ 结构再 zip —— 这就是 ipa 的本质格式，不需要证书
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT
mkdir -p "$STAGE_DIR/Payload"
cp -R "$APP_PATH" "$STAGE_DIR/Payload/"

APP_NAME="$(basename "$APP_PATH")"
# 清掉可能残留的签名材料：未签名 ipa 必须干净，否则重签名工具会报错
rm -rf "$STAGE_DIR/Payload/$APP_NAME/_CodeSignature"
rm -f "$STAGE_DIR/Payload/$APP_NAME/embedded.mobileprovision"

VERSION_LABEL="${MARKETING_VERSION:-}"
if [ -z "$VERSION_LABEL" ]; then
  VERSION_LABEL="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Info.plist" 2>/dev/null || echo unknown)"
fi
IPA_PATH="$OUTPUT_DIR/vocabulary-notebook-${VERSION_LABEL}-unsigned.ipa"
rm -f "$IPA_PATH"

# zip 必须在 Payload 的父目录执行，压缩包内路径才是 Payload/App.app
( cd "$STAGE_DIR" && zip -qry "$IPA_PATH" Payload )

echo "==> 未签名 ipa: $IPA_PATH"
ls -lh "$IPA_PATH"
echo "注意：这是未签名包，无法直接安装，需自行签名（见 ios/README.md）。"
