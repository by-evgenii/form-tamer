(() => {
  const STATE_KEY = "formtamer_state"; // { enabled: boolean, fixPatterns: boolean, killValidation: boolean }

  // --- utils
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
    // if the expresions of the pattern ends with '/', ommiting the '/'
    // E.g: "/https:\\/\\/www\\.linkedin\\.com\\/in\\/.*?/" -> "https:\\/\\/www\\.linkedin\\.com\\/in\\/.*?"
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
      // In case for custome storage of a pattern
      const dataAttr = el.getAttribute("data-pattern");
      if (dataAttr) {
        const fixed = stripJsSlashes(dataAttr);
        if (fixed !== dataAttr) {
          el.setAttribute("data-pattern", fixed);
          el.dataset.formTamerFixed = "pattern";
        }
      }
    }

    // Greenhouse/Angular/React some times use pattern on <input> through attribute's props,
    // but simultaniously checking title/aria… — here no go.
  }

  function killValidation(root = document) {
    // Set off native HTML5-validation
    const forms = root.querySelectorAll("form");
    forms.forEach(f => {
      f.setAttribute("novalidate", "novalidate");
      f.dataset.formTamerFixed = "novalidate";
    });

    const inputs = root.querySelectorAll("input, textarea, select");
    inputs.forEach(el => {
      // removing required/maxlength/minlength/min/max/pattern/step
      if (el.hasAttribute("required")) el.removeAttribute("required");
      ["pattern","min","max","maxlength","minlength","step"].forEach(a => {
        if (el.hasAttribute(a)) el.removeAttribute(a);
      });

      // some forms interchange validity through setCustomValidity - nullifying
      try { el.setCustomValidity && el.setCustomValidity(""); } catch {}
      // and on submit
      el.addEventListener("invalid", (e) => { e.preventDefault(); }, true);
    });
  }

  let observer = null;

  async function apply(root = document) {
    const state = await getState();
    if (!state.enabled) return;

    if (state.fixPatterns) fixInputPatterns(root);
    if (state.killValidation) killValidation(root);

    // Monitoring dynamics
    if (!observer) {
      observer = new MutationObserver((muts) => {
        const needsScan = muts.some(m => {
          return [...m.addedNodes].some(n => n.nodeType === 1);
        });
        if (needsScan) {
          if (state.fixPatterns) fixInputPatterns(document);
          if (state.killValidation) killValidation(document);
        }
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  }

  // Listening for changes in popup
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "sync" && changes[STATE_KEY]) {
      apply();
    }
  });

  // Initial run
  apply();

  // Export for quick debug in console:
  // window.FormTamer?.toggleKillValidation(true) и т.п.
  window.FormTamer = {
    async state() { return await getState(); },
    async toggleEnabled(v) { return await setState({ enabled: !!v }); },
    async toggleFixPatterns(v) { return await setState({ fixPatterns: !!v }); },
    async toggleKillValidation(v) { return await setState({ killValidation: !!v }); },
    runFixNow() { fixInputPatterns(document); },
    runKillNow() { killValidation(document); }
  };
})();
