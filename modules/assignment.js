(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};

  CF.extractQuizMap = function() {
    const options = Array.from(document.querySelectorAll('.rc-Option'));
    if (options.length === 0) return [];

    const questionGroups = new Map();
    options.forEach(opt => {
      let parent = opt.parentElement;
      while (parent && parent.tagName !== 'BODY') {
        if (parent.querySelectorAll('.rc-Option').length >= 2) {
          if (!questionGroups.has(parent)) {
            questionGroups.set(parent, []);
          }
          questionGroups.get(parent).push(opt);
          break;
        }
        parent = parent.parentElement;
      }
    });

    const quizMap = [];
    let qNum = 1;
    
    questionGroups.forEach((opts, container) => {
      let questionBlock = container;
      let parent = container.parentElement;
      
      for (let i = 0; i < 4; i++) {
        if (!parent || parent.tagName === 'BODY') break;
        if (parent.innerText.trim().length > container.innerText.trim().length + 15) {
          questionBlock = parent;
          break;
        }
        parent = parent.parentElement;
      }

      const clone = questionBlock.cloneNode(true);
      clone.querySelectorAll('.rc-Option').forEach(o => o.remove());
      
      let rawText = clone.innerText
          .replace(/1 point/g, '')
          .replace(/Mark as complete/g, '')
          .trim();
          
      const poisonIndex = rawText.indexOf("You are a helpful AI assistant");
      if (poisonIndex !== -1) {
          rawText = rawText.substring(0, poisonIndex).trim();
      }

      const mappedOptions = opts.map(o => o.innerText.trim());

      quizMap.push({
        id: qNum++,
        question: rawText.replace(/\n+/g, ' ').trim(),
        options: mappedOptions
      });
    });
    
    return quizMap;
  };

  CF.setupAssignmentListeners = function(btnGetAnswers, btnMemorize, answersDiv) {
    if (btnGetAnswers) {
      btnGetAnswers.addEventListener("click", async () => {
        btnGetAnswers.disabled = true;
        answersDiv.hidden = false;
        answersDiv.textContent = "Analyzing quiz...";

        try {
          const quizMap = CF.extractQuizMap();
          if (quizMap.length === 0) {
            answersDiv.textContent = "Could not find any multiple-choice questions on this page.";
            return;
          }

          const { groqApiKey } = await chrome.storage.local.get("groqApiKey");
          if (!groqApiKey) {
            answersDiv.textContent = "Error: Groq API Key not found.\nPlease enter it in the CourseFlow extension popup (Assignments Tab).";
            return;
          }
          
          const assignmentId = location.pathname.split('/')[4] || 'unknown';
          const storageKey = `mistakes_${assignmentId}`;
          const mistakesData = await chrome.storage.local.get(storageKey);
          const mistakes = mistakesData[storageKey] || [];
          
          let mistakePromptStr = "";
          if (mistakes.length > 0) {
             mistakePromptStr = `\n\nWARNING: The following options are KNOWN TO BE INCORRECT based on a previous attempt. DO NOT select these under any circumstances:\n${JSON.stringify(mistakes, null, 2)}\n`;
          }

          answersDiv.textContent = "Asking AI for answers...";
          
          const prompt = `You are a helpful AI answering a multiple-choice quiz. I will provide the questions and options. Your ONLY job is to return a numbered list of the correct answers, in the exact format:\nQ1: Option 2\nQ2: Option 4\nDo not include any explanations, reasoning, or other text.${mistakePromptStr}\n\nQUIZ:\n${JSON.stringify(quizMap, null, 2)}`;
          
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${groqApiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: [{ role: "user", content: prompt }],
              temperature: 0.1
            })
          });

          if (!response.ok) {
            let errMsg = `API Error: ${response.status}`;
            try {
              const errData = await response.json();
              if (errData.error && errData.error.message) {
                errMsg += ` - ${errData.error.message}`;
              }
            } catch (e) {}
            throw new Error(errMsg);
          }

          const data = await response.json();
          answersDiv.textContent = data.choices[0].message.content;

        } catch (error) {
          answersDiv.textContent = `Error getting answers: ${error.message}`;
        } finally {
          btnGetAnswers.disabled = false;
        }
      });
    }
    
    if (btnMemorize) {
      btnMemorize.addEventListener("click", async () => {
        btnMemorize.disabled = true;
        answersDiv.hidden = false;
        answersDiv.textContent = "Extracting incorrect answers...";
        
        try {
          const wrongQuestions = [];
          const incorrectIcons = document.querySelectorAll('[data-testid="icon-incorrect"]');

          incorrectIcons.forEach(icon => {
            let container = icon;
            while (container && container.tagName !== 'BODY') {
              if (container.querySelector('.rc-Option')) {
                break;
              }
              container = container.parentElement;
            }
            
            if (!container || container.tagName === 'BODY') return;
            
            let questionBlock = container;
            let parent = container.parentElement;
            for (let i = 0; i < 4; i++) {
              if (!parent || parent.tagName === 'BODY') break;
              if (parent.innerText.trim().length > container.innerText.trim().length + 15) {
                questionBlock = parent;
                break;
              }
              parent = parent.parentElement;
            }
            
            const clone = questionBlock.cloneNode(true);
            clone.querySelectorAll('.rc-Option').forEach(o => o.remove());
            clone.querySelectorAll('[id$="-grade-feedback"]').forEach(o => o.remove());
            
            let rawText = clone.innerText.replace(/1 point/g, '').replace(/0 \/ 1 point/g, '').trim();
            const poisonIndex = rawText.indexOf("You are a helpful AI assistant");
            if (poisonIndex !== -1) {
                rawText = rawText.substring(0, poisonIndex).trim();
            }
            const questionText = rawText.replace(/\n+/g, ' ').trim();
            
            const selectedOptions = Array.from(container.querySelectorAll('.cds-checkboxAndRadio-checked'));
            const wrongAnswers = selectedOptions.map(opt => {
               const label = opt.querySelector('.cds-checkboxAndRadio-labelText');
               return label ? label.innerText.trim() : "";
            }).filter(t => t);
            
            wrongQuestions.push({
              question: questionText,
              wrongAnswers: wrongAnswers
            });
          });
          
          if (wrongQuestions.length === 0) {
             answersDiv.textContent = "No incorrect answers found to memorize.";
             return;
          }
          
          const assignmentId = location.pathname.split('/')[4] || 'unknown';
          const storageKey = `mistakes_${assignmentId}`;
          
          await chrome.storage.local.set({ [storageKey]: wrongQuestions });
          
          answersDiv.textContent = `Memorized ${wrongQuestions.length} incorrect answers for this assignment. The AI will avoid these next time!`;
          
        } catch (e) {
           answersDiv.textContent = `Error: ${e.message}`;
        } finally {
          btnMemorize.disabled = false;
        }
      });
    }
  };
})();
