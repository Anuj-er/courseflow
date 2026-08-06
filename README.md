<div align="center">
  <img src="banner.png" alt="CourseFlow Banner" width="100%">
  <br />
  <br />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3" />
  <img src="https://img.shields.io/badge/Manifest_V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Extension V3" />
</div>

<br />

# CourseFlow

**CourseFlow** is a premium, intelligent, and highly secure Chrome Browser Extension designed to drastically speed up and semi-automate the Coursera learning experience. 

It tackles the most tedious aspects of online learning by automatically fast-forwarding and skipping video lectures across deeply nested iframes, and provides a powerful, multi-provider AI assistant to help you solve quizzes and assignments instantly.

---

## 🚀 What Exactly Does CourseFlow Provide?

CourseFlow transforms your learning experience into a frictionless flow through two primary capabilities:

### 1. Video Auto-Pilot & Skipper
Coursera often requires users to manually watch videos and click "Next" to progress. Coursera's architecture also hides these videos inside complex, deeply nested iframes, making typical automation scripts fail. 
* CourseFlow automatically detects HTML5 videos, instantly **seeks them to the very end** (saving hours of watching).
* It automatically finds and clicks the "Mark as Completed" or "Next" buttons to advance you to the next module seamlessly.
* You can leave it running in "Auto-Pilot" mode, and it will effortlessly chew through your video backlog.

### 2. Smart AI Quiz Assistant
When you reach a quiz or assignment, CourseFlow acts as your personal tutor.
* **Auto-Extraction:** The extension automatically extracts multiple-choice questions, short-answer prompts, and options from the page.
* **Bring Your Own Key (BYOK):** Send the quiz to your preferred AI model! We support **Groq, Anthropic (Claude), Google (Gemini), and OpenAI (ChatGPT)**. 
* **"Memorize Mistakes" System:** If you fail a quiz, click the "Memorize Mistakes" button on the feedback page. The extension scans the page, extracts exactly which options you got wrong, and saves them locally. On your next attempt, it feeds those known incorrect answers to the AI, guaranteeing it **never makes the same mistake twice**.

---

## 🛠️ Architecture & Tech Stack

CourseFlow is built using **Vanilla JavaScript, HTML, and CSS**, strictly adhering to the latest **Manifest V3** standards. It requires no heavy frameworks (like React or Vue), making it blazingly fast and lightweight.

```mermaid
graph TD
    A[Coursera Page] -->|Injects| B(content.js Orchestrator)
    B --> C(modules/ui.js)
    B --> D(modules/autopilot.js)
    B --> E(modules/assignment.js)
    
    C -->|Creates| F[Shadow DOM Interface]
    D -->|Calls| G[video-skipper-core]
    G <-->|postMessage| H(modules/messaging.js)
    
    E -->|Extracts Quiz Data| I[Background Service Worker]
    I -->|Secure API Call| J["OpenAI / Claude / Gemini / Groq"]
    
    K[Popup Interface] -->|Updates Settings| L[(chrome.storage.local)]
    I -.->|Reads Keys & Models| L
```

### Key Technical Highlights:
* **Shadow DOM UI**: The extension's interface (the floating status box and buttons) is injected into the Coursera webpage using a `Shadow DOM`. This completely isolates the extension's CSS, ensuring Coursera's website styles never break the UI, and the extension never breaks Coursera.
* **Cross-Frame Message Passing**: CourseFlow uses a sophisticated `postMessage` router to securely communicate between the top-level webpage and Coursera's nested LTI tool iframes to locate and manipulate the hidden video players.

---

## 🔒 Security Posture

CourseFlow was engineered with strict security standards to ensure your browser and API keys remain safe.

* **API Keys are 100% Safe:** Your API keys are saved exclusively in the extension's isolated `chrome.storage.local`. They are **never** exposed to the web page or the content scripts. Only the isolated Background Service Worker (`background.js`) accesses them to make direct, secure API calls.
* **Zero XSS Vulnerabilities:** The extension rigorously avoids using `innerHTML` to render external data. All AI responses, quiz questions, and options are securely injected into the DOM using `.textContent`. This guarantees that if a quiz contains malicious HTML script tags, the browser will treat them strictly as plain text.
* **Strict Permission Scoping:** The extension only requests host permissions for exactly four URLs (Groq, Anthropic, Gemini, and OpenAI APIs) and strictly limits content script execution to `coursera.org/learn/*`.

---

## 💻 How to Install & Use

### Installation
1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle switch in the top right corner).
4. Click **Load unpacked** and select the folder containing this project.

### Setup Your AI
1. Click the CourseFlow icon in your Chrome toolbar.
2. Select your preferred **AI Provider** from the visually stunning dashboard.
3. Choose a model from the dropdown (or enter a custom model ID).
4. Enter your API Key. (There are direct links in the UI to get your keys if you don't have them).
5. Click **Save Settings**.

### Using the Extension
1. **Auto-Pilot:** Navigate to a Coursera course page. You will see a premium, floating CourseFlow UI at the bottom right of the screen. Click the **Start Auto-Pilot** button (or start it from the extension popup). Sit back and watch the animated flow pipeline as it skips your videos!
2. **Assignments:** When you land on a quiz page, two new buttons will appear in the floating UI:
   * **Get AI Answers:** Extracts the quiz, sends it to your chosen AI, and displays the correct answers directly on the screen.
   * **Memorize Mistakes:** If you get a less-than-perfect score, go to the quiz feedback page and click this button. CourseFlow will memorize what you got wrong to ensure a better score on the retry.

---

## 🎨 UI/UX Design

The popup extension interface was completely overhauled to feature a premium, sleek, and high-tech "SaaS" aesthetic. It includes glassmorphism, soft drop shadows, glowing gradient buttons, and a fully animated 3-step pipeline flow diagram that visually reacts when the Auto-Pilot is running, giving you real-time feedback on what the extension is processing behind the scenes.

---
*Disclaimer: This extension is intended for educational and developmental purposes to demonstrate advanced DOM manipulation, Cross-Origin iframe communication, and AI API integrations. Please adhere to your institution's honor code policies.*
