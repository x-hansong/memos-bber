const assert = require('node:assert/strict')
const {
  computePosition,
  DEFAULT_EDGE_PADDING,
  DEFAULT_ANCHOR_OFFSET
} = require('../js/selection-button-position.js')

assert.deepEqual(
  computePosition(
    { top: 100, right: 300, bottom: 120 },
    { width: 120, height: 36 },
    { width: 1280, height: 720 }
  ),
  { left: 300, top: 128 }
)

assert.deepEqual(
  computePosition(
    { top: 80, right: 780, bottom: 100 },
    { width: 140, height: 40 },
    { width: 800, height: 600 }
  ),
  { left: 640, top: 108 }
)

assert.deepEqual(
  computePosition(
    { top: 580, right: 300, bottom: 598 },
    { width: 180, height: 80 },
    { width: 800, height: 620 }
  ),
  { left: 300, top: 492 }
)

assert.deepEqual(
  computePosition(
    { top: 30, right: 250, bottom: 40 },
    { width: 400, height: 200 },
    { width: 300, height: 180 }
  ),
  { left: DEFAULT_EDGE_PADDING, top: DEFAULT_EDGE_PADDING }
)

assert.deepEqual(
  computePosition(
    { top: 20, right: 40, bottom: 25 },
    { width: 90, height: 160 },
    { width: 180, height: 150 },
    { edgePadding: 12, anchorOffset: 4 }
  ),
  { left: 40, top: 12 }
)

assert.equal(DEFAULT_EDGE_PADDING, 20)
assert.equal(DEFAULT_ANCHOR_OFFSET, 8)

console.log('selection button position tests passed')
