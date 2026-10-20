#!/bin/zsh
set -e
cd "$(dirname "$0")/web"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if curl -fsS http://127.0.0.1:4173/api/health 2>/dev/null | python3 -c 'import sys,json; sys.exit(0 if json.load(sys.stdin).get("analysis")=="deepseek-with-explicit-local-fallback" else 1)' 2>/dev/null; then
  echo 'AUTHEN AI服务已启动。'
  exit 0
fi
if lsof -nP -iTCP:4173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo '4173端口已被旧服务或其他程序使用，请关闭该服务后重新启动。'
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci --no-audit --no-fund; fi
mkdir -p "$HOME/Library/Logs"
nohup node server.mjs > "$HOME/Library/Logs/AUTHEN-service.log" 2>&1 &
for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:4173/api/health >/dev/null 2>&1; then
    echo 'AUTHEN AI服务已启动，仅限本机访问。'
    exit 0
  fi
  sleep 0.25
done
echo '服务未能启动，请查看本机AUTHEN-service.log。'
exit 1
