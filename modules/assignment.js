(() => {
  "use strict";

  const CF = globalThis.__CourseFlow = globalThis.__CourseFlow || {};

  CF.extractQuizMap = function() {
    const quizMap = [];
    let qNum = 1;

    // First try the standard Coursera question block class
    const formParts = Array.from(document.querySelectorAll('.rc-FormPartsQuestion'));
    if (formParts.length > 0) {
      formParts.forEach((block) => {
        const clone = block.cloneNode(true);
        const optionsNodes = Array.from(clone.querySelectorAll('.rc-Option'));
        const hasTextInput = clone.querySelector('input[type="text"], input[type="number"], textarea') !== null;
        
        const mappedOptions = optionsNodes.map(o => o.innerText.trim());
        if (mappedOptions.length === 0 && hasTextInput) {
          mappedOptions.push("(Text Input / Short Answer Required)");
        }
        
        clone.querySelectorAll('.rc-Option, input, textarea, button').forEach(o => o.remove());
        
        // Temporarily append to DOM to get accurate innerText (preserves spaces and ignores hidden elements)
        clone.style.position = 'absolute';
        clone.style.opacity = '0';
        clone.style.pointerEvents = 'none';
        clone.style.left = '-9999px';
        document.body.appendChild(clone);
        
        let rawText = clone.innerText || clone.textContent;
        document.body.removeChild(clone);
        
        rawText = rawText
            .replace(/1 point/gi, '')
            .replace(/Mark as complete/gi, '')
            .trim();
            
        const poisonIndex = rawText.indexOf("You are a helpful AI assistant");
        if (poisonIndex !== -1) {
            rawText = rawText.substring(0, poisonIndex).trim();
        }

        // Filter out bogus inputs like character counters or honor code boxes
        if (rawText.length < 5 || /characters used/i.test(rawText) || /honor code/i.test(rawText)) {
            return;
        }

        // Clean up redundant Coursera numbering (e.g. "1. Question 1 ")
        rawText = rawText.replace(/^(\d+\.\s*Question\s*\d+\s*|\d+\.\s*|Question\s*\d+\s*)/i, '');

        quizMap.push({
          id: qNum++,
          question: rawText.replace(/\n+/g, ' ').trim(),
          options: mappedOptions
        });
      });
      
      if (quizMap.length > 0) return quizMap;
    }

    // Fallback heuristic: group by common ancestors
    const inputs = Array.from(document.querySelectorAll('.rc-Option, input[type="text"], input[type="number"], textarea'));
    if (inputs.length === 0) return [];

    const questionGroups = new Map();
    inputs.forEach(opt => {
      let parent = opt.parentElement;
      let foundContainer = false;
      
      while (parent && parent.tagName !== 'BODY') {
        if (opt.classList.contains('rc-Option')) {
          if (parent.querySelectorAll('.rc-Option').length >= 2) {
            foundContainer = true;
            break;
          }
        } else {
          // Heuristic for text inputs: go up 3 levels
          let levelsUp = 0;
          let p = opt;
          while(p && levelsUp < 3) {
             p = p.parentElement;
             levelsUp++;
          }
          if (parent === p) {
            foundContainer = true;
            break;
          }
        }
        parent = parent.parentElement;
      }

      if (parent && parent.tagName !== 'BODY') {
        if (!questionGroups.has(parent)) {
          questionGroups.set(parent, []);
        }
        questionGroups.get(parent).push(opt);
      }
    });

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
      clone.querySelectorAll('.rc-Option, input, textarea, button').forEach(o => o.remove());
      
      // Temporarily append to DOM to get accurate innerText
      clone.style.position = 'absolute';
      clone.style.opacity = '0';
      clone.style.pointerEvents = 'none';
      clone.style.left = '-9999px';
      document.body.appendChild(clone);
      
      let rawText = (clone.innerText || clone.textContent)
          .replace(/1 point/gi, '')
          .replace(/Mark as complete/gi, '')
          .trim();
          
      document.body.removeChild(clone);
          
      const poisonIndex = rawText.indexOf("You are a helpful AI assistant");
      if (poisonIndex !== -1) {
          rawText = rawText.substring(0, poisonIndex).trim();
      }

      // Filter out bogus inputs like character counters or honor code boxes
      if (rawText.length < 5 || /characters used/i.test(rawText) || /honor code/i.test(rawText)) {
          return;
      }

      // Clean up redundant Coursera numbering (e.g. "1. Question 1 ")
      rawText = rawText.replace(/^(\d+\.\s*Question\s*\d+\s*|\d+\.\s*|Question\s*\d+\s*)/i, '');

      const isTextQuestion = !opts[0].classList.contains('rc-Option');
      const mappedOptions = isTextQuestion ? ["(Text Input / Short Answer Required)"] : opts.map(o => o.innerText.trim());

      quizMap.push({
        id: qNum++,
        question: rawText.replace(/\n+/g, ' ').trim(),
        options: mappedOptions
      });
    });
    
    return quizMap;
  };

  CF.setupAssignmentListeners = function(btnGetAnswers, btnMemorize, btnCopyQuestions, btnCopyMistakes, answersDiv) {
    if (btnCopyQuestions) {
      btnCopyQuestions.addEventListener("click", async () => {
        try {
          btnCopyQuestions.disabled = true;
          answersDiv.hidden = false;
          answersDiv.textContent = "Extracting questions...";

          const quizMap = CF.extractQuizMap();
          if (quizMap.length === 0) {
            answersDiv.textContent = "Could not find any multiple-choice questions on this page.";
            return;
          }

          let clipboardText = "Quiz Questions:\n\n";
          quizMap.forEach(q => {
            clipboardText += `Q${q.id}: ${q.question}\n`;
            q.options.forEach((opt, idx) => {
              clipboardText += `  ${idx + 1}. ${opt}\n`;
            });
            clipboardText += "\n";
          });

          await navigator.clipboard.writeText(clipboardText.trim());
          answersDiv.textContent = `Copied ${quizMap.length} questions to clipboard!`;
          
          setTimeout(() => {
            if (answersDiv.textContent.includes("Copied")) {
              answersDiv.hidden = true;
            }
          }, 4000);
        } catch (error) {
          answersDiv.textContent = `Failed to copy: ${error.message}`;
        } finally {
          btnCopyQuestions.disabled = false;
        }
      });
    }

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

          const assignmentId = location.pathname.split('/')[4] || 'unknown';
          const storageKey = `mistakes_${assignmentId}`;
          const mistakesData = await chrome.storage.local.get(storageKey);
          const mistakes = mistakesData[storageKey] || [];
          
          let mistakePromptStr = "";
          if (mistakes.length > 0) {
             mistakePromptStr = `\n\nWARNING: The following options are KNOWN TO BE INCORRECT based on a previous attempt. DO NOT select these under any circumstances:\n${JSON.stringify(mistakes, null, 2)}\n`;
          }

          answersDiv.textContent = "Asking AI for answers...";
          
          const prompt = `You are a helpful AI answering a quiz. I will provide the questions and options. 
For multiple-choice questions, return the correct option number (e.g., "Q1: Option 2").
For text input or short answer questions (where the option is "(Text Input / Short Answer Required)"), return the actual short answer text (e.g., "Q2: The actual short answer text").
Your ONLY job is to return a numbered list of the correct answers. Do not include any explanations, reasoning, or other text.${mistakePromptStr}\n\nQUIZ:\n${JSON.stringify(quizMap, null, 2)}`;
          
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "fetch_answers", prompt: prompt }, resolve);
          });
          
          if (response && response.success) {
            answersDiv.textContent = response.text;
          } else {
            throw new Error(response ? response.error : "Failed to communicate with background script.");
          }

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
            
            clone.style.position = 'absolute';
            clone.style.opacity = '0';
            clone.style.pointerEvents = 'none';
            clone.style.left = '-9999px';
            document.body.appendChild(clone);
            
            let rawText = (clone.innerText || clone.textContent).replace(/1 point/gi, '').replace(/0 \/ 1 point/gi, '').trim();
            document.body.removeChild(clone);
            
            const poisonIndex = rawText.indexOf("You are a helpful AI assistant");
            if (poisonIndex !== -1) {
                rawText = rawText.substring(0, poisonIndex).trim();
            }
            const questionText = rawText.replace(/\n+/g, ' ').trim();
            
            if (questionText.length < 5 || /characters used/i.test(questionText) || /honor code/i.test(questionText)) {
                return;
            }
            
            // Clean up redundant Coursera numbering
            const cleanQuestionText = questionText.replace(/^(\d+\.\s*Question\s*\d+\s*|\d+\.\s*|Question\s*\d+\s*)/i, '');
            
            const selectedOptions = Array.from(container.querySelectorAll('.cds-checkboxAndRadio-checked'));
            const wrongAnswers = selectedOptions.map(opt => {
               const label = opt.querySelector('.cds-checkboxAndRadio-labelText');
               return label ? label.innerText.trim() : "";
            }).filter(t => t);
            
            wrongQuestions.push({
              question: cleanQuestionText,
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

    if (btnCopyMistakes) {
      btnCopyMistakes.addEventListener("click", async () => {
        btnCopyMistakes.disabled = true;
        answersDiv.hidden = false;
        answersDiv.textContent = "Extracting incorrect answers...";
        
        try {
          const wrongQuestions = [];
          const incorrectIcons = document.querySelectorAll('[data-testid="icon-incorrect"]');

          incorrectIcons.forEach(icon => {
            let container = icon;
            while (container && container.tagName !== 'BODY') {
              if (container.querySelector('.rc-Option')) break;
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
            
            clone.style.position = 'absolute';
            clone.style.opacity = '0';
            clone.style.pointerEvents = 'none';
            clone.style.left = '-9999px';
            document.body.appendChild(clone);
            
            let rawText = (clone.innerText || clone.textContent).replace(/1 point/gi, '').replace(/0 \/ 1 point/gi, '').trim();
            document.body.removeChild(clone);
            
            const poisonIndex = rawText.indexOf("You are a helpful AI assistant");
            if (poisonIndex !== -1) {
                rawText = rawText.substring(0, poisonIndex).trim();
            }
            const questionText = rawText.replace(/\n+/g, ' ').trim();
            
            if (questionText.length < 5 || /characters used/i.test(questionText) || /honor code/i.test(questionText)) {
                return;
            }
            
            const cleanQuestionText = questionText.replace(/^(\d+\.\s*Question\s*\d+\s*|\d+\.\s*|Question\s*\d+\s*)/i, '');
            
            const selectedOptions = Array.from(container.querySelectorAll('.cds-checkboxAndRadio-checked'));
            const wrongAnswers = selectedOptions.map(opt => {
               const label = opt.querySelector('.cds-checkboxAndRadio-labelText');
               return label ? label.innerText.trim() : "";
            }).filter(t => t);
            
            wrongQuestions.push({
              question: cleanQuestionText,
              wrongAnswers: wrongAnswers
            });
          });
          
          if (wrongQuestions.length === 0) {
             answersDiv.textContent = "No incorrect answers found to copy.";
             return;
          }
          
          let clipboardText = "Incorrect Questions/Answers:\n\n";
          wrongQuestions.forEach(q => {
            clipboardText += `Q: ${q.question}\n`;
            q.wrongAnswers.forEach(opt => {
              clipboardText += `  Incorrect: ${opt}\n`;
            });
            clipboardText += "\n";
          });
          
          await navigator.clipboard.writeText(clipboardText.trim());
          answersDiv.textContent = `Copied ${wrongQuestions.length} incorrect answers to clipboard!`;
          
          setTimeout(() => {
            if (answersDiv.textContent.includes("Copied")) {
              answersDiv.hidden = true;
            }
          }, 4000);
          
        } catch (e) {
           answersDiv.textContent = `Error: ${e.message}`;
        } finally {
          btnCopyMistakes.disabled = false;
        }
      });
    }
  };
})();
