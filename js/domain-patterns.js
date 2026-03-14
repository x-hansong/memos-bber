(function (root) {
  function normalizeDomainPattern(pattern) {
    if (typeof pattern !== 'string') {
      return ''
    }

    return pattern.trim().toLowerCase()
  }

  function parseDomainPatterns(value) {
    if (typeof value !== 'string') {
      return []
    }

    return value
      .split(/\r?\n/)
      .map(normalizeDomainPattern)
      .filter(function (pattern, index, items) {
        return pattern && items.indexOf(pattern) === index
      })
  }

  function escapeRegex(value) {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }

  function buildDomainPatternRegex(pattern) {
    var normalized = normalizeDomainPattern(pattern)

    if (!normalized) {
      return null
    }

    if (!/^[a-z0-9*.-]+$/.test(normalized)) {
      return null
    }

    if (normalized.indexOf('*') >= 0 && normalized.slice(0, 2) !== '*.') {
      return null
    }

    if (normalized.indexOf('*') >= 0 && normalized.lastIndexOf('*') > 0) {
      return null
    }

    if (normalized === '*') {
      return null
    }

    if (normalized.slice(0, 2) === '*.') {
      var suffix = normalized.slice(2)
      if (!suffix || suffix.indexOf('*') >= 0) {
        return null
      }
      return new RegExp('^[^.]+(?:\\.[^.]+)*\\.' + escapeRegex(suffix) + '$')
    }

    return new RegExp('^' + escapeRegex(normalized) + '$')
  }

  function matchesDomainPattern(hostname, pattern) {
    var normalizedHost = normalizeDomainPattern(hostname)
    if (!normalizedHost) {
      return false
    }

    var regex = buildDomainPatternRegex(pattern)
    return regex ? regex.test(normalizedHost) : false
  }

  function isHostnameExcluded(hostname, patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0) {
      return false
    }

    for (var i = 0; i < patterns.length; i += 1) {
      if (matchesDomainPattern(hostname, patterns[i])) {
        return true
      }
    }

    return false
  }

  var api = {
    parseDomainPatterns: parseDomainPatterns,
    buildDomainPatternRegex: buildDomainPatternRegex,
    matchesDomainPattern: matchesDomainPattern,
    isHostnameExcluded: isHostnameExcluded
  }

  root.MemosDomainPatterns = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
