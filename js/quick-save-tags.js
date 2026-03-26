(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory()
    return
  }

  root.MemosQuickSaveTags = factory()
})(typeof self !== 'undefined' ? self : this, function() {
  function normalizeTagValue(tag) {
    var rawTag = (tag || '').trim()
    if (!rawTag) {
      return ''
    }
    return rawTag.charAt(0) === '#' ? rawTag : '#' + rawTag
  }

  function parseTagValues(tagText) {
    var seen = {}
    return (tagText || '')
      .split(/[\s,，]+/)
      .map(normalizeTagValue)
      .filter(function(tag) {
        if (!tag || seen[tag]) {
          return false
        }
        seen[tag] = true
        return true
      })
  }

  function findMatchedCandidateTag(rawText, candidateTags) {
    var text = (rawText || '').trim()
    var directTag = normalizeTagValue(text.replace(/^["'`\s]+|["'`\s]+$/g, ''))
    if (candidateTags.indexOf(directTag) >= 0) {
      return directTag
    }

    var parts = text.split(/[\s,，\n]+/)
    for (var i = 0; i < parts.length; i++) {
      var normalized = normalizeTagValue(parts[i].replace(/^["'`]+|["'`]+$/g, ''))
      if (candidateTags.indexOf(normalized) >= 0) {
        return normalized
      }
    }

    for (var j = 0; j < candidateTags.length; j++) {
      var candidate = candidateTags[j]
      var plainCandidate = candidate.slice(1)
      if (text.indexOf(candidate) >= 0 || text.indexOf(plainCandidate) >= 0) {
        return candidate
      }
    }

    return ''
  }

  function findExistingCandidateTag(content, candidateTags) {
    var matches = (content || '').match(/(#[^\s#]+)/g) || []
    for (var i = 0; i < matches.length; i++) {
      if (candidateTags.indexOf(matches[i]) >= 0) {
        return matches[i]
      }
    }
    return ''
  }

  function buildQuickSaveTagLine(quickSaveTag, manualTag, autoTag) {
    var preferredTag = normalizeTagValue(manualTag) || normalizeTagValue(autoTag)
    return parseTagValues([preferredTag, quickSaveTag].filter(Boolean).join(' ')).join(' ')
  }

  return {
    normalizeTagValue: normalizeTagValue,
    parseTagValues: parseTagValues,
    findMatchedCandidateTag: findMatchedCandidateTag,
    findExistingCandidateTag: findExistingCandidateTag,
    buildQuickSaveTagLine: buildQuickSaveTagLine
  }
})
