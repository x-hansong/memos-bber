var CONFIG_EXPORT_KEYS = [
    'apiUrl',
    'apiTokens',
    'userid',
    'hidetag',
    'showtag',
    'quicksavetag',
    'autoTagEnabled',
    'autoTagCandidates',
    'autoTagApiUrl',
    'autoTagApiKey',
    'autoTagModel',
    'autoTagSystemPrompt',
    'autoTagUserPrompt'
]

var EXPORTABLE_SETTINGS_DEFAULTS = {
    apiUrl: '',
    apiTokens: '',
    userid: '',
    hidetag: '',
    showtag: '',
    quicksavetag: '',
    autoTagEnabled: false,
    autoTagCandidates: '',
    autoTagApiUrl: '',
    autoTagApiKey: '',
    autoTagModel: '',
    autoTagSystemPrompt: '',
    autoTagUserPrompt: ''
}

var S3_SYNC_DEFAULTS = {
    s3SyncEnabled: false,
    s3Endpoint: '',
    s3Region: '',
    s3Bucket: '',
    s3ObjectKey: '',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3SyncIntervalHours: 6,
    s3SyncBidirectional: true,
    s3ForcePathStyle: true
}

var SYNC_ALARM_NAME = 'memos-bber-s3-sync'
var syncCyclePromise = null

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
    initializeSyncEngine()
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

function normalizeMemoVisibility(value) {
    if (value === 'PUBLIC' || value === 'PRIVATE' || value === 'PROTECTED') {
      return value
    }
    return 'PUBLIC'
}

function parseResponseBody(response) {
    if (!response) {
      return Promise.resolve('')
    }
    return response.clone().text().catch(function() {
      return ''
    })
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

function storageSyncGet(query) {
    return new Promise(function(resolve) {
      chrome.storage.sync.get(query, resolve)
    })
}

function storageSyncSet(values) {
    return new Promise(function(resolve) {
      chrome.storage.sync.set(values, resolve)
    })
}

function storageLocalGet(query) {
    return new Promise(function(resolve) {
      chrome.storage.local.get(query, resolve)
    })
}

function storageLocalSet(values) {
    return new Promise(function(resolve) {
      chrome.storage.local.set(values, resolve)
    })
}

function alarmsCreate(name, info) {
    return new Promise(function(resolve) {
      chrome.alarms.create(name, info)
      resolve()
    })
}

function alarmsClear(name) {
    return new Promise(function(resolve) {
      chrome.alarms.clear(name, function(cleared) {
        resolve(cleared)
      })
    })
}

function normalizeExportableSettings(source) {
    var normalized = {}
    for (var i = 0; i < CONFIG_EXPORT_KEYS.length; i++) {
      var key = CONFIG_EXPORT_KEYS[i]
      if (source && Object.prototype.hasOwnProperty.call(source, key)) {
        normalized[key] = source[key]
      } else {
        normalized[key] = EXPORTABLE_SETTINGS_DEFAULTS[key]
      }
    }
    return normalized
}

function stableSortValue(value) {
    if (Array.isArray(value)) {
      return value.map(stableSortValue)
    }

    if (value && typeof value === 'object') {
      var result = {}
      var keys = Object.keys(value).sort()
      for (var i = 0; i < keys.length; i++) {
        result[keys[i]] = stableSortValue(value[keys[i]])
      }
      return result
    }

    return value
}

function stableStringify(value) {
    return JSON.stringify(stableSortValue(value))
}

function toHex(buffer) {
    var bytes = new Uint8Array(buffer)
    var parts = []
    for (var i = 0; i < bytes.length; i++) {
      parts.push(bytes[i].toString(16).padStart(2, '0'))
    }
    return parts.join('')
}

function encodeUtf8(value) {
    return new TextEncoder().encode(value)
}

function encodeRfc3986(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, function(char) {
      return '%' + char.charCodeAt(0).toString(16).toUpperCase()
    })
}

function normalizeIsoTime(value) {
    var date = value ? new Date(value) : new Date()
    if (Number.isNaN(date.getTime())) {
      date = new Date()
    }
    return date.toISOString()
}

function formatAmzDate(isoString) {
    return normalizeIsoTime(isoString).replace(/[:-]|\.\d{3}/g, '')
}

function formatDateStamp(isoString) {
    return formatAmzDate(isoString).slice(0, 8)
}

function canonicalizePath(pathname) {
    var parts = pathname.split('/')
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) {
        continue
      }
      parts[i] = encodeRfc3986(decodeURIComponent(parts[i]))
    }
    return parts.join('/') || '/'
}

function buildObjectUrl(config) {
    var base = new URL(config.s3Endpoint)
    var basePath = base.pathname.replace(/\/+$/, '')
    var segments = []
    if (basePath) {
      segments.push(basePath.replace(/^\/+/, ''))
    }
    if (config.s3ForcePathStyle !== false) {
      segments.push(config.s3Bucket)
    } else {
      base.hostname = config.s3Bucket + '.' + base.hostname
    }

    var objectSegments = (config.s3ObjectKey || '').split('/').filter(Boolean)
    for (var i = 0; i < objectSegments.length; i++) {
      segments.push(objectSegments[i])
    }

    base.pathname = '/' + segments.map(function(segment) {
      return encodeRfc3986(segment)
    }).join('/')

    return base
}

function getCrypto() {
    if (globalThis.crypto && globalThis.crypto.subtle) {
      return globalThis.crypto
    }

    throw new Error('Web Crypto unavailable')
}

function sha256HexFromText(value) {
    return getCrypto().subtle.digest('SHA-256', encodeUtf8(value)).then(toHex)
}

function hmacSha256Raw(keyBytes, value) {
    return getCrypto().subtle.importKey(
      'raw',
      keyBytes,
      {
        name: 'HMAC',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    ).then(function(key) {
      return getCrypto().subtle.sign('HMAC', key, encodeUtf8(value))
    }).then(function(signature) {
      return new Uint8Array(signature)
    })
}

function deriveSigningKey(secretKey, dateStamp, region, service) {
    return hmacSha256Raw(encodeUtf8('AWS4' + secretKey), dateStamp)
      .then(function(kDate) {
        return hmacSha256Raw(kDate, region)
      })
      .then(function(kRegion) {
        return hmacSha256Raw(kRegion, service)
      })
      .then(function(kService) {
        return hmacSha256Raw(kService, 'aws4_request')
      })
}

function signMinioRequest(method, url, payloadHash, config, isoTime) {
    var normalizedTime = normalizeIsoTime(isoTime)
    var amzDate = formatAmzDate(normalizedTime)
    var dateStamp = formatDateStamp(normalizedTime)
    var canonicalUri = canonicalizePath(url.pathname)
    var canonicalQuery = ''
    var signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
    var canonicalHeaders = [
      'host:' + url.host,
      'x-amz-content-sha256:' + payloadHash,
      'x-amz-date:' + amzDate
    ].join('\n') + '\n'
    var credentialScope = [dateStamp, config.s3Region || 'us-east-1', 's3', 'aws4_request'].join('/')
    var canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n')

    return sha256HexFromText(canonicalRequest)
      .then(function(canonicalRequestHash) {
        var stringToSign = [
          'AWS4-HMAC-SHA256',
          amzDate,
          credentialScope,
          canonicalRequestHash
        ].join('\n')

        return deriveSigningKey(config.s3SecretAccessKey, dateStamp, config.s3Region || 'us-east-1', 's3')
          .then(function(signingKey) {
            return hmacSha256Raw(signingKey, stringToSign)
          })
          .then(function(signatureBytes) {
            return {
              Authorization: [
                'AWS4-HMAC-SHA256 Credential=' + config.s3AccessKeyId + '/' + credentialScope,
                'SignedHeaders=' + signedHeaders,
                'Signature=' + toHex(signatureBytes)
              ].join(', '),
              'x-amz-content-sha256': payloadHash,
              'x-amz-date': amzDate
            }
          })
      })
}

function buildRemotePayload(settings, updatedAt) {
    var normalizedSettings = normalizeExportableSettings(settings)
    var normalizedUpdatedAt = normalizeIsoTime(updatedAt)
    var settingsJson = stableStringify(normalizedSettings)

    return sha256HexFromText(settingsJson).then(function(contentHash) {
      var payload = {
        version: 1,
        updatedAt: normalizedUpdatedAt,
        contentHash: 'sha256-' + contentHash,
        settings: normalizedSettings
      }

      return {
        payload: payload,
        contentHash: payload.contentHash,
        body: JSON.stringify(payload, null, 2)
      }
    })
}

function normalizeRemotePayload(data) {
    if (!data || typeof data !== 'object') {
      return null
    }

    var source = data.settings && typeof data.settings === 'object' ? data.settings : data
    var hasAny = false
    for (var i = 0; i < CONFIG_EXPORT_KEYS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(source, CONFIG_EXPORT_KEYS[i])) {
        hasAny = true
        break
      }
    }

    if (!hasAny) {
      return null
    }

    if (!data.updatedAt || Number.isNaN(new Date(data.updatedAt).getTime())) {
      return null
    }

    return {
      version: typeof data.version === 'number' ? data.version : 1,
      updatedAt: normalizeIsoTime(data.updatedAt),
      contentHash: typeof data.contentHash === 'string' ? data.contentHash : '',
      settings: normalizeExportableSettings(source)
    }
}

function getExportableSettings() {
    return storageSyncGet(EXPORTABLE_SETTINGS_DEFAULTS).then(normalizeExportableSettings)
}

function getSyncConfig() {
    return storageSyncGet(S3_SYNC_DEFAULTS).then(function(items) {
      var intervalHours = parseInt(items.s3SyncIntervalHours, 10)
      if (Number.isNaN(intervalHours)) {
        intervalHours = S3_SYNC_DEFAULTS.s3SyncIntervalHours
      }

      return {
        s3SyncEnabled: Boolean(items.s3SyncEnabled),
        s3Endpoint: (items.s3Endpoint || '').trim().replace(/\/+$/, ''),
        s3Region: (items.s3Region || '').trim() || 'us-east-1',
        s3Bucket: (items.s3Bucket || '').trim(),
        s3ObjectKey: (items.s3ObjectKey || '').trim().replace(/^\/+/, ''),
        s3AccessKeyId: (items.s3AccessKeyId || '').trim(),
        s3SecretAccessKey: (items.s3SecretAccessKey || '').trim(),
        s3SyncIntervalHours: Math.min(24, Math.max(1, intervalHours)),
        s3SyncBidirectional: items.s3SyncBidirectional !== false,
        s3ForcePathStyle: items.s3ForcePathStyle !== false
      }
    })
}

function getLocalConfigUpdatedAt() {
    return storageLocalGet({
      configUpdatedAt: ''
    }).then(function(items) {
      return items.configUpdatedAt ? normalizeIsoTime(items.configUpdatedAt) : ''
    })
}

function saveSyncState(state) {
    return storageLocalSet({
      s3SyncState: state
    })
}

function buildSyncState(status, reason, detail, trigger, at) {
    return {
      status: status,
      reason: reason || '',
      detail: detail || '',
      trigger: trigger || '',
      lastSyncAt: at ? normalizeIsoTime(at) : ''
    }
}

function rebuildSyncAlarm() {
    return getSyncConfig().then(function(config) {
      if (!config.s3SyncEnabled) {
        return alarmsClear(SYNC_ALARM_NAME)
      }

      return alarmsCreate(SYNC_ALARM_NAME, {
        periodInMinutes: config.s3SyncIntervalHours * 60
      })
    })
}

function hasValidSyncConfig(config) {
    return Boolean(
      config.s3SyncEnabled &&
      config.s3Endpoint &&
      config.s3Bucket &&
      config.s3ObjectKey &&
      config.s3AccessKeyId &&
      config.s3SecretAccessKey
    )
}

function fetchRemoteConfig(config) {
    var url = buildObjectUrl(config)
    var emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

    return signMinioRequest('GET', url, emptyHash, config, new Date().toISOString()).then(function(headers) {
      return fetch(url.toString(), {
        method: 'GET',
        headers: headers
      })
    }).then(function(response) {
      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw new Error('remote-' + response.status)
      }
      return response.text()
    }).then(function(text) {
      if (text === null) {
        return null
      }
      if (!text) {
        return null
      }

      var parsed = JSON.parse(text)
      var normalized = normalizeRemotePayload(parsed)
      if (!normalized) {
        throw new Error('invalid-remote-payload')
      }
      if (!normalized.contentHash) {
        return buildRemotePayload(normalized.settings, normalized.updatedAt).then(function(built) {
          normalized.contentHash = built.contentHash
          normalized.updatedAt = built.payload.updatedAt
          return normalized
        })
      }
      return normalized
    })
}

function pushRemoteConfig(config, payloadBundle) {
    var url = buildObjectUrl(config)

    return sha256HexFromText(payloadBundle.body).then(function(bodyHash) {
      return signMinioRequest('PUT', url, bodyHash, config, payloadBundle.payload.updatedAt).then(function(headers) {
        return fetch(url.toString(), {
          method: 'PUT',
          headers: headers,
          body: payloadBundle.body
        })
      })
    }).then(function(response) {
      if (!response.ok) {
        throw new Error('remote-' + response.status)
      }
      return payloadBundle.payload
    })
}

function applyRemoteConfig(normalizedRemote) {
    return storageSyncSet(normalizedRemote.settings).then(function() {
      return storageLocalSet({
        configUpdatedAt: normalizedRemote.updatedAt
      })
    })
}

function runSyncCycle(trigger) {
    if (syncCyclePromise) {
      return syncCyclePromise
    }

    syncCyclePromise = getSyncConfig()
      .then(function(config) {
        if (!config.s3SyncEnabled) {
          return saveSyncState(buildSyncState('idle', 'disabled', '', trigger, ''))
        }

        if (!hasValidSyncConfig(config)) {
          return saveSyncState(buildSyncState('error', 'missing-config', 'Missing endpoint, bucket, object key, or credentials', trigger, new Date().toISOString()))
        }

        return saveSyncState(buildSyncState('running', trigger || 'manual', '', trigger, new Date().toISOString()))
          .then(function() {
            return Promise.all([
              getExportableSettings(),
              getLocalConfigUpdatedAt(),
              fetchRemoteConfig(config)
            ])
          })
          .then(function(results) {
            var localSettings = results[0]
            var localUpdatedAt = results[1]
            var remote = results[2]
            var localTime = normalizeIsoTime(localUpdatedAt || new Date().toISOString())

            return buildRemotePayload(localSettings, localTime).then(function(localPayloadBundle) {
              if (!remote) {
                return pushRemoteConfig(config, localPayloadBundle).then(function(savedPayload) {
                  return storageLocalSet({
                    configUpdatedAt: savedPayload.updatedAt
                  }).then(function() {
                    return saveSyncState(buildSyncState('success', 'pushed-new', '', trigger, savedPayload.updatedAt))
                  })
                })
              }

              if (remote.contentHash === localPayloadBundle.contentHash) {
                return storageLocalSet({
                  configUpdatedAt: remote.updatedAt
                }).then(function() {
                  return saveSyncState(buildSyncState('success', 'unchanged', '', trigger, remote.updatedAt))
                })
              }

              if (!config.s3SyncBidirectional) {
                return pushRemoteConfig(config, localPayloadBundle).then(function(savedPayload) {
                  return storageLocalSet({
                    configUpdatedAt: savedPayload.updatedAt
                  }).then(function() {
                    return saveSyncState(buildSyncState('success', 'pushed-local', '', trigger, savedPayload.updatedAt))
                  })
                })
              }

              if (remote.updatedAt > localPayloadBundle.payload.updatedAt) {
                return applyRemoteConfig(remote).then(function() {
                  return saveSyncState(buildSyncState('success', 'pulled-remote', '', trigger, remote.updatedAt))
                })
              }

              return pushRemoteConfig(config, localPayloadBundle).then(function(savedPayload) {
                return storageLocalSet({
                  configUpdatedAt: savedPayload.updatedAt
                }).then(function() {
                  return saveSyncState(buildSyncState('success', 'pushed-local', '', trigger, savedPayload.updatedAt))
                })
              })
            })
          })
      })
      .catch(function(error) {
        return saveSyncState(buildSyncState('error', 'request-failed', error && error.message ? error.message : 'Unknown error', trigger, new Date().toISOString()))
      })
      .finally(function() {
        syncCyclePromise = null
      })

    return syncCyclePromise
}

function initializeSyncEngine() {
    rebuildSyncAlarm().then(function() {
      return runSyncCycle('startup')
    }).catch(function() {
      return null
    })
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
        memo_lock: 'PUBLIC'
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
              visibility: normalizeMemoVisibility(items.memo_lock),
              state: 'NORMAL'
            })
          })
        }).then(function(response) {
          if (!response.ok) {
            return parseResponseBody(response).then(function(bodyText) {
              console.error('[memos-bber] quick save failed', {
                status: response.status,
                statusText: response.statusText,
                responseText: bodyText
              })
              throw new Error('Request failed')
            })
          }
          return response.json()
        }).then(function() {
          sendResponse({ ok: true })
        }).catch(function(error) {
          console.error('[memos-bber] quick save request error', error && error.message ? error.message : error)
          sendResponse({ ok: false, reason: 'request-failed' })
        })
      }
    )
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (!message || !message.type) {
      return
    }

    if (message.type === 'quick-save-selection') {
      sendQuickMemo(message.payload || {}, sendResponse)
      return true
    }

    if (message.type === 's3-sync-settings-saved') {
      rebuildSyncAlarm()
        .then(function() {
          return runSyncCycle('save')
        })
        .then(function() {
          sendResponse({ ok: true })
        })
        .catch(function(error) {
          sendResponse({
            ok: false,
            reason: error && error.message ? error.message : 'unknown-error'
          })
        })
      return true
    }
})

chrome.runtime.onStartup.addListener(function() {
    initializeSyncEngine()
})

chrome.alarms.onAlarm.addListener(function(alarm) {
    if (!alarm || alarm.name !== SYNC_ALARM_NAME) {
      return
    }

    runSyncCycle('schedule')
})

initializeSyncEngine()
