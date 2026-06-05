// CKEditor Bridge - Runs in MAIN world (page's JS context)
// Has direct access to CKEditor 5 JavaScript instances
// Communicates with content script via window.postMessage

(function() {
  'use strict';

  // Check if an object is a CKEditor 5 instance
  function isCKEditor(obj) {
    return obj && typeof obj === 'object' &&
      typeof obj.setData === 'function' &&
      obj.model && obj.editing;
  }

  // Deep-search an object's own properties for a CKEditor instance
  function searchObjectForEditor(obj, maxDepth) {
    if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;

    try {
      // Check string-keyed properties
      var names = Object.getOwnPropertyNames(obj);
      for (var i = 0; i < names.length; i++) {
        try {
          var val = obj[names[i]];
          if (isCKEditor(val)) return val;
          // Check { editor: CKEditor }
          if (val && typeof val === 'object' && isCKEditor(val.editor)) return val.editor;
        } catch(e) {}
      }
    } catch(e) {}

    try {
      // Check symbol-keyed properties
      var symbols = Object.getOwnPropertySymbols(obj);
      for (var i = 0; i < symbols.length; i++) {
        try {
          var val = obj[symbols[i]];
          if (isCKEditor(val)) return val;
        } catch(e) {}
      }
    } catch(e) {}

    return null;
  }

  // Find CKEditor 5 instance near a target element
  function findCKEditor(targetEl) {
    // Strategy 1: Walk up from target element
    var node = targetEl;
    var walkCount = 0;
    while (node && walkCount < 30) {
      var found = searchObjectForEditor(node, 1);
      if (found) {
        console.log('[MW Bridge] Found CKEditor on ancestor element (walk:', walkCount, ')');
        return found;
      }
      node = node.parentElement;
      walkCount++;
    }

    // Strategy 2: Search all .ck / .ck-editor elements
    var ckEls = document.querySelectorAll('.ck, .ck-editor, .ck-editor__main');
    var candidates = [];
    for (var i = 0; i < ckEls.length; i++) {
      var found = searchObjectForEditor(ckEls[i], 1);
      if (found) {
        // Verify this editor's editable contains our target
        try {
          var editable = found.ui && found.ui.getEditableElement && found.ui.getEditableElement();
          if (editable === targetEl || (editable && editable.contains(targetEl))) {
            console.log('[MW Bridge] Found CKEditor via .ck element (editable match)');
            return found;
          }
        } catch(e) {}
        candidates.push(found);
      }
    }

    // If only one candidate, use it
    if (candidates.length === 1) {
      console.log('[MW Bridge] Using sole CKEditor candidate');
      return candidates[0];
    }

    // Strategy 3: Check the source element (element passed to ClassicEditor.create)
    // CKEditor 5 may store the instance on the original source element
    var wrappers = document.querySelectorAll('[class*="editor"]');
    for (var i = 0; i < wrappers.length; i++) {
      var found = searchObjectForEditor(wrappers[i], 1);
      if (found) {
        console.log('[MW Bridge] Found CKEditor via editor wrapper');
        return found;
      }
    }

    console.log('[MW Bridge] CKEditor instance not found');
    return null;
  }

  // Handle messages from content script
  window.addEventListener('message', function(e) {
    if (e.source !== window) return;
    if (!e.data) return;

    // Handle GET request (return current HTML)
    if (e.data.type === 'mw-ckeditor-get') {
      var detail = e.data;
      console.log('[MW Bridge] Received get request, id:', detail.id);

      var el = document.querySelector('[data-mw-id="' + detail.id + '"]');
      if (!el) {
        sendGetResult(detail.id, '', 'Element not found');
        return;
      }

      var editor = findCKEditor(el);
      if (!editor) {
        sendGetResult(detail.id, '', 'CKEditor not found');
        return;
      }

      try {
        var html = editor.getData();
        console.log('[MW Bridge] getData() succeeded, length:', html.length);
        sendGetResult(detail.id, html);
      } catch(err) {
        sendGetResult(detail.id, '', err.message);
      }
      return;
    }

    // Handle SET request (set new HTML)
    if (e.data.type === 'mw-ckeditor-set') {
      var detail = e.data;
      console.log('[MW Bridge] Received set request, id:', detail.id);

      var el = document.querySelector('[data-mw-id="' + detail.id + '"]');
      if (!el) {
        console.log('[MW Bridge] Target element not found');
        sendResult(detail.id, false, 'Element not found');
        return;
      }

      var editor = findCKEditor(el);
      if (!editor) {
        sendResult(detail.id, false, 'CKEditor not found');
        return;
      }

      try {
        console.log('[MW Bridge] Calling editor.setData(), value length:', detail.value.length);
        editor.setData(detail.value);
        console.log('[MW Bridge] setData() succeeded');
        sendResult(detail.id, true);
      } catch(err) {
        console.log('[MW Bridge] setData() error:', err.message);
        sendResult(detail.id, false, err.message);
      }
      return;
    }
  });

  function sendGetResult(id, html, error) {
    window.postMessage({
      type: 'mw-ckeditor-get-result',
      id: id,
      html: html,
      error: error || ''
    }, '*');
  }

  function sendResult(id, success, error) {
    window.postMessage({
      type: 'mw-ckeditor-result',
      id: id,
      success: success,
      error: error || ''
    }, '*');
  }

  console.log('[MW CKEditor Bridge] Ready in MAIN world');
})();
