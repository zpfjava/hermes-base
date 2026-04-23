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

### New user-facing validation lesson: never expose raw card JSON when the user expects a rendered card

A later live-debugging round exposed an important practical difference between:

- **internal validation**: checking whether cron output contains valid Feishu card JSON
- **user-facing validation**: showing the user an actually rendered card in chat

If the user explicitly wants to *see the rendered card* and dislikes raw JSON strings, then a cron verification path is not sufficient unless you have confirmed that this exact path renders correctly in chat.

#### Practical rule

If a test run causes the user to see raw JSON in the chat window, treat that as a failed validation even if the payload itself is schema-valid.

In that case:

1. keep the cron/output file for debugging
2. inspect the generated JSON
3. then send a **direct rendered Feishu card** through the adapter for user review
4. only after the user confirms the rendered card should you finalize the recurring cron prompt/template

#### Reliable fallback for Feishu card preview

When cron-based preview is exposing JSON strings but you still need to show the user the real visual result:

1. load live context data (for example from the profile script)
2. build the final Card JSON 2.0 payload in Python
3. instantiate `FeishuAdapter`
4. `await adapter.connect()`
5. `await adapter.send_card(chat_id, card)`
6. optionally `await adapter.disconnect()`

Important finding from live use:

- calling `send_card(...)` without connecting first returned `Not connected`
- the working path was:
  - `await adapter.connect()`
  - `await adapter.send_card(...)`
- once connected, live card delivery succeeded and returned a real `message_id`

#### Decision rule

- If the goal is **transport/debugging** → cron output inspection is fine
- If the goal is **show the user a real rendered card right now** → prefer direct `FeishuAdapter.send_card()` preview after connecting

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

- `div`: `**【🌐 大盘实时概览】**`
- `div`: 3 index lines + 1 summary line
- `hr`
- `div`: `**【📋 持仓实时监控】**`
- `table`: holdings table
- `div`: holdings summary line
- `hr`
- `div`: `**【📐 加仓距离更新】**`
- `table`: rebuy-distance table
- `hr`
- `div`: `**【⚡ 异动提醒】**`
- `div`: alerts body
- `hr`
- `div`: `**【💡 操作建议】**`
- `div`: actions body
- `hr`
- `div`: `**【⚠️ 风险提示】**`
- `div`: risk level / reason / next check time

### Important Feishu Card 2.0 compatibility findings from live debugging

Two schema-valid looking patterns turned out to be rejected by Feishu at send time:

1. **Do not use `note` in schema 2.0 cards**
   - Live Feishu error:
     - `unsupported tag note`
     - `cards of schema V2 no longer support this capability`
   - Practical rule:
     - in schema 2.0 cron cards, use `div` instead of `note` for holdings summary and bottom risk line

2. **Do not include `width` inside `table.columns`**
   - Live Feishu error pointed at the table column index when `width` was present
   - A minimal table succeeded only after removing `width`
   - Practical rule:
     - keep `columns` to fields like `name`, `display_name`, `data_type`
     - avoid speculative sizing fields unless re-verified against current Feishu behavior

### Example table shape that actually passed live Feishu delivery

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
    {"name": "name", "display_name": "标的", "data_type": "text"},
    {"name": "price", "display_name": "现价", "data_type": "text"}
  ],
  "rows": [
    {"name": "消费50ETF", "price": "1.103"}
  ]
}
```

### New production lesson: inject real market data before card generation

For investment monitoring cron jobs, prompt instructions alone are not enough to guarantee truthful numbers.

A reusable pattern that worked here:

### New maintainability lesson: externalize holdings into a profile data file

When an investment cron card starts as a prompt or script with hard-coded holdings, that approach becomes fragile fast. The reusable fix is to split the system into **three layers**:

1. **Profile data file** under `HERMES_HOME`
   - store user-maintained investment data outside the repo
   - recommended path used here:
     - `~/.hermes/profiles/<profile>/data/investment/portfolio.json`
2. **Testable repo module**
   - put shared loading / validation / market-data / calculation logic in a normal source module
   - example used here:
     - `cron/investment_monitor.py`
3. **Thin cron script wrapper**
   - keep the cron-attached script minimal
   - it should only load/ensure the data file, call the module, and print JSON
   - example used here:
     - `~/.hermes/profiles/<profile>/scripts/intraday_monitor_context.py`

#### Why this split is the right default

Use this pattern when the user says any variant of:

- “持仓配置表应该有个地方可以专门存储”
- “后面我还会增加或修改持仓数据”
- “还会存别的一些投资数据”

Benefits:

- holdings are no longer buried in prompt text or script constants
- the user can edit a single profile data file without touching repo code
- cron jobs keep the same script entrypoint, so production scheduling changes are minimal
- core logic becomes unit-testable
- future expansion is easier (`watchlist`, `cash_plan`, `risk_rules`, `strategy_notes`, etc.)

#### Recommended initial JSON shape

Start simple with one file containing at least:

```json
{
  "meta": {},
  "indices": [],
  "holdings": []
}
```

This is enough for the first migration. If the data grows later, split into multiple files only after the single-file shape becomes unwieldy.

#### Implementation workflow that worked

1. Inspect the current cron script and identify what is hard-coded vs dynamic.
2. Confirm the real production job and script path before refactoring.
3. Add tests first for:
   - resolving the portfolio path from `HERMES_HOME`
   - loading external JSON config
   - building the monitor context from config-driven holdings
4. Create the shared source module in the repo.
5. Move portfolio defaults + loading + generation logic into that module.
6. Rewrite the profile cron script into a thin wrapper.
7. Create the profile data file under `data/investment/portfolio.json`.
8. Run the script directly and verify output now reflects external config + live market data.

#### Testing lesson

A practical minimum regression suite for this refactor is:

- `get_portfolio_path()` uses `HERMES_HOME`
- `load_portfolio_config()` reads external JSON correctly
- generated monitor context uses holdings from the config file, not in-script constants

This catches the main failure mode where the refactor looks complete but the cron output still secretly depends on hard-coded holdings.

#### Operational note

Prefer storing investment configuration under the **profile** (`~/.hermes/profiles/...`) rather than in the repo because it is user data, not source code. Keep the reusable logic in the repo, keep the editable portfolio data outside it.

For investment monitoring cron jobs, prompt instructions alone are not enough to guarantee truthful numbers.

A reusable pattern that worked here:

1. Add a cron `script` that fetches real-time market/index/holding data before the run.
2. Print compact JSON containing:
   - index prices, pct changes, turnover
   - per-holding current price, day change, pnl, trigger state, distance-to-target
   - summary totals such as total market value and total pnl
3. In the cron prompt, explicitly require the model to:
   - use only injected script data
   - compute card text, alerts, and action lines from that data
   - mark missing fields as `未获取` / `数据暂缺` instead of inventing values

This is preferable whenever the user says any variant of:

- “数据一定要根据真实数据计算”
- “不要用示例数据”
- “不能编造价格/盈亏/触发情况”

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

### New transport lesson: Feishu true `table` requires Card JSON 2.0 passthrough

A later debugging round found an important gap in Hermes cron Feishu delivery:

- Feishu **real table components** are supported in **Card JSON 2.0**
- JSON 2.0 cards use:
  - `card.schema = "2.0"`
  - `card.body.elements`
  - `{"tag": "table", ...}` components
- Hermes originally only recognized embedded cards shaped like:
  - `header + elements` (legacy shape)
- Result: when a cron job output a valid JSON 2.0 card, Hermes failed to recognize it as a card payload and delivered the entire JSON as plain text / JSON string in Feishu

#### Practical rule

If the user explicitly wants:

- a **real table**, not a table-like column layout
- stronger section headers
- richer but still structured monitoring content

then you should prefer **Feishu Card JSON 2.0** with real `table` components.

#### Required Hermes support check

Before relying on JSON 2.0 cards in cron delivery, verify `cron/scheduler.py` accepts both shapes:

1. Legacy embedded card:
   - `header`
   - `elements`
2. JSON 2.0 embedded card:
   - `schema: "2.0"`
   - `header`
   - `body.elements`

In this case, `_extract_embedded_feishu_card(...)` had to be extended to accept:

- `payload["card"]` where `card["schema"] == "2.0"`
- `card["body"]["elements"]` is a list

and to keep legacy support for `card["elements"]`.

#### Regression tests worth keeping

When fixing JSON 2.0 Feishu card passthrough, add tests for both:

- builder acceptance of a schema 2.0 card payload
- delivery passthrough of a schema 2.0 raw interactive card payload

Typical assertions:

- `card["schema"] == "2.0"`
- `card["body"]["elements"]` exists
- one of the elements has `tag == "table"`
- Feishu delivery sends `structured_payload["feishu_card"]`
- plain text argument is empty (`args[3] == ""` in current tests)

#### Feishu doc finding to remember

Feishu docs confirm standard Feishu cards support a real `table` component in Card JSON 2.0. Relevant facts discovered:

- component tag is `table`
- it lives under card JSON 2.0 `body.elements`
- each card can include up to 5 table components
- schema 2.0 cards are supported from Feishu client 7.20+
- older clients may show fallback upgrade prompts

This matters because if the user says “不是要表格化布局，是要求表格”, prompt tweaks alone are not enough — you must switch to schema 2.0 true table cards and ensure Hermes transports them correctly.

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

## New strongest lesson for investment cron jobs: prompt-fixed cards are still unstable

A later debugging round established a more durable rule for recurring investment cards:

- a prompt can describe a fixed template
- but if the model still emits the **final** Feishu card JSON, the transport remains fragile

Observed live behavior:

- some runs rendered raw JSON strings in chat
- some runs produced schema-valid-looking but delivery-invalid payloads
- switching to markdown-only output stopped JSON strings but also removed real tables

### Updated decision rule

A later production issue exposed another important failure mode in deterministic card rendering:

- the scheduler-side investment card builder was doing a **second live quote fetch at delivery time**
- when that refetch failed transiently, `_build_investment_feishu_card(...)` returned `None`
- Hermes then fell back to the generic markdown card path
- user-visible symptom: **real tables disappeared**, and prompt-authored titles like `【模块名】` came back again

#### Practical fix rule

For investment cron jobs with code-built Feishu cards:

1. do not allow quote-refetch failure to drop back to the generic markdown wrapper
2. retry live quote loading a few times
3. if live data still fails, keep sending the **deterministic table card** using config-only fallback data
4. explicitly show `数据暂缺` / `—` for unavailable market fields

The key acceptance rule is:

- transient market-data fetch failure may degrade **data freshness**
- but it must **not** degrade the card back into non-table markdown layout

#### Additional compatibility lesson from live Feishu DM testing

A later direct-send verification showed another issue:

- the bot successfully sent a schema 2.0 card containing real `table` elements
- transport succeeded with a valid `message_id`
- but the user still did **not** see visible tables in the Feishu chat client

Practical implication:

- transport success does **not** guarantee user-visible `table` rendering
- some Feishu clients / contexts may silently fail to display `table` blocks as expected

When the user reports "表格没有了" even after confirmed card passthrough success, use a **compatibility grid fallback** for the affected card:

1. keep the deterministic scheduler-built card path
2. replace the invisible `table` block with multiple `div + lark_md` rows
3. render a bold header row plus one line per record using separators like `｜`
4. preserve module titles, row ordering, and real data values
5. prefer this fallback for the specific task/card the user is actually reading, rather than globally assuming `table` works everywhere

This is not a true Feishu native table, but it is the safest user-visible fallback when native `table` transport succeeds yet rendering still fails in chat.

For ordinary readable reports, the old default still stands:

1. stop generating Feishu card JSON from the model
2. stop using Markdown tables
3. output concise bullet-based Markdown
4. let Hermes cron wrap it into the Feishu card automatically

But for **investment monitoring jobs that must keep real tables and a stable approved layout**, the better fix is different:

1. keep script-injected structured data
2. stop asking the model to author the final card JSON
3. add a deterministic card builder in `cron/scheduler.py`
4. have `_build_feishu_cron_card(...)` return that code-built schema `2.0` card for the target jobs before embedded-card extraction
5. use code-generated `table` components instead of markdown or prompt-authored JSON

### Practical acceptance bar update

For this class of job, success is only:

- Feishu chat shows a rendered interactive card
- tables are still present as real `table` components
- no raw JSON string is visible to the user
- delivery reports `delivery_error: None`

If markdown auto-wrap renders but tables disappear, that is only a temporary transport workaround, **not** a final fix.

## Example reusable conclusion

When a Feishu cron message looks wrong in Hermes, choose the fix by requirement:

- if readability is enough → markdown output + Hermes auto-wrap
- if the user demands rendered card + true tables + stable repeatability → deterministic code-built Feishu Card 2.0 in scheduler
