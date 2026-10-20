#!/bin/zsh
set -e
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
./启动AI服务.command
AUTHEN_SIM_ID=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next((v["udid"] for a in d["devices"].values() for v in a if v["name"]=="AUTHEN iPhone 17 Pro"), ""))')
if [[ -z "$AUTHEN_SIM_ID" ]]; then
  AUTHEN_RUNTIME=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; print(next((r["identifier"] for r in json.load(sys.stdin)["runtimes"] if r.get("isAvailable") and "iOS" in r["name"]),""))')
  if [[ -z "$AUTHEN_RUNTIME" ]]; then
    echo '请先在 Xcode 设置中安装一个 iOS 模拟器。'
    read '?按回车关闭'
    exit 1
  fi
  AUTHEN_SIM_ID=$(xcrun simctl create 'AUTHEN iPhone 17 Pro' com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro "$AUTHEN_RUNTIME")
fi
xcrun simctl boot "$AUTHEN_SIM_ID" 2>/dev/null || true
xcrun simctl bootstatus "$AUTHEN_SIM_ID" -b
xcodebuild -project iOS/AUTHEN.xcodeproj -scheme AUTHEN -configuration Debug -sdk iphonesimulator -destination "id=$AUTHEN_SIM_ID" -derivedDataPath iOS/DerivedData build
xcrun simctl install "$AUTHEN_SIM_ID" iOS/DerivedData/Build/Products/Debug-iphonesimulator/AUTHEN.app
xcrun simctl launch "$AUTHEN_SIM_ID" studio.authen.app
open -a Simulator --args -CurrentDeviceUDID "$AUTHEN_SIM_ID"
