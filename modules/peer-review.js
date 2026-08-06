(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};

  CF.gradePeerReview = function(btn, statusEl) {
    btn.disabled = true;
    let oldText = btn.textContent;
    btn.textContent = "Grading...";
    
    try {
      // 1. Find all radio buttons and group them by name
      const radioGroups = new Map();
      const nativeRadios = document.querySelectorAll('input[type="radio"]');
      
      if (nativeRadios.length > 0) {
        nativeRadios.forEach(r => {
          const name = r.name || Math.random().toString();
          if (!radioGroups.has(name)) radioGroups.set(name, []);
          radioGroups.get(name).push(r);
        });
      } else {
        // Fallback for custom React role="radio"
        const customRadios = document.querySelectorAll('[role="radio"]');
        customRadios.forEach(r => {
          const group = r.closest('[role="radiogroup"]');
          const name = group ? (group.id || group.className) : Math.random().toString();
          if (!radioGroups.has(name)) radioGroups.set(name, []);
          radioGroups.get(name).push(r);
        });
      }

      // 2. Click the FIRST radio button in each group (which is the max score/Yes)
      let clickCount = 0;
      radioGroups.forEach(radios => {
        if (radios.length > 0) {
          const maxOption = radios[0]; // First option is max score
          maxOption.click();
          clickCount++;
        }
      });

      // 3. Find all textareas and fill them with generic positive feedback
      let textCount = 0;
      const textAreas = document.querySelectorAll('textarea');
      textAreas.forEach(ta => {
        // Skip if it's already filled
        if (ta.value.trim() === "") {
          ta.value = "Great work! All requirements have been met. Excellent submission.";
          // Dispatch events for React to pick up the change
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          textCount++;
        }
      });

      if (statusEl) {
        statusEl.textContent = `Graded! Selected ${clickCount} options and filled ${textCount} text boxes.`;
        statusEl.hidden = false;
        setTimeout(() => { statusEl.hidden = true; }, 4000);
      }
      
    } catch (error) {
      console.error(error);
      if (statusEl) {
        statusEl.textContent = "Error grading peer review.";
        statusEl.hidden = false;
      }
    } finally {
      btn.textContent = oldText;
      btn.disabled = false;
    }
  };

  CF.setupPeerReviewListeners = function(btnGradePeer, statusEl) {
    if (btnGradePeer) {
      btnGradePeer.addEventListener("click", () => {
        CF.gradePeerReview(btnGradePeer, statusEl);
      });
    }
  };

})();
