var CONFIG_EXPORT_KEYS = [
  'apiUrl',
  'apiTokens',
  'userid',
  'hidetag',
  'showtag',
  'quicksavetag',
  'quickSaveExcludedDomains',
  'autoTagEnabled',
  'autoTagCandidates',
  'autoTagApiUrl',
  'autoTagApiKey',
  'autoTagModel',
  'autoTagSystemPrompt',
  'autoTagUserPrompt'
]

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

function parseJwtPayload(token) {
  try {
    var parts = token.split('.')
    if (parts.length < 2) {
      return null
    }
    var base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    var padding = base64.length % 4
    if (padding) {
      base64 += '='.repeat(4 - padding)
    }
    return JSON.parse(atob(base64))
  } catch (error) {
    return null
  }
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

function setTexts() {
  document.getElementById('settingsTitle').textContent = chrome.i18n.getMessage('settingsTitle')
  document.getElementById('settingsMemosSection').textContent = chrome.i18n.getMessage('settingsMemosSection')
  document.getElementById('settingsTagsSection').textContent = chrome.i18n.getMessage('settingsTagsSection')
  document.getElementById('settingsAutoTagSection').textContent = chrome.i18n.getMessage('settingsAutoTagSection')
  document.getElementById('settingsTransferSection').textContent = chrome.i18n.getMessage('settingsTransferSection')
  document.getElementById('settingsS3SyncSection').textContent = chrome.i18n.getMessage('settingsS3SyncSection')
  document.getElementById('settingsTransferHelp').textContent = chrome.i18n.getMessage('settingsTransferHelp')
  document.getElementById('saveSettings').textContent = chrome.i18n.getMessage('saveBtn')
  document.getElementById('exportSettings').textContent = chrome.i18n.getMessage('exportSettingsBtn')
  document.getElementById('importSettings').textContent = chrome.i18n.getMessage('importSettingsBtn')

  document.getElementById('apiUrlLabel').textContent = chrome.i18n.getMessage('apiUrlLabel')
  document.getElementById('apiUrlHelp').textContent = chrome.i18n.getMessage('placeApiUrl')
  document.getElementById('apiTokensLabel').textContent = chrome.i18n.getMessage('apiTokensLabel')
  document.getElementById('apiTokensHelp').textContent = chrome.i18n.getMessage('placeApiTokens')
  document.getElementById('hideInputLabel').textContent = chrome.i18n.getMessage('hideInputLabel')
  document.getElementById('hideInputHelp').textContent = chrome.i18n.getMessage('placeHideInput')
  document.getElementById('showInputLabel').textContent = chrome.i18n.getMessage('showInputLabel')
  document.getElementById('showInputHelp').textContent = chrome.i18n.getMessage('placeShowInput')
  document.getElementById('quickSaveTagLabel').textContent = chrome.i18n.getMessage('quickSaveTagLabel')
  document.getElementById('quickSaveTagHelp').textContent = chrome.i18n.getMessage('placeQuickSaveTag')
  document.getElementById('quickSaveExcludedDomainsLabel').textContent = chrome.i18n.getMessage('quickSaveExcludedDomainsLabel')
  document.getElementById('quickSaveExcludedDomainsHelp').textContent = chrome.i18n.getMessage('placeQuickSaveExcludedDomains')
  document.getElementById('autoTagEnabledLabel').textContent = chrome.i18n.getMessage('autoTagEnabledLabel')
  document.getElementById('autoTagEnabledHelp').textContent = chrome.i18n.getMessage('autoTagEnabledHelp')
  document.getElementById('autoTagCandidatesLabel').textContent = chrome.i18n.getMessage('autoTagCandidatesLabel')
  document.getElementById('autoTagCandidatesHelp').textContent = chrome.i18n.getMessage('placeAutoTagCandidates')
  document.getElementById('autoTagApiUrlLabel').textContent = chrome.i18n.getMessage('autoTagApiUrlLabel')
  document.getElementById('autoTagApiUrlHelp').textContent = chrome.i18n.getMessage('placeAutoTagApiUrl')
  document.getElementById('autoTagApiKeyLabel').textContent = chrome.i18n.getMessage('autoTagApiKeyLabel')
  document.getElementById('autoTagApiKeyHelp').textContent = chrome.i18n.getMessage('placeAutoTagApiKey')
  document.getElementById('autoTagModelLabel').textContent = chrome.i18n.getMessage('autoTagModelLabel')
  document.getElementById('autoTagModelHelp').textContent = chrome.i18n.getMessage('placeAutoTagModel')
  document.getElementById('autoTagSystemPromptLabel').textContent = chrome.i18n.getMessage('autoTagSystemPromptLabel')
  document.getElementById('autoTagSystemPromptHelp').textContent = chrome.i18n.getMessage('placeAutoTagSystemPrompt')
  document.getElementById('autoTagUserPromptLabel').textContent = chrome.i18n.getMessage('autoTagUserPromptLabel')
  document.getElementById('autoTagUserPromptHelp').textContent = chrome.i18n.getMessage('placeAutoTagUserPrompt')

  document.getElementById('s3SyncEnabledLabel').textContent = chrome.i18n.getMessage('s3SyncEnabledLabel')
  document.getElementById('s3SyncEnabledHelp').textContent = chrome.i18n.getMessage('s3SyncEnabledHelp')
  document.getElementById('s3EndpointLabel').textContent = chrome.i18n.getMessage('s3EndpointLabel')
  document.getElementById('s3EndpointHelp').textContent = chrome.i18n.getMessage('s3EndpointHelp')
  document.getElementById('s3RegionLabel').textContent = chrome.i18n.getMessage('s3RegionLabel')
  document.getElementById('s3RegionHelp').textContent = chrome.i18n.getMessage('s3RegionHelp')
  document.getElementById('s3BucketLabel').textContent = chrome.i18n.getMessage('s3BucketLabel')
  document.getElementById('s3BucketHelp').textContent = chrome.i18n.getMessage('s3BucketHelp')
  document.getElementById('s3ObjectKeyLabel').textContent = chrome.i18n.getMessage('s3ObjectKeyLabel')
  document.getElementById('s3ObjectKeyHelp').textContent = chrome.i18n.getMessage('s3ObjectKeyHelp')
  document.getElementById('s3AccessKeyIdLabel').textContent = chrome.i18n.getMessage('s3AccessKeyIdLabel')
  document.getElementById('s3AccessKeyIdHelp').textContent = chrome.i18n.getMessage('s3AccessKeyIdHelp')
  document.getElementById('s3SecretAccessKeyLabel').textContent = chrome.i18n.getMessage('s3SecretAccessKeyLabel')
  document.getElementById('s3SecretAccessKeyHelp').textContent = chrome.i18n.getMessage('s3SecretAccessKeyHelp')
  document.getElementById('s3SyncIntervalLabel').textContent = chrome.i18n.getMessage('s3SyncIntervalLabel')
  document.getElementById('s3SyncIntervalHelp').textContent = chrome.i18n.getMessage('s3SyncIntervalHelp')
  document.getElementById('s3SyncBidirectionalLabel').textContent = chrome.i18n.getMessage('s3SyncBidirectionalLabel')
  document.getElementById('s3SyncBidirectionalHelp').textContent = chrome.i18n.getMessage('s3SyncBidirectionalHelp')
  document.getElementById('s3ForcePathStyleLabel').textContent = chrome.i18n.getMessage('s3ForcePathStyleLabel')
  document.getElementById('s3ForcePathStyleHelp').textContent = chrome.i18n.getMessage('s3ForcePathStyleHelp')
  document.getElementById('s3SyncStatusLabel').textContent = chrome.i18n.getMessage('s3SyncStatusLabel')
  document.getElementById('s3SyncStatusHelp').textContent = chrome.i18n.getMessage('s3SyncStatusHelp')
}

function loadSettings() {
  chrome.storage.sync.get(
    Object.assign({
      apiUrl: '',
      apiTokens: '',
      hidetag: '',
      showtag: '',
      quicksavetag: '',
      quickSaveExcludedDomains: '',
      autoTagEnabled: false,
      autoTagCandidates: '',
      autoTagApiUrl: '',
      autoTagApiKey: '',
      autoTagModel: '',
      autoTagSystemPrompt: '',
      autoTagUserPrompt: ''
    }, S3_SYNC_DEFAULTS),
    function(items) {
      document.getElementById('apiUrl').value = items.apiUrl
      document.getElementById('apiTokens').value = items.apiTokens
      document.getElementById('hideInput').value = items.hidetag
      document.getElementById('showInput').value = items.showtag
      document.getElementById('quickSaveTagInput').value = items.quicksavetag
      document.getElementById('quickSaveExcludedDomainsInput').value = items.quickSaveExcludedDomains
      document.getElementById('autoTagEnabled').checked = Boolean(items.autoTagEnabled)
      document.getElementById('autoTagCandidatesInput').value = items.autoTagCandidates
      document.getElementById('autoTagApiUrlInput').value = items.autoTagApiUrl
      document.getElementById('autoTagApiKeyInput').value = items.autoTagApiKey
      document.getElementById('autoTagModelInput').value = items.autoTagModel
      document.getElementById('autoTagSystemPromptInput').value = items.autoTagSystemPrompt || getDefaultAutoTagSystemPrompt()
      document.getElementById('autoTagUserPromptInput').value = items.autoTagUserPrompt || getDefaultAutoTagUserPrompt()
      document.getElementById('s3SyncEnabled').checked = Boolean(items.s3SyncEnabled)
      document.getElementById('s3EndpointInput').value = items.s3Endpoint
      document.getElementById('s3RegionInput').value = items.s3Region
      document.getElementById('s3BucketInput').value = items.s3Bucket
      document.getElementById('s3ObjectKeyInput').value = items.s3ObjectKey
      document.getElementById('s3AccessKeyIdInput').value = items.s3AccessKeyId
      document.getElementById('s3SecretAccessKeyInput').value = items.s3SecretAccessKey
      document.getElementById('s3SyncIntervalHoursInput').value = String(items.s3SyncIntervalHours || S3_SYNC_DEFAULTS.s3SyncIntervalHours)
      document.getElementById('s3SyncBidirectional').checked = Boolean(items.s3SyncBidirectional)
      document.getElementById('s3ForcePathStyle').checked = Boolean(items.s3ForcePathStyle)
      loadSyncStatus(Boolean(items.s3SyncEnabled))
    }
  )
}

function getBaseSettings() {
  return {
    hidetag: document.getElementById('hideInput').value,
    showtag: document.getElementById('showInput').value,
    quicksavetag: document.getElementById('quickSaveTagInput').value,
    quickSaveExcludedDomains: document.getElementById('quickSaveExcludedDomainsInput').value,
    autoTagEnabled: document.getElementById('autoTagEnabled').checked,
    autoTagCandidates: document.getElementById('autoTagCandidatesInput').value,
    autoTagApiUrl: document.getElementById('autoTagApiUrlInput').value,
    autoTagApiKey: document.getElementById('autoTagApiKeyInput').value,
    autoTagModel: document.getElementById('autoTagModelInput').value,
    autoTagSystemPrompt: document.getElementById('autoTagSystemPromptInput').value,
    autoTagUserPrompt: document.getElementById('autoTagUserPromptInput').value
  }
}

function getSyncSettings() {
  var intervalHours = parseInt(document.getElementById('s3SyncIntervalHoursInput').value, 10)
  if (Number.isNaN(intervalHours)) {
    intervalHours = S3_SYNC_DEFAULTS.s3SyncIntervalHours
  }

  return {
    s3SyncEnabled: document.getElementById('s3SyncEnabled').checked,
    s3Endpoint: document.getElementById('s3EndpointInput').value.trim().replace(/\/+$/, ''),
    s3Region: document.getElementById('s3RegionInput').value.trim(),
    s3Bucket: document.getElementById('s3BucketInput').value.trim(),
    s3ObjectKey: document.getElementById('s3ObjectKeyInput').value.trim().replace(/^\/+/, ''),
    s3AccessKeyId: document.getElementById('s3AccessKeyIdInput').value.trim(),
    s3SecretAccessKey: document.getElementById('s3SecretAccessKeyInput').value.trim(),
    s3SyncIntervalHours: Math.min(24, Math.max(1, intervalHours)),
    s3SyncBidirectional: document.getElementById('s3SyncBidirectional').checked,
    s3ForcePathStyle: document.getElementById('s3ForcePathStyle').checked
  }
}

function notifySyncSettingsSaved() {
  chrome.storage.local.set({
    configUpdatedAt: new Date().toISOString()
  }, function() {
    chrome.runtime.sendMessage({
      type: 's3-sync-settings-saved'
    }, function() {
      loadSyncStatus(document.getElementById('s3SyncEnabled').checked)
    })
  })
}

function persistSettings(settings, messageKey) {
  chrome.storage.sync.set(settings, function() {
    $.message({
      message: chrome.i18n.getMessage(messageKey || 'saveSuccess')
    })
    notifySyncSettingsSaved()
  })
}

function exportSettings() {
  chrome.storage.sync.get(CONFIG_EXPORT_KEYS, function(items) {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: items
    }
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var link = document.createElement('a')
    var timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    link.href = url
    link.download = 'memos-bber-settings-' + timestamp + '.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  })
}

function normalizeImportedSettings(data) {
  var source = data && typeof data === 'object' ? (data.settings && typeof data.settings === 'object' ? data.settings : data) : null
  if (!source) {
    return null
  }

  var normalized = {}
  for (var i = 0; i < CONFIG_EXPORT_KEYS.length; i++) {
    var key = CONFIG_EXPORT_KEYS[i]
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      normalized[key] = source[key]
    }
  }

  if (Object.keys(normalized).length === 0) {
    return null
  }

  return normalized
}

function importSettingsFile(file) {
  if (!file) {
    return
  }

  var reader = new FileReader()
  reader.onload = function(event) {
    try {
      var parsed = JSON.parse(event.target.result)
      var importedSettings = normalizeImportedSettings(parsed)
      if (!importedSettings) {
        throw new Error('Invalid settings')
      }
      chrome.storage.sync.set(importedSettings, function() {
        loadSettings()
        $.message({
          message: chrome.i18n.getMessage('importSuccess')
        })
        notifySyncSettingsSaved()
      })
    } catch (error) {
      $.message({
        message: chrome.i18n.getMessage('importFailed')
      })
    }
  }
  reader.onerror = function() {
    $.message({
      message: chrome.i18n.getMessage('importFailed')
    })
  }
  reader.readAsText(file)
}

function formatSyncStatusTime(value) {
  if (!value) {
    return ''
  }

  var date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString()
}

function buildSyncStatusLines(state, enabled) {
  if (!enabled) {
    return [chrome.i18n.getMessage('s3SyncStatusDisabled')]
  }

  if (!state || !state.status) {
    return [chrome.i18n.getMessage('s3SyncStatusIdle')]
  }

  var statusKey = 's3SyncStatusIdle'
  if (state.status === 'success') {
    statusKey = 's3SyncStatusSuccess'
  } else if (state.status === 'error') {
    statusKey = 's3SyncStatusError'
  } else if (state.status === 'running') {
    statusKey = 's3SyncStatusRunning'
  }

  var lines = [chrome.i18n.getMessage(statusKey)]
  var lastAt = formatSyncStatusTime(state.lastSyncAt)
  if (lastAt) {
    lines.push(chrome.i18n.getMessage('s3SyncStatusLastAt') + '：' + lastAt)
  }
  if (state.reason) {
    lines.push(chrome.i18n.getMessage('s3SyncStatusReason') + '：' + state.reason)
  }
  if (state.detail) {
    lines.push(chrome.i18n.getMessage('s3SyncStatusDetail') + '：' + state.detail)
  }

  return lines
}

function loadSyncStatus(enabled) {
  chrome.storage.local.get({
    s3SyncState: null
  }, function(items) {
    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    document.getElementById('s3SyncStatusValue').innerHTML = buildSyncStatusLines(items.s3SyncState, enabled)
      .map(function(line) {
        return '<div>' + escapeHtml(line) + '</div>'
      })
      .join('')
  })
}

function saveSettings() {
  var apiUrl = document.getElementById('apiUrl').value.trim()
  var apiTokens = document.getElementById('apiTokens').value.trim()
  var baseSettings = getBaseSettings()
  var syncSettings = getSyncSettings()

  if (apiUrl.length > 0 && !apiUrl.endsWith('/')) {
    apiUrl += '/'
  }

  if (!apiUrl && !apiTokens) {
    persistSettings(Object.assign({}, baseSettings, syncSettings, {
      apiUrl: '',
      apiTokens: '',
      userid: ''
    }))
    return
  }

  if (!apiUrl || !apiTokens) {
    persistSettings(Object.assign({}, baseSettings, syncSettings, {
      apiUrl: apiUrl,
      apiTokens: apiTokens,
      userid: ''
    }))
    return
  }

  $.ajax({
    async: true,
    crossDomain: true,
    url: apiUrl + 'api/v1/auth/status',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiTokens
    }
  }).done(function(response) {
    if (response && response.name) {
      var userid = parseInt(response.name.split('/').pop(), 10)
      persistSettings(Object.assign({}, baseSettings, syncSettings, {
        apiUrl: apiUrl,
        apiTokens: apiTokens,
        userid: userid
      }))
      return
    }

    persistSettings(Object.assign({}, baseSettings, syncSettings), 'invalidToken')
  }).fail(function(xhr) {
    if (xhr && xhr.status === 404) {
      var payload = parseJwtPayload(apiTokens)
      var userid = payload && payload.sub ? parseInt(payload.sub, 10) : NaN
      // Memos newer versions may not expose /api/v1/auth/status.
      // In this case, keep the token and URL instead of marking them invalid.
      persistSettings(Object.assign({}, baseSettings, syncSettings, {
        apiUrl: apiUrl,
        apiTokens: apiTokens,
        userid: Number.isNaN(userid) ? '' : userid
      }))
      return
    }

    persistSettings(Object.assign({}, baseSettings, syncSettings), 'invalidToken')
  })
}

setTexts()
loadSettings()
document.getElementById('saveSettings').addEventListener('click', saveSettings)
document.getElementById('exportSettings').addEventListener('click', exportSettings)
document.getElementById('importSettings').addEventListener('click', function() {
  document.getElementById('importSettingsFile').click()
})
document.getElementById('importSettingsFile').addEventListener('change', function(event) {
  importSettingsFile(event.target.files && event.target.files[0])
  event.target.value = ''
})
