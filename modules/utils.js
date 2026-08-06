(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};

  CF.CONTROL_ID = "video-finish-skipper-page-control";
  CF.AUTOPILOT_KEY = "autopilotState";

  CF.wait = function(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  };

  CF.isTopFrame = function() {
    try {
      return window.top === window;
    } catch {
      return false;
    }
  };

  CF.isNormalWebPage = function() {
    return location.protocol === "http:" || location.protocol === "https:";
  };

  CF.isCourseraPage = function() {
    return location.hostname === "coursera.org" || location.hostname.endsWith(".coursera.org");
  };

  CF.shouldShowControl = function() {
    const skipper = globalThis.__videoFinishSkipper;
    return CF.isCourseraPage() || (skipper && skipper.hasLikelyVideo(document));
  };
})();
