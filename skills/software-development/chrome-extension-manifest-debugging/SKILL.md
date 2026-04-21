---
name: chrome-extension-manifest-debugging
description: Debug Chrome/Chromium extension load failures caused by manifest/package mismatches, especially missing icon files referenced in manifest.json.
version: 1.0.0
author: Hermes Agent
license: MIT
---

# Chrome Extension Manifest Debugging

Use when a Chrome/Chromium extension fails to load with errors like:
- `Could not load icon 'icons/icon16.png' specified in 'icons'.`
- `无法加载清单`
- manifest parses, but extension load fails due to missing packaged assets.

## Goal
Find whether `manifest.json` references files that are not actually present in the unpacked folder or zip package, then repair the package with the smallest safe change.

## Steps

1. **Read the exact Chrome error message**
   - Do not guess.
   - If the error names a file path from `icons`, `action.default_icon`, `background.service_worker`, `content_scripts`, etc., treat that path as the first investigation target.

2. **Inspect the extension package contents**
   - For a zip package, list files first:
     ```bash
     unzip -l /path/to/extension.zip
     ```
   - If needed, read `manifest.json` directly from the archive:
     ```bash
     python - <<'PY'
     import zipfile
     zf = zipfile.ZipFile('/path/to/extension.zip')
     print(zf.read('manifest.json').decode())
     PY
     ```

3. **Compare manifest references against actual files**
   - Common mismatch: manifest references `icons/icon16.png`, `icon32.png`, etc., but package only contains `icon.svg`.
   - Check both places:
     - top-level `icons`
     - `action.default_icon`

4. **Fix with the smallest safe patch**
   - If the referenced files do not exist and generating replacements is unnecessary, remove invalid icon references from `manifest.json`.
   - This is often safer/faster than inventing PNG assets on the fly.
   - Preserve the rest of the manifest unchanged.

5. **Repack and verify**
   - Rebuild the zip after editing `manifest.json`.
   - Re-run:
     ```bash
     unzip -l /path/to/fixed.zip
     ```
   - Re-read the final `manifest.json` from the rebuilt archive to confirm the bad references are gone.

## Python repack pattern

Use Python `zipfile` when shell zip/unzip flow is awkward or times out:

```python
import json, pathlib, zipfile, shutil
src = pathlib.Path('/tmp/extension.zip')
out = pathlib.Path('/tmp/extension-fixed.zip')
work = pathlib.Path('/tmp/extension-fixed-work')

if work.exists():
    shutil.rmtree(work)
work.mkdir(parents=True)

with zipfile.ZipFile(src, 'r') as zf:
    zf.extractall(work)

manifest_path = work / 'manifest.json'
data = json.loads(manifest_path.read_text(encoding='utf-8'))

if 'action' in data and isinstance(data['action'], dict):
    data['action'].pop('default_icon', None)
data.pop('icons', None)

manifest_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

if out.exists():
    out.unlink()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(work.rglob('*')):
        if path.is_dir():
            continue
        zf.write(path, path.relative_to(work).as_posix())
```

## Pitfalls

- Chrome loads **unpacked folders**, not zip files. Tell the user to unzip first, then choose the folder in `chrome://extensions/`.
- A zip may contain an `icons/` directory, but Chrome still fails if the exact referenced filenames are missing.
- `icon.svg` does **not** satisfy references to `icon16.png` / `icon32.png` unless the manifest explicitly points to the SVG where supported.
- When time matters, removing invalid icon references is often enough to make the extension load.

## Verification checklist

- [ ] Error message captured verbatim
- [ ] Package file list inspected
- [ ] `manifest.json` inspected from package
- [ ] Missing referenced paths confirmed
- [ ] Manifest patched with minimal change
- [ ] Repacked archive verified
- [ ] User instructed to load the **unzipped folder**, not the zip
