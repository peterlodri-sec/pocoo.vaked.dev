#!/usr/bin/env bash
# monitor-vaked.sh — watch the VAKED token's mining state on Polygon mainnet.
#
# Polls epochCount() and miningTarget(); alerts when the target changes — i.e.
# when the first difficulty adjustment fires at mint #1024, proving the cold-
# start deadlock fix holds in production.
#
# Usage:
#   ./monitor-vaked.sh                 # poll every 5 minutes (default)
#   INTERVAL=30 ./monitor-vaked.sh     # poll every 30 seconds
#   RPC_URL=https://... ./monitor-vaked.sh   # override RPC
#
# Deps: Foundry's `cast` on PATH (installed at ~/.foundry/bin).

set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"
CONTRACT=0x2Ae7DA713A2c8527AF70825C0F79632AF2e2ae4A
RPC_URL="${RPC_URL:-https://polygon.drpc.org}"
INTERVAL="${INTERVAL:-300}"

call() { cast call "$CONTRACT" "$1" --rpc-url "$RPC_URL" 2>/dev/null || echo "?"; }

prev_target="$(call 'miningTarget()(uint256)')"
echo "[$(date -u +%FT%TZ)] start — epoch $(call 'epochCount()(uint256)'), supply $(call 'totalSupply()(uint256)'), target $prev_target"

while true; do
  epoch="$(call 'epochCount()(uint256)')"
  target="$(call 'miningTarget()(uint256)')"
  if [ "$target" != "$prev_target" ]; then
    echo "[$(date -u +%FT%TZ)] DIFFICULTY ADJUSTED — epoch $epoch, target $prev_target → $target"
    prev_target="$target"
  else
    echo "[$(date -u +%FT%TZ)] epoch $epoch, target $target (unchanged)"
  fi
  sleep "$INTERVAL"
done
