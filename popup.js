const STATE_KEY = "formtamer_state";

function getState() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STATE_KEY, (res) => {
      const def = { enabled: true, fixPatterns: true, killValidation: false, killAggressive: false };
      resolve(res?.[STATE_KEY] ? { ...def, ...res[STATE_KEY] } : def);
    });
  });
}

function setState(patch) {
  return new Promise((resolve) => {
    getState().then((state) => {
      const next = { ...state, ...patch };
      chrome.storage.sync.set({ [STATE_KEY]: next }, () => resolve(next));
    });
  });
}

(async function init() {
  const enabled = document.getElementById("enabled");
  const fixPatterns = document.getElementById("fixPatterns");
  const killValidation = document.getElementById("killValidation");
  const killAggressive = document.getElementById("killAggressive");
  const applyNow = document.getElementById("applyNow");

  const s = await getState();
  enabled.checked = s.enabled;
  fixPatterns.checked = s.fixPatterns;
  killValidation.checked = s.killValidation;
  killAggressive.checked = s.killAggressive;

  enabled.onchange = () => setState({ enabled: enabled.checked });
  fixPatterns.onchange = () => setState({ fixPatterns: fixPatterns.checked });
  killValidation.onchange = () => setState({ killValidation: killValidation.checked });
  killAggressive.onchange = () => setState({ killAggressive: killAggressive.checked });

  applyNow.onclick = async () => {
    await setState({ __ping: Date.now() }); // retrigger content script observers
    window.close();
  };
})();
