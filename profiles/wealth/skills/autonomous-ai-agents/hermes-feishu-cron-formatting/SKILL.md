---
name: hermes-feishu-cron-formatting
description: "Debug and fix Hermes cron jobs that deliver poorly formatted messages to Feishu. Key findings: Hermes can now pass through valid interactive card JSON directly; otherwise it auto-wraps Feishu cron output into interactive cards. Markdown tables inside card markdown are still unreliable."
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [hermes, feishu, cron, formatting, messaging, debugging]
    related_skills: [hermes-agent, systematic-debugging]
---

# Hermes Feishu Cron Formatting

Use this when a Hermes cron job sends ugly, literal, or mis-rendered messages to Feishu/Lark.

## Core findings

There are now **two valid strategies**, depending on what the user wants to see in Feishu:

### Strategy A — Let Hermes auto-wrap plain content

Use this when the job only needs a clean, readable Feishu card.

- Prompt the model to output **plain text / Markdown only**
- Hermes cron will wrap that content into an interactive Feishu card automatically
- Best for simple reports, summaries, and bullet-list monitoring messages

### Strategy B — Pass through a real Feishu interactive card

Use this when the user explicitly wants the chat window to show a **rendered custom card**, not a generic wrapped markdown block.

If the cron output is a valid Feishu card payload such as:

```json
{"msg_type":"interactive","card":{...}}
```

Hermes can now detect it and **pass the card through directly** instead of re-wrapping it as markdown text.

This is the correct path when:

- the user wants card-native layout
- the content needs multiple visual sections
- you need tighter control over how the message renders in Feishu

### Rule of thumb

- If the requirement is just “不要乱码 / 不要 JSON 串 / 可读即可” → use **Strategy A**
- If the requirement is “聊天窗口里要看到渲染后的卡片” → use **Strategy B**

## Important rendering constraint

Even after switching away from raw JSON text, **do not rely on Markdown tables** like:

```md
| 列1 | 列2 |
|---|---|
```

Markdown pipe tables inside card markdown are still not reliable as a true rendered table in Feishu chat.

### Updated finding: Feishu now has a real `table` card component

For users who explicitly want an actual table rather than a table-like layout, Feishu Card JSON **2.0** supports a first-class `table` component.

Key facts confirmed from Feishu docs:

- card JSON must declare `"schema": "2.0"`
- content lives under `card.body.elements`
- table component tag is `"table"`
- the table is a real card component, not Markdown
- you define `columns` and `rows`
- this is appropriate for holdings grids, rebuy-distance grids, and similar monitoring tables
- Card JSON 2.0 is only supported on sufficiently new Feishu clients (the docs page states schema 2.0 support starts from client version 7.20; older clients fall back poorly)

So the safe rule becomes:

- **Never use Markdown pipe tables** for cron investment cards
- If the user only needs readability, use simple sectioned bullets or Hermes auto-wrap
- If the user explicitly wants a real table, use **direct Feishu card pass-through + Card JSON 2.0 `table` components**

## How Hermes currently works

Check these files:

- `cron/scheduler.py`
- `tools/send_message_tool.py`
- `gateway/platforms/feishu.py`

Relevant behavior discovered:

1. `cron/scheduler.py` builds a Feishu card for Feishu cron deliveries via `_build_feishu_cron_card(...)`.
2. `_build_feishu_cron_card(...)` now first checks whether the cron output is already a valid Feishu card payload (for example `{"msg_type":"interactive","card":{...}}`). If so, it returns that embedded card directly.
3. When the target platform is Feishu, `_deliver_result(...)` sets:
   - `structured_payload = {"feishu_card": feishu_card}`
   - `text_to_send = ""`
4. `tools/send_message_tool.py` then calls Feishu adapter `send_card(...)` when `structured_payload["feishu_card"]` is present.
5. `gateway/platforms/feishu.py` sends that payload as `msg_type="interactive"`.

So the cron system supports **both**:

- automatic card wrapping for plain content
- direct pass-through of valid Feishu card JSON

## Debugging workflow

### 1. Confirm the prompt is the problem, not Feishu transport

- List the job with `cronjob(action='list')`
- Identify the `job_id`
- Read recent output under:
  - `~/.hermes/profiles/<profile>/cron/output/<job_id>/`
- Inspect whether the LLM output is:
  - raw Feishu JSON
  - Markdown table-heavy output
  - plain text/Markdown bullets

If output already looks clean but rendering is wrong, then inspect Hermes delivery code. But often the issue is in the prompt.

### 2. Inspect Hermes delivery path

Read these exact code areas:

- `cron/scheduler.py`
  - `_build_feishu_cron_card`
  - `_deliver_result`
- `tools/send_message_tool.py`
  - `_send_feishu`
- `gateway/platforms/feishu.py`
  - `send_card`

What you want to verify:

- Feishu deliveries are card-wrapped automatically
- standalone path sends `structured_payload["feishu_card"]`
- live adapter prefers `send_card(...)`

### 3. Choose the fix path based on user intent

#### Path A — clean generic card

Update the job prompt so it says all of the following explicitly:

- output **plain text / Markdown only**
- **do not output JSON**
- **do not output Feishu card payloads**
- **do not use Markdown tables**
- use **short section headers + bullet lists**
- if non-trading / no-op condition applies, output `[SILENT]` exactly if the cron flow expects silent suppression

#### Path B — rendered custom Feishu card

Update the job prompt so it says all of the following explicitly:

- output **only one valid Feishu interactive card JSON object**
- **no explanation text before or after the JSON**
- **no code fences** such as ```json
- the JSON must contain a valid `card` payload
- prefer card-native sections like `div`, `note`, `hr`, and other supported card elements
- still **avoid Markdown pipe tables** inside card markdown blocks; use card layout instead

Use Path B when the user explicitly wants the Feishu chat window to show a rendered custom card.

### 4. Preferred output style for Feishu cron

Use a structure like:

```md
**🌐 大盘实时概览**
- 上证指数：...
- 深证成指：...
- 一句话总结

**📋 持仓实时监控**
- 标的A：现价 / 成本 / 目标 / 盈亏 / 距触发
- 标的B：...
- 汇总：总市值 / 总盈亏 / 仓位

**⚡ 异动提醒**
- ...

**💡 操作建议**
- ...

**⚠️ 风险提示**
- 风险等级：中
- 原因：...
- 下次监控：15:00
```

This is much more reliable than tables inside Feishu cron cards.

## Practical rule for investment cron jobs

For 盘前 / 盘中 / 盘后 / 检查类任务:

- prefer concise sectioned Markdown
- keep one holding per bullet line
- keep numbers compact
- avoid huge blocks of prose
- avoid JSON
- avoid Markdown tables

## When prompt fix is not enough

If the user truly wants **real table-like multi-column layout**, prompt edits are not sufficient.

Then you must change Hermes code in `cron/scheduler.py` to convert structured content into richer Feishu card elements instead of a single markdown body. That is an application-level rendering change, not a prompt tweak.

## Live delivery pitfall: `cronjob run` is not immediate execution

Important operational finding from live debugging:

- `cronjob(action='run', job_id=...)` does **not** guarantee that the job has already executed and delivered.
- In Hermes cron flow, manual `run` can simply mark/schedule the job for the **next scheduler tick**.
- If you create a temporary test job, call `run`, and then immediately remove the job, you may delete it **before delivery ever happens**.

So for live Feishu verification, do **not** assume `run` means "already sent".

### Safe live-test procedure

1. Create the test job.
2. Trigger it with `cronjob(action='run', job_id=...)` if needed.
3. Force or wait for the scheduler tick before judging delivery.
4. Confirm an output file exists under:
   - `~/.hermes/profiles/<profile>/cron/output/<job_id>/`
5. Check job state with `cronjob(action='list')`:
   - `last_status`
   - `last_delivery_error`
   - `last_run_at`
6. Only remove the test job **after** execution is confirmed.

### Reliable manual scheduler trigger

When doing diagnosis in the local Hermes repo, a reliable way to force processing is:

```bash
python - <<'PY'
import os
os.environ['HERMES_HOME']='/root/.hermes/profiles/wealth'
from cron.scheduler import tick
print('tick_result=', tick(verbose=True))
PY
```

If `tick_result` increments and an output file appears, the job actually ran.

## Delivery-target diagnosis rule

If a Feishu live test shows "nothing received," separate these two possibilities:

1. **The job never actually executed**
   - no output file
   - no `last_run_at`
   - no scheduler tick happened

2. **The job executed, but delivery routing/visibility is wrong**
   - output file exists
   - `last_status: ok`
   - `last_delivery_error: null`
   - user still sees nothing

To isolate routing problems:

- first compare `deliver: origin` vs an **explicit Feishu target** like `feishu:oc_xxx`
- explicit target tests are stronger than `origin` when debugging delivery ambiguity

## Content-verification rule after transport is fixed

A successful Feishu card transport test does **not** prove the real cron message content is acceptable.

After you confirm cards can render at all, run a second validation step focused on **content realism**:

1. Create a **one-off cron test job** delivered to the same Feishu target.
2. Make its output **match the real production task's tone, title, sections, and structure**.
3. If the real task normally suppresses outside trading hours with `[SILENT]`, explicitly override that for the one-off test so the user can inspect the rendered card.
4. Remove diagnostic wording such as:
   - “诊断”
   - “联调”
   - “测试链路”
   - “如果你看到这条”
5. Keep the real content constraints:
   - same holdings / same sections / same wording style
   - no markdown tables
   - no fabricated prices
   - if data is unavailable, say `未获取到实时价格`
6. Ask the user to judge **this exact card**, not the transport-diagnostic card.

Why this matters:

- users may say “卡片可以了，但内容不对”
- the transport layer can be fixed while the content still feels like a debug artifact
- a dedicated one-off content-aligned test is safer than immediately changing the production cron prompt

### Recommended content-test pattern

For a production task like 盘中监控:

- keep the real title style, e.g. `📊 盘中监控 | HH:MM`
- keep the real sections, e.g. market overview / holdings / alerts / actions / risk
- keep formal production language, e.g. `继续持有观察，暂无操作`
- if live data is unavailable, preserve structure but mark fields explicitly as unavailable instead of inventing values

Only after the user confirms the **content-aligned** card should you update the production cron prompt.

## New implementation option: real table cards for Feishu cron

When the user says they do **not** want a “table-like layout” and explicitly wants a **real table**, do not keep iterating on `column_set`.

Use this approach instead:

1. Keep Hermes cron on the **direct Feishu card pass-through** path.
2. Output a valid Feishu interactive card payload using **Card JSON 2.0**.
3. Declare:
   - `"msg_type": "interactive"`
   - `"card": { "schema": "2.0", ... }`
4. Put content under:
   - `card.header`
   - `card.body.elements`
5. Use real `table` components for the sections that need tabular presentation, for example:
   - `持仓实时监控`
   - `加仓距离更新`
6. Keep section titles as separate `div + lark_md` blocks above each table so the module titles are visually obvious.
7. Keep surrounding narrative sections concise but not overly compressed:
   - market overview = 3 index lines + 1 summary line
   - alerts = only meaningful anomalies, but list all material ones
   - actions = at least one line for triggered holdings and one line for non-triggered holdings when useful
   - risk = compact bottom note

### Recommended skeleton for investment monitoring cards with true tables

- `div`: `**🌐 大盘实时概览**`
- `div`: 3 index lines + 1 summary line
- `hr`
- `div`: `**📋 持仓实时监控**`
- `table`: holdings table
- `note`: holdings summary line
- `hr`
- `div`: `**📐 加仓距离更新**`
- `table`: rebuy-distance table
- `hr`
- `div`: `**⚡ 异动提醒**`
- `hr`
- `div`: `**💡 操作建议**`
- `hr`
- `note`: risk level / reason / next check time

### Example table shape

```json
{
  "tag": "table",
  "element_id": "hold_table",
  "page_size": 10,
  "row_height": "low",
  "freeze_first_column": true,
  "header_style": {
    "text_align": "left",
    "text_size": "normal",
    "background_style": "grey",
    "text_color": "default",
    "bold": true,
    "lines": 1
  },
  "columns": [
    {"name": "name", "display_name": "标的", "data_type": "text", "width": "120px"},
    {"name": "price", "display_name": "现价", "data_type": "text", "width": "72px"}
  ],
  "rows": [
    {"name": "消费50ETF", "price": "1.103"}
  ]
}
```

### Decision rule discovered from live iteration

If the user says any variant of:

- “不是要表格化布局，是要求表格”
- “模块标题不明显”
- “整体内容比较简化”

then the correct response is:

- switch from simulated columns to real `table`
- promote section titles into standalone heading blocks
- expand the content back to the last acceptable density rather than compressing it further

## Strong product lesson: when content drifts, revert to the last known-good template

In this Feishu 盘中监控 case, transport was fixed, but the message content still degraded because iterative edits made it more verbose and less like the originally approved card.

What worked:

- compare the newest card against the last user-approved or user-referenced card/output
- identify which structural elements were added that made it feel worse
- revert the production prompt back to a **tight fixed skeleton** instead of continuing to add prose

### Safe rollback pattern for investment monitoring cards

If the user says things like:

- “最开始这个模板是好的”
- “后面越改越差劲”
- “最后就不成样了”

then stop polishing incrementally and do this instead:

1. Locate the last known-good rendered output or template.
2. Compare it to the current card.
3. Restore the exact high-level skeleton:
   - same title style
   - same section order
   - same density of bullets
   - same tone length
4. Remove later-added explanatory sections or prose-heavy content.
5. Send one **rollback verification card** before making further broad changes.
6. Only once the user confirms the rollback version, update the recurring production cron job.

### Specific formatting lesson from this case

For 盘中监控 cards, the user preferred the compact structure below over more explanatory versions:

- `🌐 大盘实时概览` = 3 index lines + 1 summary line
- `📋 持仓实时监控` = one holding per line + one summary line
- `⚡ 异动提醒` = only true anomalies
- `💡 操作建议` = one concise action line unless a trigger is hit
- risk should usually stay in the bottom `note`

Avoid letting the card drift into:

- a separate long `风险提示` section
- multi-line narrative explanations for every holding
- “helpful” but verbose diagnostic language
- structural changes that were not explicitly requested

### Prompt-writing rule for preserving a known-good template

When updating the production cron prompt after rollback, explicitly encode:

- fixed section order
- fixed line formats for each section
- fixed title pattern
- forbidden phrases (`测试`, `联调`, `诊断`, etc.)
- forbidden structural drift (for example: no separate long risk section if risk belongs in `note`)
- a requirement for concise, data-first bullets rather than prose paragraphs

## Updated verification checklist

Before finishing:

- [ ] Job prompt no longer asks for JSON card output unless direct card pass-through is intentional
- [ ] Job prompt no longer asks for Markdown tables
- [ ] Recent cron output matches the intended strategy (plain Markdown or valid card JSON)
- [ ] Scheduler tick actually occurred for any live test
- [ ] Output file exists for the tested run
- [ ] `last_status` and `last_delivery_error` were checked
- [ ] `deliver` target (`origin` vs explicit Feishu target) was considered during diagnosis
- [ ] `[SILENT]` behavior is preserved where needed

## Example reusable conclusion

When a Feishu cron message looks wrong in Hermes, the default fix is:

1. stop generating Feishu card JSON from the model
2. stop using Markdown tables
3. output concise bullet-based Markdown
4. let Hermes cron wrap it into the Feishu card automatically
