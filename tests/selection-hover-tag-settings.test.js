const assert = require('node:assert/strict')
const quickSaveTags = require('../js/quick-save-tags.js')
const hoverTagPickerSettings = require('../js/hover-tag-picker-settings.js')

assert.equal(hoverTagPickerSettings.normalizeDelaySeconds(''), 10)
assert.equal(hoverTagPickerSettings.normalizeDelaySeconds('0'), 1)
assert.equal(hoverTagPickerSettings.normalizeDelaySeconds('99'), 30)
assert.equal(hoverTagPickerSettings.normalizeDelaySeconds('7'), 7)

assert.deepEqual(
  hoverTagPickerSettings.normalizeSettings(
    {
      hoverTagPickerEnabled: true,
      hoverTagPickerDelaySeconds: '8',
      autoTagCandidates: 'tech, work #deep'
    },
    quickSaveTags.parseTagValues
  ),
  {
    enabled: true,
    delaySeconds: 8,
    candidateTags: ['#tech', '#work', '#deep']
  }
)

assert.deepEqual(
  hoverTagPickerSettings.normalizeSettings(
    {
      hoverTagPickerEnabled: false,
      hoverTagPickerDelaySeconds: '-5',
      autoTagCandidates: ''
    },
    quickSaveTags.parseTagValues
  ),
  {
    enabled: false,
    delaySeconds: 1,
    candidateTags: []
  }
)

console.log('selection hover tag settings tests passed')
