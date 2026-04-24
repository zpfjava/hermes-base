# Hermes 多 Profile Gateway / 定时任务速查

> 用途：给各 profile 强制执行的短版运维规则。  
> 只要任务涉及 **profile / gateway / 飞书 bot / 重启 / 日志 / cron / 定时任务归属 / 新增 agent**，必须先看这份文件，再行动。

---

## 1. 先记住 4 个核心结论

1. **当前不是单一总 gateway**，而是：
   - `default` 1 个 gateway
   - 其他 profile 各自独立 gateway service

2. **判断自己是谁，不要靠猜。**
   一律按：
   - `profile`
   - `HERMES_HOME`
   - `systemd service`
   - `FEISHU_APP_ID`
   这 4 个字段对照判断。

3. **定时任务不是每个 profile 各有一个 cron service。**
   当前任务统一存放在：
   - `/root/.hermes/cron/jobs.json`
   但每个 job 自带：
   - `profile`
   - `hermes_home`

4. **新增 profile 后，必须同步维护全量重启脚本：**
   - `/root/.local/bin/restart-hermes-all.sh`

---

## 2. Profile 对照表

| profile | HERMES_HOME | service | FEISHU_APP_ID |
|---|---|---|---|
| default | `/root/.hermes` | `hermes-gateway.service` | `cli_a96fab39a178dccb` |
| commander | `/root/.hermes/profiles/commander` | `hermes-gateway-commander.service` | `cli_a92980af81385cc4` |
| content | `/root/.hermes/profiles/content` | `hermes-gateway-content.service` | `cli_a92e3b6039789cda` |
| data | `/root/.hermes/profiles/data` | `hermes-gateway-data.service` | `cli_a92e2f5770e1dcb2` |
| dev | `/root/.hermes/profiles/dev` | `hermes-gateway-dev.service` | `cli_a9215d4804f89cca` |
| operations | `/root/.hermes/profiles/operations` | `hermes-gateway-operations.service` | `cli_a92e2e284e21dcb0` |
| planning | `/root/.hermes/profiles/planning` | `hermes-gateway-planning.service` | `cli_a92e2fb62578dcc1` |
| video | `/root/.hermes/profiles/video` | `hermes-gateway-video.service` | `cli_a947be35c1b89cee` |
| wealth | `/root/.hermes/profiles/wealth` | `hermes-gateway-wealth.service` | `cli_a95718987a5edbc9` |
| wechat | `/root/.hermes/profiles/wechat` | `hermes-gateway-wechat.service` | `cli_a92e2febcaf89ccd` |

---

## 3. 标准操作

### 查看状态

```bash
HERMES_HOME=/root/.hermes/profiles/<profile> hermes gateway status
systemctl --user status hermes-gateway-<profile>.service --no-pager
```

default 用：

```bash
HERMES_HOME=/root/.hermes hermes gateway status
systemctl --user status hermes-gateway.service --no-pager
```

### 重启单个 profile

```bash
systemctl --user restart hermes-gateway-<profile>.service
```

或：

```bash
HERMES_HOME=/root/.hermes/profiles/<profile> hermes gateway restart
```

### 看日志

```bash
journalctl --user -u hermes-gateway-<profile>.service -n 100 --no-pager
journalctl --user -u hermes-gateway-<profile>.service -f
```

### 全量重启

```bash
/root/.local/bin/restart-hermes-all.sh
```

---

## 4. 查定时任务归属

先看：

```bash
hermes cron list --all
hermes cron status
```

再查：

```bash
/root/.hermes/cron/jobs.json
```

重点字段：

- `profile`
- `hermes_home`
- `deliver`
- `schedule_display`
- `last_status`

### 当前已确认归属

- `commander`：`每日早安+AI热点`
- `dev`：`每日官方文档更新检查`
- `default`：Git 备份 / dev→master 合并 4 个任务

---

## 5. 强制规则

### 规则 1
只要任务涉及：

- profile 身份判断
- gateway 启停 / 重启 / 状态
- 飞书 bot 归属
- 日志排查
- cron / 定时任务归属
- 新增 agent / 新增 profile

**必须先阅读本文件，再执行。**

### 规则 2
不允许凭感觉说“这个 bot 应该是某某 profile”。

必须先核对：

- `HERMES_HOME`
- `service`
- `FEISHU_APP_ID`

### 规则 3
不允许把“没有独立 cron service”误判成“没有定时任务”。

### 规则 4
新增 profile 后，除了 gateway service 本身，还必须更新：

- `/root/.local/bin/restart-hermes-all.sh`

---

## 6. 出错时优先动作

### 单个 profile 出故障
按顺序：

1. 查对照表确认自己是谁
2. 查 `gateway status`
3. 查 `systemctl status`
4. 查 `journalctl`
5. 只重启自己的 service

### 怀疑定时任务归属不对
按顺序：

1. `hermes cron list --all`
2. 查 `jobs.json`
3. 看 `profile` / `hermes_home`
4. 再判断消息发送者是否异常

### 新增 profile
必须补：

1. `.env`
2. `HERMES_HOME`
3. 对应 `hermes-gateway-<profile>.service`
4. `restart-hermes-all.sh`
5. 如有 cron，确保 job 写入正确 `profile/hermes_home`
