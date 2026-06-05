// MakerWorld Auto Translate - Constants & Presets
// Sets global MW_CONSTANTS for use by content scripts and options page

var MW_CONSTANTS = {
  PRESETS: {
    zhipu: {
      name: 'ZhiPu (智谱)',
      apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      modelsApiUrl: 'https://open.bigmodel.cn/api/paas/v4/models'
    },
    deepseek: {
      name: 'DeepSeek',
      apiUrl: 'https://api.deepseek.com/v1/chat/completions',
      modelsApiUrl: 'https://api.deepseek.com/v1/models'
    },
    custom: {
      name: 'Custom (OpenAI Compatible)',
      apiUrl: '',
      modelsApiUrl: ''
    }
  },

  DEFAULT_CONFIG: {
    apiKey: '',
    preset: 'zhipu',
    modelName: '',
    customApiUrl: '',
    customModelName: ''
  },

  SYSTEM_PROMPT: 'You are a professional translator. Translate the following Chinese text to English. ' +
    'The text is from a 3D model sharing platform (MakerWorld). ' +
    'Preserve any formatting, line breaks, and special characters. ' +
    'Translate technical 3D printing terms accurately. ' +
    'Output ONLY the translated English text, nothing else.',

  SYSTEM_PROMPT_HTML: 'You are a professional translator. Translate the following HTML content from Chinese to English. ' +
    'CRITICAL RULES:\n' +
    '- Preserve ALL HTML tags, attributes, and structure EXACTLY as they are\n' +
    '- Preserve ALL image placeholders like [MW_IMG_0] exactly — do NOT modify, translate, or remove them\n' +
    '- Only translate the visible Chinese text content between HTML tags\n' +
    '- Do NOT add or remove any HTML elements\n' +
    '- The text is from a 3D model sharing platform (MakerWorld)\n' +
    '- Translate technical 3D printing terms accurately\n' +
    '- Output ONLY the translated HTML, nothing else (no markdown, no code blocks)',

  CACHE_KEY_PREFIX: 'mw_translate_cache_'
};
