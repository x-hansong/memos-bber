chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create(
      {
        type: 'normal',
        title: chrome.i18n.getMessage("sendTo"),
        id: 'Memos-send-selection',
        contexts: ['selection']
      },
    )
    chrome.contextMenus.create(
      {
        type: 'normal',
        title: chrome.i18n.getMessage("sendLinkTo"),
        id: 'Memos-send-link',
        contexts: ['link', 'page']
      },
    )
    chrome.contextMenus.create(
      {
        type: 'normal',
        title: chrome.i18n.getMessage("sendImageTo"),
        id: 'Memos-send-image',
        contexts: ['image']
      },
    )
})
chrome.contextMenus.onClicked.addListener(info => {
    let tempCont=''
    switch(info.menuItemId){
      case 'Memos-send-selection':
        tempCont = info.selectionText + '\n'
        break
      case 'Memos-send-link':
        tempCont = (info.linkUrl || info.pageUrl) + '\n'
        break
      case 'Memos-send-image':
        tempCont = `![](${info.srcUrl})` + '\n'
        break
    }
    chrome.storage.sync.get({open_action: "save_text", open_content: ''}, function(items) {
      if(items.open_action === 'upload_image') {
        alert(chrome.i18n.getMessage("picPending"));
      } else {
        chrome.storage.sync.set({open_action: "save_text", open_content: items.open_content + tempCont});
      }
    })
})

function joinApiUrl(baseUrl, path) {
    return baseUrl.replace(/\/?$/, '/') + path.replace(/^\//, '')
}

function buildMemoContent(content, pageUrl) {
    var sourceLine = pageUrl || ''
    if (!sourceLine) {
      return content
    }
    if (!content) {
      return sourceLine
    }
    return content + '\n\n' + sourceLine
}

function normalizeQuickSaveTag(tagText) {
    var rawTag = (tagText || '').trim()
    if (!rawTag) {
      return ''
    }

    return rawTag
      .split(/\s+/)
      .filter(Boolean)
      .map(function(tag) {
        return tag.charAt(0) === '#' ? tag : '#' + tag
      })
      .join(' ')
}

function buildQuickSaveContent(content, pageUrl, quickSaveTag) {
    var sections = []
    var body = buildMemoContent(content, pageUrl)
    var tagLine = normalizeQuickSaveTag(quickSaveTag)

    if (body) {
      sections.push(body)
    }
    if (tagLine) {
      sections.push(tagLine)
    }

    return sections.join('\n\n')
}

function sendQuickMemo(payload, sendResponse) {
    var memoContent = ((payload && payload.content) || '').trim()
    var pageUrl = (payload && payload.pageUrl) || ''

    if (!memoContent && !pageUrl) {
      sendResponse({ ok: false, reason: 'empty-content' })
      return
    }

    chrome.storage.sync.get(
      {
        apiUrl: '',
        apiTokens: '',
        quicksavetag: '',
        memo_lock: ''
      },
      function(items) {
        if (!items.apiUrl || !items.apiTokens) {
          sendResponse({ ok: false, reason: 'missing-config' })
          return
        }

        fetch(joinApiUrl(items.apiUrl, 'api/v1/memos'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + items.apiTokens
          },
          body: JSON.stringify({
            content: buildQuickSaveContent(memoContent, pageUrl, items.quicksavetag),
            visibility: items.memo_lock || ''
          })
        }).then(function(response) {
          if (!response.ok) {
            throw new Error('Request failed')
          }
          return response.json()
        }).then(function() {
          sendResponse({ ok: true })
        }).catch(function() {
          sendResponse({ ok: false, reason: 'request-failed' })
        })
      }
    )
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (!message || message.type !== 'quick-save-selection') {
      return
    }

    sendQuickMemo(message.payload || {}, sendResponse)
    return true
})
