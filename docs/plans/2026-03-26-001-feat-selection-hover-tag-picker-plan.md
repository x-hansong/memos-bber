---
title: feat: Add hover-to-expand tag picker for selection quick save
type: feat
status: completed
date: 2026-03-26
origin: docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md
---

# feat: Add hover-to-expand tag picker for selection quick save

## Overview

为网页选区悬浮“存到 MEMOS”按钮增加一个可选增强模式：默认点击仍然立即保存；当用户在按钮上持续悬浮达到配置时长后，按钮在原位展开为轻量标签选择态，允许用户从现有候选标签中手动选 1 个标签后再保存。

本计划完全继承上游 requirements 的产品边界：不引入第二套标签来源、不支持多选、不跳转 popup、不改变现有选区提取与保存链路（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。

## Problem Frame

当前选区悬浮按钮是一个单步动作，适合快速保存，但它把“这次想补一个标签”的需求完全留给 popup 或自动打标签，导致网页内快捷保存缺少一个轻量的人工干预入口。与此同时，这个入口的核心价值仍然是“快”，所以不能把默认点击改成需要先选标签的重交互。

仓库现状已经给出一条清晰实现路径：

- 内容脚本统一负责悬浮按钮的展示、定位、点击和隐藏，见 [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js)。
- 后台 `sendQuickMemo()` 已支持在快速保存时拼装自动标签与默认标签，见 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)。
- 设置项已经集中到 `PERSISTED_SETTINGS_DEFAULTS`、[options.html](/Users/xiaohansong/projects/memos-bber/options.html) 与 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js)。

因此这次最合适的方案不是新增入口，而是在现有按钮上增加一个受配置控制的“长悬浮展开”状态机，并让后台快速保存消息载荷支持携带“手动选中的一个标签”。

## Requirements Trace

- R1. 默认点击悬浮按钮时仍立即保存，不要求先选标签（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R2. 按钮持续悬浮达到配置时长后进入展开态（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R3. 等待期间提供轻量倒计时或进度提示（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R4. 展开态只复用现有候选标签配置（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R5. 展开态最多只能手动选择 1 个标签（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R6. 选中标签后沿用现有快速保存链路，把该标签作为本次附加标签写入 memo（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R7. 触发时长是可配置项，允许自定义秒数并限制最小/最大值（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。
- R8. 用户可以关闭该功能；关闭后完全恢复当前一键保存行为（see origin: `docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md`）。

## Scope Boundaries

- 不改 popup 的编辑器、标签列表、自动打标签和默认标签交互。
- 不新增标签创建、搜索、分页或“最近标签”动态抓取。
- 不支持多选标签。
- 不把按钮展开成独立浮层或跳转到 popup。
- 不改变当前选区提取逻辑、Memos API 路径或权限模型。

## Context & Research

### Relevant Code and Patterns

- 选区按钮生命周期已集中在 [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js)：`createButton()`、`showButton()`、`hideButton()`、`refreshSelectionButton()` 已形成单文件状态流。
- 快速保存消息当前只有 `content` 与 `pageUrl` 两个字段，后台入口为 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js) 中的 `sendQuickMemo(payload, sendResponse)`。
- 标签规范化、解析和拼装能力已存在于 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js) 与 [js/oper.js](/Users/xiaohansong/projects/memos-bber/js/oper.js) 中的 `normalizeTagValue`、`parseTagValues`、`buildQuickSaveContent` 一组函数。
- 持久化设置默认值集中在 [js/settings-schema.js](/Users/xiaohansong/projects/memos-bber/js/settings-schema.js)；设置页读取与保存模式集中在 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js)。
- 当前自动化测试只有一个纯 Node 脚本 [tests/domain-patterns.test.js](/Users/xiaohansong/projects/memos-bber/tests/domain-patterns.test.js)，说明本次应优先补“纯函数/纯逻辑”层测试，而不是规划浏览器级集成测试基建。

### Institutional Learnings

- 未发现 `docs/solutions/` 目录或相关沉淀，本计划以当前代码模式为准。

### External References

- 无。本需求完全建立在现有扩展架构与仓库模式之上，本地研究已足够支撑规划。

## Key Technical Decisions

- 在内容脚本内实现一个轻量状态机，而不是引入新的 UI 容器系统：当前按钮已由单文件控制，这样能把改动限制在现有注入入口。
- 倒计时提示采用“按钮文案变化 + 轻量视觉进度反馈”的同位提示，而不是额外 toast：用户视线已经在按钮上，复用原按钮最省交互成本，也避免新增消失/定位逻辑。
- 手动选择标签通过扩展 `quick-save-selection` 消息载荷实现：后台快速保存入口已经稳定，扩展 payload 比新增消息类型更小。
- 候选标签为空时直接回退到普通一键保存，不显示空展开态：这符合“快捷优先”的产品目标，也避免为罕见空配置场景增加额外 UI 分支。
- 新增设置项采用“显式开关 + 秒数输入”组合：关闭语义清晰，避免用 `0` 同时表达“关闭”和“无等待”。
- 默认值与范围定为 `10` 秒、最小 `1` 秒、最大 `30` 秒：默认值继承脑暴确认的目标行为；上下界足够覆盖个人偏好，同时避免极端配置导致误触或功能形同虚设。

## Open Questions

### Resolved During Planning

- 倒计时提示形式：使用按钮原位文案变化，配合轻量视觉进度反馈；不新增独立 toast 或浮层。
- 候选标签为空时的行为：直接保持普通一键保存，不进入展开态。
- 触发时长配置策略：默认 `10` 秒，保存时限制在 `1-30` 秒范围内。

### Deferred to Implementation

- 按钮原位视觉进度是用背景渐变、伪元素覆盖，还是文案旁边的简易进度条，需在不破坏现有内联样式结构的前提下选最小改动方案。
- 标签展开态的精确布局顺序需要在实现时根据按钮宽度与移动端窄视口实际效果微调，但不能改变“原位展开、单选、无独立浮层”的总体方案。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
selectionchange
  -> refreshSelectionButton()
    -> if domain excluded: hide
    -> if no valid selection: hide
    -> load/cached hover-tag settings + candidate tags
    -> render base quick-save button

button mouseenter
  -> if feature disabled or candidates empty: no-op
  -> start hover countdown timer
  -> update button label/progress until threshold
  -> promote button into expanded tag-picker state

expanded state
  -> render candidate chips from autoTagCandidates
  -> allow exactly one active chip
  -> confirm save sends { content, pageUrl, selectedTag }
  -> dismiss on outside click / scroll / selection change

background sendQuickMemo(payload)
  -> requestAutoTag(...)
  -> buildQuickSaveContent(content, pageUrl, quicksavetag, selectedTag || autoTag)
  -> POST memo
```

## Implementation Units

- [x] **Unit 1: Add persisted settings and settings UI for hover-tag mode**

**Goal:** 为长悬浮选标签能力建立稳定配置入口，包括开关与等待秒数，并把默认值纳入统一持久化设置。

**Requirements:** R7, R8

**Dependencies:** None

**Files:**
- Modify: [js/settings-schema.js](/Users/xiaohansong/projects/memos-bber/js/settings-schema.js)
- Modify: [options.html](/Users/xiaohansong/projects/memos-bber/options.html)
- Modify: [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js)
- Modify: [_locales/zh_CN/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/zh_CN/messages.json)
- Modify: [_locales/en/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/en/messages.json)

**Approach:**
- 在持久化 schema 中新增两项，例如布尔开关和等待秒数字段，并保证旧配置升级时有默认值。
- 在设置页“标签/自动标签”相邻区域增加这两个控件，避免用户在两个不同页面分别维护候选标签与悬浮增强配置。
- 保存时对秒数做边界规范化，统一写入 `1-30` 区间内的整数；关闭开关时仍保留上次秒数，便于重新开启后复用。

**Patterns to follow:**
- 持久化字段默认值模式参考 [js/settings-schema.js](/Users/xiaohansong/projects/memos-bber/js/settings-schema.js)
- 设置文案绑定与存取模式参考 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js)
- 输入范围收敛模式参考 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) 中 `s3SyncIntervalHours`

**Test scenarios:**
- 旧用户未配置新字段时，设置页能显示默认开关状态和默认秒数。
- 用户输入非法值、空值、非整数或超出范围值时，保存后会被规范化到允许区间。
- 用户关闭功能后保存，再次打开设置页仍能看到“关闭”状态且秒数值保留。
- 中英文设置页文案和帮助说明完整显示，不出现空白 label/help。

**Verification:**
- 设置页可以稳定读取、修改和保存新字段；导出导入自动覆盖新字段且默认值兼容旧配置。

- [x] **Unit 2: Extend content script button into a hover countdown and inline tag-picker state**

**Goal:** 在不破坏默认一键保存的前提下，为选区悬浮按钮增加长悬浮倒计时、原位展开、单选标签与关闭收起行为。

**Requirements:** R1, R2, R3, R4, R5, R8

**Dependencies:** Unit 1

**Files:**
- Modify: [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js)
- Test: [tests/selection-hover-tag-settings.test.js](/Users/xiaohansong/projects/memos-bber/tests/selection-hover-tag-settings.test.js)

**Approach:**
- 将当前“按钮只有显示/隐藏两态”的实现提升为最小状态机：`hidden`、`base`、`countdown`、`expanded`。
- 为内容脚本增加配置缓存，除现有域名排除项外，再读取悬浮增强开关、等待秒数和候选标签字符串；使用 `chrome.storage.onChanged` 更新缓存，避免每次鼠标事件读取存储。
- 展开条件必须同时满足：功能开启、候选标签非空、当前按钮仍绑定有效选区、倒计时完整走完；任一条件失效都回退到基础态。
- 展开态中的标签列表直接从候选标签字符串解析生成，单选后以按钮附近可点击 chip 方式呈现，并允许取消当前选择后重新选另一个。
- `mousedown`、页面滚动、窗口 resize、selectionchange、页面其他区域点击等已有隐藏路径都要扩展为“同时清理倒计时与展开态”。

**Execution note:** 先补纯逻辑测试，再动内容脚本状态管理，避免把状态分支直接堆进 DOM 事件里。

**Technical design:** *(directional guidance, not implementation specification)*
- 把“设置归一化”和“候选标签解析/是否允许展开”的纯逻辑抽成可测试辅助函数，优先放到内容脚本可复用的小函数或新建轻量 helper。
- DOM 层只消费归一化后的状态，避免把字符串解析和鼠标事件耦合在一起。

**Patterns to follow:**
- 选区按钮显示/隐藏与存储监听模式参考 [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js)
- 标签解析规则参考 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js) 与 [js/oper.js](/Users/xiaohansong/projects/memos-bber/js/oper.js)
- 现有最小 Node 测试风格参考 [tests/domain-patterns.test.js](/Users/xiaohansong/projects/memos-bber/tests/domain-patterns.test.js)

**Test scenarios:**
- 功能关闭时，按钮始终保持当前一键保存行为，不出现倒计时或展开态。
- 功能开启但候选标签为空时，按钮仍只执行普通保存。
- 鼠标悬浮未达到阈值就移开时，倒计时被清理，按钮回到基础态。
- 悬浮达到阈值后，按钮进入展开态并只展示去重后的候选标签。
- 展开态中只能有一个激活标签；重新选择其他标签时，旧选择被替换。
- 页面滚动、重新选区、点击页面其他区域后，倒计时和展开态都被清理。

**Verification:**
- 在网页选区场景中，按钮能稳定经历基础态、倒计时态和展开态，不出现残留计时器、重复展开或无法收起的问题。

- [x] **Unit 3: Extend quick-save payload and memo assembly for manual selected tags**

**Goal:** 让后台快速保存链路接收“手动选中的一个标签”，并与现有默认标签/自动标签逻辑做清晰优先级拼装。

**Requirements:** R1, R6

**Dependencies:** Unit 2

**Files:**
- Modify: [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)
- Test: [tests/quick-save-manual-tag.test.js](/Users/xiaohansong/projects/memos-bber/tests/quick-save-manual-tag.test.js)

**Approach:**
- 为 `quick-save-selection` 的消息载荷增加一个可选的 `selectedTag` 字段，保持未传时与当前完全兼容。
- 明确手动标签与自动标签的关系：用户手动选择时，该标签应作为本次人工决策优先值；自动打标签可跳过，或只在未手动选择时运行。推荐在有 `selectedTag` 时直接跳过自动打标签，避免同一次保存出现两个“本次标签来源”。
- `buildQuickSaveContent()` 保持“正文 + 来源链接 + 标签行”结构不变，只调整标签来源组合逻辑，继续通过 `parseTagValues()` 做去重与规范化。
- 后台返回值协议保持不变，避免内容脚本额外分支处理。

**Patterns to follow:**
- 消息监听与异步响应模式参考 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)
- 标签拼装与归一化模式参考 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)

**Test scenarios:**
- 未传 `selectedTag` 时，快速保存行为与当前版本一致。
- 传入合法 `selectedTag` 时，保存内容包含该标签，且标签文本会被规范化。
- `selectedTag` 与默认快捷标签重复时，结果里只保留一个。
- 存在 `selectedTag` 时，不再额外触发自动打标签分支或不再把自动标签并入本次结果。
- 传入空白或非法 `selectedTag` 时，逻辑稳定回退，不影响保存。

**Verification:**
- 快速保存后台入口能兼容新旧消息格式，并把手动标签正确合并到 memo 内容中。

- [x] **Unit 4: Add focused regression tests and manual verification coverage for the new flow**

**Goal:** 用当前仓库可承受的最小测试方式覆盖新逻辑，并把手工验证场景写清楚，降低状态回归风险。

**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8

**Dependencies:** Unit 2, Unit 3

**Files:**
- Create: [tests/selection-hover-tag-settings.test.js](/Users/xiaohansong/projects/memos-bber/tests/selection-hover-tag-settings.test.js)
- Create: [tests/quick-save-manual-tag.test.js](/Users/xiaohansong/projects/memos-bber/tests/quick-save-manual-tag.test.js)
- Modify: [README.md](/Users/xiaohansong/projects/memos-bber/README.md) *(only if the project currently documents quick-save behavior and settings; otherwise skip)*

**Approach:**
- 把可脱离浏览器环境验证的逻辑拆成 Node 可运行测试：设置值归一化、候选标签是否允许展开、手动标签与默认标签的拼装优先级。
- 手动验证则覆盖浏览器内真实交互：选区出现按钮、悬浮倒计时、展开、单选标签、保存反馈、关闭和域名排除共存。
- 如果 README 已经描述选区悬浮按钮能力，应补一小段说明“默认点击一键保存，开启增强后可长悬浮选标签”；如果 README 没有覆盖这一块，则不强制文档改动。

**Patterns to follow:**
- 最小 Node 脚本测试模式参考 [tests/domain-patterns.test.js](/Users/xiaohansong/projects/memos-bber/tests/domain-patterns.test.js)

**Test scenarios:**
- 域名排除命中时，即便功能开启也不应显示按钮或进入倒计时。
- 同一页面内多次选区切换时，不会遗留前一次展开态或手动已选标签。
- 选中手动标签后保存成功与失败提示继续沿用现有 toast 语义。
- 功能关闭后，相关配置仍保留，但 UI 完全回到当前一键保存路径。
- 英文环境下新增设置文案和交互提示仍可读。

**Verification:**
- 仓库内新增测试脚本可以独立运行并覆盖关键逻辑；结合手工浏览器验证后，足以证明默认路径未回归且增强路径可用。

## System-Wide Impact

- **Interaction graph:** 变更会跨越设置页、内容脚本和后台快速保存三层，但消息入口仍是现有 `quick-save-selection`；不会新增新的长期后台状态或 alarm。
- **Error propagation:** 内容脚本侧所有倒计时/展开失败都应本地吞掉并回退到基础态，不得阻塞默认保存；后台仍只对真正的请求失败返回 `request-failed`。
- **State lifecycle risks:** 最大风险是计时器和展开态泄漏。所有隐藏路径必须清理倒计时句柄、当前选中标签和展开 DOM，避免选区切换后残留旧状态。
- **API surface parity:** 这次变更只影响网页选区悬浮保存入口，不要求 popup、右键菜单或其他入口同步支持“手动先选标签”。
- **Integration coverage:** 纯 Node 测试无法证明 hover/DOM 行为，需要补明确手工验证清单，尤其是“悬浮中移开”“展开后页面滚动”“域名排除与增强功能共存”这些跨层场景。

## Risks & Dependencies

- 内容脚本当前是单文件内联样式实现，按钮从单元素升级到展开态时容易让样式和状态更新相互缠绕；实现时需要优先抽出状态重置函数。
- 如果直接在内容脚本里重复实现标签解析规则，后续可能与后台逻辑漂移；本次应尽量复用现有规则语义，至少保持候选标签分隔与归一化一致。
- 若在有手动标签时仍保留自动打标签，会产生来源冲突和重复标签风险；因此计划明确由手动标签优先并短路自动标签。
- 现有测试基建较薄，无法依赖完整浏览器自动化；执行阶段需要把纯逻辑层拆得足够可测。

## Documentation / Operational Notes

- 如果 README 已描述选区悬浮按钮，需补一句“可在设置页开启长悬浮选标签增强模式”；否则文档改动可以保持最小。
- 该功能不需要 feature flag、迁移或发布步骤，但应在变更说明中提醒：若未配置候选标签，即使开启功能也只会保留普通一键保存。

## Sources & References

- **Origin document:** [docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md](/Users/xiaohansong/projects/memos-bber/docs/brainstorms/2026-03-26-selection-button-hover-tag-picker-requirements.md)
- Related code: [js/content-script.js](/Users/xiaohansong/projects/memos-bber/js/content-script.js)
- Related code: [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)
- Related code: [js/settings-schema.js](/Users/xiaohansong/projects/memos-bber/js/settings-schema.js)
- Related code: [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js)
- Related markup: [options.html](/Users/xiaohansong/projects/memos-bber/options.html)
- Existing regression pattern: [tests/domain-patterns.test.js](/Users/xiaohansong/projects/memos-bber/tests/domain-patterns.test.js)
