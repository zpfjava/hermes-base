# Hermes Profile Gateway 与定时任务运维手册

> 适用对象：需要维护或接管 Hermes 多 profile 环境的 agent / 运维人员 / 记录者  
> 当前环境基线：`/root/.hermes` 多 profile 架构，gateway 由 systemd user service 托管，定时任务集中存储于全局 `jobs.json`

---

## 1. 这份文档解决什么问题

这份文档主要解决 5 个常见问题：

1. 我不知道自己对应哪个 gateway
2. 我不知道该重启哪个服务
3. 我不知道自己的飞书 bot 是哪个
4. 我不知道定时任务是不是归自己
5. 我不知道新增一个 profile 后要补哪些地方

结论先说：

- **当前环境不是单一总 gateway**，而是 **default + 各 profile 独立 gateway service**
- **每个 profile 的飞书应用（`FEISHU_APP_ID`）是分开的**
- **定时任务配置集中在全局 `~/.hermes/cron/jobs.json`**，但 **每个 job 会绑定 `profile` 和 `hermes_home`**，执行时按归属 profile 跑
- **当前已有全量重启脚本**，但它是**写死服务名单**的，新增 profile 后必须同步维护

---

## 2. 当前架构总览

### 2.1 Gateway 架构

当前采用的是：

- 1 个 default gateway
- 9 个 profile 独立 gateway
- 全部由 `systemd --user` 托管

也就是：

- `default` 用 `hermes-gateway.service`
- 其他 profile 各自用 `hermes-gateway-<profile>.service`

### 2.2 定时任务架构

当前**没有独立的 `hermes-cron*.service`**。

定时任务的真实机制是：

- 任务定义统一存储在：`/root/.hermes/cron/jobs.json`
- 每个任务项里带：
  - `profile`
  - `hermes_home`
  - `deliver`
- 调度时会按 job 绑定的 `hermes_home` 切到对应 profile 上下文执行

所以不要误判：

> **没有 profile 级 cron service，不代表该 profile 没有定时任务。**

---

## 3. Profile ↔ Gateway ↔ 飞书应用 对照表

这是最重要的一张表。任何 profile 想确认“我是谁、我的 gateway 是哪个、我该重启谁”，先看这里。

| profile | HERMES_HOME | systemd service | FEISHU_APP_ID | FEISHU_HOME_CHANNEL |
|---|---|---|---|---|
| default | `/root/.hermes` | `hermes-gateway.service` | `cli_a96fab39a178dccb` | 未显式配置 |
| commander | `/root/.hermes/profiles/commander` | `hermes-gateway-commander.service` | `cli_a92980af81385cc4` | `oc_f0d7f9a753c626ad3562846e0584cf69` |
| content | `/root/.hermes/profiles/content` | `hermes-gateway-content.service` | `cli_a92e3b6039789cda` | `oc_f0d7f9a753c626ad3562846e0584cf69` |
| data | `/root/.hermes/profiles/data` | `hermes-gateway-data.service` | `cli_a92e2f5770e1dcb2` | `oc_f0d7f9a753c626ad3562846e0584cf69` |
| dev | `/root/.hermes/profiles/dev` | `hermes-gateway-dev.service` | `cli_a9215d4804f89cca` | `oc_f0d7f9a753c626ad3562846e0584cf69` |
| operations | `/root/.hermes/profiles/operations` | `hermes-gateway-operations.service` | `cli_a92e2e284e21dcb0` | `oc_f0d7f9a753c626ad3562846e0584cf69` |
| planning | `/root/.hermes/profiles/planning` | `hermes-gateway-planning.service` | `cli_a92e2fb62578dcc1` | `oc_f0d7f9a753c626ad3562846e0584cf69` |
| video | `/root/.hermes/profiles/video` | `hermes-gateway-video.service` | `cli_a947be35c1b89cee` | `oc_f0d7f9a753c626ad3562846e0584cf69` |
| wealth | `/root/.hermes/profiles/wealth` | `hermes-gateway-wealth.service` | `cli_a95718987a5edbc9` | `oc_f0d7f9a753c626ad3562846e0584cf69` |
| wechat | `/root/.hermes/profiles/wechat` | `hermes-gateway-wechat.service` | `cli_a92e2febcaf89ccd` | `oc_f0d7f9a753c626ad3562846e0584cf69` |

### 3.1 如何理解这张表

- **profile 名**：逻辑身份
- **HERMES_HOME**：该 profile 的配置、会话、memory、env 所在目录
- **systemd service**：实际要启停/重启/查日志的服务名
- **FEISHU_APP_ID**：该 profile 实际对应的飞书应用身份
- **FEISHU_HOME_CHANNEL**：未显式指定目标时的默认 Feishu 回退目标

### 3.2 最重要的判断原则

如果你不知道某条消息、某个 bot、某个 gateway 到底归谁：

**不要靠感觉猜。**

按这个顺序判断：

1. 先看自己属于哪个 `profile`
2. 再看该 profile 的 `HERMES_HOME`
3. 再看该 profile 对应的 `systemd service`
4. 再看该 profile 的 `FEISHU_APP_ID`

---

## 4. Gateway 标准操作手册


### 4.1 查看 profile 列表

```bash
hermes profile list
```

### 4.2 查看某个 profile 的 gateway 状态

#### default

```bash
HERMES_HOME=/root/.hermes hermes gateway status
systemctl --user status hermes-gateway.service --no-pager
```

#### 非 default profile

```bash
HERMES_HOME=/root/.hermes/profiles/<profile> hermes gateway status
systemctl --user status hermes-gateway-<profile>.service --no-pager
```

例如查看 dev：

```bash
HERMES_HOME=/root/.hermes/profiles/dev hermes gateway status
systemctl --user status hermes-gateway-dev.service --no-pager
```

### 4.3 启动 gateway

#### default

```bash
systemctl --user start hermes-gateway.service
```

#### 非 default profile

```bash
systemctl --user start hermes-gateway-<profile>.service
```

例如：

```bash
systemctl --user start hermes-gateway-content.service
```

### 4.4 停止 gateway

#### default

```bash
systemctl --user stop hermes-gateway.service
```

#### 非 default profile

```bash
systemctl --user stop hermes-gateway-<profile>.service
```

### 4.5 重启 gateway

#### 推荐方式：直接重启 systemd service

#### default

```bash
systemctl --user restart hermes-gateway.service
```

#### 非 default profile

```bash
systemctl --user restart hermes-gateway-<profile>.service
```

例如：

```bash
systemctl --user restart hermes-gateway-wealth.service
```

#### 另一种方式：通过 Hermes 命令重启

```bash
HERMES_HOME=/root/.hermes/profiles/<profile> hermes gateway restart
```

例如：

```bash
HERMES_HOME=/root/.hermes/profiles/commander hermes gateway restart
```

### 4.6 重启时最容易犯的错

> **`hermes gateway restart` 必须在正确的 `HERMES_HOME` 下执行。**

如果你在错误的 `HERMES_HOME` 下执行，就可能：

- 重启错 profile
- 误以为已经生效，实际没动到目标 gateway
- 排障方向直接跑偏

所以最稳的原则是：

- **你知道 service 名，就直接 `systemctl --user restart <service>`**
- **你想用 Hermes 命令，就必须明确带 `HERMES_HOME=`**

---

## 5. 查看日志

### 5.1 看最近 100 行

#### default

```bash
journalctl --user -u hermes-gateway.service -n 100 --no-pager
```

#### 非 default profile

```bash
journalctl --user -u hermes-gateway-<profile>.service -n 100 --no-pager
```

例如：

```bash
journalctl --user -u hermes-gateway-dev.service -n 100 --no-pager
```

### 5.2 实时追日志

```bash
journalctl --user -u hermes-gateway-<profile>.service -f
```

例如：

```bash
journalctl --user -u hermes-gateway-content.service -f
```

### 5.3 日志里常见的有用判断

#### 看到 reconnect / disconnected
通常表示连接抖动，不一定是永久故障。

#### 看到 `Unauthorized user`
通常表示该用户还没在该 profile 下完成 approve / 授权。

#### 看到发送响应、收到 inbound message、response ready
说明该 gateway 正常在处理消息。

---

## 6. 全量重启方式

当前已有一键全量重启脚本：

```bash
/root/.local/bin/restart-hermes-all.sh
```

当前脚本会逐个重启以下 service：

- `hermes-gateway.service`
- `hermes-gateway-commander.service`
- `hermes-gateway-content.service`
- `hermes-gateway-data.service`
- `hermes-gateway-dev.service`
- `hermes-gateway-operations.service`
- `hermes-gateway-planning.service`
- `hermes-gateway-video.service`
- `hermes-gateway-wealth.service`
- `hermes-gateway-wechat.service`

### 6.1 适用场景

- 公共代码升级后，需要统一重启
- 大范围配置更新后，需要统一生效
- 需要确认所有 gateway 都被拉起

### 6.2 风险提示

这是**全量操作**，会影响所有 profile。

不要在下列场景随便用：

- 只是单个 profile 出故障
- 当前有敏感对话链路正在执行
- 你只想验证某一个 bot

### 6.3 重要维护要求

当前这个脚本是**写死 service 名单**的，不是自动发现。

因此：

> **每次新增 profile 后，必须同步更新 `/root/.local/bin/restart-hermes-all.sh`。**

否则新 profile 不会被全量脚本覆盖。

---

## 7. 当前定时任务机制

### 7.1 任务定义存放位置

```bash
/root/.hermes/cron/jobs.json
```

### 7.2 机制说明

当前定时任务不是“每个 profile 各有一套独立 cron service”。

真实机制是：

- 所有 job 统一保存在全局 `jobs.json`
- 每个 job 记录自己的：
  - `profile`
  - `hermes_home`
  - `deliver`
- scheduler 执行 job 时，会根据 `hermes_home` 使用对应 profile 上下文

所以：

- job 文件是全局的
- job 身份归属是 profile 级的

### 7.3 当前已确认的 job 归属

#### commander：1 个

- `每日早安+AI热点`

#### dev：1 个

- `每日官方文档更新检查`

#### default：4 个

- `Hermes Git 备份 - 阶段1: 审查预告`
- `Hermes Git 备份 - 阶段2: 自动提交`
- `每日合并 dev → master`
- `每日执行 dev → master 合并`

### 7.4 当前环境的重要判断

如果某条定时消息是某个 profile 发出来的，不要先怀疑 persona 漂移。

先查：

1. 该 job 的 `profile`
2. 该 job 的 `hermes_home`
3. 该 job 的 `deliver`

只要 job 明确绑定了目标 profile，那么**对应 profile 发出定时消息通常是正常设计，不是异常。**

---

## 8. 如何查看定时任务

### 8.1 查看全部任务

```bash
hermes cron list --all
```

### 8.2 查看调度器状态

```bash
hermes cron status
```

### 8.3 查看原始 jobs.json

```bash
python -m json.tool /root/.hermes/cron/jobs.json
```

或者直接打开文件。

### 8.4 排查某个任务是否归自己

重点看这些字段：

- `id`
- `name`
- `profile`
- `hermes_home`
- `deliver`
- `schedule_display`
- `enabled`
- `state`
- `last_status`
- `last_error`
- `last_delivery_error`

其中最关键的是：

- `profile`
- `hermes_home`
- `deliver`

---

## 9. 常见误区

### 误区 1：所有 profile 共享一个 gateway
不对。

当前环境是：

- default 1 个 gateway
- 各 profile 各自 1 个 gateway service

### 误区 2：没有 `hermes-cron-xxx.service` 就说明该 profile 没定时任务
不对。

当前定时任务是：

- 配置全局存储
- 执行按 job 归属 profile 切上下文

### 误区 3：看到同一个 Feishu 群，就说明所有 bot 是同一个
不对。

多个 profile 当前虽然大多共用同一个 `FEISHU_HOME_CHANNEL`，但：

- 它们的 `FEISHU_APP_ID` 是不同的
- 它们的 gateway service 也是不同的
- 它们仍然是独立 bot 身份

### 误区 4：直接跑 `hermes gateway restart` 一定是对的
不对。

如果当前 `HERMES_HOME` 不对，你可能重启的是别的 profile。

### 误区 5：新增 profile 后，全量重启脚本会自动带上
不对。

当前 `/root/.local/bin/restart-hermes-all.sh` 是写死名单，需要手动加。

---

## 10. 常见故障判断手册

### 10.1 我不知道自己到底对应哪个 gateway
处理顺序：

1. 先确认自己的 profile 名
2. 在本手册第 3 章对照 `HERMES_HOME`
3. 对照 `systemd service`
4. 对照 `FEISHU_APP_ID`

### 10.2 我重启了，但消息还是没反应
优先检查：

1. 你重启的是不是正确的 service
2. `HERMES_HOME` 是不是正确
3. `journalctl` 里是否出现新的启动日志
4. 是否出现 `Unauthorized user`
5. 是否有连接成功 / 收到消息 / 发送回复日志

### 10.3 我怀疑定时任务不是我发的
不要先猜 persona 问题，先查：

1. `hermes cron list --all`
2. `/root/.hermes/cron/jobs.json`
3. 任务的 `profile`
4. 任务的 `hermes_home`
5. 任务的 `deliver`

### 10.4 单个 profile 故障，应该怎么做
优先做最小化处理：

1. 查该 profile status
2. 查该 profile 日志
3. 只重启该 profile 对应 service
4. 不要先做全量重启

### 10.5 全部 profile 都需要刷新，应该怎么做
可以使用：

```bash
/root/.local/bin/restart-hermes-all.sh
```

但要明确这是全量操作。

---

## 11. 新增 Profile 接入清单（必须执行）

新增一个 profile 时，至少做以下 7 件事：

### 11.1 创建 profile 目录
例如：

```bash
/root/.hermes/profiles/<profile>
```

### 11.2 配置该 profile 的 `.env`
至少确认：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_VERIFICATION_TOKEN`
- 如需要：`FEISHU_HOME_CHANNEL`
- 如需要：其他 provider 凭据

### 11.3 确认 `HERMES_HOME`
新增 profile 的所有运维命令都要基于：

```bash
HERMES_HOME=/root/.hermes/profiles/<profile>
```

### 11.4 安装并启用对应 gateway service
目标形态应为：

```bash
hermes-gateway-<profile>.service
```

并由 `systemd --user` 管理。

### 11.5 验证 gateway 状态

```bash
HERMES_HOME=/root/.hermes/profiles/<profile> hermes gateway status
systemctl --user status hermes-gateway-<profile>.service --no-pager
```

### 11.6 如需定时任务，确认 job 归属
新增定时任务时，必须确认 job 里正确写入：

- `profile=<profile>`
- `hermes_home=/root/.hermes/profiles/<profile>`

否则任务可能跑到默认上下文。

### 11.7 更新全量重启脚本
把新 service 加到：

```bash
/root/.local/bin/restart-hermes-all.sh
```

否则以后全量重启时会漏掉它。

---

## 12. 推荐的日常操作准则

### 12.1 单个 profile 出问题
只动单个 profile：

- 查 status
- 查 journal
- 重启该 profile service

### 12.2 不确定自己是谁
先查第 3 章对照表，不要盲重启。

### 12.3 查定时任务
先看 `jobs.json` 的 `profile/hermes_home`，不要先猜消息发送者。

### 12.4 做全量操作前
确认：

- 是否真的需要全体刷新
- 是否会打断当前关键链路
- 是否新 profile 已补入全量脚本

---

## 13. 当前环境的特别注意事项

### 13.1 多个 gateway status 提示 unit 定义过期
当前环境里多条 `hermes gateway status` 都提示：

```text
Installed gateway service definition is outdated
Run: hermes gateway restart
```

这表示：

- systemd unit 定义与当前 Hermes 预期可能不完全一致
- 如需刷新 unit，可对目标 profile 执行一次：

```bash
HERMES_HOME=/root/.hermes/profiles/<profile> hermes gateway restart
```

或直接重启对应 service 并复核状态。

### 13.2 多数 profile 当前共用同一个 FEISHU_HOME_CHANNEL
这不代表它们是同一个 bot。

是否是同一个 bot，要看：

- `FEISHU_APP_ID`
- `HERMES_HOME`
- `systemd service`

而不是只看 home channel。

---

## 14. 快速结论模板

给任何 profile 的最短说明可以直接用下面这段：

> 你先确认自己的 profile 名，再去看这张对照表：profile → HERMES_HOME → systemd service → FEISHU_APP_ID。  
> 你要查状态，就用 `HERMES_HOME=... hermes gateway status` 或 `systemctl --user status ...`。  
> 你要重启，就重启自己的 `hermes-gateway-<profile>.service`。  
> 你要查定时任务，不要找独立 cron service，直接看 `/root/.hermes/cron/jobs.json` 里的 `profile` 和 `hermes_home`。  
> 新增 profile 后，别忘了更新 `/root/.local/bin/restart-hermes-all.sh`。

---

## 15. 附：当前环境已确认事实清单

### 已确认的 profile

- default
- commander
- content
- data
- dev
- operations
- planning
- video
- wealth
- wechat

### 已确认的 gateway services

- `hermes-gateway.service`
- `hermes-gateway-commander.service`
- `hermes-gateway-content.service`
- `hermes-gateway-data.service`
- `hermes-gateway-dev.service`
- `hermes-gateway-operations.service`
- `hermes-gateway-planning.service`
- `hermes-gateway-video.service`
- `hermes-gateway-wealth.service`
- `hermes-gateway-wechat.service`

### 已确认的定时任务归属统计

- `commander`：1 个
- `dev`：1 个
- `default`：4 个

### 已确认的全量重启脚本

- `/root/.local/bin/restart-hermes-all.sh`

---

如果未来环境发生变化，请优先更新以下内容：

1. 第 3 章 profile 对照表
2. 第 7 章当前定时任务归属
3. 第 6 章全量重启脚本覆盖列表
4. 第 11 章新增 profile 接入清单
