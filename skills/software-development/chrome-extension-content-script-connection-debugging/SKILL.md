---
name: chrome-extension-content-script-connection-debugging
description: Debug Chrome/Chromium extension popup-to-content-script messaging failures, especially `Could not establish connection. Receiving end does not exist.`
version: 1.0.0
author: Hermes Agent
license: MIT
---

# Chrome Extension Content Script Connection Debugging

Use when a Chrome/Chromium extension loads successfully, but clicking the popup action fails with errors like:
- `Could not establish connection. Receiving end does not exist.`
- popup UI shows a conversion/action failure even though the extension installed correctly
- `chrome.tabs.sendMessage(...)` rejects because no content script is listening

## Root cause pattern

This usually means the popup/background script tried to message the active tab, but **the target page has no loaded content script listener**.

Common reasons:
1. The page was already open **before** the extension was installed or reloaded.
2. The page URL does not match the manifest `content_scripts.matches` rules.
3. The user is not on a supported article/detail page.
4. The extension relies on static content script injection only, with **no runtime fallback**.

## Investigation steps

1. **Read the exact runtime error**
   - Do not guess.
   - If the error is `Receiving end does not exist`, start by assuming the message target has no listener.

2. **Inspect the extension files**
   - Read at least:
     - `manifest.json`
     - popup script (often `popup.js`)
     - content script (often `content.js`)
   - Confirm whether:
     - `manifest.json` contains a `content_scripts` section
     - popup code uses `chrome.tabs.sendMessage(...)`
     - content script registers `chrome.runtime.onMessage.addListener(...)`

3. **Check supported URL patterns**
   - Compare `manifest.json > content_scripts.matches` to the user’s actual site.
   - If the page host/path is unsupported, report that directly.

4. **Check whether the page must be refreshed**
   - If the user installed/reloaded the extension while the tab was already open, the simplest fix is often:
     - refresh the article page
     - then retry the popup action

5. **Add a runtime fallback when appropriate**
   - If popup messaging can fail because the content script was not injected, add a fallback using `chrome.scripting.executeScript(...)`.
   - This requires the `scripting` permission in `manifest.json`.

## Safe repair pattern

### 1. Add `scripting` permission

```json
{
  "permissions": ["activeTab", "storage", "scripting"]
}
```

### 2. In popup code, retry after injecting the content script

Pattern:

```javascript
async function sendMessage(tabId, payload) {
  return await chrome.tabs.sendMessage(tabId, payload);
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

let response;
try {
  response = await sendMessage(tab.id, {
    action: 'convertArticle',
    format: currentFormat
  });
} catch (error) {
  if (error.message && error.message.includes('Receiving end does not exist')) {
    await ensureContentScript(tab.id);
    response = await sendMessage(tab.id, {
      action: 'convertArticle',
      format: currentFormat
    });
  } else {
    throw error;
  }
}
```

### 3. Validate the active page before sending

If the extension only supports certain sites, check `tab.url` first and return a human-readable error instead of a low-level Chrome error.

Example approach:
- maintain a small host allowlist
- if current URL is unsupported, show: 
  `当前页面不受支持，请在微信公众号、知乎、简书、CSDN 或掘金文章页使用`

## User instructions after repair

Always tell the user to:
1. remove/reload the old unpacked extension
2. load the new unpacked folder
3. **refresh the target article page**
4. retry the popup action

Without refreshing the page, a statically declared content script may still not be present on the already-open tab.

## Pitfalls

- Chrome loads **unpacked folders**, not zip files.
- Even with a correct manifest, popup-to-tab messaging still fails if the tab has no listener.
- `content_scripts.matches` may include the domain broadly, but the extractor logic may still only work on specific article pages.
- Do not assume the popup error means the extraction logic is broken; often the problem is just missing injection.
- If you add `chrome.scripting.executeScript`, remember to also add the `scripting` permission.

## Verification checklist

- [ ] Runtime error captured verbatim
- [ ] `manifest.json`, popup script, and content script inspected
- [ ] `content_scripts.matches` checked against user’s actual page
- [ ] Confirmed `chrome.runtime.onMessage.addListener(...)` exists in content script
- [ ] Added `scripting` permission if using runtime injection
- [ ] Popup retries after dynamic injection on `Receiving end does not exist`
- [ ] User told to refresh the target page after reinstall/reload
