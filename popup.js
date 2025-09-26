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
    // Выполним команды в активной вкладке (контент-скрипт уже подключён)
    // Просто дёрнем изменение state, чтобы контент-скрипт снова прогнал обработку
    const s = await setState({ __ping: Date.now() });
    window.close();
  });
}

init();
