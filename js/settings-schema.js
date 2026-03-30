var PERSISTED_SETTINGS_DEFAULTS = {
  apiUrl: '',
  apiTokens: '',
  userid: '',
  hidetag: '',
  showtag: '',
  quicksavetag: '',
  quickSaveExcludedDomains: '',
  hoverTagPickerEnabled: false,
  hoverTagPickerDelaySeconds: 10,
  autoTagEnabled: false,
  autoTagCandidates: '',
  autoTagApiUrl: '',
  autoTagApiKey: '',
  autoTagModel: '',
  autoTagSystemPrompt: '',
  autoTagUserPrompt: '',
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

var S3_SYNC_SETTING_KEYS = [
  's3SyncEnabled',
  's3Endpoint',
  's3Region',
  's3Bucket',
  's3ObjectKey',
  's3AccessKeyId',
  's3SecretAccessKey',
  's3SyncIntervalHours',
  's3SyncBidirectional',
  's3ForcePathStyle'
]

var S3_SYNC_DEFAULTS = pickPersistedSettings(PERSISTED_SETTINGS_DEFAULTS, S3_SYNC_SETTING_KEYS)

function getPersistedSettingsKeys() {
  return Object.keys(PERSISTED_SETTINGS_DEFAULTS)
}

function pickPersistedSettings(source, keys) {
  var picked = {}
  var sourceObject = source || {}
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    if (Object.prototype.hasOwnProperty.call(sourceObject, key)) {
      picked[key] = sourceObject[key]
    }
  }
  return picked
}

function normalizePersistedSettings(source) {
  var normalized = {}
  var keys = getPersistedSettingsKeys()
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      normalized[key] = source[key]
    } else {
      normalized[key] = PERSISTED_SETTINGS_DEFAULTS[key]
    }
  }
  return normalized
}
