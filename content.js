(() => {
  const STATE_KEY = "formtamer_state"; // { enabled, fixPatterns, killValidation, killAggressive }

  // ---------- storage
  const getState = () => new Promise(r => {
    chrome.storage?.sync?.get(STATE_KEY, res => {
      const def = { enabled: true, fixPatterns: true, killValidation: false, killAggressive: false };
      r(res?.[STATE_KEY] ? { ...def, ...res[STATE_KEY] } : def);
    });
  });
  const setState = p => new Promise(r => {
    getState().then(s => {
      const next = { ...s, ...p };
      chrome.storage?.sync?.set({ [STATE_KEY]: next }, () => r(next));
    });
  });

  // ---------- utils
  const stripJsSlashes = p =>
    (typeof p === "string" && p.length >= 2 && p[0] === "/" && p[p.length - 1] === "/")
      ? p.slice(1, -1) : p;

  // ---------- features
  function fixInputPatterns(root = document) {
    root.querySelectorAll('input[pattern],textarea[pattern],input[data-pattern],textarea[data-pattern]')
      .forEach(el => {
        const pat = el.getAttribute("pattern");
        if (pat) {
          const fixed = stripJsSlashes(pat);
          if (fixed !== pat) el.setAttribute("pattern", fixed);
        }
        const dpat = el.getAttribute("data-pattern");
        if (dpat) {
          const fixed2 = stripJsSlashes(dpat);
          if (fixed2 !== dpat) el.setAttribute("data-pattern", fixed2);
        }
      });
  }

  function killHtml5Validation(root = document) {
    root.querySelectorAll("form").forEach(f => f.setAttribute("novalidate", "novalidate"));
    root.querySelectorAll("input,textarea,select").forEach(el => {
      ["required","pattern","min","max","maxlength","minlength","step"].forEach(a => el.removeAttribute(a));
      try { el.setCustomValidity && el.setCustomValidity(""); } catch {}
      el.addEventListener("invalid", e => e.preventDefault(), true);
    });
  }

  // ---------- SAFE aggressive bypass (no cloning, no loops)
  let protoPatched = false;
  let nativeSubmit = null;

  function patchPrototypesOnce() {
    if (protoPatched) return;
    protoPatched = true;
    try {
      const fp = HTMLFormElement.prototype;
      nativeSubmit = fp.submit; // keep native
      if (!fp.__ft_patched) {
        const origCheck = fp.checkValidity;
        const origReport = fp.reportValidity;
        fp.checkValidity = function() { try { return true; } catch { return true; } };
        fp.reportValidity = function() { try { return true; } catch { return true; } };
        fp.__ft_patched = { origCheck, origReport };
      }
    } catch {}

    try {
      const ip = HTMLInputElement.prototype;
      if (!ip.__ft_patched) {
        const orig = ip.setCustomValidity;
        ip.setCustomValidity = function() { /* ignore custom errors */ };
        ip.__ft_patched = { orig };
      }
    } catch {}
    try {
      const tp = HTMLTextAreaElement.prototype;
      if (!tp.__ft_patched) {
        const orig = tp.setCustomValidity;
        tp.setCustomValidity = function() {};
        tp.__ft_patched = { orig };
      }
    } catch {}
  }

  function attachSubmitBypass(root = document) {
    root.querySelectorAll("form").forEach(form => {
      if (form.dataset.ftBypassAttached) return;
      form.dataset.ftBypassAttached = "1";
      form.setAttribute("novalidate", "novalidate");

      // capture submit first, stop other handlers from blocking
      form.addEventListener("submit", (ev) => {
        // If something later calls preventDefault, we still ensure a native submit.
        // We don't resubmit twice.
        if (form.__ft_submitting) return;
        // Defer to end of event loop to see if anyone blocked it
        setTimeout(() => {
          if (form.__ft_submitting) return;
          if (ev.defaultPrevented) {
            try {
              form.__ft_submitting = true;
              nativeSubmit.call(form); // native submit doesn't fire 'submit' again
            } finally {
              setTimeout(() => { form.__ft_submitting = false; }, 200);
            }
          }
        }, 0);
      }, true);
    });
  }

  function killAggressiveValidation(root = document) {
    patchPrototypesOnce();
    attachSubmitBypass(root);
  }

  // ---------- observer (throttled)
  let observer = null;
  let scheduled = false;
  function rescanThrottled(state) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (state.fixPatterns) fixInputPatterns(document);
      if (state.killValidation) killHtml5Validation(document);
      if (state.killAggressive) killAggressiveValidation(document);
    });
  }

  async function apply(root = document) {
    const state = await getState();
    if (!state.enabled) return;

    if (state.fixPatterns) fixInputPatterns(root);
    if (state.killValidation) killHtml5Validation(root);
    if (state.killAggressive) killAggressiveValidation(root);

    if (!observer) {
      observer = new MutationObserver(() => rescanThrottled(state));
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  }

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "sync" && changes[STATE_KEY]) apply();
  });

  apply();

  // ---------- DevTools helpers
  window.FormTamer = {
    state: () => getState(),
    toggleEnabled: v => setState({ enabled: !!v }),
    toggleFixPatterns: v => setState({ fixPatterns: !!v }),
    toggleKillValidation: v => setState({ killValidation: !!v }),
    toggleKillAggressive: v => setState({ killAggressive: !!v }),
    runFixNow: () => fixInputPatterns(document),
  };
})();
