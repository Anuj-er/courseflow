(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};
  const skipper = globalThis.__videoFinishSkipper;

  const SOURCE = "video-finish-skipper";
  const RUN_MESSAGE = "run-skip";
  const RESULT_MESSAGE = "skip-result";

  CF.pendingRequests = new Map();

  CF.postRunMessageToChildren = function(requestId) {
    let frameCount = 0;
    try {
      frameCount = window.frames.length;
    } catch {
      return;
    }
    for (let index = 0; index < frameCount; index += 1) {
      try {
        window.frames[index].postMessage({ source: SOURCE, type: RUN_MESSAGE, requestId }, "*");
      } catch {
        // Ignore unreachable frames
      }
    }
  };

  CF.postResultToParent = function(requestId, result) {
    if (CF.isTopFrame()) return;
    try {
      window.parent.postMessage({ source: SOURCE, type: RESULT_MESSAGE, requestId, result }, "*");
    } catch {
      // Ignore unreachable parent
    }
  };

  async function handleRunMessage(data) {
    CF.postRunMessageToChildren(data.requestId);
    if (skipper) {
      const result = await skipper.skipCurrentFrameVideo();
      CF.postResultToParent(data.requestId, result);
    }
  }

  function handleResultMessage(data) {
    if (CF.isTopFrame()) {
      const request = CF.pendingRequests.get(data.requestId);
      if (request) {
        request.results.push(data.result);
      }
      return;
    }
    CF.postResultToParent(data.requestId, data.result);
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== SOURCE) return;

    if (data.type === RUN_MESSAGE && !CF.isTopFrame() && event.source === window.parent) {
      handleRunMessage(data);
      return;
    }
    if (data.type === RESULT_MESSAGE) {
      handleResultMessage(data);
    }
  });
})();
