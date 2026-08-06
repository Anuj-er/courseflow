(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};
  const skipper = globalThis.__videoFinishSkipper;

  if (!skipper) {
    return;
  }

  if (!CF.isTopFrame() || !CF.isNormalWebPage()) {
    return;
  }

  const DETECTION_TIMEOUT_MS = 30000;

  // Poll for URL changes
  let lastKnownUrl = location.href;
  setInterval(async () => {
    if (location.href !== lastKnownUrl) {
      lastKnownUrl = location.href;
      
      const host = document.getElementById(CF.CONTROL_ID);
      if (host && host.shadowRoot) {
        const answersDiv = host.shadowRoot.querySelector("#answersDiv");
        if (answersDiv) {
          answersDiv.hidden = true;
          answersDiv.textContent = "";
        }
      }

      const state = await CF.getAutopilotState();
      CF.updateAutopilotBanner(state);
    }
  }, 1000);

  // Listen for messages from popup
  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === "autopilot-trigger") {
      CF.runAutopilotLoop();
    }
  });

  // Listen for storage changes
  chrome.storage?.onChanged?.addListener((changes) => {
    if (changes[CF.AUTOPILOT_KEY]) {
      const newState = changes[CF.AUTOPILOT_KEY].newValue || "idle";

      if (newState === "running") {
        CF.runAutopilotLoop();
      } else if (newState === "idle") {
        CF.autopilotRunning = false;
        CF.updateAutopilotBanner("idle");
      } else if (newState === "paused") {
        CF.updateAutopilotBanner("paused");
      }
    }
  });

  function installWhenRelevant() {
    if (CF.shouldShowControl()) {
      CF.installControl();
      return;
    }

    const observer = new MutationObserver(() => {
      if (CF.shouldShowControl()) {
        observer.disconnect();
        CF.installControl();
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

  // Auto-start auto-pilot if state is "running" on page load
  async function checkAutopilotOnLoad() {
    await CF.wait(500);
    const state = await CF.getAutopilotState();

    if (state === "running") {
      CF.installControl();
      CF.runAutopilotLoop();
    } else if (state === "paused") {
      CF.installControl();
      CF.updateAutopilotBanner("paused");
    }
  }

  if (CF.isCourseraPage()) {
    checkAutopilotOnLoad();
  }
})();
