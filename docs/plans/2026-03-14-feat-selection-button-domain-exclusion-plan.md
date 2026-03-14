---
title: feat: Add domain exclusion for selection quick-save button
type: feat
status: completed
date: 2026-03-14
origin: docs/brainstorms/2026-03-14-selection-button-domain-exclusion-brainstorm.md
---

# feat: Add domain exclusion for selection quick-save button

## Overview

为网页选区悬浮快捷保存按钮增加“按域名模式排除”的用户配置。用户可在设置页维护一组域名规则，内容脚本在显示按钮前先根据当前页面 `hostname` 做匹配；命中规则时，不显示悬浮按钮，其余保存链路保持不变。

本计划直接继承脑暴结论：仅增加排除规则，不增加允许名单；规则维度限定为域名；规则支持通配符；配置入口放在现有设置页；命中后只隐藏悬浮按钮，不影响右键菜单、popup 和后台保存逻辑（see brainstorm: `docs/brainstorms/2026-03-14-selection-button-domain-exclusion-brainstorm.md`）。

## Problem Statement / Motivation

当前内容脚本会在所有 `http/https` 页面注入，并在任意文本选区变化后尝试显示按钮，见 [manifest.json](/Users/xiaohansong/projects/memos-bber/manifest.json) 与 [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js#L258)。这对大多数页面有效，但在富文本编辑器、后台管理页或交互复杂的网站上，用户可能希望彻底关闭该悬浮入口。

当前分支已经有 popup 内置配置入口、`chrome.storage.sync` 持久化和中英文文案机制，见 [popup.html](/Users/xiaohansong/projects/memos-bber/popup.html#L102)、[js/oper.js](/Users/xiaohansong/projects/memos-bber/js/oper.js#L4) 和 [_locales/zh_CN/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/zh_CN/messages.json#L1)。因此这个需求更适合做成一个轻量配置项，而不是改动注入范围或新增复杂规则系统。

## Proposed Solution

在当前 popup 的折叠设置区新增一个多行文本配置项，例如“悬浮按钮排除域名”，每行一条规则。支持如下语义：

- `example.com`：匹配精确域名 `example.com`
- `*.example.com`：匹配任意一级或多级子域名，不自动覆盖根域名
- 空行忽略
- 非法规则在保存时可直接保留原文，但匹配阶段应安全跳过，不得导致内容脚本报错

内容脚本启动时从 `chrome.storage.sync` 读取配置，并缓存为规则列表。每次 `selectionchange` 触发前先判断当前 `window.location.hostname` 是否命中排除规则；若命中，则直接隐藏按钮并停止后续选区展示逻辑。这样能把改动限制在“显示门槛”这一层，不干扰现有选区提取、发送消息与提示反馈逻辑，见 [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js#L198)。

## Technical Considerations

- 当前分支没有独立 `options.html`，因此配置入口应接入 popup 现有折叠设置区，并沿用 [js/oper.js](/Users/xiaohansong/projects/memos-bber/js/oper.js#L4) 的读取与保存模式。
- 设置入口需要同时补 HTML 节点、placeholder 文案绑定、默认值读取与保存路径，保持与现有字段一致，见 [popup.html](/Users/xiaohansong/projects/memos-bber/popup.html#L102)、[js/i18n.js](/Users/xiaohansong/projects/memos-bber/js/i18n.js#L1) 与 [js/oper.js](/Users/xiaohansong/projects/memos-bber/js/oper.js#L4)。
- 内容脚本目前是纯前端自执行脚本，没有共享工具模块。首版建议将“规则解析 + 主机匹配”保留在 `content-script.js` 内，避免为一个小特性引入额外打包或模块化工作。
- 匹配目标应明确为 `window.location.hostname`，不包含协议、端口、路径、查询字符串，避免和脑暴范围冲突（see brainstorm: `docs/brainstorms/2026-03-14-selection-button-domain-exclusion-brainstorm.md`）。
- 需要同步补全 `_locales/en/messages.json` 与 `_locales/zh_CN/messages.json`，确保设置页中英文都可读，延续现有 i18n 约定，见 [_locales/zh_CN/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/zh_CN/messages.json#L152)。

## System-Wide Impact

- **Interaction graph**: 设置页保存时写入 `chrome.storage.sync`，导入导出路径自动复用同一批 key；内容脚本读取该配置后，仅影响 `refreshSelectionButton()` 是否继续调用 `showButton()`，不会改变 `quick-save-selection` 消息链路。
- **Error propagation**: 风险主要在内容脚本匹配阶段。规则解析必须容错，不能因为单条非法模式导致整个页面的选区监听异常失效。
- **State lifecycle risks**: 新字段加入导出导入后，老配置文件可能不带该字段。读取逻辑必须有空字符串默认值，保证升级后行为仍为“全部显示”。
- **API surface parity**: 只影响设置页和内容脚本；后台 `background.js`、右键菜单与 popup 不需要同步同类逻辑，因为需求明确只针对悬浮按钮（see brainstorm: `docs/brainstorms/2026-03-14-selection-button-domain-exclusion-brainstorm.md`）。
- **Integration test scenarios**: 需要覆盖设置保存后刷新页面生效、导入配置后生效、英文/中文文案显示正常，以及命中排除时选区仍可正常存在但按钮不出现。

## Acceptance Criteria

- [x] popup 折叠配置区新增“悬浮按钮排除域名”配置项，支持多行输入，每行一个域名模式。
- [x] 新配置保存到 `chrome.storage.sync`。
- [x] 内容脚本在显示悬浮按钮前，会基于当前页面 `hostname` 判断是否命中排除规则。
- [x] 命中 `example.com` 时，`example.com` 页面不显示按钮。
- [x] 命中 `*.example.com` 时，`foo.example.com`、`bar.baz.example.com` 等子域页面不显示按钮。
- [x] 未配置规则时，行为与当前版本一致，所有页面仍可显示按钮。
- [x] 命中排除规则时，只隐藏悬浮按钮，不影响右键菜单、popup 或现有保存功能。
- [x] 中英文文案齐全，popup 不会出现空白 placeholder 文本。
- [x] 补充覆盖规则解析与匹配的最小自动化测试脚本。

## Success Metrics

- 用户可以通过单一设置项屏蔽不想出现悬浮按钮的网站，无需改扩展权限或手动停用插件。
- 默认用户不受影响，升级后未配置规则时无行为回归。
- 通过 `chrome.storage.sync`，同一浏览器账号环境下的新配置可随现有同步机制保留。

## Dependencies & Risks

- 目前仓库未发现 `docs/solutions/`、独立设置页或现成测试用例结构，本次需要沿用 popup 配置模式并自行补最小测试落点。
- 通配符语义需要在实现和文案中保持一致，避免用户误以为 `*.example.com` 同时覆盖根域名。
- 内容脚本若每次选区变化都重新读取存储，可能引入不必要开销；建议首版在启动时读取一次，并在必要时通过 `chrome.storage.onChanged` 更新缓存。
- 规则输入若允许任意字符，需确保匹配逻辑不会构造失控正则或抛异常。

## SpecFlow Analysis

### User Flows

1. 用户打开设置页，填写若干域名模式并保存；之后在匹配页面选中文字，按钮不再出现。
2. 用户填写空配置或删除全部规则并保存；之后所有页面恢复当前默认行为。
3. 用户导入一份包含排除规则的配置文件；刷新目标页面后按钮按导入规则决定是否显示。
4. 用户输入混合规则，如 `example.com` 与 `*.news.site`；内容脚本对当前 `hostname` 逐条判断，只要任一命中即隐藏按钮。

### Gaps Closed in This Plan

- 规则粒度：限定为域名，不处理路径或 URL 全量匹配。
- 默认策略：全部显示，仅命中排除时隐藏。
- 作用范围：仅影响悬浮按钮，不影响其他入口。

### Edge Cases To Validate

- 当前页面是根域名 `example.com`，规则为 `*.example.com`，按钮仍应显示。
- 当前页面是多级子域名 `a.b.example.com`，规则为 `*.example.com`，按钮应隐藏。
- 用户输入前后空格、空行、重复规则，保存与匹配应稳定。
- 页面在配置变更前已打开，保存设置后是否需要刷新页面才能生效，应在实施说明中明确。
- 浏览器特殊页面不会注入 content script；该限制保持不变，不作为本需求处理范围。

## Implementation Outline

### 1. Settings Surface

- 在 [popup.html](/Users/xiaohansong/projects/memos-bber/popup.html) 的现有折叠设置区中新增一个多行输入字段。
- 在 [js/oper.js](/Users/xiaohansong/projects/memos-bber/js/oper.js) 中增加默认值、读取与保存 key。
- 在中英文 locale 文件中新增 placeholder 文案，说明每行一条规则并给出 `example.com` / `*.example.com` 示例。

### 2. Matching Logic

- 在 [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js) 新增规则解析与匹配函数。
- 在 `refreshSelectionButton()` 前加入“当前页面是否被排除”的短路判断。
- 规则匹配实现保持简单、可解释，避免完整正则 DSL。

### 3. Verification

- 增加针对规则解析与匹配的单元测试，或在缺少测试基建时新增最小可运行的脚本级测试。
- 手动验证至少覆盖：无配置、精确域名、通配子域、导入导出、locale 文案显示。

## Alternative Approaches Considered

- 仅支持精确域名：实现更简单，但用户需要重复配置多个子域，不符合已确认的通配符需求（see brainstorm: `docs/brainstorms/2026-03-14-selection-button-domain-exclusion-brainstorm.md`）。
- 支持完整 URL 或正则：可扩展性更强，但显著增加输入复杂度、校验成本和误配风险，超出本次范围（see brainstorm: `docs/brainstorms/2026-03-14-selection-button-domain-exclusion-brainstorm.md`）。
- 修改 `manifest.json` 的 `matches` 范围：无法满足用户级动态配置，也会让启停粒度落到扩展发布层，而不是个人设置层。

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-14-selection-button-domain-exclusion-brainstorm.md](/Users/xiaohansong/projects/memos-bber/docs/brainstorms/2026-03-14-selection-button-domain-exclusion-brainstorm.md) — 延续了“仅排除、不做允许名单”“规则限定为域名”“支持通配符”“只影响悬浮按钮”的核心决策。
- Similar implementation surface: [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js#L289)
- Settings persistence pattern: [js/oper.js](/Users/xiaohansong/projects/memos-bber/js/oper.js#L4)
- Settings form structure: [popup.html](/Users/xiaohansong/projects/memos-bber/popup.html#L102)
- Locale conventions: [_locales/zh_CN/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/zh_CN/messages.json#L1)
- Content script injection scope: [manifest.json](/Users/xiaohansong/projects/memos-bber/manifest.json#L22)
