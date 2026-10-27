# 实施方案

- 行为、边界与验收依据：同目录的 `spec.md`；对照来源为 `/Users/qihoo/workspace/360MultiPaySdk_AS` 的 `.wisharness/templates/spec.md`、`plan.md` 和 `rules/core.md`，基线 `master@eaed603`。本仓现有契约以 `docs/decisions/0044-delivery-flow-starts-with-an-acceptance-map.md` 和 `packs/delivery-flow/README.md` 为准。
- 执行记录位置：本文的“执行记录”。

## 方案与依赖

- 本次只提交供后续迭代评审的 SPEC，不修改 CLI、Pack、Schema、生成文件或消费仓库。
- 复用 WisHarness 的行为说明结构与“缺失验证不能冒充不适用”的语义；保留本仓 `delivery.plan.json`、固定提交回执和项目原有需求文档作为权威来源。
- 先提交本计划，再编写 SPEC；若调查推翻取舍，在 SPEC 提交中同步更新本计划。
- 不新增运行时依赖，也不把 SDK 的支付业务规则带入共享 Harness。

## 实施与验证

| 步骤 | 改动与依赖 | 对应验收及验证方式 |
| --- | --- | --- |
| 1 | 核对两个仓库的入口、配置、模板及 delivery-flow 源码 | 在 SPEC 中准确标出已有能力和缺口；不把仅配置启用说成实际执行 |
| 2 | 依 WisHarness 模板写 `spec.md`，给出目标行为、边界、验收及未决项 | 人工逐项核对模板，链接现有契约，区分文档定义和未来实现 |
| 3 | 运行 `npm test` 与示例 `./harness check`，复查 Git diff | 交付仓库规定的两个检查，确认只新增本变更文档 |
| 4 | 将已验证文档提交并推送远端 `main` | 核对远端提交、工作区状态；不宣称 SPEC 中的功能已经交付 |

## 恢复与收尾

- 此次仅新增文档；若评审拒绝提案，以后续提交撤销或修订文档，不改写既有发布历史。
- SPEC 的退出条件是未来实现及真实消费仓库验证完成；本次不满足该退出条件。

## 执行记录

- 已完成与验证证据：待本轮检查后填写。
- 剩余事项、阻塞与下一步：依据 SPEC 决定是否实现 opt-in 的需求映射和验证状态检查；本轮不实现。
