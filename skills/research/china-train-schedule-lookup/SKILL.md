---
name: china-train-schedule-lookup
description: Query Chinese train schedules and ticket prices. Covers which platforms work vs. fail, and how to give accurate estimates when real-time data is unavailable.
version: 1.0.0
metadata:
  tested: 2026-04
  tags: [china, trains, travel, 12306, 高铁]
---

# China Train Schedule Lookup

Query real-time Chinese train schedules and ticket prices. Use when user asks about train routes, travel times, or ticket costs between Chinese cities.

## Platform Reality (tested 2026-04)

Most approaches fail or are blocked. Here's what actually works vs. what doesn't:

### ❌ What Doesn't Work
- **百度搜索** — immediately hits CAPTCHA/bot detection
- **Google** — blocked by bot detection from server IPs
- **Bing** — returns no useful structured content for train queries
- **12306.cn direct API** (`/otn/leftTicket/queryZ`) — times out from non-residential IPs
- **12306.cn web form** — requires JS interaction; form inputs don't trigger search via browser_type alone
- **携程 trains.ctrip.com URL params** — `depCity=安阳&arrCity=厦门` in URL is ignored; page defaults to Shanghai-Beijing; form interaction doesn't reload page
- **高铁网 shike.gaotie.cn** — query URLs use GBK encoding; UTF-8 encoded URLs return 404; search form submits to broken endpoint
- **travelchinaguide.com** — route-specific pages only exist for major city pairs; smaller cities return 404
- **chinahighlights.com** — same limitation

### ✅ What Works

**Option 1: Browser CDP with 携程 (if CDP available)**
If CDP proxy is running, navigate to `https://trains.ctrip.com` manually and use the search form interactively — select cities from the dropdown autocomplete (don't just type and submit).

**Option 2: Knowledge + geography estimation**
For most route questions involving smaller cities, this is the most reliable fallback:
1. Determine if origin city has an airport
2. Identify nearest HSR hub
3. Calculate transfer route: smaller city → HSR hub → destination hub → destination
4. Estimate time and price from benchmarks (see below)

## Key Geography Facts

**Cities without airports (must use train):**
- 安阳 (Anyang) — nearest airport: 郑州 (Zhengzhou, ~1hr HSR)

**Major HSR hubs:**
- North: 北京, 郑州, 武汉
- East: 上海, 南京, 杭州
- South: 广州, 深圳, 长沙
- Southeast coast: 福州, 厦门

**Typical routes from 安阳:**
- 安阳 → 郑州: ~1hr, ~¥50 二等座
- 安阳 → 厦门: via 郑州, total ~7-8hr, ~¥400-500 二等座
- 安阳 → 三亚: 12+ hours, not practical for 3-day trips
- 安阳 → 北海: 10+ hours, not practical for 3-day trips
- 安阳 → 秦皇岛: ~4-5hr via 北京, ~¥200-300 二等座

**Price benchmark:** ~¥0.45/km for 二等座 (second class) as rough estimate

## Recommended Approach

1. Check if origin city has an airport. If not, train is the only option.
2. Identify nearest HSR hub city.
3. Calculate hub-to-destination time + transfer time.
4. Be honest: if you can't verify exact schedules, say so and recommend user check 12306.cn or 携程 app.
5. Never fabricate specific train numbers, exact departure times, or precise prices without a verified source.

## Telling the User

When real-time data is unavailable, be transparent:
> "我无法实时查到具体班次，建议你在12306.cn或携程App上查询。根据路网情况，大概是这样：[估算]"
