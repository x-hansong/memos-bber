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

function getDefaultAutoTagSystemPrompt() {
    return [
      '你是一个严格的标签分类器。',
      '你的任务是：从提供的候选标签中，选择最适合当前内容的一个标签。',
      '规则：',
      '1. 只能从候选标签列表中选择，绝不能创造新标签。',
      '2. 只返回一个标签。',
      '3. 返回内容必须是纯标签文本，不要解释、不要句子、不要标点、不要代码块。',
      '4. 如果候选标签都不合适，就返回：SKIP',
      '5. 如果有明确匹配，优先选择最具体的标签。'
    ].join('\n')
}

function getDefaultAutoTagUserPrompt() {
    return [
      '请根据下面内容选择一个最合适的标签。',
      '',
      '候选标签：',
      '{{candidate_tags}}',
      '',
      '待分类内容：',
      '{{content}}',
      '',
      '补充上下文：',
      '{{extra_context}}'
    ].join('\n')
}

function renderAutoTagPrompt(template, vars) {
    return (template || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function(_, key) {
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        return vars[key]
      }
      return ''
    })
}

function resolveAutoTagApiUrl(apiUrl) {
    var rawUrl = (apiUrl || '').trim()
    if (!rawUrl) {
      return ''
    }
    if (/\/chat\/completions\/?$/.test(rawUrl)) {
      return rawUrl
    }
    return rawUrl.replace(/\/?$/, '/') + 'chat/completions'
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

function requestAutoTag(content, settings) {
    var text = (content || '').trim()
    var candidateTags = parseTagValues(settings.autoTagCandidates)
    var endpoint = resolveAutoTagApiUrl(settings.autoTagApiUrl)
    var apiKey = (settings.autoTagApiKey || '').trim()
    var model = (settings.autoTagModel || '').trim()
    var existingTag = findExistingCandidateTag(text, candidateTags)
    var promptVars = {
      candidate_tags: candidateTags.join(', '),
      content: text,
      extra_context: ''
    }
    var systemPrompt = renderAutoTagPrompt(settings.autoTagSystemPrompt || getDefaultAutoTagSystemPrompt(), promptVars)
    var userPrompt = renderAutoTagPrompt(settings.autoTagUserPrompt || getDefaultAutoTagUserPrompt(), promptVars)

    if (existingTag) {
      return Promise.resolve(existingTag)
    }

    if (!settings.autoTagEnabled || !text || candidateTags.length === 0 || !endpoint || !apiKey || !model) {
      return Promise.resolve('')
    }

    var timeoutId = null
    var abortController = typeof AbortController === 'function' ? new AbortController() : null
    if (abortController) {
      timeoutId = setTimeout(function() {
        abortController.abort()
      }, 8000)
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ]
      }),
      signal: abortController ? abortController.signal : undefined
    }).then(function(response) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (!response.ok) {
        throw new Error('Request failed')
      }
      return response.json()
    }).then(function(data) {
      var modelOutput = ''
      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        modelOutput = data.choices[0].message.content || ''
      }
      return findMatchedCandidateTag(modelOutput, candidateTags)
    }).catch(function() {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      return ''
    })
}

function buildQuickSaveContent(content, pageUrl, quickSaveTag, autoTag) {
    var sections = []
    var body = buildMemoContent(content, pageUrl)
    var tagLine = parseTagValues([autoTag, quickSaveTag].filter(Boolean).join(' ')).join(' ')

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
        autoTagEnabled: false,
        autoTagCandidates: '',
        autoTagApiUrl: '',
        autoTagApiKey: '',
        autoTagModel: '',
        autoTagSystemPrompt: '',
        autoTagUserPrompt: '',
        memo_lock: ''
      },
      function(items) {
        if (!items.apiUrl || !items.apiTokens) {
          sendResponse({ ok: false, reason: 'missing-config' })
          return
        }

        requestAutoTag(memoContent || pageUrl, items).then(function(selectedTag) {
          return fetch(joinApiUrl(items.apiUrl, 'api/v1/memos'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + items.apiTokens
            },
            body: JSON.stringify({
              content: buildQuickSaveContent(memoContent, pageUrl, items.quicksavetag, selectedTag),
              visibility: items.memo_lock || ''
            })
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
