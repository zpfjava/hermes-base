---
name: hermes-profile-gateway-cron-ops
description: Hermes 多 profile 环境下，识别 gateway 归属、重启正确 service、核对飞书 bot 身份、审计 cron 任务归属的标准运维流程。
---

# Hermes Profile Gateway / Cron 运维速查

## 触发场景
只要任务涉及以下任一主题，必须优先使用本 skill：
- profile 身份判断
- gateway 启停 / 重启 / 状态 / 日志
- 飞书 bot 属于哪个 profile
- cron / 定时任务归属
- 新增 profile / 新增 agent

## 强制步骤
1. 先看文档：`/root/.hermes/docs/profile-gateway-cron-quickref.md`
2. 再按 `profile -> HERMES_HOME -> service -> FEISHU_APP_ID` 判断归属
3. 只对目标 profile 的 service 做操作，避免误重启
4. 查询 cron 时，一律先看 `/root/.hermes/cron/jobs.json` 的 `profile/hermes_home`
5. 新增 profile 后，必须同步维护 `/root/.local/bin/restart-hermes-all.sh`

## 当前 profile 对照表
- default -> `/root/.hermes` -> `hermes-gateway.service` -> `cli_a96fab39a178dccb`
- commander -> `/root/.hermes/profiles/commander` -> `hermes-gateway-commander.service` -> `cli_a92980af81385cc4`
- content -> `/root/.hermes/profiles/content` -> `hermes-gateway-content.service` -> `cli_a92e3b6039789cda`
- data -> `/root/.hermes/profiles/data` -> `hermes-gateway-data.service` -> `cli_a92e2f5770e1dcb2`
- dev -> `/root/.hermes/profiles/dev` -> `hermes-gateway-dev.service` -> `cli_a9215d4804f89cca`
- operations -> `/root/.hermes/profiles/operations` -> `hermes-gateway-operations.service` -> `cli_a92e2e284e21dcb0`
- planning -> `/root/.hermes/profiles/planning` -> `hermes-gateway-planning.service` -> `cli_a92e2fb62578dcc1`
- video -> `/root/.hermes/profiles/video` -> `hermes-gateway-video.service` -> `cli_a947be35c1b89cee`
- wealth -> `/root/.hermes/profiles/wealth` -> `hermes-gateway-wealth.service` -> `cli_a95718987a5edbc9`
- wechat -> `/root/.hermes/profiles/wechat` -> `hermes-gateway-wechat.service` -> `cli_a92e2febcaf89ccd`

## 标准命令
查看状态：
```bash
HERMES_HOME=/root/.hermes/profiles/<profile> hermes gateway status
systemctl --user status hermes-gateway-<profile>.service --no-pager
```

重启：
```bash
systemctl --user restart hermes-gateway-<profile>.service
```

日志：
```bash
journalctl --user -u hermes-gateway-<profile>.service -n 100 --no-pager
journalctl --user -u hermes-gateway-<profile>.service -f
```

cron：
```bash
hermes cron list --all
hermes cron status
```

## 误区
- 不能把“共用一个群”理解成“共用一个 bot”
- 不能把“没有独立 cron service”理解成“没有定时任务”
- 不能在错误的 `HERMES_HOME` 下执行 `hermes gateway restart`
