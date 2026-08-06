(async () => {
  "use strict";

  const skipper = globalThis.__videoFinishSkipper;

  if (!skipper?.skipCurrentFrameVideo) {
    return {
      ok: false,
      skipped: false,
      videoCount: 0,
      frameUrl: location.href,
      message: "Video skipper is not available in this frame."
    };
  }

  return skipper.skipCurrentFrameVideo();
})();
