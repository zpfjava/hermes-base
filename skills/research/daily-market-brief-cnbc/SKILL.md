---
name: daily-market-brief-cnbc
description: Build a concise daily investment panorama brief using CNBC market pages as primary browser-friendly sources when other finance sites are blocked or empty.
license: MIT
---

# Daily Market Brief via CNBC

Use this when generating a short pre-market or morning investment note covering overnight moves, themes, ETF/sector observation angles, and risk reminders.

## Why this skill
In browser-based collection, some common finance sources can fail or render as empty pages:
- Reuters market pages may load as `reuters.com` with an empty snapshot.
- Yahoo Finance world indices can return an empty page.

CNBC market pages were reliable for quickly extracting:
- major U.S. index closes
- U.S. futures
- Asia index moves
- oil / Brent levels
- U.S. 10Y Treasury yield
- top current market headlines

## Recommended source order
1. `https://www.cnbc.com/markets/`
2. `https://www.cnbc.com/world/?region=world`
3. Relevant CNBC article pages linked from those pages for the day’s dominant theme

Fallback sources can be tried, but do not rely on them as primary browser sources if they render empty.

## Workflow

### 1) Gather overnight U.S. risk tone
Open CNBC Markets.
Capture from the page:
- S&P 500, Nasdaq, Dow close direction
- VIX direction
- headline describing U.S. futures / overnight tone

Good evidence usually appears directly in the Markets page snapshot.

### 2) Check cross-asset risk signals from the same page
Use the market banner tabs on CNBC:
- `PRE-MKT` for U.S. futures
- `OIL` for WTI / Brent
- `BONDS` for U.S. 10Y yield
- `ASIA` or World page banner for Nikkei / Hang Seng / Shanghai tone

These tabs often expose enough structured data in the snapshot without needing deeper scraping.

### 3) Identify the day’s main theme
From CNBC World / Markets headlines, pick 1–2 dominant drivers such as:
- geopolitics / oil
- AI / semis / robotics
- Fed / yields / macro
- China / Hong Kong sentiment
- earnings / leadership transition / sector rotation

Open one relevant article to verify the framing. Prefer article Key Points and first few paragraphs.

### 4) Write the brief in observation language
For investment briefing tasks:
- use “观察 / 关注 / 风险提示” framing
- do not give absolute buy/sell instructions
- do not fabricate exact holdings, cost basis, or P&L
- if including numbers, only use numbers clearly visible from the source page

### 5) Structure
A reliable structure is:
1. 隔夜外围市场要点
2. 今日值得关注的市场主题
3. ETF / 行业 / 持仓观察角度
4. 今日操作关注点或风险提示
5. 一句总结
6. Closing disclaimer: `仅供观察，不构成投资建议`

## Practical notes
- CNBC tab clicks can be used to switch between US / PRE-MKT / OIL / BONDS views.
- After clicking a tab, refresh the snapshot to ensure the selected state is reflected.
- If clicking an in-page link times out, navigate directly to the known CNBC URL instead.
- For short daily briefs, CNBC alone is often sufficient if it provides both cross-asset data and the dominant news catalyst.

## Pitfalls
- Do not claim precision from memory; quote only what was visible in the page snapshot.
- Do not overfit to one headline; cross-check with indices, VIX, oil, and yields.
- If a source page is empty, switch sources quickly instead of repeatedly retrying.

## Verification checklist
Before finalizing:
- U.S. equities tone captured?
- Asia / Hong Kong or global risk tone captured?
- Oil and/or yields checked if geopolitics is relevant?
- Theme phrased as observation, not instruction?
- Disclaimer included?
