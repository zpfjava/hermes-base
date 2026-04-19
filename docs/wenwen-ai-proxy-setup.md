# Wenwen AI 代理配置指南

本文档说明如何通过 `breakout.wenwen-ai.com` 代理使用 Claude Sonnet 4.6 模型。

## 适用场景

- 使用 Wenwen AI 提供的 Claude API 代理服务
- 通过飞书、Telegram 等平台调用 Claude
- 需要在 config.yaml 和 .env 中同时配置

## 配置步骤

### 1. config.yaml

```yaml
model:
  default: claude-sonnet-4-6
  provider: anthropic                          # 必须为 anthropic，不能为 custom
  base_url: https://breakout.wenwen-ai.com/
  api_key: <your-wenwen-ai-api-key>           # 从 wenwen-ai.com 获取

anthropic:
  api_key: <same-as-above>
  base_url: https://breakout.wenwen-ai.com
  name: claude-sonnet-4-6

custom_providers:
  - name: Breakout.wenwen-ai.com
    base_url: https://breakout.wenwen-ai.com/
    api_key: <same-as-above>
    model: claude-sonnet-4-6
```

### 2. .env 文件

```env
ANTHROPIC_API_KEY=<your-wenwen-ai-api-key>
ANTHROPIC_BASE_URL=https://breakout.wenwen-ai.com
ANTHROPIC_MODEL=claude-sonnet-4-6
```

## 关键注意事项

### 为什么 `provider` 必须是 `anthropic`

| provider 值 | 使用的 API 格式 | Wenwen AI 代理是否支持 |
|------------|----------------|----------------------|
| `custom` | OpenAI `chat/completions` | ❌ 返回空响应 |
| `anthropic` | Anthropic `v1/messages` | ✅ 正常工作 |

hermes 在 `provider: custom` 时默认使用 `chat/completions` 格式，但 Wenwen AI 代理只支持 `anthropic_messages` 格式，导致返回空响应。

### API Key 不要重复拼接

旧版配置中 `api_key` 可能被错误拼接为 `sk-xxxsk-xxx`，这会导致认证失败。确保每个 key 只出现一次。

### .env 优先级高于 config.yaml

hermes 会优先读取 `.env` 中的以下变量：

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`

如果 key 只写在 config.yaml 里但 .env 中有旧值，仍会使用旧值。因此两处需保持同步。

## 验证配置

重启 hermes 后，在聊天窗口发送一条消息，观察日志：

```bash
tail -f /root/.hermes/logs/agent.log
```

正常情况下，日志中应显示：

```
INFO agent.auxiliary_client: Vision auto-detect: using main provider anthropic (claude-sonnet-4-6)
```

如果仍然返回空响应，检查 `.env` 中 `ANTHROPIC_API_KEY` 是否为当前有效的 key。

## 获取 API Key

访问 [wenwen-ai.com](https://breakout.wenwen-ai.com) 获取新的 API key。

## 重启 hermes

```bash
# 找到进程
ps aux | grep hermes_cli.main | grep -v grep

# 杀掉并重启
kill <PID>
/root/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main gateway run --replace
```

如果通过 systemd 管理，则：

```bash
systemctl restart hermes
```
