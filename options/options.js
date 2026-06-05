// MakerWorld Auto Translate - Options Page Logic

(function() {
  'use strict';

  var presetSelect = document.getElementById('preset');
  var apiKeyInput = document.getElementById('apiKey');
  var modelSelect = document.getElementById('modelSelect');
  var modelInput = document.getElementById('modelInput');
  var fetchModelsBtn = document.getElementById('fetchModelsBtn');
  var customFields = document.getElementById('custom-fields');
  var customApiUrlInput = document.getElementById('customApiUrl');
  var form = document.getElementById('config-form');
  var statusEl = document.getElementById('status');

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + (type || 'success');
    statusEl.classList.remove('hidden');
    setTimeout(function() { statusEl.classList.add('hidden'); }, 3000);
  }

  function toggleCustomFields() {
    if (presetSelect.value === 'custom') {
      customFields.classList.remove('hidden');
      document.getElementById('model-section').classList.remove('hidden');
    } else {
      customFields.classList.add('hidden');
      document.getElementById('model-section').classList.remove('hidden');
    }
  }

  function getEffectiveModelName() {
    var custom = modelInput.value.trim();
    if (custom) return custom;
    return modelSelect.value;
  }

  async function fetchModels() {
    var preset = presetSelect.value;
    var apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('Please enter an API Key first', 'error');
      return;
    }

    var presetConfig = MW_CONSTANTS.PRESETS[preset];
    var modelsUrl = presetConfig ? presetConfig.modelsApiUrl : '';

    if (!modelsUrl && preset !== 'custom') {
      showStatus('No models API for this preset', 'error');
      return;
    }

    fetchModelsBtn.disabled = true;
    fetchModelsBtn.textContent = 'Loading...';

    try {
      var response = await fetch(modelsUrl || customApiUrlInput.value.replace(/\/chat\/completions?$/, '/models'), {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch models (' + response.status + ')');
      }

      var data = await response.json();
      var models = (data.data || []).map(function(m) { return m.id; }).sort();

      if (models.length === 0) {
        showStatus('No models found. You can type a model name manually.', 'error');
        return;
      }

      modelSelect.innerHTML = '';
      models.forEach(function(id) {
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id;
        modelSelect.appendChild(opt);
      });

      showStatus('Loaded ' + models.length + ' models', 'success');
    } catch (err) {
      showStatus('Failed to fetch models: ' + err.message, 'error');
    } finally {
      fetchModelsBtn.disabled = false;
      fetchModelsBtn.textContent = 'Fetch Models';
    }
  }

  // Load saved config
  MW_STORAGE.getConfig(function(config) {
    presetSelect.value = config.preset || 'zhipu';
    apiKeyInput.value = config.apiKey || '';
    customApiUrlInput.value = config.customApiUrl || '';
    toggleCustomFields();

    if (config.modelName) {
      // Try to set it in dropdown, or put it in custom input
      var found = false;
      for (var i = 0; i < modelSelect.options.length; i++) {
        if (modelSelect.options[i].value === config.modelName) {
          modelSelect.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        modelInput.value = config.modelName;
      }
    }
  });

  presetSelect.addEventListener('change', toggleCustomFields);
  fetchModelsBtn.addEventListener('click', fetchModels);

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    var apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('Please enter an API Key', 'error');
      return;
    }

    var modelName = getEffectiveModelName();
    if (!modelName) {
      showStatus('Please select or type a model name', 'error');
      return;
    }

    var config = {
      apiKey: apiKey,
      preset: presetSelect.value,
      modelName: modelName,
      customApiUrl: customApiUrlInput.value.trim(),
      customModelName: ''
    };

    // For custom preset, use customApiUrl and store model in customModelName
    if (config.preset === 'custom') {
      config.customModelName = modelName;
    }

    MW_STORAGE.saveConfig(config, function() {
      showStatus('Configuration saved!', 'success');
    });
  });
})();
