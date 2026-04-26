---
name: moment-cron
description: 朋友圈每日自动配图+文案生成与发送流程。已从 OpenClaw 迁移至 content profile。
trigger: 当需要排查、修复或手动触发朋友圈配图定时任务时
---

## 朋友圈配图定时任务

### 路径与位置
- 脚本目录: `/root/.hermes/profiles/content/scripts/moment-cron/`
- 主入口: `script.js`（文案+配图+发送全流程）
- AI文案: `ai-copywriter.js`（5种视觉风格：治愈/共鸣/态度/悬念/美感）
- 状态文件: `moment-state.json`, `send-history.json`, `used-scenes.json`

### 定时任务配置
```bash
# crontab -l 查看
0 9 * * * cd /root/.hermes/profiles/content/scripts/moment-cron && node script.js
```

### 手动补发
```bash
cd /root/.hermes/profiles/content/scripts/moment-cron && node script.js
```

### 已知 Bug（已修复）
- `ai-copywriter.js` 曾漏了 `require('path')`，导致配图生成报错 `path is not defined`
- 修复方式：在文件头部添加 `const path = require('path');`
- 排查方法：看日志里 `[IMAGE]` 阶段是否出现 `path is not defined`

### 5种视觉风格
治愈 / 共鸣 / 态度 / 悬念 / 美感 — 每次随机抽取一种风格生成配图提示词

### 迁移历史
- 原位置: `/root/.openclaw/workspace/shared/tasks/moment-cron/`
- 迁移时间: 2026-04-25
- 迁移原因: 统一归到 content profile 下管理
