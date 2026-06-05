// MakerWorld Auto Translate - Content Script
// Injects translate buttons into text input fields on MakerWorld edit pages

(function() {
  'use strict';

  var TRANSLATE_BTN_CLASS = 'mw-translate-btn';

  var TRANSLATE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>';

  var LOADING_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mw-spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';

  function isTextInput(el) {
    if (!el) return false;
    var tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      return type === 'text' || type === 'search';
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function isContentEditable(el) {
    return el && el.isContentEditable;
  }

  function hasTranslateBtn(el) {
    var next = el.nextElementSibling;
    return next && next.classList && next.classList.contains(TRANSLATE_BTN_CLASS);
  }

  function getText(el) {
    if (isContentEditable(el)) {
      return el.innerText || '';
    }
    return el.value || '';
  }

  function createTranslateButton(inputEl) {
    if (hasTranslateBtn(inputEl)) return;

    var parent = inputEl.parentNode;
    if (!parent) return;

    var btn = document.createElement('button');
    btn.className = TRANSLATE_BTN_CLASS;
    btn.type = 'button';
    btn.title = 'Translate to English';
    btn.innerHTML = TRANSLATE_ICON_SVG;

    btn.addEventListener('mousedown', function(e) {
      e.stopImmediatePropagation();
    });

    if (inputEl.nextSibling) {
      parent.insertBefore(btn, inputEl.nextSibling);
    } else {
      parent.appendChild(btn);
    }

    inputEl.classList.add('mw-translate-input');

    if (isContentEditable(inputEl)) {
      inputEl.classList.add('mw-translate-rich');
    }

    if (window.getComputedStyle(parent).position === 'static') {
      parent.classList.add('mw-relative-parent');
    }

    positionButton(inputEl, btn);
  }

  function positionButton(inputEl, btn) {
    var parent = inputEl.offsetParent || inputEl.parentNode;
    if (!parent) return;

    var inputRect = inputEl.getBoundingClientRect();
    var parentRect = parent.getBoundingClientRect();

    var rightOffset = parentRect.right - inputRect.right + 4;
    var topOffset;

    if (isContentEditable(inputEl)) {
      topOffset = inputRect.top - parentRect.top + 4;
    } else {
      topOffset = inputRect.top - parentRect.top + (inputRect.height / 2) - 12;
    }

    btn.style.right = rightOffset + 'px';
    btn.style.top = topOffset + 'px';
  }

  function handleTranslate(inputEl, btn) {
    console.log('[MW Translate] handleTranslate called', inputEl.tagName, inputEl.isContentEditable);

    if (btn.classList.contains('mw-loading')) return;

    // Tag section special handling
    if (inputEl.closest && inputEl.closest('.modelTags')) {
      handleTagTranslate(inputEl, btn);
      return;
    }

    if (isContentEditable(inputEl)) {
      handleRichTranslate(inputEl, btn);
      return;
    }

    // Plain text input/textarea
    var text = getText(inputEl);
    if (!text || !text.trim()) return;

    btn.classList.add('mw-loading');
    btn.innerHTML = LOADING_SVG;

    chrome.runtime.sendMessage(
      { action: 'translate', text: text },
      function(response) {
        btn.classList.remove('mw-loading');
        btn.innerHTML = TRANSLATE_ICON_SVG;

        if (chrome.runtime.lastError) {
          alert('Extension error: ' + chrome.runtime.lastError.message);
          return;
        }

        if (response && response.success) {
          setFieldValue(inputEl, response.translated);
          btn.classList.add('mw-done');
          setTimeout(function() { btn.classList.remove('mw-done'); }, 2000);
        } else {
          alert((response && response.error) || 'Unknown translation error');
        }
      }
    );
  }

  // --- Rich Text Translation (preserves HTML structure + images) ---
  // Flow: get HTML from CKEditor → replace images with placeholders → translate → restore → set back

  function handleRichTranslate(inputEl, btn) {
    btn.classList.add('mw-loading');
    btn.innerHTML = LOADING_SVG;

    // Step 1: Get HTML from CKEditor via MAIN world bridge
    getCKEditorHTML(inputEl, function(html) {
      if (!html) {
        btn.classList.remove('mw-loading');
        btn.innerHTML = TRANSLATE_ICON_SVG;
        alert('Failed to get editor content');
        return;
      }

      console.log('[MW Translate] Got HTML, length:', html.length);

      // Step 2: Check if there's any Chinese text to translate
      var textOnly = html.replace(/<[^>]+>/g, '').trim();
      if (!textOnly) {
        btn.classList.remove('mw-loading');
        btn.innerHTML = TRANSLATE_ICON_SVG;
        return;
      }

      // Step 3: Replace <img> tags with placeholders to protect them
      var images = [];
      var processedHTML = html.replace(/<img\s[^>]*\/?>/gi, function(match) {
        var idx = images.length;
        images.push(match);
        return '[MW_IMG_' + idx + ']';
      });

      console.log('[MW Translate] Protected', images.length, 'images, sending HTML to API');

      // Step 4: Send HTML to translation API (with HTML-aware prompt)
      chrome.runtime.sendMessage(
        { action: 'translate', text: processedHTML, isHtml: true },
        function(response) {
          btn.classList.remove('mw-loading');
          btn.innerHTML = TRANSLATE_ICON_SVG;

          if (chrome.runtime.lastError) {
            alert('Extension error: ' + chrome.runtime.lastError.message);
            return;
          }

          if (response && response.success) {
            var translated = response.translated;
            // Clean code block wrappers
            translated = translated.replace(/^```[\w]*\n/, '').replace(/\n```$/, '').trim();

            // Step 5: Restore images from placeholders
            for (var i = 0; i < images.length; i++) {
              // Try original case, lowercase, and uppercase
              translated = translated.split('[MW_IMG_' + i + ']').join(images[i]);
              translated = translated.split('[mw_img_' + i + ']').join(images[i]);
              translated = translated.split('[MW_IMG_' + i + ']').join(images[i]);
            }

            console.log('[MW Translate] Translated HTML length:', translated.length, ', images restored:', images.length);

            // Step 6: Set HTML back to CKEditor via bridge
            setCKEditorHTML(inputEl, translated, function(success) {
              if (success) {
                console.log('[MW Translate] SUCCESS: Rich text translated and set');
                btn.classList.add('mw-done');
                setTimeout(function() { btn.classList.remove('mw-done'); }, 2000);
              } else {
                alert('Failed to set translated content');
              }
            });
          } else {
            alert((response && response.error) || 'Translation failed');
          }
        }
      );
    });
  }

  // Get HTML from CKEditor via MAIN world bridge
  function getCKEditorHTML(el, callback) {
    var id = 'mw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    el.setAttribute('data-mw-id', id);

    var timeout;

    function handler(e) {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== 'mw-ckeditor-get-result' || e.data.id !== id) return;
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      el.removeAttribute('data-mw-id');
      console.log('[MW Translate] Get HTML result, length:', (e.data.html || '').length, e.data.error || '');
      callback(e.data.html || null);
    }

    window.addEventListener('message', handler);

    timeout = setTimeout(function() {
      window.removeEventListener('message', handler);
      el.removeAttribute('data-mw-id');
      console.log('[MW Translate] Get HTML timeout');
      callback(null);
    }, 3000);

    window.postMessage({ type: 'mw-ckeditor-get', id: id }, '*');
  }

  // Set HTML to CKEditor via MAIN world bridge
  function setCKEditorHTML(el, html, callback) {
    var id = 'mw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    el.setAttribute('data-mw-id', id);

    var timeout;

    function handler(e) {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== 'mw-ckeditor-result' || e.data.id !== id) return;
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      el.removeAttribute('data-mw-id');
      console.log('[MW Translate] Set HTML result:', e.data.success, e.data.error || '');
      callback(e.data.success);
    }

    window.addEventListener('message', handler);

    timeout = setTimeout(function() {
      window.removeEventListener('message', handler);
      el.removeAttribute('data-mw-id');
      console.log('[MW Translate] Set HTML timeout');
      callback(false);
    }, 3000);

    window.postMessage({ type: 'mw-ckeditor-set', id: id, value: html }, '*');
  }

  // --- Tag Translation ---

  function handleTagTranslate(inputEl, btn) {
    var tagSection = inputEl.closest('.modelTags');
    if (!tagSection) return;

    // Collect all existing tag texts
    var tagContents = tagSection.querySelectorAll('.tagItem-content');
    var tags = [];
    for (var i = 0; i < tagContents.length; i++) {
      tags.push(tagContents[i].textContent.trim());
    }
    if (tags.length === 0) return;

    btn.classList.add('mw-loading');
    btn.innerHTML = LOADING_SVG;

    var tagsText = tags.join('\n');
    chrome.runtime.sendMessage(
      { action: 'translate', text: tagsText, isTags: true },
      function(response) {
        if (chrome.runtime.lastError || !response || !response.success) {
          btn.classList.remove('mw-loading');
          btn.innerHTML = TRANSLATE_ICON_SVG;
          alert(chrome.runtime.lastError ? chrome.runtime.lastError.message :
            (response && response.error) || 'Translation failed');
          return;
        }

        var translations = response.translated.trim().split('\n').map(function(s) { return s.trim(); });
        while (translations.length < tags.length) translations.push('');

        // Delete all tags first, then add translations
        var tagSectionEl = inputEl.closest('.modelTags');
        deleteAllTags(tagSectionEl, function() {
          addTagsSequentially(inputEl, translations, 0, function() {
            btn.classList.remove('mw-loading');
            btn.innerHTML = TRANSLATE_ICON_SVG;
            btn.classList.add('mw-done');
            setTimeout(function() { btn.classList.remove('mw-done'); }, 2000);
          });
        });
      }
    );
  }

  function deleteAllTags(tagSection, callback) {
    var deleteIcon = tagSection.querySelector('.tagItem-deleteIcon');
    if (!deleteIcon) {
      callback();
      return;
    }

    var rect = deleteIcon.getBoundingClientRect();
    deleteIcon.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    }));

    setTimeout(function() {
      deleteAllTags(tagSection, callback);
    }, 200);
  }

  function addTagsSequentially(inputEl, translations, index, callback) {
    if (index >= translations.length) {
      callback();
      return;
    }

    var translation = translations[index].trim();
    if (!translation) {
      addTagsSequentially(inputEl, translations, index + 1, callback);
      return;
    }

    inputEl.focus();
    setFieldValue(inputEl, translation);

    inputEl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
    }));

    setTimeout(function() {
      addTagsSequentially(inputEl, translations, index + 1, callback);
    }, 400);
  }

  // --- Plain text setFieldValue (input/textarea only) ---

  function setFieldValue(el, value) {
    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    );
    var nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    );

    var setter = el.tagName.toLowerCase() === 'textarea'
      ? nativeTextareaValueSetter
      : nativeInputValueSetter;

    if (setter && setter.set) {
      setter.set.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function scanAndInject() {
    var inputs = document.querySelectorAll('input, textarea, [contenteditable]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (isTextInput(el) && !hasTranslateBtn(el) && el.offsetParent !== null) {
        createTranslateButton(el);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(scanAndInject, 500);
    });
  } else {
    setTimeout(scanAndInject, 500);
  }

  // Global click handler: capture phase to intercept clicks BEFORE the rich text editor
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.' + TRANSLATE_BTN_CLASS);
    if (btn) {
      var inputEl = btn.previousElementSibling;
      if (inputEl) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleTranslate(inputEl, btn);
      }
    }
  }, true);

  var observer = new MutationObserver(function(mutations) {
    var shouldScan = false;
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      clearTimeout(scanAndInject._timer);
      scanAndInject._timer = setTimeout(scanAndInject, 300);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', function() {
    var buttons = document.querySelectorAll('.' + TRANSLATE_BTN_CLASS);
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var input = btn.previousElementSibling;
      if (input) {
        positionButton(input, btn);
      }
    }
  });
})();
