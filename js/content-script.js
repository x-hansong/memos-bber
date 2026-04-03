(function () {
  var quickSaveTags = window.MemosQuickSaveTags || {}
  var hoverTagPickerSettings = window.MemosHoverTagPickerSettings || {}
  var selectionButtonPosition = window.MemosSelectionButtonPosition || {}
  var parseTagValues = quickSaveTags.parseTagValues || function() {
    return []
  }
  var computeSelectionButtonPosition = selectionButtonPosition.computePosition || function(anchorRect) {
    return {
      left: anchorRect && typeof anchorRect.right === 'number' ? anchorRect.right : 20,
      top: anchorRect && typeof anchorRect.bottom === 'number' ? anchorRect.bottom + 8 : 20
    }
  }
  var normalizeHoverSettings = hoverTagPickerSettings.normalizeSettings || function(rawSettings) {
    return {
      enabled: Boolean(rawSettings && rawSettings.hoverTagPickerEnabled),
      delaySeconds: 10,
      candidateTags: parseTagValues(rawSettings && rawSettings.autoTagCandidates)
    }
  }

  var excludedDomainPatterns = []
  var hoverTagPickerEnabled = false
  var hoverTagPickerDelaySeconds = 10
  var hoverTagCandidateTags = []
  var containerEl = null
  var buttonEl = null
  var tagListEl = null
  var toastEl = null
  var hideTimer = null
  var selectedPayload = null
  var selectedManualTag = ''
  var isExpanded = false
  var hoverCountdownTimer = null
  var hoverCountdownStartedAt = 0
  var VIEWPORT_EDGE_PADDING = 20
  var ANCHOR_OFFSET = 8

  function parseDomainPatterns(value) {
    if (!window.MemosDomainPatterns) {
      return []
    }
    return window.MemosDomainPatterns.parseDomainPatterns(value)
  }

  function isCurrentHostnameExcluded() {
    if (!window.MemosDomainPatterns) {
      return false
    }
    return window.MemosDomainPatterns.isHostnameExcluded(window.location.hostname, excludedDomainPatterns)
  }

  function applySettings(items) {
    excludedDomainPatterns = parseDomainPatterns(items.quickSaveExcludedDomains)

    var normalizedHoverSettings = normalizeHoverSettings({
      hoverTagPickerEnabled: items.hoverTagPickerEnabled,
      hoverTagPickerDelaySeconds: items.hoverTagPickerDelaySeconds,
      autoTagCandidates: items.autoTagCandidates
    }, parseTagValues)

    hoverTagPickerEnabled = normalizedHoverSettings.enabled
    hoverTagPickerDelaySeconds = normalizedHoverSettings.delaySeconds
    hoverTagCandidateTags = normalizedHoverSettings.candidateTags

    if (isCurrentHostnameExcluded()) {
      hideButton()
      return
    }

    if (!canOpenHoverTagPicker()) {
      stopHoverCountdown()
      collapseExpandedState()
    }
  }

  function loadSettings() {
    chrome.storage.sync.get(
      {
        quickSaveExcludedDomains: '',
        hoverTagPickerEnabled: false,
        hoverTagPickerDelaySeconds: 10,
        autoTagCandidates: ''
      },
      applySettings
    )
  }

  function getBaseButtonText() {
    return chrome.i18n.getMessage('quickSaveBtn') || 'Save to Memos'
  }

  function getSelectPromptText() {
    return chrome.i18n.getMessage('hoverTagPickerSelectPrompt') || 'Pick 1 tag first'
  }

  function getExpandedSaveText() {
    return chrome.i18n.getMessage('hoverTagPickerSaveBtn') || 'Save to Memos with Tag'
  }

  function sendQuickSave(selectedTag) {
    if (!selectedPayload || !selectedPayload.content) {
      hideButton()
      return
    }

    chrome.runtime.sendMessage(
      {
        type: 'quick-save-selection',
        payload: {
          content: selectedPayload.content,
          pageUrl: window.location.href,
          selectedTag: selectedTag || ''
        }
      },
      function (response) {
        if (chrome.runtime.lastError) {
          showToast(chrome.i18n.getMessage('quickSaveFailed') || 'Save failed')
          return
        }

        if (response && response.ok) {
          showToast(chrome.i18n.getMessage('quickSaveSuccess') || 'Saved to Memos')
        } else if (response && response.reason === 'missing-config') {
          showToast(chrome.i18n.getMessage('quickSaveNeedSetup') || 'Configure Memos first')
        } else {
          showToast(chrome.i18n.getMessage('quickSaveFailed') || 'Save failed')
        }
      }
    )

    hideButton()
    clearSelection()
  }

  function createButton() {
    if (containerEl) {
      return containerEl
    }

    containerEl = document.createElement('div')
    containerEl.style.position = 'fixed'
    containerEl.style.zIndex = '2147483647'
    containerEl.style.display = 'none'
    containerEl.style.flexDirection = 'column'
    containerEl.style.alignItems = 'flex-end'
    containerEl.style.gap = '8px'
    containerEl.style.maxWidth = 'calc(100vw - 40px)'
    containerEl.style.boxSizing = 'border-box'

    buttonEl = document.createElement('button')
    buttonEl.type = 'button'
    buttonEl.style.padding = '6px 10px'
    buttonEl.style.border = '0'
    buttonEl.style.borderRadius = '999px'
    buttonEl.style.background = '#111827'
    buttonEl.style.color = '#ffffff'
    buttonEl.style.fontSize = '12px'
    buttonEl.style.fontFamily = 'system-ui, sans-serif'
    buttonEl.style.lineHeight = '1.2'
    buttonEl.style.cursor = 'pointer'
    buttonEl.style.maxWidth = '100%'
    buttonEl.style.boxSizing = 'border-box'
    buttonEl.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.2)'
    buttonEl.style.transition = 'background 120ms ease, opacity 120ms ease'

    buttonEl.addEventListener('mousedown', function (event) {
      event.preventDefault()
    })

    buttonEl.addEventListener('mouseenter', function () {
      startHoverCountdown()
    })

    buttonEl.addEventListener('mouseleave', function () {
      if (isExpanded) {
        return
      }
      stopHoverCountdown()
      setBaseButtonState()
    })

    buttonEl.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()

      if (!selectedPayload || !selectedPayload.content) {
        hideButton()
        return
      }

      if (isExpanded && !selectedManualTag) {
        showToast(chrome.i18n.getMessage('hoverTagPickerTagRequired') || 'Pick exactly one tag before saving')
        return
      }

      sendQuickSave(selectedManualTag)
    })

    tagListEl = document.createElement('div')
    tagListEl.style.display = 'none'
    tagListEl.style.flexWrap = 'wrap'
    tagListEl.style.justifyContent = 'flex-end'
    tagListEl.style.gap = '6px'
    tagListEl.style.maxWidth = '280px'
    tagListEl.style.boxSizing = 'border-box'
    tagListEl.style.padding = '10px'
    tagListEl.style.borderRadius = '14px'
    tagListEl.style.background = 'rgba(17, 24, 39, 0.94)'
    tagListEl.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.2)'

    containerEl.appendChild(buttonEl)
    containerEl.appendChild(tagListEl)
    document.documentElement.appendChild(containerEl)
    return containerEl
  }

  function createToast() {
    if (toastEl) {
      return toastEl
    }

    toastEl = document.createElement('div')
    toastEl.style.position = 'fixed'
    toastEl.style.left = '50%'
    toastEl.style.bottom = '24px'
    toastEl.style.transform = 'translateX(-50%)'
    toastEl.style.zIndex = '2147483647'
    toastEl.style.display = 'none'
    toastEl.style.maxWidth = '320px'
    toastEl.style.padding = '10px 14px'
    toastEl.style.borderRadius = '10px'
    toastEl.style.background = 'rgba(17, 24, 39, 0.92)'
    toastEl.style.color = '#ffffff'
    toastEl.style.fontSize = '13px'
    toastEl.style.fontFamily = 'system-ui, sans-serif'
    toastEl.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.2)'

    document.documentElement.appendChild(toastEl)
    return toastEl
  }

  function showToast(message) {
    var el = createToast()
    el.textContent = message
    el.style.display = 'block'

    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(function () {
      el.style.display = 'none'
    }, 2200)
  }

  function clearSelection() {
    var selection = window.getSelection()
    if (!selection) {
      return
    }
    selection.removeAllRanges()
  }

  function isBlockElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return false
    }

    return /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DIV|DL|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H1|H2|H3|H4|H5|H6|HEADER|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TR|UL)$/.test(node.tagName)
  }

  function escapeMarkdown(text) {
    return text.replace(/([\\`*_\[\]<>])/g, '\\$1')
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, ' ')
  }

  function serializeNode(node) {
    if (!node) {
      return ''
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeText(node.textContent || '')
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ''
    }

    if (node.tagName === 'BR') {
      return '\n'
    }

    if (node.tagName === 'A') {
      var label = serializeChildren(node).trim()
      var href = node.getAttribute('href') || node.href || ''
      if (!href) {
        return label
      }
      if (!label) {
        return href
      }
      if (label === href) {
        return href
      }
      return '[' + escapeMarkdown(label) + '](' + href + ')'
    }

    var content = serializeChildren(node)
    if (isBlockElement(node)) {
      return '\n' + content.trim() + '\n'
    }
    return content
  }

  function serializeChildren(node) {
    var result = ''
    var childNodes = node.childNodes || []
    for (var i = 0; i < childNodes.length; i += 1) {
      result += serializeNode(childNodes[i])
    }
    return result
  }

  function tidyContent(text) {
    return text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  }

  function getSelectionPayload() {
    var selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null
    }

    var content = ''

    for (var i = 0; i < selection.rangeCount; i += 1) {
      var fragment = selection.getRangeAt(i).cloneContents()
      var wrapper = document.createElement('div')
      wrapper.appendChild(fragment)
      content += serializeChildren(wrapper)
    }

    content = tidyContent(content)
    if (!content) {
      return null
    }

    var range = selection.getRangeAt(0)
    var rect = range.getBoundingClientRect()
    if ((!rect || (!rect.width && !rect.height)) && range.getClientRects().length > 0) {
      rect = range.getClientRects()[0]
    }

    if (!rect) {
      return null
    }

    return {
      content: content,
      rect: rect
    }
  }

  function canOpenHoverTagPicker() {
    return hoverTagPickerEnabled && hoverTagCandidateTags.length > 0
  }

  function getViewportMaxWidth() {
    return Math.max(0, window.innerWidth - VIEWPORT_EDGE_PADDING * 2)
  }

  function applyContainerWidthConstraints() {
    var maxWidth = getViewportMaxWidth()

    if (containerEl) {
      containerEl.style.maxWidth = maxWidth + 'px'
    }

    if (tagListEl) {
      tagListEl.style.maxWidth = maxWidth + 'px'
    }
  }

  function positionContainer() {
    if (!containerEl || !selectedPayload || !selectedPayload.rect) {
      return
    }

    applyContainerWidthConstraints()

    containerEl.style.left = '0px'
    containerEl.style.top = '0px'

    var position = computeSelectionButtonPosition(
      selectedPayload.rect,
      {
        width: containerEl.offsetWidth,
        height: containerEl.offsetHeight
      },
      {
        width: window.innerWidth,
        height: window.innerHeight
      },
      {
        edgePadding: VIEWPORT_EDGE_PADDING,
        anchorOffset: ANCHOR_OFFSET
      }
    )

    containerEl.style.left = position.left + 'px'
    containerEl.style.top = position.top + 'px'
  }

  function stopHoverCountdown() {
    if (!hoverCountdownTimer) {
      return
    }
    window.clearInterval(hoverCountdownTimer)
    hoverCountdownTimer = null
    hoverCountdownStartedAt = 0
  }

  function setButtonProgress(progress) {
    var safeProgress = Math.max(0, Math.min(1, progress))
    if (safeProgress <= 0) {
      buttonEl.style.background = '#111827'
      return
    }

    var progressPercent = Math.round(safeProgress * 100)
    buttonEl.style.background = 'linear-gradient(90deg, #2563eb 0%, #2563eb ' + progressPercent + '%, #111827 ' + progressPercent + '%, #111827 100%)'
  }

  function setBaseButtonState() {
    if (!buttonEl) {
      return
    }
    buttonEl.textContent = getBaseButtonText()
    buttonEl.disabled = false
    buttonEl.style.opacity = '1'
    buttonEl.style.cursor = 'pointer'
    setButtonProgress(0)
  }

  function updateExpandedButtonState() {
    if (!buttonEl) {
      return
    }

    buttonEl.textContent = selectedManualTag ? getExpandedSaveText() : getSelectPromptText()
    buttonEl.disabled = false
    buttonEl.style.opacity = selectedManualTag ? '1' : '0.92'
    buttonEl.style.cursor = 'pointer'
    buttonEl.style.background = selectedManualTag ? '#2563eb' : '#111827'
  }

  function updateTagChipStyles() {
    var children = tagListEl ? tagListEl.children : []
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i]
      var isActive = child.getAttribute('data-tag') === selectedManualTag
      child.style.background = isActive ? '#2563eb' : 'rgba(255, 255, 255, 0.08)'
      child.style.color = '#ffffff'
      child.style.border = isActive ? '1px solid #60a5fa' : '1px solid rgba(255, 255, 255, 0.12)'
    }
  }

  function renderTagOptions() {
    if (!tagListEl) {
      return
    }

    tagListEl.innerHTML = ''

    for (var i = 0; i < hoverTagCandidateTags.length; i += 1) {
      var tag = hoverTagCandidateTags[i]
      var chipEl = document.createElement('button')
      chipEl.type = 'button'
      chipEl.textContent = tag
      chipEl.setAttribute('data-tag', tag)
      chipEl.style.padding = '4px 8px'
      chipEl.style.borderRadius = '999px'
      chipEl.style.fontSize = '12px'
      chipEl.style.lineHeight = '1.2'
      chipEl.style.cursor = 'pointer'

      chipEl.addEventListener('mousedown', function (event) {
        event.preventDefault()
        event.stopPropagation()
      })

      chipEl.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()

        var tagValue = this.getAttribute('data-tag') || ''
        selectedManualTag = tagValue
        updateTagChipStyles()
        updateExpandedButtonState()
        sendQuickSave(selectedManualTag)
      })

      tagListEl.appendChild(chipEl)
    }

    updateTagChipStyles()
  }

  function collapseExpandedState() {
    isExpanded = false
    selectedManualTag = ''

    if (tagListEl) {
      tagListEl.style.display = 'none'
      tagListEl.innerHTML = ''
    }

    if (buttonEl) {
      setBaseButtonState()
    }
  }

  function expandTagPicker() {
    if (!selectedPayload || !canOpenHoverTagPicker()) {
      stopHoverCountdown()
      setBaseButtonState()
      return
    }

    stopHoverCountdown()
    isExpanded = true
    selectedManualTag = ''
    renderTagOptions()
    tagListEl.style.display = 'flex'
    updateExpandedButtonState()
    positionContainer()
  }

  function startHoverCountdown() {
    if (!selectedPayload || isExpanded || !canOpenHoverTagPicker()) {
      return
    }

    stopHoverCountdown()
    hoverCountdownStartedAt = Date.now()

    function tick() {
      var durationMs = hoverTagPickerDelaySeconds * 1000
      var elapsedMs = Date.now() - hoverCountdownStartedAt
      var progress = elapsedMs / durationMs

      if (progress >= 1) {
        expandTagPicker()
        return
      }

      var remainingSeconds = Math.max(1, Math.ceil((durationMs - elapsedMs) / 1000))
      buttonEl.textContent = getBaseButtonText() + ' · ' + remainingSeconds + 's'
      buttonEl.disabled = false
      buttonEl.style.opacity = '1'
      buttonEl.style.cursor = 'pointer'
      setButtonProgress(progress)
    }

    tick()
    hoverCountdownTimer = window.setInterval(tick, 120)
  }

  function hideButton() {
    stopHoverCountdown()
    collapseExpandedState()
    selectedPayload = null

    if (!containerEl) {
      return
    }

    containerEl.style.display = 'none'
    containerEl.style.visibility = 'hidden'
  }

  function showButton(payload) {
    createButton()
    selectedPayload = payload
    stopHoverCountdown()
    collapseExpandedState()

    containerEl.style.display = 'flex'
    containerEl.style.visibility = 'hidden'
    setBaseButtonState()
    positionContainer()
    containerEl.style.visibility = 'visible'
  }

  function refreshSelectionButton() {
    if (isCurrentHostnameExcluded()) {
      hideButton()
      return
    }

    var payload = getSelectionPayload()
    if (!payload) {
      hideButton()
      return
    }

    showButton(payload)
  }

  document.addEventListener('selectionchange', function () {
    window.setTimeout(refreshSelectionButton, 0)
  })

  document.addEventListener('mousedown', function (event) {
    if (containerEl && containerEl.contains(event.target)) {
      return
    }
    hideButton()
  })

  window.addEventListener('scroll', hideButton, true)
  window.addEventListener('resize', hideButton)

  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName !== 'sync') {
      return
    }

    if (
      !changes.quickSaveExcludedDomains &&
      !changes.hoverTagPickerEnabled &&
      !changes.hoverTagPickerDelaySeconds &&
      !changes.autoTagCandidates
    ) {
      return
    }

    applySettings({
      quickSaveExcludedDomains: changes.quickSaveExcludedDomains ? changes.quickSaveExcludedDomains.newValue : excludedDomainPatterns.join('\n'),
      hoverTagPickerEnabled: changes.hoverTagPickerEnabled ? changes.hoverTagPickerEnabled.newValue : hoverTagPickerEnabled,
      hoverTagPickerDelaySeconds: changes.hoverTagPickerDelaySeconds ? changes.hoverTagPickerDelaySeconds.newValue : hoverTagPickerDelaySeconds,
      autoTagCandidates: changes.autoTagCandidates ? changes.autoTagCandidates.newValue : hoverTagCandidateTags.join(' ')
    })
  })

  loadSettings()
})()
