const assert = require('node:assert/strict')
const quickSaveTags = require('../js/quick-save-tags.js')

assert.equal(
  quickSaveTags.buildQuickSaveTagLine('#default', '#manual', '#auto'),
  '#manual #default'
)

assert.equal(
  quickSaveTags.buildQuickSaveTagLine('#default', '', '#auto'),
  '#auto #default'
)

assert.equal(
  quickSaveTags.buildQuickSaveTagLine('#default', 'manual', ''),
  '#manual #default'
)

assert.equal(
  quickSaveTags.buildQuickSaveTagLine('#manual', '#manual', '#auto'),
  '#manual'
)

assert.equal(
  quickSaveTags.findExistingCandidateTag('hello #work world', ['#tech', '#work']),
  '#work'
)

assert.equal(
  quickSaveTags.findMatchedCandidateTag('最适合的是 work', ['#tech', '#work']),
  '#work'
)

console.log('quick save manual tag tests passed')
