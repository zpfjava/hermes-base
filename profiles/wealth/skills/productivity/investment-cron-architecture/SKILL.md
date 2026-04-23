---
name: investment-cron-architecture
description: Build and maintain Hermes investment cron jobs using fixed Feishu card templates, profile-scoped portfolio config, and script-injected real market data.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [investment, cron, feishu, portfolio, monitoring, market-data]
    related_skills: [autonomous-ai-agents/hermes-feishu-cron-formatting, software-development/writing-plans]
---

# Investment Cron Architecture

Use this when maintaining recurring investment tasks for 阿布 such as 盘前、早盘检查、盘中监控、收盘检查、盘后、周报.

## Goal

Keep investment cron jobs stable by separating:

1. **Template** — fixed Feishu card structure
2. **Config** — editable portfolio/investment data in the profile
3. **Live data** — fetched at run time and injected by scripts

This prevents holdings from being hard-coded into prompts or scripts and makes future task updates low-risk.

## Default architecture

### 1. Store editable investment data under the profile

Primary file:

- `~/.hermes/profiles/<profile>/data/investment/portfolio.json`

For 阿布's setup this is:

- `/root/.hermes/profiles/wealth/data/investment/portfolio.json`

Start with:

```json
{
  "meta": {},
  "indices": [],
  "holdings": [],
  "watchlist": [],
  "cash_plan": {},
  "strategy_notes": []
}
```

### 2. Put reusable logic in the repo

Create a normal source module, for example:

- `cron/investment_monitor.py`

It should own:

- resolving the profile data path from `HERMES_HOME`
- ensuring default config exists
- loading external JSON
- fetching quotes
- computing pnl, trigger distance, summary, alerts, risk text

### 3. Keep cron-attached scripts thin

Example:

- `~/.hermes/profiles/<profile>/scripts/intraday_monitor_context.py`

The wrapper should only:

1. ensure config exists
2. call the repo module
3. print JSON

Do **not** bury business logic in the profile script.

## Stable rules for 阿布's investment tasks

### Template rule

- Keep the approved Feishu card structure fixed once accepted.
- Do not casually redesign modules, title hierarchy, or emphasis.
- Future updates should prefer data and config changes over template changes.

### Config rule

- Holdings, target prices, quantities, status, and plans belong in `portfolio.json`.
- When the user says “以后修改持仓”, edit config first, not prompt text.

### Data rule

- Card numbers must come from real market data.
- If data is unavailable, mark it explicitly instead of inventing values.

### Delivery rule

- For Feishu rendered custom cards, use direct interactive card pass-through.
- For true tables, use Card JSON 2.0 `table` components.
- Avoid Markdown pipe tables.

## Recommended task grouping

When upgrading multiple investment cron jobs, do not treat them as one big blob. Split them into three families.

### A. Holdings / monitoring tasks

Examples:

- 早盘价格检查
- 盘中实时监控
- 收盘价格检查
- 周一 ETF 定投检查

Characteristics:

- should reuse `portfolio.json`
- should use live quote data
- should mention holdings / target distance / trigger state when relevant

Recommended order:

1. 早盘价格检查
2. 收盘价格检查
3. 周一 ETF 定投检查

### B. Daily market report tasks

Examples:

- 盘前市场早报
- 盘后市场晚报
- 投资策略全景日报

Characteristics:

- mainly market context, themes, and risk appetite
- should be clearly distinguished from holdings-monitoring tasks
- should avoid duplicating each other

Recommended order:

1. 盘前市场早报
2. 盘后市场晚报
3. 投资策略全景日报

### Repeated-formatting-regression rule for daily market report jobs

A later diagnosis in this setup found an important reason formatting issues kept "coming back" for daily report jobs even after the holdings-monitoring cards had been stabilized.

#### Symptom pattern

The user reported recurring problems such as:

- module titles becoming weak again
- tables rendering poorly or disappearing again
- extra model chatter like English prefaces appearing before the report
- the message sometimes looking like generic markdown instead of the approved Feishu presentation

#### Root cause pattern

Do not assume that because the investment monitoring jobs are already deterministic, the daily market report jobs are also protected.

A real failure pattern here was:

- `盘中监控 / 早盘检查 / 收盘检查 / 周一ETF检查` had already been routed through `_build_investment_feishu_card(...)`
- but `盘前市场早报 / 盘后市场晚报 / 投资策略全景日报` still had:
  - no attached `script`
  - no deterministic scheduler-side builder
  - no template lock tests
- so they continued to use the generic path in `cron/scheduler.py`:
  - model free-generates markdown
  - `_build_feishu_cron_card(...)` falls through to the generic markdown wrapper

Practical consequence:

- formatting remains model-dependent
- prompt drift or model behavior changes can reintroduce bad headings, markdown tables, or explanatory filler text
- the issue will feel like it "keeps recurring" even though transport is healthy

#### Required diagnosis sequence

When a daily report job repeatedly regresses in formatting, check in this order:

1. inspect `cronjob(action='list')`
   - confirm `last_status`
   - confirm `last_delivery_error`
2. inspect `~/.hermes/profiles/<profile>/cron/jobs.json`
   - whether the job has `script: null`
   - whether the prompt actually locks title format / forbids markdown tables / forbids preambles
3. inspect the newest output file under:
   - `~/.hermes/profiles/<profile>/cron/output/<job_id>/`
4. look for evidence of free-form model output, for example:
   - English lead-ins like `Now I have enough data...`
   - markdown pipe tables `| col | col |`
   - section heading drift
5. inspect `cron/scheduler.py`
   - whether the job is routed through a deterministic builder or is falling through to the generic markdown wrapper

#### Decision rule

If the user says formatting problems are recurring for a daily report job and you confirm:

- `last_delivery_error` is `null`
- output files exist
- the job is not covered by a deterministic builder

then the root cause is usually **generation/rendering architecture**, not Feishu transport.

#### Fix rule

Do not keep treating this as a one-off prompt polish problem forever.

Use a two-stage response:

1. **Short-term stopgap**
   - patch the prompt to:
     - forbid markdown tables
     - forbid explanatory prefaces / meta text
     - lock section order
     - lock title format
2. **Durable fix**
   - migrate the daily report family (`盘前市场早报 / 盘后市场晚报 / 投资策略全景日报`, and optionally `周报`) to deterministic scheduler-built cards
   - add template-lock tests for them just like the holdings-monitoring family

#### Reusable conclusion

If a user says a Feishu investment report's titles/tables/sections are "又出问题了" and the job is one of the daily market report tasks, first check whether it was ever migrated off the generic markdown-wrapper path. If not, expect recurring regressions until that migration is done.

### C. Weekly strategy tasks

Examples:

- 周末市场周报

Characteristics:

- summarize weekly market behavior
- optionally include portfolio-level review after daily jobs are stabilized

## Practical migration workflow

### Step 1: inventory existing jobs

Use `cronjob(action='list')` and classify each job into:

- holdings/monitoring
- daily market report
- weekly strategy

### Step 2: preserve the known-good production task

If one task has already been stabilized, treat it as the anchor.

For this setup:

- official intraday task = `d0132c7861d9`
- keep its template and config path as the reference pattern

### Step 3: refactor nearby jobs first

Upgrade jobs closest to the anchor first so code and prompt reuse stay high.

### Practical expansion lesson from this setup

After stabilizing the two anchor jobs:

- `盘中实时监控`
- `早盘价格检查`

the next two jobs to migrate should be:

- `收盘价格检查`
- `周一 ETF 定投检查`

Why this order worked:

- both reuse the same `portfolio.json`
- both benefit from the same `watchlist.json` and `risk_rules.json`
- both are execution-adjacent jobs where stale prose is especially risky
- both can reuse the same quote-fetching layer without inventing a new data model

### Step 4: decide what each job is responsible for

Do **not** make every job say the same thing.

Use this separation:

- **盘前** = overnight environment + today focus + today risk
- **早盘检查** = after-open confirmation of strongest/weakest directions
- **盘中监控** = holdings status, triggers, distance, alerts
- **收盘检查** = whether today's signal held into the close
- **周一 ETF 检查** = weekly ETF ladder/rhythm check for current ETF holdings + ETF watchlist
- **盘后** = recap + next-day watchpoints
- **周报** = weekly summary and execution review

### Implementation rule for extending the first batch of holdings-monitoring jobs

When adding `收盘价格检查` or `周一 ETF 定投检查` into the config-driven architecture, do not stop at creating a new prompt.

You should add **all three layers**:

1. **Repo generator function** in `cron/investment_monitor.py`
   - examples that proved reusable here:
     - `generate_close_check_context(...)`
     - `generate_monday_etf_check_context(...)`
2. **Task-specific builder** when the task has distinct responsibility
   - example:
     - `build_monday_etf_check_context(...)`
3. **Thin profile script wrapper** under `~/.hermes/profiles/<profile>/scripts/`
   - examples:
     - `close_price_check_context.py`
     - `monday_etf_check_context.py`

Why this matters:

- a task may appear “mostly done” because a lower-level builder already exists, but if there is no top-level `generate_*_context(...)`, the cron-attached script cannot cleanly reuse it
- `收盘检查` and `周一 ETF 检查` should reuse the same config files as `早盘检查`:
  - `portfolio.json`
  - `watchlist.json`
  - `risk_rules.json`
- job migration is not complete until the cron job itself is updated to point at the new thin script

### Reusable code lesson

If multiple jobs need the same watchlist opportunity judgment, extract it into a helper rather than re-embedding regex/threshold logic inside each task builder.

A reusable pattern that worked here was:

- `parse_numeric_hints(...)`
- `summarize_watch_opportunity(...)`

Use these helpers for:

- `收盘价格检查`
- `周一 ETF 定投检查`
- future watchlist-aware jobs

This keeps opportunity labels consistent, such as:

- `可重点跟踪`
- `接近观察区`
- `仍偏高`
- `仅观察不出手`
- `数据暂缺`

### Step 5: reuse config, not prose

If two jobs need the same holdings data, both should read the same profile config.
Do not duplicate holdings descriptions inside multiple prompts.

## Reusable pattern for 早盘价格检查 / open-check jobs

When migrating a morning check from a generic market-summary cron into the formal investment system, use a **dedicated open-check context** rather than reusing the full intraday monitor context unchanged.

### Why

早盘价格检查 has a different responsibility from 盘中监控:

- it should judge whether the open is stronger/weaker than expected
- it should surface only the most relevant 3-5 directions
- it should call out red/yellow triggers and obvious early moves
- it should give a short rhythm judgement, not a full holdings dashboard

### Implementation pattern that worked

1. Keep shared quote/config helpers in the repo module, e.g. `cron/investment_monitor.py`.
2. Add a **separate generator** for the morning task, for example:
   - `generate_open_check_context(...)`
   - `build_open_check_context(...)`
3. Load not only `portfolio.json`, but also:
   - `watchlist.json`
   - `risk_rules.json`
4. Merge data sources into a ranked morning focus list:
   - current holdings
   - watchlist items
   - execution-priority items from risk rules
5. Deduplicate the focus list by `name` before truncating to 3-5 items.
   - This matters because the same symbol may appear in both holdings and watchlist.
6. Attach a thin script wrapper dedicated to the morning job, for example:
   - `~/.hermes/profiles/<profile>/scripts/open_price_check_context.py`

### Fields worth computing for open-check context

Useful morning-specific fields include:

- index `open_gap_pct`
- `market_style` such as `偏强开局 / 偏弱开局 / 分化开局`
- `market_phase` such as `集合竞价检查 / 开盘初段检查`
- holding alert level using red/yellow/watch/green
- early move alerts for names with notable opening weakness/strength
- `focus_items` already sorted for the card layer

### Prompt rule for morning jobs

Encode the morning job's scope explicitly:

- only output during the intended morning window, otherwise `[SILENT]`
- inside the window, do **not** silence just because the market is calm
- distinguish it from:
  - 盘前长报告
  - 盘中全量持仓监控
- output should be short, judgment-first, and suitable for quick chat reading

A practical timing rule that worked here was:

- workday only
- Beijing time roughly `09:20-09:35`
- otherwise `[SILENT]`

### Verification pattern for time-gated jobs

For jobs that normally silence outside a narrow time window:

1. keep the production prompt's time gate
2. create a **one-off verification job** that temporarily ignores the time gate
3. use the same script and nearly the same card structure
4. run the job and force a scheduler tick
5. inspect the output file and only then trust the production update

This avoids the false impression that the task is broken when it is actually just respecting `[SILENT]`.

### Diagnosis rule when the user says "没看到"

For time-gated investment cron jobs, first distinguish **silent suppression** from **delivery failure**.

Use this sequence:

1. check the job metadata:
   - `last_status`
   - `last_delivery_error`
   - `last_run_at`
2. inspect the newest output file under:
   - `~/.hermes/profiles/<profile>/cron/output/<job_id>/`
3. read the final `## Response` section, not just the injected script data
4. compare the run timestamp with the prompt's allowed time window

A real failure pattern from this setup:

- job `last_status` was `ok`
- `last_delivery_error` was `null`
- but the final response was exactly `[SILENT]`
- so the user saw nothing even though transport was healthy

Practical conclusion:

- if `## Response` is `[SILENT]`, treat it as a **prompt/time-window outcome**, not a Feishu delivery bug
- do not start changing card templates or transport code until this check is done
- if you need user-visible validation outside the production window, use a separate one-off verification job that explicitly disables the time gate

## Minimum verification checklist

Before considering a cron migration done:

- [ ] Job still exists and is enabled as intended
- [ ] Prompt matches the task's distinct responsibility
- [ ] Any required script is attached to the job
- [ ] Config is read from `portfolio.json`
- [ ] No holdings are secretly hard-coded in the script or prompt
- [ ] Output uses real data or clearly marks missing data
- [ ] Feishu rendering path matches the intended card type

## Deterministic rendering rule for the first four investment monitoring jobs

For these four production jobs in 阿布's setup:

- `早盘价格检查`
- `盘中实时监控`
- `收盘价格检查`
- `周一 ETF 定投检查`

use a stronger default than prompt-only card generation:

- let scripts continue to inject real market/context JSON
- let the model produce only summary text if needed
- but build the **final Feishu card structure in code**, not in the model output

### Why this change became necessary

Live iteration showed that even a "fixed" prompt template is still unstable if the model is responsible for emitting the final Feishu card JSON. Repeated failures included:

- raw JSON strings rendered in Feishu chat instead of a card
- parse failures such as `Expecting ',' delimiter` and `Extra data`
- schema drift across runs
- disallowed fields such as `table.columns.width`
- mixed `div/body/elements` shapes that looked plausible but failed delivery/rendering

### Practical decision rule

If the user requires **all three** of the following at once:

1. rendered Feishu card in chat
2. real `table` components, not markdown or column-set imitation
3. stable repeatable output across cron runs

then do **not** keep iterating on prompt wording alone.

Instead, patch `cron/scheduler.py` so `_build_feishu_cron_card(...)` routes those jobs through a dedicated deterministic builder, for example an internal helper like:

- `_build_investment_feishu_card(job)`

That builder should:

- read the injected structured context
- assemble schema `2.0` card payloads directly
- create module headings as separate `div` blocks
- create real `table` components in code
- preserve approved section order and title style

### Important side-effect lesson

An intermediate fallback of:

- model outputs markdown only
- Hermes auto-wraps it into a generic Feishu card

is useful for stopping raw JSON strings, but it **drops real tables**. Treat that as a temporary stopgap only.

If the user then says any variant of `表格怎么都丢失了`, the correct fix is to restore tables in the code-built card path, not to add markdown tables back into the prompt.

## Full-flow validation rule for holdings-monitoring jobs

Do not treat a migration as complete just because:

- repo tests passed
- generator functions return JSON
- cron output files were created

For investment cron jobs that emit Feishu interactive cards, those checks only prove that the **data pipeline** works. They do **not** prove the final card payload is stable.

### What full validation must cover

For each task in the first batch (`早盘价格检查`, `盘中实时监控`, `收盘价格检查`, `周一ETF定投检查`), validate the full chain:

1. create a **one-off verification cron job**
2. keep the same script as production
3. copy the production prompt, but add one top-priority override:
   - ignore time window
   - never output `[SILENT]`
4. manually `run` the job
5. force a scheduler tick
6. confirm an output file exists under:
   - `~/.hermes/profiles/<profile>/cron/output/<job_id>/`
7. inspect the final `## Response` payload, not just the script output section

### Practical lesson from this setup

A task can appear “done” while still failing the real acceptance bar:

- the script ran correctly
- the LLM produced something card-like
- but the final response still contained invalid or unstable Feishu card JSON

Observed failure modes worth checking explicitly:

1. **response JSON is not parseable**
   - examples seen here:
     - `Expecting ',' delimiter`
     - `Extra data`
2. **response JSON parses, but still contains disallowed / unstable fields**
   - especially `table.columns.width`
3. **response JSON uses loose or mixed card structure** instead of a stable Card 2.0 body
   - for example ad-hoc `div.content` shapes or inconsistent `body/elements` layout

### Decision rule after full-flow validation

- If cron ran and wrote an output file, but the final `## Response` payload is invalid JSON or contains disallowed Feishu fields, the migration is **not complete**.
- In that case, record the status as: architecture/data migration complete, but **card stabilization still pending**.

### Recommended acceptance bar

Only mark a holdings-monitoring cron job as truly complete when all of the following are true:

- one-off validation job executed end-to-end
- final `## Response` payload parses as JSON
- payload is a valid Feishu interactive card shape
- no `note`
- no `width` in table columns
- structure uses stable Card 2.0 sections/body layout
- output still reflects injected real data rather than fabricated values

## Good default paths for this setup

- Config: `/root/.hermes/profiles/wealth/data/investment/portfolio.json`
- Thin scripts: `/root/.hermes/profiles/wealth/scripts/`
- Reusable repo logic: `/root/.hermes/hermes-agent/cron/`

## New stability rule: lock approved card templates in code and tests

When a Feishu investment card has already been approved by the user, do not rely on verbal discipline alone. Add an explicit **template lock** in code and a matching regression test.

### Why this became necessary

A real regression happened here after the official 盘中监控 card had already been fixed:

- debugging work temporarily replaced the approved native-table template with a compatibility layout
- the user correctly objected because the official template had already been agreed and should not have drifted
- restoring the old template fixed the visible issue, but trust required a stronger guardrail than "it's fixed now"

### Reusable prevention pattern

For approved investment cards in `cron/scheduler.py`:

1. keep the official production builder path deterministic in code
2. wrap the return value with a validator such as:
   - `_assert_investment_card_lock("monitor", card)`
3. have that validator fail fast if the approved structure changes

Typical lock assertions for a monitor card:

- schema must stay `2.0`
- expected number of `table` blocks must remain present
- required section titles must remain present
- forbidden title decorations like `【】` must remain absent

### Required regression tests

Add targeted tests in `tests/cron/test_scheduler.py` for both:

1. **negative lock test**
   - a malformed card missing the required tables must raise `ValueError`
2. **builder snapshot-structure test**
   - the real builder output must still contain the expected tables and section titles

A practical pattern that worked here was:

- `test_monitor_lock_rejects_missing_tables`
- `test_monitor_builder_keeps_locked_table_template`

### Debugging discipline rule

Once the user-approved official template is in production:

- do **not** change the official template shape during diagnosis
- if you need experiments, send them as isolated verification cards only
- keep the production template path "locked"
- only merge a structural change after explicit user approval
- if the user says the template is now "fixed", treat that as a hard freeze across all sibling investment jobs, not just the one currently under review

This is especially important for 阿布's Feishu investment cards because the user cares about:

### Template-completeness rule

When the deterministic builder in `cron/scheduler.py` becomes the source of truth, do not assume it still contains every approved module just because tables render correctly.

Re-check the formal builder against the approved task scope and the cron prompt in `~/.hermes/profiles/<profile>/cron/jobs.json`.

A practical failure seen here:

- monitor tables were correct again
- but the formal builder had drifted and was missing the `💡 操作建议` module content the user expected
- the fix was to restore the missing module in the deterministic builder and then re-run a real delivery test

Use this rule for any approved investment card:

- verify section list, not just table count
- verify decision/action modules still exist
- verify any market-summary module still has enough non-table context, not only the table itself

### Revalidation rule for sibling investment jobs

When one approved investment template is repaired or frozen, re-test the other formal investment jobs one by one instead of assuming they are fine.

For this setup, the sibling jobs are:

- `早盘价格检查`
- `收盘价格检查`
- `周一 ETF 定投检查`

Recommended verification sequence:

1. build each deterministic card individually with `_build_investment_feishu_card(job)`
2. record:
   - header title
   - table count
   - section titles
   - whether forbidden brackets `【】` reappeared
3. send each formal job individually through `_deliver_result(...)`
4. require `delivery_error: null`

Important practical lesson:

- bulk multi-job verification in one Python loop can hang or time out because each delivery may perform live network work
- when that happens, switch to one-job-per-run verification instead of treating the timeout as proof of a card problem

This is especially important for 阿布's Feishu investment cards because the user cares about:

- exact rendered structure
- real table presence
- consistent section emphasis
- no surprise formatting drift between runs

## Quote-source stability rule for intraday monitoring

When an approved investment card suddenly starts showing widespread `—` / `数据暂缺` while the cron job is still running, investigate the **quote source** before touching the template.

### Symptom pattern that mattered here

A real production failure looked like this:

- scheduled Feishu card still delivered
- approved table/template structure was intact
- but many live fields were blank or partially missing
- `last_run_at` kept advancing, so the job itself was not obviously stuck

In this situation, do not assume the scheduler or template is the root cause.

### Practical diagnosis sequence

1. confirm the job is still loaded and advancing:
   - check `jobs.json`
   - inspect `last_run_at`
   - manually call `tick(verbose=True)` if needed
2. run the market-data generator directly, for example:
   - `generate_monitor_context()`
3. measure coverage explicitly:
   - how many indices have prices
   - how many holdings have `current`
4. inspect historical cron output files for blank-field patterns
5. only after that decide whether this is:
   - scheduler stale state
   - rendering fallback
   - or quote API instability

### Reusable fix that worked here

The old Eastmoney batch endpoint became flaky in this environment:

- `http://push2.eastmoney.com/api/qt/ulist.np/get`

Observed failure mode:

- intermittent connection aborts / `RemoteDisconnected`
- partial or empty quote batches
- cards rendered, but market data disappeared

A more stable approach was to switch to **per-security** fetching via:

- `https://push2.eastmoney.com/api/qt/stock/get`

Implementation pattern:

1. fetch one `secid` at a time instead of one large batch
2. retry each security independently
3. normalize the returned payload back into the old internal quote shape so downstream code changes stay small
4. if one security fails, do not lose the whole batch

### Important normalization lesson: ETF price scaling differs

After migrating to `stock/get`, ETFs can use a different implicit decimal scale than ordinary stocks.

Failure seen here:

- ETF prices came back 10x too large
- for example `1.103` was initially interpreted as `11.03`

Rule:

- detect ETF-like codes explicitly
- use different price scaling for ETF-like codes versus ordinary stocks
- validate by checking at least two known ETF holdings and two ordinary stock holdings after the migration

### Validation checklist after changing quote endpoints

Do not stop at `py_compile`.

Verify all of the following:

- [ ] `generate_monitor_context()` shows full or improved coverage
- [ ] ETF prices are in the correct magnitude
- [ ] total market value / total pnl are reasonable again
- [ ] rebuilt formal card shows the corrected values
- [ ] no template structure changed during the data-source fix

### New resilience rule: add same-day quote cache fallback for intermittent blanks

If the live source becomes **partially** unreliable rather than fully down, switching endpoints may still be insufficient.
A real follow-up failure here was:

- most runs looked healthy when tested manually
- but the user still saw occasional missing rows/cells in the scheduled Feishu card
- root cause was likely per-security quote fetch intermittency rather than full-job failure

A reusable mitigation that fit this architecture well was to add a **profile-scoped quote cache**:

- path example: `~/.hermes/profiles/<profile>/data/investment/quote_cache.json`
- for this setup: `/root/.hermes/profiles/wealth/data/investment/quote_cache.json`

Implementation pattern:

1. after each successful fetch, save normalized quote data by `secid`
2. store at least:
   - `fetched_at`
   - normalized `quote`
3. on a later run, if a specific `secid` is missing from the fresh response:
   - try the cached quote for that `secid`
   - only accept it if it is **same trading day** and within a short freshness window
4. keep the fallback in the **data layer** (`cron/investment_monitor.py`), not in the card builder
5. still refuse stale data rather than silently serving old quotes forever

A practical TTL that worked here was:

- same day only
- max age about `45 minutes`

Why this is the right compromise:

- reduces noisy partial blanks in scheduled cards
- avoids fabricating prices
- preserves the user's requirement that missing data should not be invented
- keeps template/rendering untouched

### Regression-test rule for quote fallback

When adding quote fallback, add explicit tests for both cases:

1. **recent cache accepted**
   - fresh live fetch missing
   - recent cached quote exists
   - returned quotes should include the cached `secid`
2. **stale cache rejected**
   - cached quote older than the freshness window
   - returned quotes should stay missing rather than use stale data

This prevents future edits from either:

- breaking the fallback silently
- or making it too permissive and hiding stale prices

### Runtime reload lesson

For Hermes investment cron jobs, code patches may not take effect immediately if the gateway/service is a long-lived process.

So after a live-data hotfix:

1. verify the relevant gateway service is active
2. confirm whether a new process/PID is running if a restart/reload occurred
3. do not assume that because local module tests pass, the scheduled delivery path is already using the new code

## Anti-patterns to avoid

- changing both template and data model at the same time
- hard-coding holdings in prompt text
- letting multiple morning jobs repeat the same content
- using fake or static example prices in live reminders
- editing the approved intraday card structure without a concrete user request

## Expected user preference in this setup

阿布 prefers:

- rendered Feishu cards, not raw JSON
- stable templates once approved
- stronger module titles and clearer emphasis
- module titles should drop the decorative brackets `【】`; prefer forms like `**🌐 开盘概览**`
- real computed market data
- when upstream market fields are missing, show `—` explicitly instead of misleading placeholders like `0.00亿`
- config-driven holdings updates instead of repeated prompt surgery

## Data-formatting lessons from live investment-card debugging

After the deterministic Feishu table-card path was stabilized, two additional UI/data issues showed up in live review and should be preserved as defaults for future maintenance.

### 1. Distinguish missing market data from real zero values

For Eastmoney quote fields used in these jobs, some index fields can legitimately come back as `"-"`, especially:

- turnover / amount fields such as `f6`
- open/high/low fields such as `f17`, `f15`, `f16`

Do **not** coerce those missing fields into `0` and then display values like:

- `0.00亿`
- `0.00%`

Instead:

- keep missing values as `None`
- render them as `—`
- for aggregate summaries such as `total_turnover_yi`, only sum and display a numeric value if at least one upstream turnover field was actually present

A good pattern is to track a boolean like `has_turnover_data` while aggregating. If no usable turnover data exists, summary output should remain `None` so the card layer renders `—`.

### 2. Do not double-scale percentage values in the scheduler card layer

The investment context builders in `cron/investment_monitor.py` already normalize percentage fields (for example `pct`, `day_pct`, `distance_to_target_pct`) into human percent units such as:

- `0.09` meaning `0.09%`
- `1.36` meaning `1.36%`

Therefore the deterministic Feishu card formatter in `cron/scheduler.py` must **not** apply another `* 100` heuristic for values with absolute magnitude `<= 1`.

Why this matters:

- a naive formatter turned `0.09` into `+9.00%`
- this created false signals in holdings tables and ETF rhythm checks

Rule:

- if the upstream investment context already emits percentage units, `_fmt_pct(...)` should format the number directly
- scaling belongs in the data-generation layer, not in the generic card-rendering layer

### 3. Title-emphasis rule for deterministic investment cards

When adjusting section-title emphasis in the deterministic card builder:

- keep titles as their own `div` blocks above the related table
- use strong markdown emphasis like `**🌐 开盘概览**`
- remove decorative brackets around the title text
- place summary text on the next line under the title when present

This keeps titles visually stronger without changing the approved table structure.
