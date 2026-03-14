const assert = require('node:assert/strict')
const {
  parseDomainPatterns,
  matchesDomainPattern,
  isHostnameExcluded
} = require('../js/domain-patterns.js')

assert.deepEqual(parseDomainPatterns(''), [])
assert.deepEqual(
  parseDomainPatterns(' example.com \n*.example.com\n\nexample.com\n'),
  ['example.com', '*.example.com']
)

assert.equal(matchesDomainPattern('example.com', 'example.com'), true)
assert.equal(matchesDomainPattern('www.example.com', 'example.com'), false)
assert.equal(matchesDomainPattern('foo.example.com', '*.example.com'), true)
assert.equal(matchesDomainPattern('a.b.example.com', '*.example.com'), true)
assert.equal(matchesDomainPattern('example.com', '*.example.com'), false)
assert.equal(matchesDomainPattern('foo.example.com', 'foo.*.com'), false)
assert.equal(matchesDomainPattern('foo.example.com', ''), false)

assert.equal(
  isHostnameExcluded('a.b.example.com', ['example.org', '*.example.com']),
  true
)
assert.equal(
  isHostnameExcluded('example.com', ['*.example.com']),
  false
)

console.log('domain pattern tests passed')
