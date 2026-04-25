# OpenClaw 多智能体路由文档 - 基准版本
# 抓取时间: 2026-04-25 北京时间 08:00

## 页面章节结构

1. 什么是"一个智能体"？
2. 路径（快速映射）
3. 单智能体模式（默认）
4. 智能体辅助工具
5. 快速开始
6. 多个智能体 = 多个人，多种人格
7. 跨智能体 QMD 记忆搜索
8. 一个 WhatsApp 号码，多个人（私信拆分）
9. 路由规则（消息如何选择智能体）
10. 多个账号 / 电话号码
11. 概念
12. 平台示例
    - 每个智能体一个 Discord bot
    - 每个智能体一个 Telegram bot
    - 每个智能体一个 WhatsApp 号码
    - 示例：WhatsApp 日常聊天 + Telegram 深度工作
    - 示例：同一渠道，将一个 peer 路由到 Opus
    - 绑定到 WhatsApp 群组的家庭智能体
13. 按智能体划分的沙箱与工具配置
14. 相关

## 关键内容摘要

### 智能体定义
- 工作区（文件、AGENTS.md/SOUL.md/USER.md、本地笔记、人设规则）
- 状态目录（agentDir），用于存放凭证配置、模型注册表和按智能体划分的配置
- 会话存储（聊天历史 + 路由状态），位于 ~/.openclaw/agents/<agentId>/sessions

### 路由规则优先级
1. peer 匹配（精确的私信 / 群组 / 渠道 id）
2. parentPeer 匹配（线程继承）
3. guildId + roles（Discord 角色路由）
4. guildId（Discord）
5. teamId（Slack）
6. 某个渠道的 accountId 匹配
7. 渠道级匹配（accountId: "*"）
8. 回退到默认智能体

### 支持多账号的渠道
whatsapp、telegram、discord、slack、signal、imessage
irc、line、googlechat、mattermost、matrix、nextcloud-talk
bluebubbles、zalo、zalouser、nostr、feishu

### 工具配置
- tools.allow: 允许的工具列表
- tools.deny: 拒绝的工具列表
- sandbox.mode: 沙箱模式（off/all）
- sandbox.scope: 沙箱作用域（agent/shared）

## 文档哈希（用于快速比较）
内容长度: 约 12000 字符
主要代码块数量: 8 个配置示例