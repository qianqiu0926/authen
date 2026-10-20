#!/bin/zsh
set -e
cd "$(dirname "$0")/web"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if [[ ! -d node_modules ]]; then npm ci --no-audit --no-fund; fi
npm run build
../启动AI服务.command
open http://127.0.0.1:4173
