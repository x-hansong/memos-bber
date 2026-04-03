(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory()
    return
  }

  root.MemosSelectionButtonPosition = factory()
})(typeof self !== 'undefined' ? self : this, function() {
  var DEFAULT_EDGE_PADDING = 20
  var DEFAULT_ANCHOR_OFFSET = 8

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
  }

  function computePosition(anchorRect, containerSize, viewportSize, options) {
    var rect = anchorRect || {}
    var size = containerSize || {}
    var viewport = viewportSize || {}
    var settings = options || {}
    var edgePadding = typeof settings.edgePadding === 'number' ? settings.edgePadding : DEFAULT_EDGE_PADDING
    var anchorOffset = typeof settings.anchorOffset === 'number' ? settings.anchorOffset : DEFAULT_ANCHOR_OFFSET

    var width = Math.max(0, size.width || 0)
    var height = Math.max(0, size.height || 0)
    var viewportWidth = Math.max(edgePadding * 2, viewport.width || 0)
    var viewportHeight = Math.max(edgePadding * 2, viewport.height || 0)
    var maxLeft = Math.max(edgePadding, viewportWidth - edgePadding - width)
    var maxTop = Math.max(edgePadding, viewportHeight - edgePadding - height)

    var defaultLeft = typeof rect.right === 'number' ? rect.right : edgePadding
    var defaultTop = typeof rect.bottom === 'number' ? rect.bottom + anchorOffset : edgePadding
    var top = defaultTop

    if (top > maxTop) {
      top = (typeof rect.top === 'number' ? rect.top : edgePadding) - anchorOffset - height
    }

    return {
      left: clamp(defaultLeft, edgePadding, maxLeft),
      top: clamp(top, edgePadding, maxTop)
    }
  }

  return {
    DEFAULT_EDGE_PADDING: DEFAULT_EDGE_PADDING,
    DEFAULT_ANCHOR_OFFSET: DEFAULT_ANCHOR_OFFSET,
    computePosition: computePosition
  }
})
