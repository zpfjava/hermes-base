---
name: openclaw-investment-strategy-recovery
description: Recover legacy investment strategy, holdings rules, and wealth-task structure from an OpenClaw workspace, then map them into Hermes config and cron architecture.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [openclaw, hermes, investment, migration, cron, portfolio]
---

# OpenClaw Investment Strategy Recovery

Use this when the user says some version of:
- “之前在 OpenClaw 那里有一套投资策略”
- “能不能把 OpenClaw 的策略/定时任务拿过来参考”
- “旧的持仓、定投、风控、盯盘规则还在不在”

## Goal

Do not assume the old strategy is missing just because session search is sparse. Check both:
1. Hermes/session history
2. The actual OpenClaw filesystem under `~/.openclaw`

The reusable objective is to recover:
- investment rules
- holdings / buy-the-dip ladders
- ETF定投规则
- watchlists / universe definitions
- old cron/task taxonomy
- old reports that reveal preferred structure

## Recovery workflow

### 1. Search cross-session memory first
Use `session_search` with broad OR queries such as:
- `openclaw OR 投资策略 OR 理财策略 OR 持仓策略 OR ETF 定投`
- `持仓 OR ETF OR 定投 OR 风控 OR 盘前 OR 盘中 OR 盘后`

Important lesson:
- session summaries often mention migration attempts but may *not* contain the actual strategy content
- lack of session recall is **not evidence** that the OpenClaw workspace lacks data

### 2. Verify OpenClaw directories really exist
Use `terminal` to inspect likely roots:
- `/root/.openclaw`
- `/root/.config/openclaw`

List top-level children before guessing paths.

### 3. Search the workspace, not just the global root
A key finding from this case:
- generic searches under `~/.openclaw` for keywords like `投资`, `ETF`, `持仓` can return nothing useful
- the real material may live under the agent workspace, especially:
  - `~/.openclaw/workspace/wealth/`

So inspect:
- `~/.openclaw/workspace/wealth/portfolio/`
- `~/.openclaw/workspace/wealth/strategies/`
- `~/.openclaw/workspace/wealth/reports/`
- `~/.openclaw/workspace/wealth/scripts/`
- `~/.openclaw/workspace/wealth/memory/`
- `~/.openclaw/workspace/wealth/HEARTBEAT.md`

### 4. Mine session JSONL only after ranking likely files
OpenClaw may store rich sessions in:
- `~/.openclaw/agents/commander/sessions/*.jsonl`

Practical workflow that worked:
1. Use a small script to count keyword frequency across session files
2. Rank the highest-scoring files
3. Inspect only the top few

Useful keywords:
- `投资`, `理财`, `持仓`, `ETF`, `定投`, `建仓`, `加仓`, `止盈`, `止损`, `仓位`, `目标价`, `盘前`, `盘中`, `盘后`

This prevents drowning in huge session logs.

## High-value file patterns to check

In this case, the most valuable strategy files were:
- `portfolio/abu-investment-plan.md`
- `strategies/investment-rules.md`
- `strategies/risk-control.md`
- `portfolio/gege-investment-inventory.md`
- `portfolio/price-alert-strategy.md`
- `abu-holdings.md`
- `reports/投资策略全景日报_*.md`
- `reports/周一 ETF 定投检查_*.md`
- `scripts/price_monitor_feishu.py`
- `HEARTBEAT.md`

## What to extract

### A. Concrete execution rules
Prefer rules that can be migrated into Hermes config directly:
- ETF总额度
- 首档仓位
- 每跌 X% 入一档
- 每档金额 / 每档股数
- 个股加仓价位
- 已入满 / 已建仓状态
- 多档同时触发时的执行顺序
- 资金优先级（P0/P1/P2）

### B. Strategy framework
Extract durable rules such as:
- 低估区才买
- 分档建仓
- 不追高
- 短期暴涨后几年不再入
- 中药仓位上限
- 成长股长期持有逻辑
- 利用市场情绪/大跌加仓

### C. Task taxonomy
Recover old task roles, for example:
- morning-report
- daily-strategy
- etf-invest
- open-check
- intra-monitor
- close-check
- evening-report
- weekly-report

This helps map OpenClaw workflows into Hermes cron jobs.

## Migration mapping rules

### 1. Treat old prices as historical, not live truth
Do **not** copy old spot prices or PnL into production config as if current.

Migrate instead:
- target prices
n- ladder thresholds
- amounts / share counts
- role/status labels
- strategy notes

### 2. Separate durable rules from stale snapshots
Safe to migrate:
- ladder definitions
- watchlist universe
- category structure
- buy/sell/hold rules
- cron responsibility boundaries

Unsafe to migrate blindly:
- old market commentary
- old daily news focus
- historical current prices
- historical total assets / cash balances unless user reconfirms

### 3. Prefer Hermes profile data files over hard-coded scripts
If OpenClaw used hard-coded holdings in scripts (as happened here), migrate into Hermes profile data such as:
- `~/.hermes/profiles/<profile>/data/investment/portfolio.json`

Map old sources into:
- `holdings`
- `watchlist`
- `indices`
- `cash_plan`
- `risk_rules`
- `strategy_notes`

## Reporting format to the user

When you finish recovery, report in this order:
1. **结论先说** — whether a reusable old strategy was actually found
2. **找到的核心资料** — exact files and what each contains
3. **可直接迁移的内容** — rules, ladders, watchlists, cron roles
4. **不能直接照搬的内容** — stale prices, old daily reports, time-sensitive commentary
5. **下一步建议** — turn findings into Hermes config + cron migration plan

## Important experiential lessons

- A first-pass search can falsely suggest “nothing exists”
- OpenClaw wealth data may live in workspace files, not obvious cron/config files
- Old reports are useful for structure and strategy wording, even when their numbers are stale
- Old scripts often reveal data sources and legacy hard-coded assumptions
- `HEARTBEAT.md` can reveal old push cadence and trigger logic that never appears in session summaries

## Good output artifact after recovery

Produce a migration-oriented summary such as:
- recovered strategy rules
- recovered watchlist / universe
- recovered cron roles
- recommended Hermes data model changes
- recommended migration order

This turns archaeological findings into an implementation plan instead of just a pile of files.
