// MakerWorld Auto Translate - Background Service Worker
// Handles LLM API calls and translation caching

// Service worker at extension root, so relative paths resolve correctly
importScripts('shared/constants.js');

var PRESETS = MW_CONSTANTS.PRESETS;
var SYSTEM_PROMPT = MW_CONSTANTS.SYSTEM_PROMPT;
var SYSTEM_PROMPT_HTML = MW_CONSTANTS.SYSTEM_PROMPT_HTML;
var CACHE_KEY_PREFIX = MW_CONSTANTS.CACHE_KEY_PREFIX;
var CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function getConfig() {
  return new Promise(function(resolve) {
    chrome.storage.local.get(['mw_config'], function(result) {
      resolve(result.mw_config || MW_CONSTANTS.DEFAULT_CONFIG);
    });
  });
}

function getApiConfig(config) {
  if (config.preset === 'custom') {
    return {
      apiUrl: config.customApiUrl,
      modelName: config.customModelName || config.modelName
    };
  }
  var preset = PRESETS[config.preset];
  return {
    apiUrl: preset.apiUrl,
    modelName: config.modelName
  };
}

function getCacheKey(text) {
  var hash = 0;
  for (var i = 0; i < text.length; i++) {
    var char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return CACHE_KEY_PREFIX + Math.abs(hash).toString(36);
}

async function callLLMApi(apiKey, apiUrl, modelName, text, prompt) {
  if (!apiUrl.startsWith('https://')) {
    throw new Error('API URL must use HTTPS. Current: ' + apiUrl);
  }

  var response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: prompt || SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    var errorBody = await response.text();
    throw new Error('API error (' + response.status + '): ' + errorBody);
  }

  var data = await response.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content.trim();
  }
  throw new Error('Unexpected API response format');
}

chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
  if (message.action !== 'translate') return false;

  (async function() {
    try {
      var config = await getConfig();

      if (!config.apiKey) {
        sendResponse({
          success: false,
          error: 'API Key not configured. Please go to the extension options page to set up your API key and model.'
        });
        return;
      }

      var text = message.text;
      if (!text || !text.trim()) {
        sendResponse({ success: false, error: 'No text to translate' });
        return;
      }

      var cacheKey = getCacheKey(text);

      var cached = await new Promise(function(resolve) {
        chrome.storage.local.get(cacheKey, function(result) {
          resolve(result[cacheKey] || null);
        });
      });

      if (cached && cached.translated && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL)) {
        sendResponse({ success: true, translated: cached.translated, cached: true });
        return;
      }

      var apiConfig = getApiConfig(config);
      var prompt = message.isHtml ? SYSTEM_PROMPT_HTML : null;
      var translated = await callLLMApi(config.apiKey, apiConfig.apiUrl, apiConfig.modelName, text, prompt);

      var cacheData = {};
      cacheData[cacheKey] = { translated: translated, timestamp: Date.now() };
      await new Promise(function(resolve) {
        chrome.storage.local.set(cacheData, resolve);
      });

      sendResponse({ success: true, translated: translated, cached: false });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true;
});
