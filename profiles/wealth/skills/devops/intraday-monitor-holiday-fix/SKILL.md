---
name: intraday-monitor-holiday-fix
description: "Fix for intraday monitoring cron job firing during Chinese market holidays (e.g. Labor Day). Root cause: cron only filters weekdays, doesn't recognize exchange holidays. Fix adds Chinese trading calendar detection to the context generation script."
version: 1.0.0
author: 格格理财官
metadata:
  hermes:
    tags: [hermes, cron, feishu, investment, holiday, trading-calendar]
---

# 盘中监控节假日误触发修复

## 问题
cron 表达式 `*/15 9-11,13-15 * * 1-5` 在节假日（如劳动节）仍会触发，因为只过滤工作日不识别中国节假日。prompt 内的时间窗口判断（09:30-11:30, 13:00-15:00）也不检测交易日。

## 涉及文件
- cron job: `d0132c7861d9` (盘中实时监控)
- 脚本: `/root/.hermes/profiles/wealth/scripts/intraday_monitor_context.py`
- 核心模块: `cron/investment_monitor.py` (若有)
- 持仓配置: `/root/.hermes/profiles/wealth/data/investment/portfolio.json`

## 诊断步骤
1. `hermes cron list --profile wealth` 确认 job
2. `hermes cron history --job-id d0132c7861d9` 看触发记录
3. 检查脚本和 generate_monitor_context / build_monitor_context 逻辑

## 修复方案（Plan B）
在 context 生成函数开头加交易日检测，非交易日直接返回空/SILENT：

```python
from datetime import date
import chinese_calendar as cc

def is_trading_day(d: date) -> bool:
    """中国A股交易日判断：工作日且非节假日"""
    return cc.is_workday(d) and not cc.is_holiday(d)

def generate_monitor_context(...):
    if not is_trading_day(date.today()):
        return {"type": "silent"}  # 或 "[SILENT]"
    # ... 正常逻辑
```

依赖：`pip install chinese-calendar`

## 注意事项
- 修改后需测试（mock 节假日日期验证静默）
- 400 错误可能来自飞书卡片 JSON 格式问题或脚本语法错误，需具体排查
- 任务当前状态：**已暂停** (d0132c7861d9 paused)，节后需恢复
- 若用 build_monitor_context 而非 generate_monitor_context，检查 scheduler.py 中的 card builder 是否也有非交易日判断
