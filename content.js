(() => {
  const STATE_KEY = "formtamer_state"; // { enabled, fixPatterns, killValidation, killAggressive, showPostcodeHints }

  // ---------- storage
  const getState = () => new Promise(r => {
    chrome.storage?.sync?.get(STATE_KEY, res => {
      const def = {
        enabled: true,
        fixPatterns: true,
        killValidation: false,
        killAggressive: false,
        showPostcodeHints: true
      };
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

  const elMatches = (el, needles) => {
    const s = [
      el.name, el.id, el.placeholder,
      el.getAttribute("aria-label"),
      el.getAttribute("aria-describedby"),
      el.getAttribute("data-drupal-selector")
    ].filter(Boolean).join(" ").toLowerCase();
    return needles.some(n => s.includes(n));
  };

  // ---------- postcode rules (one canonical pattern per country)
  // NOTE: "normalize" doesn't force validity; it only formats obvious cases.
  const POSTCODE_RULES = {
    nl: {
      country: "Netherlands",
      pattern: /^\d{4}\s?[A-Z]{2}$/,
      example: "1234 AB",
      normalize: v => {
        const raw = v.toUpperCase().replace(/\s+/g, "");
        if (/^\d{4}[A-Z]{2}$/.test(raw)) return raw.slice(0,4) + " " + raw.slice(4);
        return v;
      }
    },
    pt: {
      country: "Portugal",
      pattern: /^\d{4}-\d{3}$/,
      example: "1234-567",
      normalize: v => {
        const raw = v.replace(/\D/g, "");
        if (/^\d{7}$/.test(raw)) return raw.slice(0,4) + "-" + raw.slice(4);
        return v;
      }
    },
    es: {
      country: "Spain",
      pattern: /^\d{5}$/,
      example: "46015",
      normalize: v => v.replace(/\D/g, "").slice(0,5)
    },
    fr: {
      country: "France",
      pattern: /^\d{5}$/,
      example: "75008",
      normalize: v => v.replace(/\D/g, "").slice(0,5)
    },
    de: {
      country: "Germany",
      pattern: /^\d{5}$/,
      example: "10115",
      normalize: v => v.replace(/\D/g, "").slice(0,5)
    },
    it: {
      country: "Italy",
      pattern: /^\d{5}$/,
      example: "00100",
      normalize: v => v.replace(/\D/g, "").slice(0,5)
    },
    be: {
      country: "Belgium",
      pattern: /^\d{4}$/,
      example: "1000",
      normalize: v => v.replace(/\D/g, "").slice(0,4)
    },
    se: {
      country: "Sweden",
      pattern: /^\d{3}\s?\d{2}$/,
      example: "114 55",
      normalize: v => {
        const raw = v.replace(/\D/g, "");
        if (/^\d{5}$/.test(raw)) return raw.slice(0,3) + " " + raw.slice(3);
        return v;
      }
    },
    no: {
      country: "Norway",
      pattern: /^\d{4}$/,
      example: "0150",
      normalize: v => v.replace(/\D/g, "").slice(0,4)
    },
    dk: {
      country: "Denmark",
      pattern: /^\d{4}$/,
      example: "1050",
      normalize: v => v.replace(/\D/g, "").slice(0,4)
    },
    fi: {
      country: "Finland",
      pattern: /^\d{5}$/,
      example: "00100",
      normalize: v => v.replace(/\D/g, "").slice(0,5)
    },
    pl: {
      country: "Poland",
      pattern: /^\d{2}-\d{3}$/,
      example: "00-001",
      normalize: v => {
        const raw = v.replace(/\D/g, "");
        if (/^\d{5}$/.test(raw)) return raw.slice(0,2) + "-" + raw.slice(2);
        return v;
      }
    },
    cz: {
      country: "Czechia",
      pattern: /^\d{3}\s?\d{2}$/,
      example: "110 00",
      normalize: v => {
        const raw = v.replace(/\D/g, "");
        if (/^\d{5}$/.test(raw)) return raw.slice(0,3) + " " + raw.slice(3);
        return v;
      }
    },
    hu: {
      country: "Hungary",
      pattern: /^\d{4}$/,
      example: "1051",
      normalize: v => v.replace(/\D/g, "").slice(0,4)
    },
    ro: {
      country: "Romania",
      pattern: /^\d{6}$/,
      example: "010011",
      normalize: v => v.replace(/\D/g, "").slice(0,6)
    },
    gb: {
      country: "United Kingdom",
      // simplified, pragmatic UK regex
      pattern: /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2})$/,
      example: "SW1A 1AA",
      normalize: v => {
        const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (raw.length >= 5) {
          return raw.slice(0, raw.length - 3) + " " + raw.slice(-3);
        }
        return v.toUpperCase();
      }
    },
    us: {
      country: "United States",
      pattern: /^\d{5}(-\d{4})?$/,
      example: "94105 or 94105-1234",
      normalize: v => {
        const raw = v.replace(/\D/g, "");
        if (raw.length > 9) return raw.slice(0,9).replace(/^(\d{5})(\d{4})$/, "$1-$2");
        if (raw.length === 9) return raw.replace(/^(\d{5})(\d{4})$/, "$1-$2");
        return raw.slice(0,5);
      }
    }
  };

  const tldFromHost = (host) => {
    const parts = host.split(".").filter(Boolean);
    const last = parts[parts.length - 1]?.toLowerCase() || "";
    // special cases: .co.uk -> gb, .com/nl paths — не трогаем
    if (last === "uk") return "gb";
    return last;
  };

  function createHint(text) {
    const span = document.createElement("span");
    span.className = "ft-postcode-hint";
    span.textContent = text;
    return span;
  }

  function injectStylesOnce() {
    if (document.getElementById("ft-postcode-style")) return;
    const css = `
      .ft-postcode-hint {
        display:inline-block; margin-left:8px; padding:2px 6px;
        font:12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color:#0f172a; background:#e2e8f0; border-radius:6px;
      }
      .ft-postcode-field { outline: 2px dashed rgba(15,23,42,.2); outline-offset: 2px; }
    `;
    const style = document.createElement("style");
    style.id = "ft-postcode-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function attachPostcodeHints(tldKey) {
    const rule = POSTCODE_RULES[tldKey];
    if (!rule) return;

    injectStylesOnce();

    const candidates = Array.from(document.querySelectorAll("input[type='text'], input:not([type]), input[type='search'], input[type='tel']"))
      .filter(el => elMatches(el, [
        "postcode","postal","zip","post code","Código postal","codigo postal","codice postale",
        "plz","cap","cp","kodepos","posta","postnummer","邮编","почтовый индекс","индекс"
      ]));

    candidates.forEach(el => {
      if (el.dataset.ftPostcodeBound) return;
      el.dataset.ftPostcodeBound = "1";

      // hint
      const hint = createHint(`${rule.country}: e.g. ${rule.example}`);
      // place after input if possible
      const parent = el.parentElement || el;
      parent.insertBefore(hint, el.nextSibling);

      // soft highlight once
      el.classList.add("ft-postcode-field");
      setTimeout(() => el.classList.remove("ft-postcode-field"), 1500);

      // gentle auto-format on blur (does NOT force validity)
      el.addEventListener("blur", () => {
        const before = el.value || "";
        const after = rule.normalize(before);
        if (after !== before) el.value = after;
      }, { passive: true });
    });
  }

  // ---------- validation features (existing)
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

  // safe aggressive bypass
  let protoPatched = false;
  let nativeSubmit = null;
  function patchPrototypesOnce() {
    if (protoPatched) return;
    protoPatched = true;
    try {
      const fp = HTMLFormElement.prototype;
      nativeSubmit = fp.submit;
      if (!fp.__ft_patched) {
        fp.__ft_checkValidity = fp.checkValidity;
        fp.__ft_reportValidity = fp.reportValidity;
        fp.checkValidity = function() { return true; };
        fp.reportValidity = function() { return true; };
        fp.__ft_patched = true;
      }
    } catch {}
    try {
      const ip = HTMLInputElement.prototype;
      if (!ip.__ft_patched) {
        ip.__ft_setCustomValidity = ip.setCustomValidity;
        ip.setCustomValidity = function() {};
        ip.__ft_patched = true;
      }
    } catch {}
    try {
      const tp = HTMLTextAreaElement.prototype;
      if (!tp.__ft_patched) {
        tp.__ft_setCustomValidity = tp.setCustomValidity;
        tp.setCustomValidity = function() {};
        tp.__ft_patched = true;
      }
    } catch {}
  }
  function attachSubmitBypass(root = document) {
    root.querySelectorAll("form").forEach(form => {
      if (form.dataset.ftBypassAttached) return;
      form.dataset.ftBypassAttached = "1";
      form.setAttribute("novalidate", "novalidate");
      form.addEventListener("submit", (ev) => {
        if (form.__ft_submitting) return;
        setTimeout(() => {
          if (form.__ft_submitting) return;
          if (ev.defaultPrevented) {
            try {
              form.__ft_submitting = true;
              nativeSubmit && nativeSubmit.call(form);
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
  function rescanThrottled(state, tldKey) {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (state.fixPatterns) fixInputPatterns(document);
      if (state.killValidation) killHtml5Validation(document);
      if (state.killAggressive) killAggressiveValidation(document);
      if (state.showPostcodeHints) attachPostcodeHints(tldKey);
    });
  }

  async function apply(root = document) {
    const state = await getState();
    if (!state.enabled) return;

    const tldKey = tldFromHost(location.hostname);
    if (state.fixPatterns) fixInputPatterns(root);
    if (state.killValidation) killHtml5Validation(root);
    if (state.killAggressive) killAggressiveValidation(root);
    if (state.showPostcodeHints) attachPostcodeHints(tldKey);

    if (!observer) {
      observer = new MutationObserver(() => rescanThrottled(state, tldKey));
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
    togglePostcodeHints: v => setState({ showPostcodeHints: !!v }),
    runFixNow: () => fixInputPatterns(document),
  };
})();
