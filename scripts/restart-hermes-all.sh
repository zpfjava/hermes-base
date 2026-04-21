#!/usr/bin/env bash
set -euo pipefail
units=(
  hermes-gateway-commander.service
  hermes-gateway-content.service
  hermes-gateway-data.service
  hermes-gateway-dev.service
  hermes-gateway-operations.service
  hermes-gateway-planning.service
  hermes-gateway-video.service
  hermes-gateway-wealth.service
  hermes-gateway-wechat.service
  hermes-gateway.service
)

payload=$(mktemp)
cat > "$payload" <<'EOS'
set -euo pipefail
units=(
  hermes-gateway-commander.service
  hermes-gateway-content.service
  hermes-gateway-data.service
  hermes-gateway-dev.service
  hermes-gateway-operations.service
  hermes-gateway-planning.service
  hermes-gateway-video.service
  hermes-gateway-wealth.service
  hermes-gateway-wechat.service
  hermes-gateway.service
)

systemctl --user daemon-reload
for unit in "${units[@]}"; do
  if systemctl --user list-unit-files "$unit" --no-legend 2>/dev/null | grep -q "$unit"; then
    echo "==> restarting $unit"
    systemctl --user restart "$unit"
    sleep 2
    if systemctl --user is-active "$unit" --quiet; then
      echo "    ok"
    else
      echo "    failed"
    fi
  fi
done
EOS

systemd-run --user --unit=hermes-gateway-batch-restart --collect /bin/bash "$payload" >/dev/null
rm -f "$payload"
echo "已提交后台任务：开始依次重启全部 Hermes gateway 服务"
