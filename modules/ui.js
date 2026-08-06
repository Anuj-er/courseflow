(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};
  const STATUS_HIDE_MS = 3200;

  CF.setStatus = function(statusEl, message, kind = "info") {
    window.clearTimeout(CF.setStatus.hideTimer);
    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
    statusEl.hidden = false;

    if (kind === "success") {
      CF.setStatus.hideTimer = window.setTimeout(() => {
        statusEl.hidden = true;
      }, STATUS_HIDE_MS);
    }
  };

  CF.updateAutopilotBanner = function(state) {
    const host = document.getElementById(CF.CONTROL_ID);
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
    const isPeerReviewPage = window.location.pathname.includes('/give-feedback') || window.location.pathname.includes('/review-next');

    if (isAttemptPage || isFeedbackPage || isPeerReviewPage) {
      banner.hidden = true;
      if (skipBtn) skipBtn.hidden = true;
      if (assignmentUI) {
        assignmentUI.hidden = false;
        if (btnGetAnswers) btnGetAnswers.hidden = !isAttemptPage;
        const btnCopyQuestions = host.shadowRoot.querySelector("#btnCopyQuestions");
        if (btnCopyQuestions) btnCopyQuestions.hidden = !isAttemptPage;
        if (btnMemorize) btnMemorize.hidden = !isFeedbackPage;
        const btnGradePeer = host.shadowRoot.querySelector("#btnGradePeer");
        if (btnGradePeer) btnGradePeer.hidden = !isPeerReviewPage;
        const scoreToggleWrapper = host.shadowRoot.querySelector("#scoreToggleWrapper");
        if (scoreToggleWrapper) scoreToggleWrapper.hidden = !isPeerReviewPage;
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
  };

  CF.installControl = function() {
    if (document.getElementById(CF.CONTROL_ID)) {
      return;
    }

    const host = document.createElement("div");
    host.id = CF.CONTROL_ID;

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

        .btn-get-answers, .btn-memorize, .btn-grade-peer, .btn-copy, .btn-score-toggle {
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
        .btn-grade-peer { color: #F59E0B; }
        .btn-copy { color: #6B7280; }

        /* Toggle Switch CSS */
        .score-toggle-wrapper {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 8px;
          border: 1px solid rgba(15, 23, 42, 0.1);
          background: #ffffff;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          pointer-events: auto;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .score-toggle-wrapper:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
          background: #FFFBEB;
        }
        .score-toggle-wrapper:active {
          transform: scale(0.92);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        .switch {
          position: relative;
          display: inline-block;
          width: 28px;
          height: 16px;
        }
        .switch input { 
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #F59E0B; /* Same color, doesn't change */
          transition: .3s;
          border-radius: 16px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 12px;
          width: 12px;
          left: 2px;
          bottom: 2px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        input:checked + .slider {
          background-color: #F59E0B; /* Stays exactly the same */
        }
        input:checked + .slider:before {
          transform: translateX(12px);
        }

        .btn-get-answers:hover { background: #ECFDF5; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); }
        .btn-memorize:hover { background: #F5F3FF; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); }
        .btn-grade-peer:hover { background: #FFFBEB; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); }
        .btn-copy:hover { background: #F3F4F6; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2); }

        .btn-get-answers:active, .btn-memorize:active, .btn-grade-peer:active, .btn-copy:active {
          transform: scale(0.92);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        
        .btn-get-answers svg, .btn-memorize svg, .btn-grade-peer svg, .btn-copy svg {
          width: 28px;
          height: 28px;
          fill: currentColor;
        }

        .btn-get-answers:disabled, .btn-memorize:disabled, .btn-grade-peer:disabled, .btn-copy:disabled {
          opacity: 0.7;
          cursor: wait;
          animation: btnPulse 1s infinite ease-in-out;
        }
        .btn-get-answers[hidden], .btn-memorize[hidden], .btn-grade-peer[hidden], .btn-copy[hidden], .score-toggle-wrapper[hidden] { display: none; }

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
          <button id="btnCopyQuestions" class="btn-copy" hidden title="Copy Questions to Clipboard">
            <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button id="btnGetAnswers" class="btn-get-answers" hidden title="Get AI Answers">
            <svg viewBox="0 0 24 24"><path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z"/></svg>
          </button>
          <button id="btnMemorize" class="btn-memorize" hidden title="Memorize Mistakes">
            <svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
          </button>
          <div id="scoreToggleWrapper" class="score-toggle-wrapper" hidden title="Toggle Max/Min Score">
            <label class="switch">
              <input type="checkbox" id="scoreToggle" checked>
              <span class="slider"></span>
            </label>
          </div>
          <button id="btnGradePeer" class="btn-grade-peer" hidden title="Grade Peer">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
          <div id="answersDiv" class="answers-div" hidden></div>
        </div>

        <div class="status" role="status" hidden></div>
      </div>
    `;

    const button = shadow.querySelector(".skip-btn");
    const statusEl = shadow.querySelector(".status");
    button.addEventListener("click", () => CF.runSkipFromButton(button, statusEl));

    // Autopilot actions
    const continueBtn = shadow.querySelector(".autopilot-continue-btn");
    const pauseBtn = shadow.querySelector(".autopilot-pause-btn");
    const stopBtn = shadow.querySelector(".autopilot-stop-btn");

    continueBtn.addEventListener("click", async () => {
      await CF.setAutopilotState("running");
      CF.runAutopilotLoop();
    });

    pauseBtn.addEventListener("click", async () => {
      await CF.setAutopilotState("paused");
      CF.updateAutopilotBanner("paused");
    });

    stopBtn.addEventListener("click", async () => {
      await CF.setAutopilotState("idle");
    });

    document.documentElement.append(host);
    
    const btnMemorize = shadow.querySelector("#btnMemorize");
    const btnGetAnswers = shadow.querySelector("#btnGetAnswers");
    const btnCopyQuestions = shadow.querySelector("#btnCopyQuestions");
    const answersDiv = shadow.querySelector("#answersDiv");
    const btnGradePeer = shadow.querySelector("#btnGradePeer");
    const scoreToggleWrapper = shadow.querySelector("#scoreToggleWrapper");
    const scoreToggle = shadow.querySelector("#scoreToggle");
    
    // Assignment Helper Logic Setup
    if (CF.setupAssignmentListeners) {
      CF.setupAssignmentListeners(btnGetAnswers, btnMemorize, btnCopyQuestions, answersDiv);
    }
    
    if (CF.setupPeerReviewListeners) {
      CF.setupPeerReviewListeners(btnGradePeer, scoreToggle, scoreToggleWrapper, statusEl);
    }

    // Ensure the banner is updated immediately upon installation
    CF.getAutopilotState().then(CF.updateAutopilotBanner);

    // Watch for URL changes (Single Page App navigations)
    if (!CF.urlWatcherInterval) {
      let lastUrl = location.href;
      CF.urlWatcherInterval = setInterval(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          CF.getAutopilotState().then(CF.updateAutopilotBanner);
        }
      }, 1000);
    }
  };
})();
