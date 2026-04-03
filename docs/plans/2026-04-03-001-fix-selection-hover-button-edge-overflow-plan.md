---
title: fix: keep selection quick-save hover UI inside viewport
type: fix
status: active
date: 2026-04-03
origin: docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md
---

# fix: keep selection quick-save hover UI inside viewport

## Overview

修复网页选区“存到 MEMOS”悬浮按钮及其展开标签区在浏览器边缘被遮挡的问题。目标不是改变触发方式，而是在保持“尽量贴近原位置”的前提下，为基础按钮态和展开态补上统一的视口内约束与尺寸压缩策略。

## Problem Frame

当前内容脚本只根据选区矩形的 `right` 和 `bottom` 计算初始位置，再做一次非常粗的边界裁剪，见 [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js)。这个实现默认容器宽高接近按钮本身，但在长悬浮展开标签选择态后，容器实际尺寸会显著增大，导致以下问题：

- 右侧贴边时，展开标签区会超出视口并被裁掉。
- 靠近底部时，仅以固定 `40px` 上移无法覆盖真实展开高度，仍可能溢出。
- 当前定位没有基于真实渲染尺寸做二次校正，因此按钮态和展开态行为不一致。

## Requirements Trace

- R1. 默认点击悬浮按钮时仍立即保存，不改变原有快速路径（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R2. 长悬浮展开逻辑保持不变，只修复其可见性与定位稳定性（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R3. 悬浮按钮与展开标签区都应尽量贴近选区原位置，仅在即将超出视口时做必要位移。
- R4. 当视口空间不足时，允许标签区压缩到视口可容纳宽度并自动换行，优先保证内容可见。
- R5. 定位逻辑应统一可复用，避免按钮态与展开态各自维护不同边界规则。

## Scope Boundaries

- 不修改悬浮触发时长、标签来源、单选逻辑或保存链路。
- 不新增独立浮层、Portal 或复杂定位库。
- 不改变按钮与标签区的视觉主题，只做必要的宽度/位置约束。

## Context & Research

### Relevant Code and Patterns

- [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js) 统一管理选区按钮创建、显示、展开和隐藏，是本次修复的主入口。
- 当前容器采用 `position: fixed`，并以 `containerEl.style.left/top` 直接定位，适合抽出一个纯函数来统一计算视口内坐标。
- 现有 Node 测试以纯逻辑 helper 为主，见 [tests/selection-hover-tag-settings.test.js](/Users/xiaohansong/projects/memos-bber/tests/selection-hover-tag-settings.test.js) 和 [tests/domain-patterns.test.js](/Users/xiaohansong/projects/memos-bber/tests/domain-patterns.test.js)。因此本次优先把定位计算抽成可单测函数，而不是直接上浏览器级测试。

### External Research

当前仓库已有足够明确的本地模式，这次只涉及内容脚本内的视口碰撞处理，不需要额外外部调研。

## Key Technical Decisions

- 抽出纯函数定位 helper：以“锚点矩形 + 容器尺寸 + 视口尺寸 + 边距”计算最终坐标，便于按钮态和展开态复用。
- 采用“贴近原位置优先，必要时才校正”的策略：默认仍从选区右下侧开始，只有即将溢出时才向左或向上收缩。
- 展开后做二次测量与重定位：因为展开态真实宽高只能在 DOM 更新后得出，不能继续依赖按钮态的估算值。
- 标签区允许根据视口宽度收缩：通过限制容器/标签区最大宽度，让窄视口下仍能完整显示并自动换行。

## High-Level Technical Design

```text
selection payload
  -> showButton()
    -> render base state
    -> measure container
    -> compute viewport-safe position
    -> place container

hover expand
  -> render expanded tag list
  -> constrain max width from viewport
  -> measure expanded container
  -> recompute viewport-safe position
  -> update left/top
```

## Implementation Units

- [ ] **Unit 1: Extract viewport-safe positioning helper**

**Goal:** 把悬浮按钮定位规则从内容脚本事件流中拆出来，形成可复用、可测试的纯函数。

**Requirements:** R3, R5

**Files:**
- Add: [js/selection-button-position.js](/Users/xiaohansong/projects/memos-bber/js/selection-button-position.js)
- Add: [tests/selection-button-position.test.js](/Users/xiaohansong/projects/memos-bber/tests/selection-button-position.test.js)

**Approach:**
- 新增一个纯函数，根据锚点 `rect`、容器 `width/height`、视口 `innerWidth/innerHeight` 和安全边距，返回最终 `left/top`。
- 默认从选区右下方起步；若右侧或底部将溢出，则回退到视口内可容纳位置。
- 对极窄视口保留最小边距，确保不会出现负坐标或超出右下边界。

**Patterns to follow:**
- 纯逻辑 CommonJS 导出模式参考 [js/hover-tag-picker-settings.js](/Users/xiaohansong/projects/memos-bber/js/hover-tag-picker-settings.js)
- Node 断言测试风格参考 [tests/selection-hover-tag-settings.test.js](/Users/xiaohansong/projects/memos-bber/tests/selection-hover-tag-settings.test.js)

**Test scenarios:**
- 右下空间充足时，返回靠近选区右下方的默认位置。
- 右侧空间不足时，`left` 被收敛到视口内而不是溢出。
- 底部空间不足时，`top` 回退到选区上方或视口允许的最高位置。
- 容器比视口可用空间更大时，坐标仍被限制在安全边距内。

**Verification:**
- 定位 helper 的单测能稳定覆盖默认、右边缘、底边缘和极小视口场景。

- [ ] **Unit 2: Apply helper to base and expanded states in content script**

**Goal:** 让按钮初次显示和长悬浮展开后都使用统一的视口内约束逻辑。

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**
- Modify: [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js)

**Approach:**
- 在 `showButton()` 中先渲染基础态，再读取容器实际尺寸并调用定位 helper。
- 在 `expandTagPicker()` 中先渲染标签列表、设置基于视口的最大宽度，再次测量容器并重算位置。
- 让标签区和容器在窄视口下缩小 `maxWidth`，继续依赖现有 `flex-wrap` 换行，不新增滚动交互。

**Patterns to follow:**
- 继续沿用 [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js) 的单文件 UI 状态管理方式
- 样式改动保持内联声明风格，与当前内容脚本实现一致

**Test scenarios:**
- 普通按钮态在靠右、靠下选区上仍完整可见。
- 展开标签态在靠右、靠下选区上会在视口内重新定位。
- 窄视口下标签区宽度会压缩且不超出视口。
- 功能关闭、无候选标签、普通点击保存等既有路径不受影响。

**Verification:**
- 在实际页面中，按钮态和展开态都不会被浏览器边缘裁掉，且仍尽量贴近原选区。

## Risks and Mitigations

- 展开后重新定位如果时机不对，可能读到旧尺寸。
  通过先更新 DOM 再读取 `offsetWidth/offsetHeight`，必要时在同一轮渲染后同步测量规避。
- 宽度压缩过度可能让标签区难以点击。
  保留安全边距并只压到“视口可容纳宽度”，不强行设置极小固定宽度。

## Verification

- 运行 [tests/selection-button-position.test.js](/Users/xiaohansong/projects/memos-bber/tests/selection-button-position.test.js)
- 回归运行 [tests/selection-hover-tag-settings.test.js](/Users/xiaohansong/projects/memos-bber/tests/selection-hover-tag-settings.test.js)
- 手工验证浏览器右边缘、底边缘和窄视口下的按钮态/展开态定位
