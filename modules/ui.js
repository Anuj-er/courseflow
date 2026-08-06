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
    const answersDiv = shadow.querySelector("#answersDiv");
    
    // Assignment Helper Logic Setup
    if (CF.setupAssignmentListeners) {
      CF.setupAssignmentListeners(btnGetAnswers, btnMemorize, answersDiv);
    }

    // Ensure the banner is updated immediately upon installation
    CF.getAutopilotState().then(CF.updateAutopilotBanner);
  };
})();
