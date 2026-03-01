(function () {
  var buttonEl = null
  var toastEl = null
  var hideTimer = null
  var selectedPayload = null

  function createButton() {
    if (buttonEl) {
      return buttonEl
    }

    buttonEl = document.createElement('button')
    buttonEl.type = 'button'
    buttonEl.textContent = chrome.i18n.getMessage('quickSaveBtn') || 'Save to Memos'
    buttonEl.style.position = 'fixed'
    buttonEl.style.zIndex = '2147483647'
    buttonEl.style.display = 'none'
    buttonEl.style.padding = '6px 10px'
    buttonEl.style.border = '0'
    buttonEl.style.borderRadius = '999px'
    buttonEl.style.background = '#111827'
    buttonEl.style.color = '#ffffff'
    buttonEl.style.fontSize = '12px'
    buttonEl.style.fontFamily = 'system-ui, sans-serif'
    buttonEl.style.lineHeight = '1.2'
    buttonEl.style.cursor = 'pointer'
    buttonEl.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.2)'

    buttonEl.addEventListener('mousedown', function (event) {
      event.preventDefault()
    })

    buttonEl.addEventListener('click', function (event) {
      event.preventDefault()
      event.stopPropagation()

      if (!selectedPayload || !selectedPayload.content) {
        hideButton()
        return
      }

      chrome.runtime.sendMessage(
        {
          type: 'quick-save-selection',
          payload: {
            content: selectedPayload.content,
            pageUrl: window.location.href
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
    })

    document.documentElement.appendChild(buttonEl)
    return buttonEl
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

  function hideButton() {
    if (!buttonEl) {
      return
    }
    selectedPayload = null
    buttonEl.style.display = 'none'
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

  function showButton(payload) {
    var el = createButton()
    selectedPayload = payload

    var top = payload.rect.bottom + 8
    var left = payload.rect.right
    var maxLeft = window.innerWidth - 20

    if (left > maxLeft) {
      left = maxLeft
    }
    if (left < 20) {
      left = 20
    }

    if (top > window.innerHeight - 20) {
      top = Math.max(20, payload.rect.top - 40)
    }

    el.style.left = left + 'px'
    el.style.top = top + 'px'
    el.style.display = 'block'
  }

  function refreshSelectionButton() {
    var payload = getSelectionPayload()
    if (!payload) {
      selectedPayload = null
      hideButton()
      return
    }

    showButton(payload)
  }

  document.addEventListener('selectionchange', function () {
    window.setTimeout(refreshSelectionButton, 0)
  })

  document.addEventListener('mousedown', function (event) {
    if (buttonEl && event.target === buttonEl) {
      return
    }
    hideButton()
  })

  window.addEventListener('scroll', hideButton, true)
  window.addEventListener('resize', hideButton)
})()
