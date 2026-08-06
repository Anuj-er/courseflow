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
        "modules/peer-review.js",
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
const providerCards = document.querySelectorAll(".provider-card");
const aiModelSelect = document.getElementById("aiModel");
const groupCustomModel = document.getElementById("groupCustomModel");
const customModelInput = document.getElementById("customModelId");
const groupGroqKey = document.getElementById("groupGroqKey");
const groupClaudeKey = document.getElementById("groupClaudeKey");
const groupGeminiKey = document.getElementById("groupGeminiKey");
const groupOpenaiKey = document.getElementById("groupOpenaiKey");
const groqApiKeyInput = document.getElementById("groqApiKey");
const claudeApiKeyInput = document.getElementById("claudeApiKey");
const geminiApiKeyInput = document.getElementById("geminiApiKey");
const openaiApiKeyInput = document.getElementById("openaiApiKey");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const saveStatus = document.getElementById("saveStatus");

let selectedProvider = "groq";

const MODELS = {
  groq: [
    { id: "llama-3.1-8b-instant", name: "LLaMA 3.1 8B Instant" },
    { id: "llama-3.3-70b-versatile", name: "LLaMA 3.3 70B Versatile" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" }
  ],
  claude: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
    { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet" }
  ],
  gemini: [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }
  ],
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" }
  ]
};

const KEY_GROUPS = {
  groq: "groupGroqKey",
  claude: "groupClaudeKey",
  gemini: "groupGeminiKey",
  openai: "groupOpenaiKey"
};

function populateModels(provider, activeModelId) {
  aiModelSelect.innerHTML = "";
  const models = MODELS[provider];
  
  models.forEach(model => {
    const opt = document.createElement("option");
    opt.value = model.id;
    opt.textContent = model.name;
    if (model.id === activeModelId) opt.selected = true;
    aiModelSelect.appendChild(opt);
  });
}

function getSelectedModelId() {
  const custom = customModelInput.value.trim();
  if (custom) return custom;
  return aiModelSelect.value;
}

function setActiveProvider(provider) {
  selectedProvider = provider;
  providerCards.forEach(card => {
    card.classList.toggle("active", card.dataset.provider === provider);
  });
  populateModels(provider);
  updateKeyVisibility(provider);
}

function updateKeyVisibility(provider) {
  Object.values(KEY_GROUPS).forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  const groupId = KEY_GROUPS[provider];
  if (groupId) document.getElementById(groupId).classList.remove("hidden");
}

providerCards.forEach(card => {
  card.addEventListener("click", () => {
    setActiveProvider(card.dataset.provider);
  });
});

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "aiProvider", "aiModel", "groqApiKey", "claudeApiKey", "geminiApiKey", "openaiApiKey"
  ]);
  
  const provider = data.aiProvider || "groq";
  selectedProvider = provider;
  
  providerCards.forEach(card => {
    card.classList.toggle("active", card.dataset.provider === provider);
  });
  
  if (data.aiModel) {
    // If the saved model is not in the dropdown list, it must be a custom model
    const isCustom = !MODELS[data.aiProvider].some(m => m.id === data.aiModel);
    if (isCustom) {
      customModelInput.value = data.aiModel;
    } else {
      populateModels(provider, data.aiModel);
    }
  } else {
    populateModels(provider);
  }
  
  updateKeyVisibility(provider);
  
  if (data.groqApiKey) groqApiKeyInput.value = data.groqApiKey;
  if (data.claudeApiKey) claudeApiKeyInput.value = data.claudeApiKey;
  if (data.geminiApiKey) geminiApiKeyInput.value = data.geminiApiKey;
  if (data.openaiApiKey) openaiApiKeyInput.value = data.openaiApiKey;
}

btnSaveSettings.addEventListener("click", async () => {
  const modelId = getSelectedModelId();
  
  if (!modelId) {
    customModelInput.focus();
    customModelInput.style.borderColor = "#DC2626";
    setTimeout(() => { customModelInput.style.borderColor = ""; }, 2000);
    return;
  }
  
  await chrome.storage.local.set({
    aiProvider: selectedProvider,
    aiModel: modelId,
    groqApiKey: groqApiKeyInput.value.trim(),
    claudeApiKey: claudeApiKeyInput.value.trim(),
    geminiApiKey: geminiApiKeyInput.value.trim(),
    openaiApiKey: openaiApiKeyInput.value.trim()
  });
  
  saveStatus.classList.remove("hidden");
  setTimeout(() => {
    saveStatus.classList.add("hidden");
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
    getAutopilotState().then(updateUIState);
  }
});

// Init
loadSettings();
updateContextBar();
updateSessionStats();
getAutopilotState().then(updateUIState);
