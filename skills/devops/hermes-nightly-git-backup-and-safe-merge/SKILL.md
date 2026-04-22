---
name: hermes-nightly-git-backup-and-safe-merge
description: 在 Hermes 上为本地 Git 仓库配置 nightly 自动备份与 dev→master 安全合并 cron 流程。包含 23:00 预告、23:03 自动提交、23:05 审查/建PR、23:08 带 merge-approved 标签才执行 merge 的闭环方案。
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [Hermes, cron, git, github, pr, merge, backup]
---

# Hermes nightly Git 备份 + 安全合并流程

## 适用场景

当用户希望在 Hermes 中为某个本地仓库建立一套**分阶段 nightly 流程**：

1. 固定时间自动备份并 push
2. 自动检查 `dev -> master` 差异并建/复用 PR
3. 只有明确批准后才真正执行 merge
4. 不允许无条件硬合并，不做 destructive 操作

这套技能特别适合：
- Hermes 主配置仓库
- 需要 nightly 自动备份的个人仓库
- 想要“自动化 + 人工审批开关”的小团队/一人公司流程

---

## 标准流程设计

推荐时间：

- `23:00` 备份预告
- `23:03` 自动备份并 push
- `23:05` 审查 `dev -> master`，建/复用 PR
- `23:08` 仅在 PR 带批准标签时执行 merge

推荐批准信号：
- GitHub 上存在 `base=master`、`head=dev` 的 **open PR**
- 该 PR 带标签 **`merge-approved`**

推荐 merge 方式：
```bash
gh pr merge <PR号> --merge --delete-branch=false
```

约束：
- 不 squash
- 不 rebase
- 不删除 `dev`
- 不 `force push`
- 不 `git reset --hard`
- 不 `git clean -fd`

---

## 前置检查

在创建 cron 前先确认：

1. 本地仓库路径正确
2. `origin` 指向正确 GitHub 仓库
3. `gh` CLI 可用且已登录
4. `dev` 分支已创建并推到远端
5. Hermes cron 目标 deliver 正确
6. cron job 模型显式固定，避免默认模型漂移/不兼容

建议固定模型：
```json
{
  "provider": "dashscope",
  "model": "qwen3.5-plus"
}
```

---

## 实施步骤

### 1. 创建并推送 dev 分支

```bash
cd /path/to/repo
git checkout -b dev
git push -u origin dev
```

如果本地已存在 `dev`，先核对：
```bash
git branch --list dev
git ls-remote --heads origin
```

---

### 2. 创建 merge 审查标签

注意：某些环境里 `gh label view` 不可用，只支持：
- `gh label list`
- `gh label create`
- `gh label edit`
- `gh label delete`

因此不要假设 `gh label view` 一定存在。

推荐写法：
```bash
gh label list --repo OWNER/REPO | grep '^merge-approved\b' || \
  gh label create merge-approved \
    --repo OWNER/REPO \
    --color 0E8A16 \
    --description 'Explicitly approved for nightly dev to master merge'
```

---

### 3. 创建 23:05 审查/建 PR 任务

任务职责：
- `git fetch origin --prune`
- 检查 `origin/master..origin/dev`
- 没差异：输出固定模板“无需合并”
- 有差异：统计提交数、列文件、给风险等级
- 检查是否已有 open PR
- 没有则创建 PR；有则复用
- 绝不直接 merge

PR 标题建议固定：
```text
Daily merge: YYYY-MM-DD dev → master
```

PR 正文建议固定结构：
```md
## 每日合并预审
- 时间：YYYY-MM-DD HH:MM
- 源分支：dev
- 目标分支：master
- 提交数：N
- 风险等级：低 / 中 / 高

## 改动摘要
- 3-6 条摘要

## 最近提交
- 提交1
- 提交2
- 提交3

## 关键改动文件
- 路径1
- 路径2
- 路径3

## 风险提示
- 风险点1
- 风险点2
- 风险点3

## 合并规则
- 本 PR 由 nightly 流程创建
- 默认不自动合并
- 只有打上 `merge-approved` 标签后，23:08 的合并任务才会执行
```

群消息建议固定模板：
```text
【dev→master 每日预审】
时间：YYYY-MM-DD HH:MM
结果：已创建PR 或 已复用PR
提交数：N
风险等级：低 / 中 / 高
关键改动：
- 路径1
- 路径2
- 路径3
PR：#编号 链接
结论：本次仅创建/复用 PR，不自动合并；如确认无误，请给该 PR 打上 merge-approved 标签
```

无差异时输出：
```text
【dev→master 每日预审】
时间：YYYY-MM-DD HH:MM
结果：无需合并
提交数：0
风险等级：低
关键改动：无
PR：无
结论：本次仅检查，无需创建 PR，不自动合并
```

---

### 4. 创建 23:08 执行 merge 任务

任务职责：
1. 只检查目标仓库和固定分支
2. 查询 `base=master`、`head=dev` 的 open PR
3. 若没有 open PR：跳过
4. 若没有 `merge-approved` 标签：跳过
5. 若 PR 不可合并：跳过并报错说明
6. 若满足条件才执行：
```bash
gh pr merge <PR号> --merge --delete-branch=false
```
7. merge 后重新 `git fetch origin --prune`，确认 `origin/master` 前进

---

## 两种可复用模式

### 模式 A：安全闭环自动 merge（当前 skill 原始方案）
- `23:05` 审查/建 PR
- `23:08` 仅当 PR 带 `merge-approved` 标签时自动 merge
- 适合希望“机器闭环 + 人工审批门禁”的场景

### 模式 B：OpenClaw 模式（更保守）
这是一次真实迁移里用户最终确认要恢复的行为：
- `23:05` 自动检查差异、建/复用 PR
- `23:08` **只做提醒，不执行 merge**
- 等用户明确下指令后再人工执行：
```bash
gh pr merge <PR号> --merge
```

**关键规则：切到 OpenClaw 模式时，23:05 和 23:08 两条任务都要一起改。**
不要只改 23:08。

必须同步移除 23:05 任务中的这些内容：
- `merge-approved`
- `请给该 PR 打上 merge-approved 标签`
- `只有打上 merge-approved 标签后，23:08 的合并任务才会执行`

23:05 在 OpenClaw 模式下应改成：
- PR 正文里的“合并规则/合并说明”写成：等待阿布指令后，再执行 `gh pr merge <编号> --merge`
- 群消息结论写成：`本次仅创建/复用 PR，不自动合并；等待阿布指令后再执行 merge`

OpenClaw 模式的 23:08 任务提示词要写死：
- 只检查 open PR
- 读取 PR 编号/标题/链接/标签/mergeStateStatus
- 给出“建议合并 / 暂不建议合并”
- 明确写出：`等待阿布指令后再执行 gh pr merge <编号> --merge`
- 严禁实际执行 merge
- 严禁启用 auto-merge

推荐输出模板（接近旧 OpenClaw 风格）：
```md
## ⏰ 每日合并 dev→master 执行完成

**执行摘要**：

| 步骤 | 状态 | 结果 |
|------|------|------|
| 1️⃣ 检查 dev/master 差异 | ✅ | 已存在待处理 PR / 当前无待处理 PR |
| 2️⃣ PR 状态检查 | ✅ | PR #编号 已存在 / 无 open PR |
| 3️⃣ 合并建议 | ✅ / ⚠️ / ℹ️ | 建议合并 / 暂不建议合并 / 今晚无需处理 |
| 4️⃣ 执行合并 | ⏭️ | 等待阿布指令 / 未执行 |

**关键发现**：
- PR #编号 已存在，标题为 “PR标题”
- PR 链接：PR链接
- 标签：标签1, 标签2；若无则写“无”
- 可合并性：可合并 / 有冲突 / 待确认

**AI 建议**：✅ **建议合并** 或 ⚠️ **暂不建议合并**

**待办事项**：
- 等待阿布指令后执行 `gh pr merge 编号 --merge`
- 不自动合并
```

---

## `gh pr list` 的兼容性坑

在部分环境，`gh pr list --json` 不是所有字段组合都支持。

实际踩坑：
- 带 `baseRefOid`、`mergeableState` 等字段的组合可能直接 exit 1
- 简化字段后可正常工作

更稳妥的字段组合示例：
```bash
gh pr list \
  --repo OWNER/REPO \
  --base master \
  --head dev \
  --state open \
  --json number,title,url,labels,mergeStateStatus,state,headRefOid,headRefName,baseRefName,mergeable \
  --limit 10
```

结论：
- 查询 PR 时先用**保守字段集**
- 不要上来就堆太多 `--json` 字段

### 额外实战坑：`gh pr edit --add-label` 可能因为 token scope 不足失败
真实踩坑：
- `gh pr edit <PR号> --add-label merge-approved`
- 可能报 GraphQL scope 错误，例如缺少 `read:org`
- 即使 token 已有 `repo` scope，也不一定能通过该路径

更稳的兜底方式：直接走 GitHub REST 给 issue/PR 打标签：
```bash
gh api repos/OWNER/REPO/issues/<PR号>/labels -X POST -f labels[]='merge-approved'
```

因为 GitHub 的 PR 同时也是 issue，这个接口通常更稳。

---

## Hermes cron 的实施建议

### 创建/更新任务时
- 显式指定 `deliver`
- 显式指定模型
- 提示词里写死：
  - 仓库路径
  - 远程名
  - 源分支/目标分支
  - GitHub repo 名
  - 禁止事项

### 验证任务时
创建后不要只看创建成功，必须：
1. `cronjob(action='run', job_id=...)`
2. 执行 `cron tick`
3. 回查 `/root/.hermes/cron/jobs.json` 里的：
   - `last_run_at`
   - `last_status`
   - `last_delivery_error`
4. 再核对分支/PR现场状态

因为 Hermes 手动 run 后，可能只是“排队”，不 tick 不算真正执行。

### 做真实全流程测试时，优先使用独立 worktree
如果主工作区本身已有运行态脏文件（如 `cron/jobs.json`、memory 文件、nested repo 状态），不要直接在主工作区切分支做测试。

推荐做法：
```bash
cd /path/to/repo
git worktree add /tmp/repo-dev-test dev
cd /tmp/repo-dev-test
```

然后在 worktree 中：
1. 新增一个低风险、可追踪的测试文件
2. commit 到 `dev`
3. push 到 `origin/dev`
4. 跑 23:05 任务验证 PR 创建/复用
5. 按所选模式验证 23:08：
   - 安全闭环模式：验证审批后可 merge
   - OpenClaw 模式：验证只提醒、不自动 merge
6. 最后回查 `origin/master`、`origin/dev`、PR 状态

推荐测试文件：
- `scripts/nightly_merge_smoke_test.py`
- 内容只做 marker / 说明用途
- 不改核心配置，不动高风险路径逻辑

---

## 关于 `cron/jobs.json` 变更

Hermes cron 每次跑任务会更新 `cron/jobs.json` 的运行元数据，例如：
- `last_run_at`
- `last_status`
- `next_run_at`
- `last_delivery_error`

这属于**正常现象**，不是故障。

如果仓库在做 Git 自动备份，需要明确接受这一点，或者单独设计降噪策略。

---

## 推荐验证顺序

### 场景 A：无差异
验证目标：任务能安全跳过

检查：
```bash
git rev-list --count origin/master..origin/dev
git rev-parse origin/master
git rev-parse origin/dev
```

若提交数为 `0` 且两边 SHA 一致，则预期：
- 23:05 输出“无需合并”模板
- 23:08 输出“无 open PR，本次跳过”或等价结果

### 场景 B：有差异但未执行 merge
验证目标：能建/复用 PR，但不会自动 merge。

这里要区分两种模式：

#### B1. 安全闭环模式
步骤：
1. 在 `dev` 制造一个小提交
2. push 到 `origin/dev`
3. 手动跑 23:05
4. 确认 PR 已创建、模板正确
5. 手动跑 23:08
6. 确认因缺少 `merge-approved` 标签而跳过

#### B2. OpenClaw 模式
步骤：
1. 在 `dev` 制造一个小提交
2. push 到 `origin/dev`
3. 手动跑 23:05
4. 确认 PR 已创建或复用
5. 手动跑 23:08
6. 确认它只输出提醒/建议，不执行 merge
7. 最终核对：
   - PR 仍是 `OPEN`
   - `mergedAt = null`
   - `mergeCommit = null`
   - `origin/master` 没有自动前进
   - 测试文件只存在于 `origin/dev`，不在 `origin/master`

### 场景 C：有差异且已批准
验证目标：只在审批后执行 merge

步骤：
1. 给 open PR 打上 `merge-approved`
2. 手动跑 23:08
3. 确认 merge 成功
4. 确认 `origin/master` 前进
5. 确认 `dev` 未被删除

---

## 常见坑

### 1. 误以为“任务创建成功”就等于“任务执行成功”
错。必须 run + tick + 回查元数据。

### 2. 误把 merge 任务做成无条件自动 merge
错。必须有明确批准信号，推荐用 label 门禁。

### 3. 误用 `gh label view`
有些环境没有这个子命令，要改用 `list/create` 组合。

### 4. `gh pr list --json` 字段过多导致失败
先用保守字段集。

### 5. 忽略 deliver/model 固定
容易导致消息发错地方，或模型因默认值漂移而报错。

---

## 飞书消息呈现的实战限制

### 重要：普通飞书文本消息不会自动变成“卡片消息”
一次真实踩坑里，虽然多次调整了 cron 输出文案（V1/V2/V3），但用户在飞书里看到的仍然只是：
- 普通文本
- 蓝色链接
- GitHub 链接预览

而不是飞书 interactive card。

结论：
- **改文案 ≠ 改成飞书卡片**
- 如果 Hermes 当前发送链路只支持普通文本，那么不管文案怎么调，视觉上都还是文本块
- 用户如果明确要“飞书卡片样式”，不要继续只改提示词，要先确认 Hermes 是否真的支持 Feishu card / interactive card 发送

### 实操规则
1. 先验证当前 Hermes 是否存在飞书卡片发送能力
   - 搜索代码里是否有 Feishu/Lark interactive card 发送实现
   - 搜索是否有 `msg_type=interactive`、card schema、Feishu card sender 等逻辑
2. 如果没有卡片能力：
   - 明确告诉用户“当前发的是普通文本，不是飞书卡片”
   - 不要继续靠改文案假装能实现卡片视觉效果
3. 如果只能发文本：
   - 目标改为“更适合群聊扫读的极简文本”
   - 不要承诺“卡片格式”
4. 如果用户真正要卡片：
   - 进入代码改造路线，而不是 cron prompt 微调路线

### 手动 run 的可见性坑
手动 `cronjob run` 时，当前聊天里可能出现：
- `Cronjob Response: ...`
- `(job_id: ...)`

这类回执消息。

这不等于飞书群里最终收到的样式。
所以测试“群消息效果”时，不能只看当前聊天里的 cron 回执，必须：
1. 直接检查飞书群
2. 或直接用 `send_message` 往目标群发送同款示例
3. 区分“cron 在当前聊天的回执”与“飞书群最终展示”

## 输出口径建议

给用户汇报时要明确说清：
- 新增了哪条任务
- job_id 是什么
- 时间是什么
- 触发条件是什么
- merge 的门禁是什么
- 手动验证结果是什么
- 当前是“安全跳过”还是“已创建 PR”还是“已完成 merge”
- 当前发的是“普通飞书文本”还是“真正飞书卡片”

避免只说“已经好了”。必须把闭环状态讲清楚。
