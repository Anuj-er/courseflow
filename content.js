(() => {
  "use strict";

  const skipper = globalThis.__videoFinishSkipper;

  if (!skipper) {
    return;
  }

  const SOURCE = "video-finish-skipper";
  const RUN_MESSAGE = "run-skip";
  const RESULT_MESSAGE = "skip-result";
  const CONTROL_ID = "video-finish-skipper-page-control";
  const RESPONSE_TIMEOUT_MS = 950;
  const STATUS_HIDE_MS = 3200;
  const DETECTION_TIMEOUT_MS = 30000;
  const AUTOPILOT_KEY = "autopilotState";
  const PAGE_SETTLE_MS = 2500;

  const pendingRequests = new Map();

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isTopFrame() {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  }

  function isNormalWebPage() {
    return location.protocol === "http:" || location.protocol === "https:";
  }

  function isCourseraPage() {
    return location.hostname === "coursera.org" || location.hostname.endsWith(".coursera.org");
  }

  function postRunMessageToChildren(requestId) {
    let frameCount = 0;

    try {
      frameCount = window.frames.length;
    } catch {
      return;
    }

    for (let index = 0; index < frameCount; index += 1) {
      try {
        window.frames[index].postMessage(
          {
            source: SOURCE,
            type: RUN_MESSAGE,
            requestId
          },
          "*"
        );
      } catch {
        // Some frames cannot be reached. Other frames can still respond.
      }
    }
  }

  function postResultToParent(requestId, result) {
    if (isTopFrame()) {
      return;
    }

    try {
      window.parent.postMessage(
        {
          source: SOURCE,
          type: RESULT_MESSAGE,
          requestId,
          result
        },
        "*"
      );
    } catch {
      // If the parent cannot receive the response, the top-frame result still works.
    }
  }

  async function handleRunMessage(data) {
    postRunMessageToChildren(data.requestId);
    const result = await skipper.skipCurrentFrameVideo();
    postResultToParent(data.requestId, result);
  }

  function handleResultMessage(data) {
    if (isTopFrame()) {
      const request = pendingRequests.get(data.requestId);

      if (request) {
        request.results.push(data.result);
      }

      return;
    }

    postResultToParent(data.requestId, data.result);
  }

  window.addEventListener("message", (event) => {
    const data = event.data;

    if (!data || data.source !== SOURCE) {
      return;
    }

    if (data.type === RUN_MESSAGE && !isTopFrame() && event.source === window.parent) {
      handleRunMessage(data);
      return;
    }

    if (data.type === RESULT_MESSAGE) {
      handleResultMessage(data);
    }
  });

  if (!isTopFrame() || !isNormalWebPage()) {
    return;
  }

  function shouldShowControl() {
    return isCourseraPage() || skipper.hasLikelyVideo(document);
  }

  // ── Status helpers for the on-page control ──

  function setStatus(statusEl, message, kind = "info") {
    window.clearTimeout(setStatus.hideTimer);
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
    statusEl.hidden = false;

    if (kind === "success") {
      setStatus.hideTimer = window.setTimeout(() => {
        statusEl.hidden = true;
      }, STATUS_HIDE_MS);
    }
  }

  // ── Single-skip from button ──

  async function runSkipFromButton(button) {
    const pauseCheck = skipper.detectPausablePage(document);
    if (pauseCheck.pause) {
      const proceed = confirm(`WARNING: Please complete this ${pauseCheck.label.toLowerCase()}.\n\nIf you skip this, the course cannot be completed!\n\nDo you still want to force skip it?`);
      if (!proceed) {
        return;
      }
    }

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const request = {
      results: []
    };

    pendingRequests.set(requestId, request);
    button.disabled = true;

    try {
      postRunMessageToChildren(requestId);
      request.results.push(await skipper.skipCurrentFrameVideo());
      await wait(RESPONSE_TIMEOUT_MS);

      const best = skipper.pickBestResult(request.results);

      if (!best || !best.videoCount) {
        await skipper.continueAfterSkipResult(null);
        return;
      }

      if (!best.skipped) {
        await skipper.continueAfterSkipResult(null);
        return;
      }

      await skipper.continueAfterSkipResult(best);
    } finally {
      pendingRequests.delete(requestId);
      button.disabled = false;
    }
  }

  // ── Auto-pilot engine ──

  let autopilotRunning = false;

  async function getAutopilotState() {
    try {
      const data = await chrome.storage.local.get(AUTOPILOT_KEY);
      return data[AUTOPILOT_KEY] || "idle";
    } catch {
      return "idle";
    }
  }

  async function setAutopilotState(state) {
    try {
      await chrome.storage.local.set({ [AUTOPILOT_KEY]: state });
    } catch {
      // Storage may not be available
    }
  }

  function updateAutopilotBanner(state) {
    const host = document.getElementById(CONTROL_ID);
    if (!host?.shadowRoot) return;

    const banner = host.shadowRoot.querySelector(".autopilot-controls");
    if (!banner) return;

    const continueBtn = banner.querySelector(".autopilot-continue-btn");
    const pauseBtn = banner.querySelector(".autopilot-pause-btn");
    const stopBtn = banner.querySelector(".autopilot-stop-btn");
    const skipBtn = host.shadowRoot.querySelector(".skip-btn");

    const assignmentUI = host.shadowRoot.querySelector(".assignment-helper-ui");
    const btnGetAnswers = host.shadowRoot.querySelector("#btnGetAnswers");
    const btnMemorize = host.shadowRoot.querySelector("#btnMemorize");
    
    const isAttemptPage = window.location.pathname.includes('/attempt');
    const isFeedbackPage = window.location.pathname.includes('/view-feedback');

    if (isAttemptPage || isFeedbackPage) {
      banner.hidden = true;
      if (skipBtn) skipBtn.hidden = true;
      if (assignmentUI) {
        assignmentUI.hidden = false;
        if (btnGetAnswers) btnGetAnswers.hidden = !isAttemptPage;
        if (btnMemorize) btnMemorize.hidden = !isFeedbackPage;
      }
      return;
    }

    if (assignmentUI) assignmentUI.hidden = true;

    if (state === "running") {
      banner.hidden = false;
      continueBtn.hidden = true;
      pauseBtn.hidden = false;
      stopBtn.hidden = false;
      if (skipBtn) skipBtn.hidden = true;
    } else if (state === "paused") {
      banner.hidden = false;
      continueBtn.hidden = false;
      pauseBtn.hidden = true;
      stopBtn.hidden = false;
      if (skipBtn) skipBtn.hidden = true;
    } else {
      banner.hidden = true;
      if (skipBtn) skipBtn.hidden = false;
    }
  }

  let lastKnownUrl = location.href;
  setInterval(async () => {
    if (location.href !== lastKnownUrl) {
      lastKnownUrl = location.href;
      
      const host = document.getElementById(CONTROL_ID);
      if (host && host.shadowRoot) {
        const answersDiv = host.shadowRoot.querySelector("#answersDiv");
        if (answersDiv) {
          answersDiv.hidden = true;
          answersDiv.textContent = "";
        }
      }

      const state = await getAutopilotState();
      updateAutopilotBanner(state);
    }
  }, 1000);

  async function incrementSessionStats() {
    try {
      const data = await chrome.storage.local.get("itemsCompletedThisSession");
      const current = data.itemsCompletedThisSession || 0;
      await chrome.storage.local.set({ itemsCompletedThisSession: current + 1 });
    } catch {
      // Ignore
    }
  }

  async function waitForUrlChange(previousUrl, timeoutMs = 12000) {
    const deadline = performance.now() + timeoutMs;

    while (performance.now() < deadline) {
      if (location.href !== previousUrl) {
        return true;
      }

      // Check if user stopped auto-pilot while we're waiting
      const state = await getAutopilotState();
      if (state !== "running") {
        return false;
      }

      await wait(400);
    }

    return false;
  }

  async function processCurrentPage() {
    installControl();

    const pauseCheck = skipper.detectPausablePage(document);
    if (pauseCheck.pause) {
      // Pass the reason to storage so popup can read it
      await chrome.storage.local.set({ autopilotPauseReason: pauseCheck.label });
      await setAutopilotState("paused");
      updateAutopilotBanner("paused");
      alert(`Auto-pilot paused:\n\n${pauseCheck.label}`);
      return "paused";
    }

    // Clear any previous pause reason
    await chrome.storage.local.remove("autopilotPauseReason");
    updateAutopilotBanner("running");

    const hasVideo = skipper.hasVideoOnPage(document);
    if (hasVideo) {
      const requestId = `autopilot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const request = { results: [] };
      pendingRequests.set(requestId, request);

      try {
        postRunMessageToChildren(requestId);
        request.results.push(await skipper.skipCurrentFrameVideo());
        await wait(RESPONSE_TIMEOUT_MS);

        const best = skipper.pickBestResult(request.results);

        if (best?.skipped) {
          const action = await skipper.continueAfterSkipResult(best);
          if (action.clicked) {
            await incrementSessionStats();
            return "navigated";
          }
        }

        const action = await skipper.continueAfterSkipResult(null);
        if (action?.clicked) {
          await incrementSessionStats();
          return "navigated";
        }
      } finally {
        pendingRequests.delete(requestId);
      }
    } else {
      const action = await skipper.clickCompletionAction();
      if (action.clicked) {
        await incrementSessionStats();
        return "navigated";
      }
    }

    return "stuck";
  }

  async function runAutopilotLoop() {
    if (!isTopFrame()) {
      return;
    }
    if (autopilotRunning) {
      return;
    }
    autopilotRunning = true;

    try {
      while (true) {
        const state = await getAutopilotState();
        if (state !== "running") {
          updateAutopilotBanner(state === "paused" ? "paused" : "idle");
          break;
        }

        await wait(PAGE_SETTLE_MS);

        const stateAfterWait = await getAutopilotState();
        if (stateAfterWait !== "running") {
          updateAutopilotBanner(stateAfterWait === "paused" ? "paused" : "idle");
          break;
        }

        const urlBefore = location.href;
        const result = await processCurrentPage();

        if (result === "paused") {
          break;
        }

        if (result === "stuck") {
          await chrome.storage.local.set({ autopilotPauseReason: "Could not find next action." });
          await setAutopilotState("paused");
          updateAutopilotBanner("paused");
          alert("Auto-pilot paused:\n\nCould not find next action.");
          break;
        }

        const urlChanged = await waitForUrlChange(urlBefore);
        if (!urlChanged) {
          break;
        }
      }
    } catch (error) {
      await chrome.storage.local.set({ autopilotPauseReason: error?.message || "Unknown error" });
      await setAutopilotState("paused");
      updateAutopilotBanner("paused");
    } finally {
      autopilotRunning = false;
    }
  }

  // ── Listen for messages from popup ──

  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === "autopilot-trigger") {
      runAutopilotLoop();
    }
  });

  // ── Listen for storage changes ──

  chrome.storage?.onChanged?.addListener((changes) => {
    if (changes[AUTOPILOT_KEY]) {
      const newState = changes[AUTOPILOT_KEY].newValue || "idle";

      if (newState === "running") {
        runAutopilotLoop();
      } else if (newState === "idle") {
        autopilotRunning = false;
        updateAutopilotBanner("idle");
      } else if (newState === "paused") {
        updateAutopilotBanner("paused");
      }
    }
  });

  // ── Install on-page control ──

  function installControl() {
    if (document.getElementById(CONTROL_ID)) {
      return;
    }

    const host = document.createElement("div");
    host.id = CONTROL_ID;

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .wrap {
          position: fixed;
          top: 50%;
          right: 24px;
          transform: translateY(-50%);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          pointer-events: none;
        }

        button {
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          pointer-events: auto;
        }

        button:disabled {
          opacity: 0.7;
          cursor: wait;
          pointer-events: none;
          animation: btnPulse 1s infinite ease-in-out;
        }

        @keyframes btnPulse {
          0% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.95); }
          100% { opacity: 0.7; transform: scale(1); }
        }

        .skip-btn {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 8px;
          border: 1px solid rgba(15, 23, 42, 0.1);
          background: #ffffff;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          color: #0056D2;
        }
        .skip-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
          background: #F0F4F8;
        }
        .skip-btn:active {
          transform: scale(0.92);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        .skip-btn[hidden] { display: none; }
        
        .skip-btn svg {
          width: 28px;
          height: 28px;
          fill: currentColor;
        }

        .btn-pause {
          background: #F57F17;
          color: #fff;
          min-height: 32px;
          padding: 0 12px;
          font-size: 13px;
        }
        .btn-pause:hover { background: #F9A825; }

        .btn-stop {
          background: #D32F2F;
          color: #fff;
          min-height: 32px;
          padding: 0 12px;
          font-size: 13px;
        }
        .btn-stop:hover { background: #B71C1C; }

        .autopilot-continue-btn {
          background: #0056D2;
          color: #fff;
          min-height: 32px;
          padding: 0 12px;
          font-size: 13px;
        }
        .autopilot-continue-btn:hover { background: #00419e; }

        .icon {
          display: inline-grid;
          place-items: center;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          color: #0056D2;
          background: #fff;
          font-weight: 900;
          font-size: 11px;
        }

        .status {
          max-width: min(250px, calc(100vw - 48px));
          border-radius: 4px;
          padding: 10px 14px;
          color: #1F2431;
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          font-size: 13px;
          line-height: 1.4;
          border-left: 4px solid #E2E6EA;
        }

        .status[hidden] { display: none; }
        .status[data-kind="success"] { border-left-color: #4CAF50; }
        .status[data-kind="error"] { border-left-color: #F44336; }

        .autopilot-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .autopilot-controls[hidden] {
          display: none;
        }

        .btn-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 8px;
          border: 1px solid rgba(15, 23, 42, 0.1);
          background: #ffffff;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          color: #374151;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-icon svg {
          width: 36px;
          height: 36px;
          fill: currentColor;
        }

        .btn-icon:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
          color: #111827;
        }

        .btn-icon:active {
          transform: scale(0.92);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .btn-icon-danger {
          color: #EF4444;
        }

        .btn-icon-danger:hover {
          background: #FEF2F2;
          color: #DC2626;
        }

        .btn-icon-primary {
          color: #0056D2;
        }

        .btn-icon-primary:hover {
          background: #F0F4F8;
          color: #00419e;
        }
        
        .btn-icon[hidden] { display: none; }

        .assignment-helper-ui {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          pointer-events: auto;
        }

        .assignment-helper-ui[hidden] { display: none; }

        .btn-get-answers, .btn-memorize {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 8px;
          border: 1px solid rgba(15, 23, 42, 0.1);
          background: #ffffff;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          cursor: pointer;
          transition: all 0.2s ease;
          pointer-events: auto;
        }
        
        .btn-get-answers { color: #10B981; }
        .btn-memorize { color: #8B5CF6; }

        .btn-get-answers:hover { background: #ECFDF5; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); }
        .btn-memorize:hover { background: #F5F3FF; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); }

        .btn-get-answers:active, .btn-memorize:active {
          transform: scale(0.92);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        
        .btn-get-answers svg, .btn-memorize svg {
          width: 28px;
          height: 28px;
          fill: currentColor;
        }

        .btn-get-answers:disabled, .btn-memorize:disabled {
          opacity: 0.7;
          cursor: wait;
          animation: btnPulse 1s infinite ease-in-out;
        }
        .btn-get-answers[hidden], .btn-memorize[hidden] { display: none; }

        .answers-div {
          background: #ffffff;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          border: 1px solid rgba(0,0,0,0.1);
          color: #111827;
          font-size: 13px;
          width: max-content;
          max-width: 300px;
          pointer-events: auto;
          white-space: pre-wrap;
          max-height: 400px;
          overflow-y: auto;
        }
        .answers-div[hidden] { display: none; }
      </style>
      <div class="wrap">
        <div class="autopilot-controls" hidden>
          <button class="btn-icon autopilot-pause-btn" type="button" hidden title="Pause Auto-pilot">
            <svg viewBox="4 3 16 18"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button class="btn-icon btn-icon-primary autopilot-continue-btn" type="button" hidden title="Continue Auto-pilot">
            <svg viewBox="6 3 14 18"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn-icon btn-icon-danger autopilot-stop-btn" type="button" hidden title="Stop Auto-pilot">
            <svg viewBox="5 5 14 14"><path d="M6 6h12v12H6z"/></svg>
          </button>
        </div>
        <button type="button" class="skip-btn" title="Skip video and continue">
          <svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
        </button>
        
        <div class="assignment-helper-ui" hidden>
          <button id="btnGetAnswers" class="btn-get-answers" hidden title="Get AI Answers">
            <svg viewBox="0 0 24 24"><path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z"/></svg>
          </button>
          <button id="btnMemorize" class="btn-memorize" hidden title="Memorize Mistakes">
            <svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
          </button>
          <div id="answersDiv" class="answers-div" hidden></div>
        </div>

        <div class="status" role="status" hidden></div>
      </div>
    `;

    const button = shadow.querySelector(".skip-btn");
    const statusEl = shadow.querySelector(".status");
    button.addEventListener("click", () => runSkipFromButton(button, statusEl));

    // Autopilot actions
    const continueBtn = shadow.querySelector(".autopilot-continue-btn");
    const pauseBtn = shadow.querySelector(".autopilot-pause-btn");
    const stopBtn = shadow.querySelector(".autopilot-stop-btn");

    continueBtn.addEventListener("click", async () => {
      await setAutopilotState("running");
      runAutopilotLoop();
    });

    pauseBtn.addEventListener("click", async () => {
      await setAutopilotState("paused");
      updateAutopilotBanner("paused", "Auto-pilot manually paused.");
    });

    stopBtn.addEventListener("click", async () => {
      await setAutopilotState("idle");
    });

    document.documentElement.append(host);
    
    const btnMemorize = shadow.querySelector("#btnMemorize");
    const btnGetAnswers = shadow.querySelector("#btnGetAnswers");
    const answersDiv = shadow.querySelector("#answersDiv");
    
    // Assignment Helper Logic
    if (btnGetAnswers) {
      btnGetAnswers.addEventListener("click", async () => {
        btnGetAnswers.disabled = true;
        answersDiv.hidden = false;
        answersDiv.textContent = "Analyzing quiz...";

        try {
          const quizMap = extractQuizMap();
          if (quizMap.length === 0) {
            answersDiv.textContent = "Could not find any multiple-choice questions on this page.";
            return;
          }

          const { groqApiKey } = await chrome.storage.local.get("groqApiKey");
          if (!groqApiKey) {
            answersDiv.textContent = "Error: Groq API Key not found.\nPlease enter it in the CourseFlow extension popup (Assignments Tab).";
            return;
          }
          
          // Check for memorized mistakes
          const assignmentId = location.pathname.split('/')[4] || 'unknown';
          const storageKey = `mistakes_${assignmentId}`;
          const mistakesData = await chrome.storage.local.get(storageKey);
          const mistakes = mistakesData[storageKey] || [];
          
          let mistakePromptStr = "";
          if (mistakes.length > 0) {
             mistakePromptStr = `\n\nWARNING: The following options are KNOWN TO BE INCORRECT based on a previous attempt. DO NOT select these under any circumstances:\n${JSON.stringify(mistakes, null, 2)}\n`;
          }

          answersDiv.textContent = "Asking AI for answers...";
          
          const prompt = `You are a helpful AI answering a multiple-choice quiz. I will provide the questions and options. Your ONLY job is to return a numbered list of the correct answers, in the exact format:\nQ1: Option 2\nQ2: Option 4\nDo not include any explanations, reasoning, or other text.${mistakePromptStr}\n\nQUIZ:\n${JSON.stringify(quizMap, null, 2)}`;
          
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${groqApiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.1
            })
          });

          if (!response.ok) {
            let errMsg = `API Error: ${response.status}`;
            try {
              const errData = await response.json();
              if (errData.error && errData.error.message) {
                errMsg += ` - ${errData.error.message}`;
              }
            } catch (e) {}
            throw new Error(errMsg);
          }

          const data = await response.json();
          answersDiv.textContent = data.choices[0].message.content;

        } catch (error) {
          answersDiv.textContent = `Error getting answers: ${error.message}`;
        } finally {
          btnGetAnswers.disabled = false;
        }
      });
    }
    
    if (btnMemorize) {
      btnMemorize.addEventListener("click", async () => {
        btnMemorize.disabled = true;
        answersDiv.hidden = false;
        answersDiv.textContent = "Extracting incorrect answers...";
        
        try {
          const wrongQuestions = [];
          const incorrectIcons = document.querySelectorAll('[data-testid="icon-incorrect"]');

          incorrectIcons.forEach(icon => {
            let container = icon;
            while (container && container.tagName !== 'BODY') {
              if (container.querySelector('.rc-Option')) {
                break;
              }
              container = container.parentElement;
            }
            
            if (!container || container.tagName === 'BODY') return;
            
            let questionBlock = container;
            let parent = container.parentElement;
            for (let i = 0; i < 4; i++) {
              if (!parent || parent.tagName === 'BODY') break;
              if (parent.innerText.trim().length > container.innerText.trim().length + 15) {
                questionBlock = parent;
                break;
              }
              parent = parent.parentElement;
            }
            
            const clone = questionBlock.cloneNode(true);
            clone.querySelectorAll('.rc-Option').forEach(o => o.remove());
            clone.querySelectorAll('[id$="-grade-feedback"]').forEach(o => o.remove());
            
            let rawText = clone.innerText.replace(/1 point/g, '').replace(/0 \/ 1 point/g, '').trim();
            const poisonIndex = rawText.indexOf("You are a helpful AI assistant");
            if (poisonIndex !== -1) {
                rawText = rawText.substring(0, poisonIndex).trim();
            }
            const questionText = rawText.replace(/\n+/g, ' ').trim();
            
            const selectedOptions = Array.from(container.querySelectorAll('.cds-checkboxAndRadio-checked'));
            const wrongAnswers = selectedOptions.map(opt => {
               const label = opt.querySelector('.cds-checkboxAndRadio-labelText');
               return label ? label.innerText.trim() : "";
            }).filter(t => t);
            
            wrongQuestions.push({
              question: questionText,
              wrongAnswers: wrongAnswers
            });
          });
          
          if (wrongQuestions.length === 0) {
             answersDiv.textContent = "No incorrect answers found to memorize.";
             return;
          }
          
          const assignmentId = location.pathname.split('/')[4] || 'unknown';
          const storageKey = `mistakes_${assignmentId}`;
          
          await chrome.storage.local.set({ [storageKey]: wrongQuestions });
          
          answersDiv.textContent = `Memorized ${wrongQuestions.length} incorrect answers for this assignment. The AI will avoid these next time!`;
          
        } catch (e) {
           answersDiv.textContent = `Error: ${e.message}`;
        } finally {
          btnMemorize.disabled = false;
        }
      });
    }

    // Ensure the banner is updated immediately upon installation
    getAutopilotState().then(updateAutopilotBanner);
  }

  function extractQuizMap() {
    const options = Array.from(document.querySelectorAll('.rc-Option'));
    if (options.length === 0) return [];

    const questionGroups = new Map();
    options.forEach(opt => {
      let parent = opt.parentElement;
      while (parent && parent.tagName !== 'BODY') {
        if (parent.querySelectorAll('.rc-Option').length >= 2) {
          if (!questionGroups.has(parent)) {
            questionGroups.set(parent, []);
          }
          questionGroups.get(parent).push(opt);
          break;
        }
        parent = parent.parentElement;
      }
    });

    const quizMap = [];
    let qNum = 1;
    
    questionGroups.forEach((opts, container) => {
      let questionBlock = container;
      let parent = container.parentElement;
      
      for (let i = 0; i < 4; i++) {
        if (!parent || parent.tagName === 'BODY') break;
        if (parent.innerText.trim().length > container.innerText.trim().length + 15) {
          questionBlock = parent;
          break;
        }
        parent = parent.parentElement;
      }

      const clone = questionBlock.cloneNode(true);
      clone.querySelectorAll('.rc-Option').forEach(o => o.remove());
      
      let rawText = clone.innerText
          .replace(/1 point/g, '')
          .replace(/Mark as complete/g, '')
          .trim();
          
      const poisonIndex = rawText.indexOf("You are a helpful AI assistant");
      if (poisonIndex !== -1) {
          rawText = rawText.substring(0, poisonIndex).trim();
      }

      const mappedOptions = opts.map(o => o.innerText.trim());

      quizMap.push({
        id: qNum++,
        question: rawText.replace(/\n+/g, ' ').trim(),
        options: mappedOptions
      });
    });
    
    return quizMap;
  }

  function installWhenRelevant() {
    if (shouldShowControl()) {
      installControl();
      return;
    }

    const observer = new MutationObserver(() => {
      if (shouldShowControl()) {
        observer.disconnect();
        installControl();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.setTimeout(() => observer.disconnect(), DETECTION_TIMEOUT_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installWhenRelevant, { once: true });
  } else {
    installWhenRelevant();
  }

  // ── Auto-start auto-pilot if state is "running" on page load ──

  async function checkAutopilotOnLoad() {
    // Small delay to let the page render
    await wait(500);
    const state = await getAutopilotState();

    if (state === "running") {
      // Ensure the control is installed so the banner can show
      installControl();
      runAutopilotLoop();
    } else if (state === "paused") {
      installControl();
      updateAutopilotBanner("paused");
    }
  }

  if (isCourseraPage()) {
    checkAutopilotOnLoad();
  }
})();
