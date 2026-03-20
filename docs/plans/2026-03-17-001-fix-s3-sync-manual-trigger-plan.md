---
title: fix: Add manual S3 sync trigger and restore sync status visibility
type: fix
status: completed
date: 2026-03-17
origin: docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md
---

# fix: Add manual S3 sync trigger and restore sync status visibility

## Overview

为设置页的 MinIO 配置同步区域新增“立即同步配置”按钮，并修复“定时同步看起来没有生效”的主要可见性问题。实现上复用现有后台 `runSyncCycle()` 链路，不改动同步冲突策略，也不把按钮做成“保存并同步”的复合动作。同时去掉当前手工维护的同步白名单限制，让设置页里的持久化配置默认进入同步范围，而运行时临时状态继续排除在外。

这份计划以 [docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md](/Users/xiaohansong/projects/memos-bber/docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md) 为唯一上游需求来源，所有产品决策都沿用源文档，不再重新定义。

## Problem Statement / Motivation

当前同步能力已经具备三条核心链路：

- 设置保存后会通过 `chrome.runtime.sendMessage({ type: 's3-sync-settings-saved' })` 触发后台立即同步，见 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js)。
- 后台会根据同步开关和间隔重建 `chrome.alarms`，并在闹钟触发时执行 `runSyncCycle('schedule')`，见 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)。
- 同步结果会写入 `chrome.storage.local.s3SyncState`，由设置页读取后展示，见 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js) 与 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js)。

但用户仍然感知“定时同步没有生效”，静态代码显示最可能原因是状态展示不是实时的：

- 设置页只在初次加载，以及保存/导入后的消息回调中调用 `loadSyncStatus()`。
- 设置页没有监听 `chrome.storage` 变化，因此后台定时同步执行后，即便更新了 `s3SyncState`，页面也不会自动刷新。
- 结果是“后台可能已跑、页面却还停在旧状态”，被用户感知为定时同步失效。

同时，缺少一个显式的“立即同步配置”入口，导致用户无法在不修改设置的前提下主动验证同步链路是否正常。

## Requirements Carried Forward

- R1. 在设置页 MinIO 配置同步区域新增“立即同步配置”按钮（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。
- R2. 按钮只同步已经保存到扩展存储中的配置，不读取或提交未保存表单（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。
- R3. 手动同步复用当前完整同步逻辑，允许推送或拉取（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。
- R4. 手动触发后应立即可见最新状态（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。
- R5. 定时同步执行后，设置页也应能看到状态变化，避免误判“未生效”（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。
- R6. 失败场景需继续保留明确的失败状态与原因（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。
- R7. 同步范围应覆盖设置页里的全部持久化配置，不再依赖手工维护的同步白名单（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。
- R8. 运行时临时状态不得进入同步范围（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。

## Scope Boundaries

- 不修改远端优先级与冲突策略，继续使用“较新配置覆盖较旧配置”（see origin: `docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md`）。
- 不新增回滚、历史版本或差异预览。
- 不把“立即同步配置”实现成“先保存表单再同步”。
- 不重构整套 S3/MinIO 配置结构。
- 不把 `chrome.storage.sync` 中所有键无差别同步到远端。

## Local Research

### Existing Patterns

- 设置页结构集中在 [options.html](/Users/xiaohansong/projects/memos-bber/options.html)，S3 同步区域已具备完整表单和状态展示容器。
- 文案采用 `chrome.i18n`，中英文资源分别在 [_locales/zh_CN/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/zh_CN/messages.json) 和 [_locales/en/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/en/messages.json)。
- 设置页通过 `chrome.runtime.sendMessage()` 请求后台执行保存后同步，模式已在 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) 建立，可直接扩展为手动同步消息。
- 后台同步引擎集中在 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)，包含 `rebuildSyncAlarm()`、`runSyncCycle()`、`chrome.alarms.onAlarm` 和状态持久化。
- 当前配置边界分散在多处：`getBaseSettings()`、`getSyncSettings()`、`CONFIG_EXPORT_KEYS`、`EXPORTABLE_SETTINGS_DEFAULTS` 各自维护一部分配置集合，是未来新增设置项漏同步的根源。

### Institutional Learnings

- 未发现 `docs/solutions/` 目录或相关现成总结，本次实现以现有代码模式为准。

### Research Decision

不做外部研究。原因是这次属于仓库内已有模式扩展，Chrome 扩展权限、`chrome.alarms` 与 `chrome.storage` 都已在代码里落地，主要风险来自仓库内部状态流转，而不是外部平台新规范。

## SpecFlow Analysis

### Primary User Flow

1. 用户打开设置页，查看 MinIO 同步区。
2. 用户点击“立即同步配置”。
3. 前端发送消息给后台，请求运行完整同步周期。
4. 后台读取已保存配置并执行同步。
5. 后台持续写入 `s3SyncState`。
6. 设置页刷新状态区域，展示运行中、成功或失败。

### Scheduled Flow

1. 用户已开启同步并保存设置。
2. 后台创建或更新 `chrome.alarms`。
3. 定时器到点触发 `runSyncCycle('schedule')`。
4. 后台写入最新 `s3SyncState`。
5. 如果设置页处于打开状态，应自动刷新状态展示。

### Edge Cases

- 用户点击手动同步时，同步配置不完整，应显示现有 `missing-config` 失败状态，而不是静默失败。
- 手动同步与后台已有同步同时发生时，应继续依赖 `syncCyclePromise` 做互斥，避免并发跑两次。
- 页面打开后长时间未刷新，定时同步多次发生，状态区域仍应能随着 `storage` 变化显示最新结果。
- 如果 service worker 被系统回收后重新唤醒，初始化逻辑仍应能恢复闹钟与启动同步路径。
- 如果用户在页面里修改了表单但没保存，再点击“立即同步配置”，必须明确只使用存储中的已保存值。
- 以后新增设置页持久化配置项时，不应再需要同时修改导入、导出、同步三套白名单。

## Proposed Implementation

### 1. 设置页增加手动同步入口

- 在 [options.html](/Users/xiaohansong/projects/memos-bber/options.html) 的 S3 同步区域新增一个独立按钮，靠近当前同步状态或底部操作区，但视觉上与全局“保存设置”区分开。
- 在 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) 中新增按钮文案绑定与点击事件。
- 文案新增到中英文 locale 文件，保持现有 `chrome.i18n` 模式。

### 2. 复用后台同步链路实现手动触发

- 在 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) 中发送新的消息类型，例如 `s3-sync-run-now`。
- 在 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js) 的 `chrome.runtime.onMessage` 中接收该消息，并直接调用 `runSyncCycle('manual')`。
- 不调用 `getSyncSettings()` 的表单读取逻辑，确保完全基于已保存配置执行，满足 R2。
- 继续依赖现有 `syncCyclePromise`，避免重复执行。

### 3. 收敛“可同步配置”的唯一来源

- 去掉“后台同步白名单”和“设置页导出白名单”各自维护的模式，改为由单一配置定义驱动。
- 推荐做法是抽出一个共享的“持久化设置 schema”或至少统一的键清单，覆盖：
  - Memos 基础配置
  - 标签与自动标签配置
  - MinIO/S3 同步配置
  - 任何未来新增的设置页持久化字段
- 运行时临时键例如 `open_action`、`open_content` 不纳入这个 schema，因此不会被导出或同步。
- `saveSettings()`、导入导出、后台同步都改为依赖同一套定义，避免未来再次出现“设置项新增了，但同步没跟上”的问题。

### 4. 修复同步状态的实时可见性

- 在 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) 增加 `chrome.storage.onChanged` 监听。
- 当 `areaName === 'local'` 且 `s3SyncState` 发生变化时，重新调用 `loadSyncStatus()`。
- 同时兼顾同步开关本地 UI 状态，确保“关闭同步”与“后台刚写入状态”之间展示一致。
- 这样既覆盖手动同步，也覆盖定时同步和启动同步，不必为每条触发路径手写回调刷新。

### 5. 补强定时同步的可诊断性

- 保留现有 `reason/detail` 展示机制，不先做大规模文案映射，优先把真实后台状态展示出来。
- 视实现复杂度决定是否在后台重建闹钟后附加轻量调试信息，例如：
  - 使用 `chrome.alarms.get(SYNC_ALARM_NAME)` 验证闹钟是否存在。
  - 在状态或控制台中记录下次计划时间，帮助判断“没生效”究竟是没触发还是没显示。
- 这部分应控制在低成本范围内，避免把一次修复演变成调试面板开发。

## Implementation Steps

1. 更新 `options.html`，为 S3 同步区加入手动同步按钮容器。
2. 更新 locale 文案，为按钮与可能新增的轻量提示提供中英文消息键。
3. 更新 `js/options.js`：
   - 绑定新按钮文案和点击事件。
   - 封装手动同步消息发送。
   - 收敛设置页持久化配置定义，避免导出与保存使用不同键集。
   - 增加 `chrome.storage.onChanged` 监听，实时刷新 `s3SyncState`。
4. 更新 `js/background.js`：
   - 处理手动同步消息。
   - 改为从统一配置定义读取“可同步配置”，移除手工维护白名单。
   - 视需要补一个最小化闹钟可诊断入口。
5. 手动验证保存后同步、手动同步、定时状态刷新三条路径。

## Risks And Mitigations

- 风险：设置页在监听 `chrome.storage.onChanged` 后重复刷新或状态闪烁。
  - 缓解：仅过滤 `local` 区域的 `s3SyncState` 变化，不订阅全部键。
- 风险：手动同步与自动同步并发触发。
  - 缓解：继续依赖已有 `syncCyclePromise` 互斥设计。
- 风险：用户仍然认为“定时同步没生效”，但实际是 `chrome.alarms` 没有被正确重建。
  - 缓解：在本次改动中加入轻量验证或至少保留清晰日志位点，便于下一步确认。
- 风险：去掉手工白名单后，配置边界定义如果不够严谨，可能把不该同步的键带进去。
  - 缓解：用“设置页持久化配置 schema”而不是“`chrome.storage.sync` 全量键”作为唯一来源，显式排除运行时状态。

## Testing Plan

- 在本地安装扩展后打开设置页，确认“立即同步配置”按钮可见且与“保存设置”区分明确。
- 修改表单但不保存，点击“立即同步配置”，确认后台使用的仍是旧配置而非未保存值。
- 在同步配置完整的情况下点击手动同步，确认状态区域按顺序出现运行中与最终结果。
- 开着设置页，模拟后台写入 `s3SyncState`，确认页面无需刷新也会更新状态。
- 开启定时同步后等待或手动触发 alarm 路径，确认状态展示能反映最近一次调度结果。
- 新增一个设置页持久化字段后，验证其无需额外补白名单也会进入导出与 S3 同步载荷。
- 验证 `open_action`、`open_content` 这类运行时键不会进入远端同步载荷。

## Acceptance Criteria

- [x] 设置页出现“立即同步配置”按钮，且按钮只触发已保存配置的同步。
- [x] 手动按钮调用与自动同步相同的后台同步链路。
- [x] 手动同步执行后，状态区域能自动刷新为最新结果。
- [x] 后台定时同步更新 `s3SyncState` 后，已打开的设置页无需手动刷新即可看到新状态。
- [x] 同步失败时，状态区域仍保留失败原因与细节。
- [x] 设置页持久化配置通过统一定义自动进入导出与远端同步，无需再维护手工同步白名单。
- [x] 运行时临时键不会进入远端同步范围。

## Sources

- **Origin document:** [docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md](/Users/xiaohansong/projects/memos-bber/docs/brainstorms/2026-03-17-manual-sync-button-and-schedule-diagnosis-requirements.md)
- **Relevant implementation:** [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js)
- **Relevant implementation:** [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)
- **Relevant markup:** [options.html](/Users/xiaohansong/projects/memos-bber/options.html)
- **Locale files:** [_locales/zh_CN/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/zh_CN/messages.json)
- **Locale files:** [_locales/en/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/en/messages.json)
