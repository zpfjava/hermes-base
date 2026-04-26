# OpenClaw 多智能体路由文档监控记录
# 检查时间: 2026-04-26 08:00 北京时间
# 页面URL: https://docs.openclaw.ai/zh-CN/concepts/multi-agent

## 主要章节列表

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
    - 按智能体划分的沙箱与工具配置
13. 相关

## 关键概念

- agentDir: ~/.openclaw/agents/<agentId>/
- bindings: 将渠道账号映射到智能体
- accountId: 渠道账号实例标识
- peer路由: 按发送者路由消息
- sandbox配置: 按智能体划分的沙箱隔离

## 支持的渠道

whatsapp, telegram, discord, slack, signal, imessage, irc, line, googlechat, mattermost, matrix, nextcloud-talk, bluebubbles, zalo, zalouser, nostr, feishu

## 文档哈希 (章节标题)

SHA256: 基于章节标题列表生成