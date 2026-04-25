# OpenClaw 投资策略迁移整理

**整理时间**: 2026-04-23 00:40 CST  
**整理目标**: 将 OpenClaw 中已验证的投资规则、观察池、任务结构迁入 Hermes 当前投资任务体系。  

---

## 一、已确认迁移来源

### 核心策略文件
- `/root/.openclaw/workspace/wealth/portfolio/abu-investment-plan.md`
- `/root/.openclaw/workspace/wealth/strategies/investment-rules.md`
- `/root/.openclaw/workspace/wealth/strategies/risk-control.md`
- `/root/.openclaw/workspace/wealth/portfolio/gege-investment-inventory.md`
- `/root/.openclaw/workspace/wealth/portfolio/price-alert-strategy.md`
- `/root/.openclaw/workspace/wealth/HEARTBEAT.md`

### 旧实现参考
- `/root/.openclaw/workspace/wealth/scripts/price_monitor_feishu.py`

---

## 二、已迁入 Hermes 的文件

### 1. 持仓配置主文件
- `/root/.hermes/profiles/wealth/data/investment/portfolio.json`
- 用途：盘中监控正式任务读取的主配置
- 当前状态：保持现有 6 个真实持仓，不破坏正式任务稳定性

### 2. 观察池配置
- `/root/.hermes/profiles/wealth/data/investment/watchlist.json`
- 内容：22 只标的分类观察池 + 排除标的
- 用途：后续盘前、盘后、周报、策略日报复用

### 3. 风控与执行规则
- `/root/.hermes/profiles/wealth/data/investment/risk_rules.json`
- 内容：买入规则、卖出规则、仓位原则、预警级别、优先级、任务职责映射
- 用途：统一后续定时任务的话术和决策口径

---

## 三、当前正式保留的策略核心

### ETF 定投主线
- 消费50ETF：3 万额度，首档已建，后续每跌 2% 一档
- 中概互联ETF：3 万额度，首档已建，后续每跌 3% 加 3000 元

### 股票加仓主线
- 新洋丰：13.5 / 12.2 两个后续加仓档
- 龙佰集团：16 / 15 两个后续加仓档
- 羚锐制药：22 以内可加，但当前按“已入满”处理
- 华润三九：28 左右为重要观察价，但当前按“已入满”处理

### 上层原则
- 低估才买
- 必须分档
- 不追高
- 重视现金管理
- 成长股偏长期持有
- 中药总仓不超过总资金 20%
- 短期暴涨标的几年内不再入

---

## 四、当前不直接迁入实时任务的数据

以下内容只保留为参考，不作为实时任务计算依据：

- OpenClaw 旧价格快照
- 旧任务中具体某天的新闻/市场结论
- 旧脚本里写死的持仓价格与时点判断

原因：这些内容有时效性，继续沿用会污染当前真实行情任务。

---

## 五、下一步迁移方向

### 第一批：盯盘类任务
优先改造：
1. 早盘价格检查
2. 收盘价格检查
3. 周一 ETF 定投检查

迁移方式：
- 继续读取 `portfolio.json`
- 补充读取 `risk_rules.json`
- 在需要扩展观察标的时读取 `watchlist.json`

### 第二批：日报类任务
1. 盘前市场早报
2. 盘后市场晚报
3. 投资策略全景日报

迁移方式：
- 从 `watchlist.json` 中抽取板块/标的观察方向
- 从 `risk_rules.json` 中抽取统一风险口径
- 保持模板与盘中任务风格统一，但职责不同

### 第三批：周报类任务
1. 周末市场周报

迁移方式：
- 融合观察池、持仓、风险规则
- 周维度复盘，不做盘中式触发提醒

---

## 六、迁移判断

### 已经可以直接用的
- ETF 分档逻辑
- 股票加仓价位
- 22 只观察池结构
- 旧任务职责划分
- 风险优先级（P0/P1/P2）

### 仍需你后续确认的
- 最大回撤容忍度
- 总仓位硬上限/硬下限
- 止损规则是否需要数字化
- 是否把医疗ETF / 医药龙头ETF / 达仁堂等加入正式观察提醒

---

## 七、执行原则

当前 Hermes 迁移策略遵循：

> **先保住现有盘中监控稳定，再把 OpenClaw 的旧策略分层迁进来。**

所以现在做法是：
- 不重写现有正式盘中任务
- 先把旧策略整理成结构化配置文件
- 后续逐个任务复用这些配置

---

*本文件用于 Hermes 投资任务迁移整理，不直接参与实时行情计算。*
