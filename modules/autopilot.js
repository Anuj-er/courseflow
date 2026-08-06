(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};
  const skipper = globalThis.__videoFinishSkipper;

  const RESPONSE_TIMEOUT_MS = 950;
  const PAGE_SETTLE_MS = 2500;
  
  CF.autopilotRunning = false;

  CF.getAutopilotState = async function() {
    try {
      const data = await chrome.storage.local.get(CF.AUTOPILOT_KEY);
      return data[CF.AUTOPILOT_KEY] || "idle";
    } catch {
      return "idle";
    }
  };

  CF.setAutopilotState = async function(state) {
    try {
      await chrome.storage.local.set({ [CF.AUTOPILOT_KEY]: state });
    } catch {
      // Ignore
    }
  };

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
      if (location.href !== previousUrl) return true;
      const state = await CF.getAutopilotState();
      if (state !== "running") return false;
      await CF.wait(400);
    }
    return false;
  }

  async function processCurrentPage() {
    CF.installControl();

    const pauseCheck = skipper.detectPausablePage(document);
    if (pauseCheck.pause) {
      await chrome.storage.local.set({ autopilotPauseReason: pauseCheck.label });
      await CF.setAutopilotState("paused");
      CF.updateAutopilotBanner("paused");
      alert(`Auto-pilot paused:\n\n${pauseCheck.label}`);
      return "paused";
    }

    await chrome.storage.local.remove("autopilotPauseReason");
    CF.updateAutopilotBanner("running");

    const hasVideo = skipper.hasVideoOnPage(document);
    if (hasVideo) {
      const requestId = `autopilot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const request = { results: [] };
      CF.pendingRequests.set(requestId, request);

      try {
        CF.postRunMessageToChildren(requestId);
        request.results.push(await skipper.skipCurrentFrameVideo());
        await CF.wait(RESPONSE_TIMEOUT_MS);

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
        CF.pendingRequests.delete(requestId);
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

  CF.runAutopilotLoop = async function() {
    if (!CF.isTopFrame()) return;
    if (CF.autopilotRunning) return;
    CF.autopilotRunning = true;

    try {
      while (true) {
        const state = await CF.getAutopilotState();
        if (state !== "running") {
          CF.updateAutopilotBanner(state === "paused" ? "paused" : "idle");
          break;
        }

        await CF.wait(PAGE_SETTLE_MS);

        const stateAfterWait = await CF.getAutopilotState();
        if (stateAfterWait !== "running") {
          CF.updateAutopilotBanner(stateAfterWait === "paused" ? "paused" : "idle");
          break;
        }

        const urlBefore = location.href;
        const result = await processCurrentPage();

        if (result === "paused") break;
        if (result === "stuck") {
          await chrome.storage.local.set({ autopilotPauseReason: "Could not find next action." });
          await CF.setAutopilotState("paused");
          CF.updateAutopilotBanner("paused");
          alert("Auto-pilot paused:\n\nCould not find next action.");
          break;
        }

        const urlChanged = await waitForUrlChange(urlBefore);
        if (!urlChanged) break;
      }
    } catch (error) {
      await chrome.storage.local.set({ autopilotPauseReason: error?.message || "Unknown error" });
      await CF.setAutopilotState("paused");
      CF.updateAutopilotBanner("paused");
    } finally {
      CF.autopilotRunning = false;
    }
  };

  CF.runSkipFromButton = async function(button) {
    const pauseCheck = skipper.detectPausablePage(document);
    if (pauseCheck.pause) {
      const proceed = confirm(`WARNING: Please complete this ${pauseCheck.label.toLowerCase()}.\n\nIf you skip this, the course cannot be completed!\n\nDo you still want to force skip it?`);
      if (!proceed) return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const request = { results: [] };

    CF.pendingRequests.set(requestId, request);
    button.disabled = true;

    try {
      CF.postRunMessageToChildren(requestId);
      request.results.push(await skipper.skipCurrentFrameVideo());
      await CF.wait(RESPONSE_TIMEOUT_MS);

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
      CF.pendingRequests.delete(requestId);
      button.disabled = false;
    }
  };
})();
