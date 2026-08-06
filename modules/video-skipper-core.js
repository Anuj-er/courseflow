(() => {
  "use strict";

  if (globalThis.__videoFinishSkipper?.version >= 2) {
    return;
  }

  const END_OFFSET_SECONDS = 0.4;
  const METADATA_TIMEOUT_MS = 1600;
  const PLAY_SETTLE_MS = 350;
  const POST_SKIP_MIN_WAIT_MS = 700;
  const POST_SKIP_MAX_WAIT_MS = 4500;
  const COMPLETION_ACTION_TIMEOUT_MS = 12000;
  const COMPLETION_ACTION_RETRY_MS = 250;

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function waitForEvent(target, eventName, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        target.removeEventListener(eventName, handleEvent);
        window.clearTimeout(timer);
      };

      const finish = (callback) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        callback();
      };

      const handleEvent = () => finish(resolve);
      const timer = window.setTimeout(() => {
        finish(() => reject(new Error(`Timed out waiting for ${eventName}`)));
      }, timeoutMs);

      target.addEventListener(eventName, handleEvent, { once: true });
    });
  }

  function collectVideos(root) {
    const videos = [];
    const visited = new Set();

    const visit = (node) => {
      if (!node || visited.has(node)) {
        return;
      }

      visited.add(node);

      if (node instanceof HTMLVideoElement) {
        videos.push(node);
      }

      if (node.querySelectorAll) {
        node.querySelectorAll("video").forEach((video) => videos.push(video));
        node.querySelectorAll("*").forEach((element) => {
          if (element.shadowRoot) {
            visit(element.shadowRoot);
          }
        });
      }
    };

    visit(root);
    return [...new Set(videos)];
  }

  function readControlDuration(doc) {
    const selectors = [
      "[aria-label*='Video Progress' i][aria-valuemax]",
      "[data-testid='video-progress-bar'] [aria-valuemax]",
      "[role='slider'][aria-valuemax]",
      "input[type='range'][max]"
    ];

    for (const selector of selectors) {
      const control = doc.querySelector(selector);
      const value = control?.getAttribute("aria-valuemax") || control?.getAttribute("max");
      const duration = Number.parseFloat(value);

      if (Number.isFinite(duration) && duration > 0) {
        return duration;
      }
    }

    return 0;
  }

  function getDuration(video) {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      return video.duration;
    }

    if (video.seekable?.length) {
      const seekableEnd = video.seekable.end(video.seekable.length - 1);

      if (Number.isFinite(seekableEnd) && seekableEnd > 0) {
        return seekableEnd;
      }
    }

    return readControlDuration(video.ownerDocument);
  }

  function getVideoScore(video) {
    const rect = video.getBoundingClientRect();
    const style = window.getComputedStyle(video);
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    const visible = area > 0 && style.display !== "none" && style.visibility !== "hidden";
    const playing = !video.paused && !video.ended;
    const duration = getDuration(video);

    return area + (visible ? 100000 : 0) + (playing ? 50000 : 0) + Math.min(duration || 0, 10000);
  }

  function pickBestVideo(videos) {
    return videos
      .map((video) => ({
        video,
        score: getVideoScore(video)
      }))
      .sort((a, b) => b.score - a.score)[0];
  }

  async function tryPlay(video) {
    try {
      await video.play();
      return {
        playStarted: true,
        playError: ""
      };
    } catch (firstError) {
      const wasMuted = video.muted;

      try {
        video.muted = true;
        await video.play();
        return {
          playStarted: true,
          playError: ""
        };
      } catch (secondError) {
        video.muted = wasMuted;
        return {
          playStarted: false,
          playError: secondError?.message || firstError?.message || "Playback was blocked."
        };
      }
    }
  }

  function hasLikelyVideo(doc = document) {
    try {
      return Boolean(
        doc.querySelector(
          "video, [data-testid='video-control-bar'], [aria-label*='Video Progress' i], [role='slider'][aria-valuemax], [data-testid='mark-complete'], button[aria-label*='Go to next item' i]"
        )
      );
    } catch {
      return false;
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
      return "the end";
    }

    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const remainder = String(total % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function pickBestResult(results) {
    return results
      .filter(Boolean)
      .sort((a, b) => {
        if (a.skipped !== b.skipped) {
          return a.skipped ? -1 : 1;
        }

        if ((a.videoCount || 0) !== (b.videoCount || 0)) {
          return (b.videoCount || 0) - (a.videoCount || 0);
        }

        return (b.score || 0) - (a.score || 0);
      })[0];
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function isUsableButton(button) {
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
      return false;
    }

    const rect = button.getBoundingClientRect();
    const style = window.getComputedStyle(button);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.pointerEvents !== "none"
    );
  }

  function buttonText(button) {
    return normalizeText(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`);
  }

  function findButtonBySelectors(selectors) {
    for (const selector of selectors) {
      const button = document.querySelector(selector);

      if (isUsableButton(button)) {
        return button;
      }
    }

    return null;
  }

  function findButtonByText(matcher) {
    return [...document.querySelectorAll("button, a")].find((button) => {
      return isUsableButton(button) && matcher(buttonText(button), button);
    });
  }

  function findMarkAsCompletedButton() {
    return (
      findButtonBySelectors([
        "button[data-testid='mark-complete']",
        "button[data-testid*='mark-complete' i]",
        "button[aria-label*='Mark as completed' i]",
        "button[aria-label*='Mark complete' i]"
      ]) ||
      findButtonByText((text, button) => {
        return (
          text.includes("mark as completed") ||
          text.includes("mark complete") ||
          normalizeText(button.getAttribute("data-testid")).includes("mark-complete")
        );
      })
    );
  }

  function findGoToNextItemButton() {
    return (
      findButtonBySelectors([
        "button[aria-label='Go to next item' i]",
        "button[aria-label*='Go to next item' i]",
        "a[aria-label='Go to next item' i]",
        "a[aria-label*='Go to next item' i]",
        "[data-track-component='nav_button_next']",
        "button[data-testid='next-item']",
        "a[data-testid='next-item']"
      ]) ||
      findButtonByText((text) => text.startsWith("next") || text.includes("go to next") || text.includes("next item") || text.includes("next module"))
    );
  }

  function findCompletionActionButton() {
    const markButton = findMarkAsCompletedButton();

    if (markButton) {
      return {
        button: markButton,
        action: "mark-completed",
        label: "Mark as completed"
      };
    }

    const nextButton = findGoToNextItemButton();

    if (nextButton) {
      return {
        button: nextButton,
        action: "next-item",
        label: "Go to next item"
      };
    }

    return null;
  }

  async function waitForButton(findFn, timeoutMs) {
    const deadline = performance.now() + timeoutMs;

    do {
      const result = findFn();

      if (result) {
        const el = result.button || result;
        if (isUsableButton(el)) {
          return result;
        }
      }

      await wait(COMPLETION_ACTION_RETRY_MS);
    } while (performance.now() < deadline);

    return null;
  }

  const NEXT_ITEM_AFTER_MARK_TIMEOUT_MS = 3000;

  async function clickCompletionAction({ timeoutMs = COMPLETION_ACTION_TIMEOUT_MS } = {}) {
    const isSupplement = window.location.pathname.includes('/supplement/');
    if (isSupplement) {
      window.scrollTo(0, document.body.scrollHeight);
      timeoutMs = Math.max(timeoutMs, 12000); // Coursera enforces a read timer on some supplements
      await wait(500);
    }
    
    const actionObj = await waitForButton(findCompletionActionButton, timeoutMs);
    if (!actionObj) {
      return {
        clicked: false,
        action: "none",
        label: "No completion action found",
        frameUrl: location.href
      };
    }
    
    actionObj.button.scrollIntoView({ block: "center", inline: "center" });
    await wait(80);
    actionObj.button.click();
    
    if (actionObj.action === "mark-completed") {
      await wait(500);
      const nextButton = await waitForButton(findGoToNextItemButton, NEXT_ITEM_AFTER_MARK_TIMEOUT_MS);
      if (nextButton) {
        nextButton.scrollIntoView({ block: "center", inline: "center" });
        await wait(80);
        nextButton.click();
        
        return {
          clicked: true,
          action: "mark-completed-and-next",
          label: "Mark as completed → Go to next item",
          frameUrl: location.href
        };
      }
    }
    
    return {
      clicked: true,
      action: actionObj.action,
      label: actionObj.label,
      frameUrl: location.href
    };
  }

  function getPostSkipWaitMs(skipResult) {
    if (!skipResult?.skipped) {
      return 0;
    }

    if (!skipResult.playStarted) {
      return POST_SKIP_MIN_WAIT_MS;
    }

    const currentTime = Number.isFinite(skipResult.currentTime)
      ? skipResult.currentTime
      : skipResult.targetTime;
    const remainingSeconds = skipResult.duration - currentTime;

    if (!Number.isFinite(remainingSeconds)) {
      return POST_SKIP_MIN_WAIT_MS;
    }

    return Math.min(
      POST_SKIP_MAX_WAIT_MS,
      Math.max(POST_SKIP_MIN_WAIT_MS, Math.ceil(remainingSeconds * 1000) + 800)
    );
  }

  async function continueAfterSkipResult(skipResult) {
    const waitMs = getPostSkipWaitMs(skipResult);

    if (waitMs > 0) {
      await wait(waitMs);
    }

    return clickCompletionAction();
  }

  async function skipCurrentFrameVideo() {
    const videos = collectVideos(document);
    const best = pickBestVideo(videos);

    if (!best) {
      return {
        ok: false,
        skipped: false,
        videoCount: 0,
        frameUrl: location.href,
        message: "No HTML5 video found in this frame."
      };
    }

    const { video, score } = best;

    if (video.readyState === 0) {
      await waitForEvent(video, "loadedmetadata", METADATA_TIMEOUT_MS).catch(() => {});
    }

    const duration = getDuration(video);

    if (!Number.isFinite(duration) || duration <= 0) {
      return {
        ok: false,
        skipped: false,
        videoCount: videos.length,
        frameUrl: location.href,
        score,
        message: "The video duration is not available yet."
      };
    }

    const targetTime = Math.max(0, duration - END_OFFSET_SECONDS);
    const beforeTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

    try {
      video.currentTime = targetTime;
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        videoCount: videos.length,
        frameUrl: location.href,
        score,
        duration,
        message: error?.message || "The video could not be seeked."
      };
    }

    const playback = await tryPlay(video);
    await wait(PLAY_SETTLE_MS);

    return {
      ok: true,
      skipped: true,
      videoCount: videos.length,
      frameUrl: location.href,
      score,
      beforeTime,
      targetTime,
      currentTime: video.currentTime,
      duration,
      playStarted: playback.playStarted,
      playError: playback.playError
    };
  }

  // Detects pages where auto-pilot should pause for manual user action.
  // Returns { pause: true, type: "...", label: "..." } or { pause: false }.
  function detectPausablePage(doc = document) {
    try {
      // 1. Check the CoverPageActionButton (used for assignments, quizzes, exams, labs)
      const coverButton = doc.querySelector(
        "button[data-testid='CoverPageActionButton'], button[data-e2e='CoverPageActionButton']"
      );

      if (coverButton) {
        const text = normalizeText(coverButton.textContent);

        if (text.includes("start assignment") || text.includes("resume assignment")) {
          return { pause: true, type: "assignment", label: "Assignment" };
        }

        if (text.includes("start quiz") || text.includes("resume quiz")) {
          return { pause: true, type: "quiz", label: "Quiz" };
        }

        if (text.includes("start exam") || text.includes("resume exam")) {
          return { pause: true, type: "exam", label: "Exam" };
        }

        if (text.includes("start lab") || text.includes("resume lab") || text.includes("open lab") || text.includes("launch lab")) {
          return { pause: true, type: "lab", label: "Lab" };
        }

        if (text.includes("review your peers") || text.includes("start review") || text.includes("give feedback")) {
          return { pause: true, type: "peer-review", label: "Peer Review" };
        }

        if (text.includes("start discussion") || text.includes("create a post")) {
          return { pause: true, type: "discussion", label: "Discussion Prompt" };
        }

        if (text.includes("submit")) {
          return { pause: true, type: "submission", label: "Submission" };
        }
      }

      // 2. Check URL path patterns as fallback (SPA URLs may contain these)
      const path = location.pathname.toLowerCase();

      if (path.includes("/assignment-submission/") || path.includes("/assignment/")) {
        return { pause: true, type: "assignment", label: "Assignment Submission" };
      }

      if (path.includes("/peer/") || path.includes("/peer-review")) {
        return { pause: true, type: "peer-review", label: "Peer Review" };
      }

      if (path.includes("/lab/") || path.includes("/ungradedLab") || path.includes("/ungradedlab")) {
        return { pause: true, type: "lab", label: "Lab" };
      }

      if (path.includes("/exam/")) {
        return { pause: true, type: "exam", label: "Exam" };
      }

      // 3. Check for lab iframes (Coursera labs often embed in iframes)
      const labIframe = doc.querySelector(
        "iframe[src*='coursera-labs'], iframe[src*='rhyme.com'], iframe[data-testid*='lab' i]"
      );

      if (labIframe) {
        return { pause: true, type: "lab", label: "Lab" };
      }

      return { pause: false };
    } catch {
      return { pause: false };
    }
  }

  // Backwards-compatible wrapper
  function isAssignmentPage(doc = document) {
    return detectPausablePage(doc).pause;
  }

  function hasVideoOnPage(doc = document) {
    try {
      const videos = collectVideos(doc);
      return videos.length > 0;
    } catch {
      return false;
    }
  }

  globalThis.__videoFinishSkipper = {
    version: 2,
    clickCompletionAction,
    continueAfterSkipResult,
    detectPausablePage,
    formatTime,
    hasLikelyVideo,
    hasVideoOnPage,
    isAssignmentPage,
    pickBestResult,
    skipCurrentFrameVideo
  };
})();
