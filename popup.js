const AUTOPILOT_KEY = "autopilotState";

// DOM Elements
const pageContext = document.getElementById("pageContext");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const stateIdle = document.getElementById("stateIdle");
const stateRunning = document.getElementById("stateRunning");
const statePaused = document.getElementById("statePaused");
const pauseReasonEl = document.getElementById("pauseReason");
const sessionCountEl = document.getElementById("sessionCount");

const btnStart = document.getElementById("btnStart");
const btnSkip = document.getElementById("btnSkip");
const btnPause = document.getElementById("btnPause");
const btnStopRun = document.getElementById("btnStopRun");
const btnResume = document.getElementById("btnResume");
const btnStopPause = document.getElementById("btnStopPause");

// ── Tab Logic ──
tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tabBtns.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    
    btn.classList.add("active");
    document.getElementById(btn.dataset.target).classList.add("active");
  });
});

// ── Context Logic ──
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateContextBar() {
  const tab = await getActiveTab();
  if (tab && tab.title) {
    // Clean up Coursera title (usually ends with " | Coursera")
    let title = tab.title.replace(" | Coursera", "");
    pageContext.textContent = title || "Unknown page";
  } else {
    pageContext.textContent = "Cannot read page";
  }
}

// ── Session Stats ──
async function updateSessionStats() {
  const data = await chrome.storage.local.get("itemsCompletedThisSession");
  const count = data.itemsCompletedThisSession || 0;
  sessionCountEl.textContent = count;
}

// ── State Management ──
async function getAutopilotState() {
  const data = await chrome.storage.local.get(AUTOPILOT_KEY);
  return data[AUTOPILOT_KEY] || "idle";
}

async function setAutopilotState(state) {
  await chrome.storage.local.set({ [AUTOPILOT_KEY]: state });
}

async function updateUIState(state) {
  stateIdle.classList.remove("active");
  stateRunning.classList.remove("active");
  statePaused.classList.remove("active");

  if (state === "running") {
    stateRunning.classList.add("active");
  } else if (state === "paused") {
    statePaused.classList.add("active");
    const data = await chrome.storage.local.get("autopilotPauseReason");
    pauseReasonEl.textContent = data.autopilotPauseReason || "Waiting for user input.";
  } else {
    stateIdle.classList.add("active");
  }
}

// ── Actions ──
async function triggerAutopilot() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: [
        "modules/video-skipper-core.js",
        "modules/utils.js",
        "modules/messaging.js",
        "modules/autopilot.js",
        "modules/assignment.js",
        "modules/ui.js",
        "content.js"
      ]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "autopilot-trigger" });
  } catch (error) {
    // Content script may already be loaded; the storage change will trigger it
  }
}

btnStart.addEventListener("click", async () => {
  await setAutopilotState("running");
  updateUIState("running");
  triggerAutopilot();
});

btnResume.addEventListener("click", async () => {
  await setAutopilotState("running");
  updateUIState("running");
  triggerAutopilot();
});

btnPause.addEventListener("click", async () => {
  await setAutopilotState("paused");
  updateUIState("paused");
});

const stopHandler = async () => {
  await setAutopilotState("idle");
  updateUIState("idle");
};

btnStopRun.addEventListener("click", stopHandler);
btnStopPause.addEventListener("click", stopHandler);

// Manual Skip action from idle state
btnSkip.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  btnSkip.disabled = true;
  btnSkip.textContent = "Processing...";
  
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["modules/video-skipper-core.js", "modules/skip-video.js"]
    });
  } catch (e) {
    console.error(e);
  } finally {
    btnSkip.disabled = false;
    btnSkip.innerHTML = "Skip &amp; Continue";
    updateSessionStats();
  }
});

// ── Settings Logic ──
const groqApiKeyInput = document.getElementById("groqApiKey");
const btnSaveGroqKey = document.getElementById("btnSaveGroqKey");
const groqSaveStatus = document.getElementById("groqSaveStatus");

async function loadSettings() {
  const data = await chrome.storage.local.get("groqApiKey");
  if (data.groqApiKey) {
    groqApiKeyInput.value = data.groqApiKey;
  }
}

btnSaveGroqKey.addEventListener("click", async () => {
  const key = groqApiKeyInput.value.trim();
  await chrome.storage.local.set({ groqApiKey: key });
  
  groqSaveStatus.classList.remove("hidden");
  setTimeout(() => {
    groqSaveStatus.classList.add("hidden");
  }, 2000);
});

// ── Initialization ──
chrome.storage.onChanged.addListener((changes) => {
  if (changes[AUTOPILOT_KEY]) {
    updateUIState(changes[AUTOPILOT_KEY].newValue || "idle");
  }
  if (changes.itemsCompletedThisSession) {
    updateSessionStats();
  }
  if (changes.autopilotPauseReason) {
    // Refresh state to show new reason
    getAutopilotState().then(updateUIState);
  }
});

// Init
loadSettings();
updateContextBar();
updateSessionStats();
getAutopilotState().then(updateUIState);
