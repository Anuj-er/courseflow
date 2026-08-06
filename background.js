// background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "fetch_answers") {
    handleFetchAnswers(message.prompt)
      .then(response => sendResponse({ success: true, text: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});

async function handleFetchAnswers(prompt) {
  // Get settings from local storage
  const data = await chrome.storage.local.get([
    "aiProvider",
    "aiModel",
    "groqApiKey",
    "claudeApiKey",
    "geminiApiKey",
    "openaiApiKey"
  ]);

  const provider = data.aiProvider || "groq";
  
  if (provider === "groq") {
    const apiKey = data.groqApiKey;
    if (!apiKey) throw new Error("Groq API Key is not set. Please set it in the extension popup.");
    
    const model = data.aiModel || "llama-3.1-8b-instant";
    return await fetchGroq(prompt, apiKey, model);
    
  } else if (provider === "claude") {
    const apiKey = data.claudeApiKey;
    if (!apiKey) throw new Error("Claude API Key is not set. Please set it in the extension popup.");
    
    const model = data.aiModel || "claude-3-5-haiku-latest";
    return await fetchClaude(prompt, apiKey, model);
    
  } else if (provider === "gemini") {
    const apiKey = data.geminiApiKey;
    if (!apiKey) throw new Error("Gemini API Key is not set. Please set it in the extension popup.");
    
    const model = data.aiModel || "gemini-2.5-flash";
    return await fetchGemini(prompt, apiKey, model);
    
  } else if (provider === "openai") {
    const apiKey = data.openaiApiKey;
    if (!apiKey) throw new Error("OpenAI API Key is not set. Please set it in the extension popup.");
    
    const model = data.aiModel || "gpt-4o-mini";
    return await fetchOpenAI(prompt, apiKey, model);
    
  } else {
    throw new Error(`Unknown AI Provider: ${provider}`);
  }
}

async function fetchGroq(prompt, apiKey, model) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      model: model,
      temperature: 0.1,
      max_tokens: 1500,
      top_p: 1
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API Error (${response.status}): ${err}`);
  }

  const result = await response.json();
  if (result.choices && result.choices.length > 0) {
    return result.choices[0].message.content;
  } else {
    throw new Error("Invalid response format from Groq.");
  }
}

async function fetchClaude(prompt, apiKey, model) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true" // Required for browser extensions making direct calls to Anthropic API
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1500,
      temperature: 0.1,
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API Error (${response.status}): ${err}`);
  }

  const result = await response.json();
  if (result.content && result.content.length > 0) {
    return result.content[0].text;
  } else {
    throw new Error("Invalid response format from Claude.");
  }
}

async function fetchGemini(prompt, apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1500
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${err}`);
  }

  const result = await response.json();
  if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts.length > 0) {
    return result.candidates[0].content.parts[0].text;
  } else {
    throw new Error("Invalid response format from Gemini.");
  }
}

async function fetchOpenAI(prompt, apiKey, model) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      model: model,
      temperature: 0.1,
      max_tokens: 1500,
      top_p: 1
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${err}`);
  }

  const result = await response.json();
  if (result.choices && result.choices.length > 0) {
    return result.choices[0].message.content;
  } else {
    throw new Error("Invalid response format from OpenAI.");
  }
}
