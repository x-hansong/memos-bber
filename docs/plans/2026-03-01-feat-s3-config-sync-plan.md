---
title: feat: Add S3-backed config sync
type: feat
status: completed
date: 2026-03-01
origin: docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md
---

# feat: Add S3-backed config sync

## Overview

为扩展增加一个面向多设备的配置同步能力，把当前用户显式配置同步到 S3 对象中，并支持自动双向收敛。该功能以现有设置存储和 JSON 导入导出语义为基础，只同步 `CONFIG_EXPORT_KEYS` 白名单内的配置，避免把运行时临时状态带入跨设备同步（see brainstorm: `docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md`）。

本次规划覆盖三类触发点：设置页保存后立即推送、浏览器启动或后台恢复时自动拉取一次、后台定时检查同步。同步必须先做内容比较，只有配置变化时才写远端；双向冲突默认按最后修改时间取新值覆盖旧值（see brainstorm: `docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md`）。

## Problem Statement / Motivation

当前扩展的配置只保存在浏览器本地 `chrome.storage.sync` 中，虽然已有本地 JSON 导出导入能力，但用户在多台设备间同步配置仍需手动导出再导入。对于带有 Access Token、自动打标签模型配置等字段的场景，这种手动迁移成本高且容易出现配置漂移。

仓库已有较清晰的配置边界：
- [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) `CONFIG_EXPORT_KEYS` 已定义“哪些字段算可迁移配置”（`1-15` 行）。
- [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) 现有 `exportSettings` / `normalizeImportedSettings` / `importSettingsFile` 已提供稳定的序列化与反序列化入口（`155-227` 行）。
- [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js) 中存在 `open_action`、`open_content` 一类运行时状态，不适合跨设备同步（`40-45` 行）。

因此新增的同步功能应建立在“现有白名单配置”上，而不是扩大全量存储同步范围。

## Proposed Solution

### 1. 引入独立的 S3 兼容同步配置区

在设置页新增一个“S3 配置同步”分区，单独配置：
- 总开关 `s3SyncEnabled`
- S3 兼容服务 endpoint `s3Endpoint`
- 签名区域 `s3Region`
- 桶名 `s3Bucket`
- 对象键 `s3ObjectKey`
- Access Key ID `s3AccessKeyId`
- Secret Access Key `s3SecretAccessKey`
- 定时同步间隔（小时）`s3SyncIntervalHours`
- 双向同步开关 `s3SyncBidirectional`（默认开）
- 路径风格开关 `s3ForcePathStyle`（对 MinIO 默认开）

这些字段不加入 `CONFIG_EXPORT_KEYS`，避免出现“同步配置把自己也同步出去”导致的递归耦合。同步目标对象仍仅包含 `CONFIG_EXPORT_KEYS` 对应的业务配置（see brainstorm: `docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md`）。

### 2. 抽出统一的配置快照层

在前端与后台共用一组轻量辅助函数：
- `getExportableSettings()`：按 `CONFIG_EXPORT_KEYS` 读取当前配置
- `buildSyncPayload(settings)`：生成远端对象 JSON
- `normalizeRemotePayload(data)`：校验远端对象格式并提取有效配置
- `stableStringify(value)`：以稳定 key 顺序序列化，避免字段顺序导致误判
- `computeDigest(content)`：基于 Web Crypto 计算 SHA-256 摘要，作为变更判定依据

远端对象建议使用如下逻辑结构：

```json
{
  "version": 1,
  "updatedAt": "2026-03-01T12:34:56.000Z",
  "contentHash": "sha256-...",
  "settings": {
    "...": "..."
  }
}
```

这里的 `updatedAt` 是冲突判定主依据，`contentHash` 用于快速跳过无变化写入。

### 3. 在后台新增同步协调器

将同步逻辑放在 service worker（[js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js)）中，而不是仅放在设置页脚本。原因是：
- 定时同步需要后台能力；
- 启动拉取不能依赖用户打开设置页；
- 所有设备都应复用同一套冲突处理逻辑。

建议在后台新增一组职责清晰的函数：
- `loadSyncConfig()`
- `shouldRunSync()`
- `fetchRemoteConfig()`
- `pushRemoteConfig()`
- `pullRemoteConfig()`
- `runSyncCycle(trigger)`，其中 `trigger` 为 `startup` / `save` / `schedule`

同步状态（最近一次本地摘要、最近一次远端摘要、最近一次同步时间、最近错误）单独保存在 `chrome.storage.local`，不进入 `chrome.storage.sync`，避免跨设备回流污染。

### 4. 使用 `chrome.alarms` 驱动定时任务

当前扩展是 MV3 service worker，且 [manifest.json](/Users/xiaohansong/projects/memos-bber/manifest.json) 只有 `tabs`、`storage`、`activeTab`、`contextMenus` 权限（`34-39` 行）。定时同步应新增 `alarms` 权限，并使用 `chrome.alarms.create` + `chrome.alarms.onAlarm` 管理周期任务，而不是 `setInterval`。

定时策略：
- 在扩展安装/启动、同步设置变化时重建 alarm
- 间隔单位用“小时”，取值建议 `1-24`
- 若同步关闭则删除 alarm

### 5. 启动拉取与保存推送接入点

触发点按 brainstorm 直接落地：
- `startup`：在后台初始化时尝试执行一次拉取，优先把远端最新配置应用到本地（see brainstorm: `docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md`）
- `save`：设置页在 `persistSettings()` 成功后，通过 `chrome.runtime.sendMessage` 通知后台立即执行一次推送
- `schedule`：alarm 定时触发一次完整同步周期

为了避免 service worker 冷启动期间的重复执行，需要为 `runSyncCycle` 增加轻量互斥（例如内存态标志 + 超时兜底，必要时落到 `chrome.storage.local` 的“进行中”时间戳）。

### 6. S3 兼容访问方式（按 MinIO 优先设计）

该仓库是无构建步骤的静态扩展（`options.html` 直接加载脚本，见 [options.html](/Users/xiaohansong/projects/memos-bber/options.html) `196-198` 行），不适合为了一个简单同步功能引入 AWS SDK 打包链。计划采用浏览器原生 `fetch` + Web Crypto 自行完成最小必要的 AWS Signature Version 4 签名，请求目标为 S3 REST API：
- MinIO 默认：`GET {endpoint}/{bucket}/{objectKey}` 与 `PUT {endpoint}/{bucket}/{objectKey}`
- 若未来关闭 `s3ForcePathStyle`，再允许使用虚拟主机风格 URL

这样可以：
- 避免引入体积较大的 SDK 和打包改造
- 保持和现有原生脚本风格一致
- 只实现本功能需要的 `GET` / `PUT` 两条路径
- 更适配自建 MinIO 这类自定义域名/端口的 S3 兼容服务

需要在计划中明确要求：
- 用户的 MinIO bucket 必须配置允许扩展来源的 CORS
- 不推荐 AWS SDK v2（官方已于 2025-09-08 停止支持）
- 长期凭证保存在扩展中属于高风险方案，UI 需明确提示风险
- endpoint 允许自定义协议、域名与端口（如 `https://minio.example.com:9000`）
- `s3Region` 对 MinIO 仍保留为签名参数；若用户未显式配置，可默认 `us-east-1`

### 7. 双向同步与冲突策略

同步流程建议如下：

1. 读取本地导出配置，构造本地 payload 与 `contentHash`
2. 拉取远端对象（若不存在则记为“远端为空”）
3. 比较本地/远端 `contentHash`
4. 若内容一致：
   - 更新本地最近同步元数据
   - 结束，不做写入
5. 若内容不同：
   - 若远端为空：推送本地
   - 若为单向模式：始终推送本地
   - 若为双向模式：比较 `updatedAt`
6. `updatedAt` 较新的配置获胜：
   - 远端新：覆盖本地（`chrome.storage.sync.set`）
   - 本地新：覆盖远端（`PUT`）

为了减少误覆盖：
- 本地每次保存业务设置时，额外维护 `configUpdatedAt`
- 从远端拉取并应用本地时，也同步写入 `configUpdatedAt = remote.updatedAt`
- 当远端对象缺失 `updatedAt` 或格式非法时，视为不可自动合并，跳过覆盖并记录错误

## Technical Considerations

- 架构影响：
  - 设置页需要新增 S3 同步配置表单、说明文案和保存逻辑。
  - 后台需要新增独立同步协调器，但不应污染现有 memo 发送链路。
  - 建议把“导出配置相关逻辑”从 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) 抽到可复用模块，供后台复用，避免复制 `CONFIG_EXPORT_KEYS` 和序列化规则。

- 性能影响：
  - 定时任务默认按小时级运行，流量和计算开销很低。
  - 使用摘要比较可以避免无变化重复 `PUT`。
  - 自定义 SigV4 只覆盖小对象读写，请求成本可控。

- 安全考虑：
  - S3 长期凭证存在扩展存储中，本质上不安全，只能视为用户主动接受的 trade-off。
  - Secret 字段在设置页应使用密码输入框。
  - 日志或错误消息不得回显完整 AK/SK。
  - 必须校验 endpoint、bucket、object key 非空后才允许启用同步；`region` 可允许为空并回退默认值。
  - 远端 JSON 解析失败时不得清空本地配置。

- 兼容性：
  - 需要验证 Manifest V3 service worker 内的 `crypto.subtle` 可用性。
  - 需要确保 S3 REST 返回的 XML 错误体不会被误判成有效 JSON。
  - 需要兼容 MinIO 常见的路径风格访问与自签名证书部署场景；若用户使用无效 TLS 证书，浏览器请求可能直接失败，需在帮助文案中说明。

## System-Wide Impact

- **Interaction graph**：
  - 用户在 [options.html](/Users/xiaohansong/projects/memos-bber/options.html) 点击保存，会触发 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) `saveSettings()`（`229-292` 行），再经 `persistSettings()` 写入 `chrome.storage.sync`（`147-153` 行）。
  - 新增方案中，`persistSettings()` 成功后还会通知后台执行一次 `runSyncCycle('save')`。
  - 后台在 `startup` 和 `schedule` 触发下也会执行同一协调器，最终可能反向写回 `chrome.storage.sync`。

- **Error propagation**：
  - S3 网络错误、签名错误、CORS 错误都应在后台被捕获并写入“最近同步状态”，不能影响已有的 Memo 发送能力。
  - 设置页保存业务配置成功后，即使随后 S3 推送失败，也应保持“本地保存成功”不回滚。

- **State lifecycle risks**：
  - 若拉取远端后部分字段写入失败，可能产生半更新状态；因此应用远端配置时必须一次性调用 `chrome.storage.sync.set(normalizedSettings)`。
  - 若定时任务与设置页保存并发，需要互斥避免旧快照覆盖新设置。
  - 若设备时钟偏差大，`updatedAt` 可能误判；需要在文案和风险说明中明确“最后修改时间策略依赖设备时间大体准确”。

- **API surface parity**：
  - 现有“导出 JSON”和“远端同步对象”应复用相同的 payload 结构（至少 `version` + `settings`），避免两套格式长期漂移。
  - 所有写入业务设置的入口（设置页保存、远端拉取应用）都应统一维护 `configUpdatedAt`。

- **Integration test scenarios**：
  - 本地已修改且远端为空时，首次同步应成功创建对象。
  - 两台设备分别修改配置后，以较新 `updatedAt` 的配置为最终结果。
  - 远端返回非法 JSON / XML 错误页时，本地配置保持不变并记录错误。
  - 本地配置未变化时，定时同步不应重复执行 `PUT`。
  - 用户关闭同步后，定时 alarm 被删除，后续不再发起请求。
  - MinIO 使用自定义 endpoint 和端口时，请求 URL 与签名仍然正确。

## Acceptance Criteria

- [x] 设置页新增“S3 配置同步”配置区，支持启用/关闭、自定义 endpoint、签名区域、桶信息、长期凭证、对象键、同步间隔、双向同步开关，以及 MinIO 默认路径风格配置。
- [x] 同步目标仅包含 `CONFIG_EXPORT_KEYS` 内的配置字段，不包含 `open_action`、`open_content` 等运行时状态（see brainstorm: `docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md`）。
- [x] 用户保存设置成功后，后台立即尝试执行一次同步推送；推送失败不回滚本地保存。
- [x] 扩展启动或 service worker 恢复后，后台会尝试拉取远端配置一次。
- [x] 启用定时同步后，扩展使用 `chrome.alarms` 按用户配置间隔执行同步。
- [x] 本地与远端内容一致时，不执行重复写入。
- [x] 双向同步开启时，本地与远端冲突按 `updatedAt` 取较新者覆盖较旧者（see brainstorm: `docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md`）。
- [x] 远端格式非法、签名失败、权限不足、CORS 拒绝时，不会清空或破坏本地业务配置。
- [x] 用户可以看到最近一次同步结果的基础反馈（至少成功/失败和最近时间），便于诊断。
- [x] 中英文文案都完成更新。

## Success Metrics

- 用户在两台设备上配置同一 S3 目标后，可在一次“保存推送 + 对端启动拉取”或一次定时周期内完成配置收敛。
- 配置未变更时，重复定时周期不会产生额外 `PUT` 请求。
- 同步失败不会影响现有 Memos 保存与发送主流程。
- 用户在遇到配置错误（如 bucket/CORS/签名）时，能从 UI 或状态提示判断失败类别，而不是静默失败。
- 用户配置自建 MinIO endpoint 后，无需依赖 AWS 官方域名即可完成同步。

## Dependencies & Risks

- 依赖：
  - 浏览器支持 MV3 `chrome.alarms`
  - 浏览器支持 `crypto.subtle`（用于 SHA-256 与 HMAC-SHA256）
  - 用户可控制 MinIO bucket 的 CORS 配置

- 主要风险：
  - 长期 AWS 凭证暴露在扩展本地存储中，存在泄露风险
  - 设备时间漂移导致“最后修改时间优先”误判
  - 自实现 SigV4 容易在 canonical request、header 编码、URI 编码上出错，尤其是 MinIO 自定义 endpoint/端口场景
  - service worker 生命周期导致定时任务和启动任务存在重复触发窗口
  - 部分 MinIO 部署可能使用路径风格、非标准端口或私有 CA，兼容性细节多于 AWS 官方 S3

- 风险缓解：
  - 明确将 S3 同步标记为高级功能，并在帮助文案中提示长期凭证风险
  - 用集中化签名辅助函数，并以固定输入做单元验证
  - 以稳定序列化 + 摘要比较减少不必要冲突
  - 同步状态单独存储于 `chrome.storage.local`，降低跨设备状态污染

## Implementation Suggestions

### Phase 1: Foundation

- 在 [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js) 中提炼可复用的导出/导入辅助函数。
- 在 [options.html](/Users/xiaohansong/projects/memos-bber/options.html) 新增 S3 同步配置区。
- 在 [_locales/zh_CN/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/zh_CN/messages.json) 和 [_locales/en/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/en/messages.json) 新增中英文文案。
- 在 [manifest.json](/Users/xiaohansong/projects/memos-bber/manifest.json) 增加 `alarms` 权限。

### Phase 2: Sync Engine

- 在 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js) 增加同步配置读取、调度、状态管理和同步协调器。
- 实现最小化的 SigV4 签名工具，只覆盖 S3 `GET` / `PUT`。
- 实现本地/远端 payload 比较与 `updatedAt` 冲突处理。

### Phase 3: UX & Verification

- 在设置页展示最近同步状态。
- 补充输入校验和错误提示。
- 以手工验证场景为主，覆盖首次同步、无变化跳过、双端冲突、关闭同步、CORS/403 等失败路径。

## Alternative Approaches Considered

- 使用 `chrome.storage.sync` 全量键值做同步：
  - 放弃原因：会把 [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js) 中的临时状态一并带入远端，污染跨设备语义（see brainstorm: `docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md`）。

- 只做单向推送到 S3：
  - 放弃原因：不满足自动双向同步。

- 引入 AWS SDK：
  - 放弃原因：当前仓库没有构建链，增加 SDK 会明显抬高体积和维护复杂度；同时不应选择已停更的 AWS SDK v2。

- 通过预签名 URL 或中转服务同步：
  - 放弃原因：安全性更好，但与你在 brainstorm 中确认的“扩展直连 S3、保存长期凭证”前提不一致（see brainstorm: `docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md`）。

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md](/Users/xiaohansong/projects/memos-bber/docs/brainstorms/2026-03-01-s3-config-sync-brainstorm.md)  
  Carried-forward decisions: 只同步 `CONFIG_EXPORT_KEYS`、扩展直连 S3、启动拉取 + 保存推送 + 定时同步、按 `updatedAt` 解决双向冲突。

- **Internal references**
  - [js/options.js](/Users/xiaohansong/projects/memos-bber/js/options.js): `1-15`, `147-227`, `229-304`
  - [js/background.js](/Users/xiaohansong/projects/memos-bber/js/background.js): `27-45`, `315-322`
  - [manifest.json](/Users/xiaohansong/projects/memos-bber/manifest.json): `19-40`
  - [options.html](/Users/xiaohansong/projects/memos-bber/options.html): `16-199`
  - [_locales/zh_CN/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/zh_CN/messages.json): `20-199`
  - [_locales/en/messages.json](/Users/xiaohansong/projects/memos-bber/_locales/en/messages.json): `20-199`

- **External references**
  - Chrome Extensions `chrome.alarms` API: https://developer.chrome.com/docs/extensions/reference/api/alarms
  - Chrome Extensions `storage` API: https://developer.chrome.com/docs/extensions/reference/api/storage
  - MinIO/AIStor JavaScript SDK docs（用于确认其为 S3-compatible，对本计划仅作兼容性参考）: https://docs.min.io/enterprise/aistor-object-store/developers/sdk/javascript/
  - MinIO/AIStor `mc cors set` docs（用于确认 bucket CORS 配置能力）: https://docs.min.io/enterprise/aistor-object-store/reference/cli/mc-cors/mc-cors-set/
  - AWS SDK for JavaScript v2 end-of-support announcement: https://aws.amazon.com/blogs/developer/announcing-end-of-support-for-aws-sdk-for-javascript-v2/

## Notes

- 本仓库当前没有 `docs/solutions/` 可供复用的历史经验文档，因此本计划未引用 institutional learnings。
- 本计划已将 brainstorm 中的 open question 视为已接受前提：用户接受长期凭证风险，并接受基于设备时间的最后修改时间策略。
