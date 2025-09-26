# Form Tamer — Fix broken `pattern="/…/"` and (optionally) disable HTML5 validation

A lightweight **Chrome/Edge MV3** extension that fixes common front‑end mistakes in forms:

- Converts invalid HTML `pattern="/…/"` (JS-style) into a valid **HTML5 pattern** (`…` without slashes).
- Optional: disables native **HTML5 validation** on the page (required/pattern/min/max/maxlength/step), so you can submit a form and let the backend decide.
- Works on dynamically injected inputs (React/Angular/Vue, etc.) via `MutationObserver`.
- **No data leaves your device.** Uses only `chrome.storage.sync` for local settings.

> ✅ Great for cases like LinkedIn field validation bugs (e.g., the form expects `https://www.linkedin.com/in/...` but is broken by `/…/` pattern).


---

## TL;DR — Quick Start

1. Create a folder, e.g. `form-tamer/`.
2. Put **four files** inside (see below): `manifest.json`, `content.js`, `popup.html`, `popup.js`.
3. Open `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → pick the folder.
4. Click the toolbar icon → keep **Enabled** and **Fix pattern “/…/”** ON.  
   Toggle **Disable HTML5 validation** only when a form keeps blocking submission.

> If you don’t have icons, **remove the `"icons"` field** from `manifest.json` (or add valid icon files).


---

## Files

```
form-tamer/
├─ manifest.json
├─ content.js
├─ popup.html
└─ popup.js
```

### `manifest.json` (MV3)
> Includes `all_frames: true` so it also works in iframes (e.g., embedded job forms).  
> If you don’t ship icons yet, remove the `"icons"` block entirely.

```json
{
  "manifest_version": 3,
  "name": "Form Tamer: fix broken patterns & disable validation",
  "description": "Правит pattern=\"/…/\" на сайтах и позволяет отключать HTML5-валидацию одним кликом.",
  "version": "1.0.0",
  "permissions": ["storage"],
  "action": {
    "default_title": "Form Tamer",
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "all_frames": true,
      "run_at": "document_idle"
    }
  ]
}
```

> **Edge**: same steps via `edge://extensions/` → “Load unpacked”.


### `content.js`

```js
(() => {
  const STATE_KEY = "formtamer_state"; // { enabled, fixPatterns, killValidation }

  // --- storage utils
  const getState = () =>
    new Promise(resolve => {
      chrome.storage?.sync?.get(STATE_KEY, (res) => {
        const def = { enabled: true, fixPatterns: true, killValidation: false };
        resolve(res?.[STATE_KEY] ? { ...def, ...res[STATE_KEY] } : def);
      });
    });

  const setState = (patch) =>
    new Promise(resolve => {
      getState().then(state => {
        const next = { ...state, ...patch };
        chrome.storage?.sync?.set({ [STATE_KEY]: next }, () => resolve(next));
      });
    });

  // --- core
  function stripJsSlashes(pattern) {
    // HTML pattern must be a *bare* regex without enclosing slashes.
    if (typeof pattern !== "string") return pattern;
    if (pattern.length >= 2 && pattern.startsWith("/") && pattern.endsWith("/")) {
      return pattern.slice(1, -1);
    }
    return pattern;
  }

  function fixInputPatterns(root = document) {
    const inputs = root.querySelectorAll("input[pattern], textarea[pattern], input[data-pattern], textarea[data-pattern]");
    for (const el of inputs) {
      const attr = el.getAttribute("pattern");
      if (attr) {
        const fixed = stripJsSlashes(attr);
        if (fixed !== attr) {
          el.setAttribute("pattern", fixed);
          el.dataset.formTamerFixed = "pattern";
        }
      }
      const dataAttr = el.getAttribute("data-pattern");
      if (dataAttr) {
        const fixed = stripJsSlashes(dataAttr);
        if (fixed !== dataAttr) {
          el.setAttribute("data-pattern", fixed);
          el.dataset.formTamerFixed = "pattern";
        }
      }
    }
  }

  function killValidation(root = document) {
    // Disable native HTML5 validation to avoid client-side blockers.
    const forms = root.querySelectorAll("form");
    forms.forEach(f => {
      f.setAttribute("novalidate", "novalidate");
      f.dataset.formTamerFixed = "novalidate";
    });

    const inputs = root.querySelectorAll("input, textarea, select");
    inputs.forEach(el => {
      if (el.hasAttribute("required")) el.removeAttribute("required");
      ["pattern","min","max","maxlength","minlength","step"].forEach(a => el.removeAttribute(a));
      try { el.setCustomValidity && el.setCustomValidity(""); } catch {}
      el.addEventListener("invalid", (e) => { e.preventDefault(); }, true);
    });
  }

  let observer = null;

  async function apply(root = document) {
    const state = await getState();
    if (!state.enabled) return;

    if (state.fixPatterns) fixInputPatterns(root);
    if (state.killValidation) killValidation(root);

    if (!observer) {
      observer = new MutationObserver(() => {
        if (state.fixPatterns) fixInputPatterns(document);
        if (state.killValidation) killValidation(document);
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  }

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "sync" && changes[STATE_KEY]) apply();
  });

  apply();

  // Handy API for DevTools
  window.FormTamer = {
    async state() { return await getState(); },
    async toggleEnabled(v) { return await setState({ enabled: !!v }); },
    async toggleFixPatterns(v) { return await setState({ fixPatterns: !!v }); },
    async toggleKillValidation(v) { return await setState({ killValidation: !!v }); },
    runFixNow() { fixInputPatterns(document); },
    runKillNow() { killValidation(document); }
  };
})();
```

### `popup.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Form Tamer</title>
    <style>
      body { font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; min-width: 280px; padding: 12px; }
      .row { display: flex; align-items: center; justify-content: space-between; margin: 8px 0; }
      label { display: flex; gap: 8px; align-items: center; }
      .hint { color: #666; font-size: 12px; margin-top: 8px; }
      .sep { height: 1px; background: #ddd; margin: 10px 0; }
      button { padding: 6px 10px; border: 1px solid #ccc; background: #f9f9f9; cursor: pointer; border-radius: 6px; }
      button:hover { background: #f1f1f1; }
    </style>
  </head>
  <body>
    <h3>Form Tamer</h3>

    <div class="row">
      <label><input type="checkbox" id="enabled"> Enabled</label>
      <button id="applyNow">Apply now</button>
    </div>

    <div class="sep"></div>

    <div class="row">
      <label><input type="checkbox" id="fixPatterns"> Fix pattern “/…/”</label>
    </div>

    <div class="row">
      <label><input type="checkbox" id="killValidation"> Disable HTML5 validation</label>
    </div>

    <p class="hint">Работает на всех сайтах. Ничего никуда не отправляет.</p>

    <script src="popup.js"></script>
  </body>
</html>
```

### `popup.js`

```js
const STATE_KEY = "formtamer_state";

function getState() {
  return new Promise(resolve => {
    chrome.storage.sync.get(STATE_KEY, res => {
      const def = { enabled: true, fixPatterns: true, killValidation: false };
      resolve(res?.[STATE_KEY] ? { ...def, ...res[STATE_KEY] } : def);
    });
  });
}

function setState(patch) {
  return new Promise(resolve => {
    getState().then(state => {
      const next = { ...state, ...patch };
      chrome.storage.sync.set({ [STATE_KEY]: next }, () => resolve(next));
    });
  });
}

async function init() {
  const enabled = document.getElementById("enabled");
  const fixPatterns = document.getElementById("fixPatterns");
  const killValidation = document.getElementById("killValidation");
  const applyNow = document.getElementById("applyNow");

  const state = await getState();
  enabled.checked = !!state.enabled;
  fixPatterns.checked = !!state.fixPatterns;
  killValidation.checked = !!state.killValidation;

  enabled.addEventListener("change", async () => { await setState({ enabled: enabled.checked }); });
  fixPatterns.addEventListener("change", async () => { await setState({ fixPatterns: fixPatterns.checked }); });
  killValidation.addEventListener("change", async () => { await setState({ killValidation: killValidation.checked }); });

  applyNow.addEventListener("click", async () => {
    await setState({ __ping: Date.now() }); // retrigger content script
    window.close();
  });
}

init();
```


---

## Usage

1. Open any broken form (e.g., input with `pattern="/https:\/\/www.linkedin.com\/in\/.*/"`).
2. Keep **Fix pattern “/…/”** ON — the extension will rewrite the pattern to a valid HTML one in place.
3. If the site still blocks submit (framework-level validators), enable **Disable HTML5 validation** and try again.
4. For dynamic forms, the extension will keep watching the DOM and re-apply fixes automatically.

**DevTools helpers:**  
- `FormTamer.state()` – show current settings.  
- `FormTamer.toggleKillValidation(true)` – switch at runtime.  
- `FormTamer.runFixNow()` – force a re-scan.


---

## Troubleshooting (read this if it “breaks in your browser”)

- **Extension fails to load (manifest error):**  
  Remove the `"icons"` block or provide valid icon files (16/32/48/128). Icons are optional; an empty object is **not** valid.

- **Doesn’t affect embedded forms (iframes):**  
  Ensure you used the manifest here with `"all_frames": true`. Reload the extension after changes.

- **Nothing changes on the page:**  
  - Click the extension icon → toggle **Enabled** OFF/ON.  
  - Open DevTools → Console → run `FormTamer.state()` — verify `enabled: true`.  
  - Hard reload the page (Ctrl+Shift+R). Some SPAs cache inputs.

- **Site still blocks submit after fixes:**  
  Turn on **Disable HTML5 validation** — frameworks may use custom validators that ignore the HTML `pattern` attribute.

- **Performance concerns on very heavy pages:**  
  If you notice slowdowns, disable the extension on that page by toggling **Enabled** off temporarily. (We use a single `MutationObserver` with simple checks.)

- **Corporate/locked-down environments:**  
  Some managed profiles restrict loading unpacked extensions. Use a personal profile or ask IT to allow developer mode.

- **Privacy note:**  
  No network requests, no data collection. Settings are stored locally via `chrome.storage.sync`.

- **Edge / Chrome differences:**  
  Behavior is identical. Use `edge://extensions/` for loading unpacked in Edge.

## Changelog
- **1.0.0** — Initial release (MV3), fixes `/…/` pattern, optional HTML5 validation disable, iframe support.


---

## License
MIT — do whatever you want, but no warranty.
