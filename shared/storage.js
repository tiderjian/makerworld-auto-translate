// MakerWorld Auto Translate - Storage Helpers
// Sets global MW_STORAGE for use by content scripts and options page

var MW_STORAGE = {
  getConfig: function(callback) {
    chrome.storage.local.get(['mw_config'], function(result) {
      var config = result.mw_config || MW_CONSTANTS.DEFAULT_CONFIG;
      callback(config);
    });
  },

  saveConfig: function(config, callback) {
    chrome.storage.local.set({ mw_config: config }, function() {
      if (callback) callback();
    });
  }
};
