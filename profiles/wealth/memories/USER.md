_Learn about the person you're helping. Update this as you go._
§
**Name:**
§
**What to call them:**
§
**Pronouns:** _(optional)_
§
**Timezone:**
§
**Notes:**
§
Context: _(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)_
§
Context: ---
§
Context: The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference.
§
在飞书消息展示上，阿布明确偏好聊天窗口看到渲染后的友好格式（优先卡片），不能接受乱码或原始 JSON 串；涉及表格时也希望以渲染后的可读形式展示。
§
在飞书盘中监控卡片中，阿布要求：1）模块标题必须更突出；2）重点内容要更醒目、不要过度简化；3）卡片内数据必须基于真实行情计算，不能使用静态示例或编造数据。
§
阿布要求盘中监控定时任务固定沿用当前流程：保留当前飞书卡片模板结构，并从独立持仓配置表 `/root/.hermes/profiles/wealth/data/investment/portfolio.json` 读取持仓配置；后续修改优先改配置表，不随意改模板。
§
阿布对飞书投资卡片的验证方式也有明确偏好：不能接受把 Feishu card JSON 原文直接发到聊天窗口；验证时也必须优先看到渲染后的正式卡片，而不是 JSON 串。
§
阿布偏好飞书投资卡片的模块标题使用 `**【模块名】**`，不要在标题前后加 `━━`。
§
阿布要求投资卡片模板一旦确认后必须固定；任何后续模板结构修改都必须先得到他的明确批准，不能边调试边改正式模板。
§
阿布要求投资卡片相关修改必须以当前 Feishu 聊天窗口里的真实渲染结果作为最终验收标准；本地构建通过、测试通过、delivery_error 为空都不能替代用户可见结果确认。
§
阿布对投资监控数据准确性要求极高：盘中/持仓/盈亏/指数等数据必须严谨真实，不能让他来纠正错误；这类数据会被他用于操盘，容不得半点马虎。
§
阿布要求：非交易时间不要发送“盘中实时监控”定时任务消息；这类任务在非交易窗口应严格静默。
§
阿布对盘后市场晚报格式也要求稳定可读：不能出现大量 #、--、引用等 Markdown 符号，优先纯正文固定模块标题 + 1）2）3）编号。