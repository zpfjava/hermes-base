---
name: fastapi-ai-mvp
description: Minimal FastAPI + DeepSeek multi-agent product template. Use when building a simple AI-powered web tool with activation code monetization. Covers parallel agent pattern, frontend, and card-based activation code management.
version: 1.0.0
author: Hermes Agent
metadata:
  hermes:
    tags: [fastapi, deepseek, multi-agent, mvp, monetization, activation-code]
---

# FastAPI AI MVP Template

Minimal stack for a sellable AI web tool:
- FastAPI backend with parallel agent calls
- Single-file HTML frontend (mobile-friendly)
- Activation code monetization (file-based, no DB needed)
- DeepSeek API (cheapest LLM option)

## Project Structure

```
project/
  main.py          # FastAPI app + agent logic
  templates/
    index.html     # Single-page frontend
  requirements.txt
  .env
  codes.txt        # Activation codes (one per line)
```

## Parallel Agent Pattern

Run multiple LLM calls concurrently with asyncio.gather:

```python
from openai import AsyncOpenAI
import asyncio

client = AsyncOpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

async def agent_a(input): ...
async def agent_b(input): ...
async def agent_c(input): ...

# Sequential when B depends on A:
result_a = await agent_a(input)
result_b, result_c = await asyncio.gather(agent_b(result_a), agent_c(result_a))
```

## Activation Code System

File-based, zero dependencies:

```python
CODES_FILE = "codes.txt"

def load_codes():
    if not os.path.exists(CODES_FILE): return set()
    with open(CODES_FILE) as f:
        return set(line.strip() for line in f if line.strip())

def use_code(code):
    codes = load_codes()
    if code not in codes: return False
    codes.remove(code)
    with open(CODES_FILE, "w") as f: f.write("\n".join(codes))
    return True

def add_codes(new_codes: list):
    codes = load_codes()
    codes.update(new_codes)
    with open(CODES_FILE, "w") as f: f.write("\n".join(codes))
```

Admin endpoint to add codes after sales:
```python
@app.post("/admin/add-codes")
async def add_codes_api(req: AddCodesRequest):
    if req.admin_key != os.environ.get("ADMIN_KEY"): raise HTTPException(403)
    add_codes(req.codes)
    return {"added": len(req.codes)}
```

## requirements.txt

```
fastapi
uvicorn
openai
python-multipart
```

## .env

```
DEEPSEEK_API_KEY=sk-...
ADMIN_KEY=your_admin_password
```

## Run

```bash
pip install -r requirements.txt
DEEPSEEK_API_KEY=sk-... uvicorn main:app --host 0.0.0.0 --port 8899
```

## Monetization Flow

1. Set up a card-selling platform (发卡网, 兔兔发卡, etc.)
2. Each sale triggers delivery of one activation code
3. Add new codes via POST /admin/add-codes
4. Each code is single-use (consumed on first successful generation)

## Pitfalls

- DeepSeek base_url must be set: `https://api.deepseek.com`
- Use `AsyncOpenAI` not `OpenAI` for async FastAPI routes
- codes.txt must exist before first request (create empty file or seed with test codes)
- For production: move codes to Redis or SQLite to avoid race conditions under load
