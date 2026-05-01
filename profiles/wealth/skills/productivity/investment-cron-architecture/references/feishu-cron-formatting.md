# Feishu Cron Formatting — Detailed Debugging Reference

> Absorbed from `hermes-feishu-cron-formatting` skill. This file preserves the full experiential knowledge
> for Feishu-specific cron rendering issues. The umbrella SKILL.md has a concise summary.

## Core findings

There are two valid strategies for Feishu cron output:

### Strategy A — Let Hermes auto-wrap plain content
- Prompt the model to output plain text / Markdown only
- Hermes cron will wrap that content into an interactive Feishu card automatically
- Best for simple reports, summaries, and bullet-list monitoring messages

### Strategy B — Pass through a real Feishu interactive card
- Output a valid Feishu card payload: `{"msg_type":"interactive","card":{...}}`
- Hermes detects it and passes the card through directly
- Use when: user wants card-native layout, multiple visual sections, or tighter rendering control

### Rule of thumb
- "不要乱码 / 可读即可" → Strategy A
- "聊天窗口里要看到渲染后的卡片" → Strategy B

## Important rendering constraint

**Never use Markdown pipe tables** inside card markdown — they are not reliable in Feishu chat.

### Feishu Card JSON 2.0 real table component
- card JSON must declare `"schema": "2.0"`
- content lives under `card.body.elements`
- table component tag is `"table"`
- Supported from Feishu client 7.20+; older clients fall back poorly

Safe rule:
- Never use Markdown pipe tables for cron investment cards
- If user only needs readability → simple sectioned bullets or Hermes auto-wrap
- If user explicitly wants a real table → Card JSON 2.0 `table` components

## How Hermes cron delivery works

Key files: `cron/scheduler.py`, `tools/send_message_tool.py`, `gateway/platforms/feishu.py`

1. `cron/scheduler.py` builds a Feishu card via `_build_feishu_cron_card(...)`
2. It first checks whether cron output is already a valid Feishu card payload; if so, returns it directly
3. `_deliver_result(...)` sets `structured_payload = {"feishu_card": feishu_card}` and `text_to_send = ""`
4. `send_message_tool.py` calls Feishu adapter `send_card(...)` when `structured_payload["feishu_card"]` is present
5. `gateway/platforms/feishu.py` sends as `msg_type="interactive"`

## Debugging workflow

### 1. Confirm the prompt is the problem, not Feishu transport
- List job with `cronjob(action='list')`
- Read output under `~/.hermes/profiles/<profile>/cron/output/<job_id>/`
- Inspect whether LLM output is raw JSON, Markdown tables, or plain text

### 2. Inspect Hermes delivery path
Read: `cron/scheduler.py` (`_build_feishu_cron_card`, `_deliver_result`), `tools/send_message_tool.py` (`_send_feishu`), `gateway/platforms/feishu.py` (`send_card`)

### 3. Fix paths based on user intent

**Path A — clean generic card**: output plain text/Markdown only, no JSON, no Markdown tables, use section headers + bullet lists, use `[SILENT]` for no-op conditions.

**Path B — rendered custom card**: output only one valid Feishu interactive card JSON object, no explanation text, no code fences, avoid Markdown pipe tables.

### 4. Preferred output style for Feishu cron
Use sectioned Markdown with bold headers and bullet lists — much more reliable than tables.

## Live delivery pitfalls

### `cronjob run` is not immediate execution
`cronjob(action='run', job_id=...)` may only schedule for the next tick. Don't assume "run" means "already sent."

### Safe live-test procedure
1. Create test job
2. Trigger with `cronjob(action='run')` if needed
3. Force/wait for scheduler tick
4. Confirm output file exists
5. Check `last_status`, `last_delivery_error`, `last_run_at`
6. Only remove test job after execution confirmed

### Reliable manual scheduler trigger
```bash
python - <<'PY'
import os
os.environ['HERMES_HOME']='/root/.hermes/profiles/wealth'
from cron.scheduler import tick
print('tick_result=', tick(verbose=True))
PY
```

### Never expose raw card JSON when user expects rendered card
If a test run causes raw JSON in chat, treat it as failed validation. Use direct `FeishuAdapter.send_card()` preview after connecting instead:
```python
await adapter.connect()
await adapter.send_card(chat_id, card)
```

## Delivery-target diagnosis
If "nothing received": separate "never executed" (no output file, no `last_run_at`) from "executed but routing wrong" (output exists, `last_status: ok`, `last_delivery_error: null`). Use explicit Feishu targets over `deliver: origin` for debugging.

## Content-verification rule
A successful transport test doesn't prove content is acceptable. Run a content-aligned one-off test:
- Match production tone, title, sections, structure
- Override `[SILENT]` for inspection
- Remove diagnostic wording ("诊断", "联调", "测试链路")
- Keep real constraints: same holdings/sections/wording, no markdown tables, no fabricated prices

## Feishu Card 2.0 compatibility findings
1. **Do not use `note` in schema 2.0 cards** — `unsupported tag note`, use `div` instead
2. **Do not include `width` inside `table.columns`** — keep to `name`, `display_name`, `data_type`

### Example table shape that passed live delivery
```json
{
  "tag": "table",
  "element_id": "hold_table",
  "page_size": 10,
  "row_height": "low",
  "freeze_first_column": true,
  "header_style": {
    "text_align": "left", "text_size": "normal",
    "background_style": "grey", "text_color": "default",
    "bold": true, "lines": 1
  },
  "columns": [
    {"name": "name", "display_name": "标的", "data_type": "text"},
    {"name": "price", "display_name": "现价", "data_type": "text"}
  ],
  "rows": [{"name": "消费50ETF", "price": "1.103"}]
}
```

## Deterministic rendering rule
For investment monitoring jobs that need real tables + stable layout:
- Stop asking the model to author final card JSON
- Use a deterministic card builder in `cron/scheduler.py`
- Route those jobs through `_build_investment_feishu_card(job)` with code-built schema 2.0 cards
- Model outputs summary text only; final card structure is code-generated

## JSON 2.0 passthrough fix
`_extract_embedded_feishu_card(...)` must accept both:
- Legacy: `card["elements"]`
- JSON 2.0: `card["schema"] == "2.0"` and `card["body"]["elements"]`

## Recurring regression patterns
- "Tables sometimes disappear" → check if builder is falling back to generic markdown wrapper
- "Module titles revert to 【】" → check if job is on deterministic builder path
- "Fields suddenly missing" → check context generator stability, not just rendering
- Long-lived Hermes processes can keep old behavior after code patches — verify process state

## Card skeleton for investment monitoring with true tables
- `div`: `**【🌐 大盘实时概览】**` + 3 index lines + 1 summary line
- `hr`
- `div`: `**【📋 持仓实时监控】**` + `table`: holdings + summary line
- `hr`
- `div`: `**【📐 加仓距离更新】**` + `table`: rebuy-distance
- `hr`
- `div`: `**【⚡ 异动提醒】**` + alerts body
- `hr`
- `div`: `**【💡 操作建议】**` + actions body
- `hr`
- `div`: `**【⚠️ 风险提示】**` + risk level / reason / next check time
