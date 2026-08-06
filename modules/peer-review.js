(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};

  CF.gradePeerReview = async function(btn, isMaxScore, statusEl) {
    btn.disabled = true;
    
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

      // 2. Click the selected radio button in each group
      let clickCount = 0;
      radioGroups.forEach(radios => {
        if (radios.length > 0) {
          const targetIndex = isMaxScore ? 0 : (radios.length - 1);
          const optionToClick = radios[targetIndex];
          optionToClick.click();
          clickCount++;
        }
      });

      // 3. Find all textareas and fill them with generic feedback
      let textCount = 0;
      const textAreas = document.querySelectorAll('textarea');
      textAreas.forEach(ta => {
        // Skip if it's already filled
        if (ta.value.trim() === "") {
          ta.value = "Review submitted as per the grading criteria.";
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
      
      // Scroll to the bottom of the page so the user can easily click submit
      // Scroll to the bottom of the page so the user can easily click submit
      // Extremely robust scroll to handle Coursera's weird React containers
      setTimeout(() => {
        // Scroll the window
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        
        // Scroll the app container if it exists
        const appContainer = document.querySelector('.rc-RefreshApp, #rendered-content');
        if (appContainer) {
          appContainer.scrollTo({ top: appContainer.scrollHeight, behavior: 'smooth' });
        }
        
        // Try to find the submit button and scroll it into view directly
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn = buttons.reverse().find(b => b.innerText && b.innerText.includes('Submit'));
        if (submitBtn) {
          submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // Fallback to the last textarea
          const textAreas = document.querySelectorAll('textarea');
          if (textAreas.length > 0) {
            textAreas[textAreas.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 150);
      
    } catch (error) {
      console.error(error);
      if (statusEl) {
        statusEl.textContent = "Error grading peer review.";
        statusEl.hidden = false;
      }
    } finally {
      btn.disabled = false;
    }
  };

  CF.setupPeerReviewListeners = function(btnGradePeer, scoreToggle, scoreToggleWrapper, statusEl) {
    let isMaxScore = true; // Default to max score

    if (scoreToggle) {
      scoreToggle.addEventListener("change", (e) => {
        isMaxScore = e.target.checked;
      });
    }

    if (btnGradePeer) {
      btnGradePeer.addEventListener("click", () => {
        CF.gradePeerReview(btnGradePeer, isMaxScore, statusEl);
      });
    }
  };

})();
