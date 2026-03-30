(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory()
    return
  }

  root.MemosHoverTagPickerSettings = factory()
})(typeof self !== 'undefined' ? self : this, function() {
  var DEFAULT_DELAY_SECONDS = 10
  var MIN_DELAY_SECONDS = 1
  var MAX_DELAY_SECONDS = 30

  function normalizeDelaySeconds(value) {
    var parsed = parseInt(value, 10)
    if (Number.isNaN(parsed)) {
      parsed = DEFAULT_DELAY_SECONDS
    }
    return Math.min(MAX_DELAY_SECONDS, Math.max(MIN_DELAY_SECONDS, parsed))
  }

  function normalizeSettings(rawSettings, parseTagValues) {
    var settings = rawSettings || {}
    var parse = typeof parseTagValues === 'function' ? parseTagValues : function() {
      return []
    }

    return {
      enabled: Boolean(settings.hoverTagPickerEnabled),
      delaySeconds: normalizeDelaySeconds(settings.hoverTagPickerDelaySeconds),
      candidateTags: parse(settings.autoTagCandidates)
    }
  }

  return {
    DEFAULT_DELAY_SECONDS: DEFAULT_DELAY_SECONDS,
    MIN_DELAY_SECONDS: MIN_DELAY_SECONDS,
    MAX_DELAY_SECONDS: MAX_DELAY_SECONDS,
    normalizeDelaySeconds: normalizeDelaySeconds,
    normalizeSettings: normalizeSettings
  }
})
