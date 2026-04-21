---
name: feishu-doc-create
description: Create Feishu (Lark) documents from Markdown using the Drive import API. Use when publishing content to Feishu docs programmatically.
---

# Feishu Document Creation from Markdown

## Key Finding

**Do NOT use the docx blocks API** — `POST /docx/v1/documents/{doc_id}/blocks/{block_id}/children` returns `1770001 invalid param` consistently, even with minimal payloads. The block format is extremely finicky and underdocumented.

**Use the Drive upload + import task flow instead.** Reliable, handles Markdown natively, ~3 seconds total.

## Credentials

Read app credentials from the Hermes env file. App must have scopes: `drive:drive`, `docx:document`.

## Workflow (4 steps)

### 1. Get tenant_access_token

```
POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
Body: {"app_id": "...", "app_secret": "..."}
Response: {"tenant_access_token": "t-xxx", ...}
```

### 2. Upload Markdown file to Drive

```
POST https://open.feishu.cn/open-apis/drive/v1/files/upload_all
Authorization: Bearer {token}
Form fields:
  file_name = article.md
  parent_type = explorer
  parent_node = (empty string)
  size = {file_size_bytes}
  file = @/path/to/file.md  (type=text/markdown)
Response: {"data": {"file_token": "Xxx..."}}
```

### 3. Create import task

```
POST https://open.feishu.cn/open-apis/drive/v1/import_tasks
Authorization: Bearer {token}
Body:
{
  "file_extension": "md",
  "file_token": "{file_token}",
  "type": "docx",
  "file_name": "文档标题",
  "point": {
    "mount_type": 1,    // 1 = bot own space; 2 = wiki node
    "mount_key": ""     // wiki node token if mount_type=2
  }
}
Response: {"data": {"ticket": "763xxx"}}
```

### 4. Poll for completion

```
GET https://open.feishu.cn/open-apis/drive/v1/import_tasks/{ticket}
Authorization: Bearer {token}

Poll every 2s. Check result.job_status:
  0 = success  → result.url = "https://my.feishu.cn/docx/Xxx"
  1 = initializing
  2 = processing
  other = error (check result.job_error_msg)
```

## Notes

- The resulting doc URL is `https://my.feishu.cn/docx/{token}` — share this with the user.
- Markdown headings, bold, code blocks, and lists are all preserved by the import.
- After import, verify with `feishu_doc_read(doc_token)` if needed.
- To place doc in a wiki/shared space: `mount_type: 2`, `mount_key: {wiki_node_token}`.

## Troubleshooting and real-world findings

### 1) `10014 app secret invalid`

If tenant token creation succeeds for some apps but fails for the app you expected to use, do **not** assume Feishu is down.

Common real-world cause: after migration or profile cloning, the credentials in `~/.hermes/profiles/<profile>/.env` are stale or overwritten, while the original source config still has valid credentials.

Practical fallback order:
1. Try the intended Hermes profile `.env`
2. If it returns `10014`, check other profile `.env` files
3. If those are stale too, check the original migration source (for example `/root/.openclaw/openclaw.json` under `channels.feishu.accounts.*`)

### 2) Token works, but upload fails with `99991672 Access denied`

This means the app can authenticate, but does **not** have required Drive scopes. Token success alone does **not** prove the app can create docs.

Typical error message mentions one of these missing scopes:
- `drive:drive`
- `drive:file`
- `drive:file:upload`

Action:
- Test `upload_all` against candidate apps and pick one that actually has Drive permission
- Do not keep retrying the same app if token is OK but upload is denied

### 3) In multi-bot / multi-app setups, not every Feishu app is equal

When several Feishu apps exist in one workspace, some may only be provisioned for messaging while others also have Drive/doc permissions.

Recommended strategy:
1. Enumerate candidate app credentials
2. Verify token acquisition
3. Verify `drive/v1/files/upload_all`
4. Only then create the import task

This avoids wasting time on apps that can chat but cannot create documents.
