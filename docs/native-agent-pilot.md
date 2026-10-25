# 自身原生接入试点 — 2026-10-25

设计：[0048](decisions/0048-self-host-native-agent-pilot.md)；
用法：[原生指南](native-agents.md)；
机器结果：[生成的评分摘要](native-agent-pilot.results.json)。
本轮在本仓库真实提交副本上做只读工程 review/context 任务，不使用玩具项目。
发行 0.1.46 固定提交 `1638ba8d1a14689d2bbe5655a2d0bac53bd09ea7`，目前仅本地。

## 实现与实际发现

复用已有 composition，将三个 base 技能生成到 .agents/skills 和 .claude/skills，
共六个原生文件。加上 AGENTS/REVIEW，共八个组合输出，逐文件 hash 进入 lock。
原始来源仍只有固定 base；sync/check 管理生成与漂移。harness-drift 的注入目标
改为原生 verification-tiers 导出文件，已看到它失败并在 sync 后恢复。
AGENTS.delta 为评审任务显式路由到 REVIEW。没有新建 CLAUDE.md 兼容副本，
没有修改全局 Agent 配置、全局安装、game-design 或 DSH 的源码。

上一轮 Claude 入口判断过时：官方文档说明 2.1.277 起支持 AGENTS.md；当前仍
受内置插件与加载模式影响。本机安装 2.1.71，本次临时运行固定的 2.1.310。
实验采用命令行 both 模式，不能据此推导所有用户默认配置都已加载 AGENTS。
[官方依据](https://code.claude.com/docs/en/memory)。

## 真实任务观测

共保留 11 次调用，包括失败和有界重试。固定案例的自动评分不是人工验收。

| 运行时 | 原生证据 | 任务结果 |
|---|---|---|
| Claude Code 2.1.310 | 基线目录无项目技能，接入目录的原生 init catalog 含全部三个技能 | 实际配置指向 openrouter/auto；API 402 额度不足，任务未执行。不是模型完成率证据 |
| Codex CLI 0.146.0 | 接入组真实读取 .agents/skills/verification-tiers/SKILL.md 与 REVIEW | 基线执行过相关测试；双方后续请求超时，重试亦遇到请求/连接问题。均不计任务完成 |
| 本地 DSH 0.2.1-rc.2 | 接入组通过原生 skill 工具加载 verification-tiers | 基线与接入组完成真实 context 评估，运行测试且源码保持干净；首个接入组遗漏仓库 DoD |

DSH 首次从外部目录启动时，未使用其源码 tsconfig，报 FiberState 导出错误；
重试仅在子进程指定 TSX_TSCONFIG_PATH 与隔离 DSH_HOME 后启动成功。
运行时报告的源码提交为 `687f282e8625c6b8d11ff58211a90524be2e4317`。
Codex 第一轮隔离用户配置，第二轮恢复用户配置；两轮任务和配置不同，不能合并
计算模型成功率。没有为余额问题充值、换账户或切换模型供应商。

## 由失败推动的修正

DSH 基线用时 129052 ms，执行完整测试与 example check；原生组 56210 ms，
只跑定向检查。虽然两个回答均正确区分了结构校验与 Agent 阅读责任，后者遗漏
仓库明确的交付要求。不能把更快、少 token 直接算作质量提升。

因此修正 base verification-tiers：便宜的定向检查不替代项目规定的交付检查。
发行新的 0.1.46，没有原地改旧 base；评分也区分 execution_qualified 与
repository_dod_qualified，completed/源码干净/真实工具检查均是条件。

修正后 DSH 再次原生加载该技能，并实际发起 npm test 与 example check。
但 JSON tool_result 的测试正文截断为 8192 bytes，且明确 truncated=true。
评分器没有采用模型声称“253 passed”的句子，而是先标注 evidence-incomplete。
该会话发起必需命令是已观测事实；投影单独不能证明完整结果。

随后由独立进程在同一干净 fixture 提交
`26c22faf22d68cdcd969c8526f74d410aa4b2208` 验证：

```text
npm test: 253 passed / 0 failed
example check: 2 composition(s) match 0.1.46
source: clean
```

这两份完整日志及其 SHA-256 进入 independent-delivery.json，评分摘要标为
independently-verified；原生投影不足标志仍保留。它是独立命令复验，不是
独立模型/人工审批。此 fixture 隐去了评估脚本及其自身测试，
所以核心套件计数与维护分支的完整套件不同。

## 指标与局限

原始轨迹位于被忽略的 .harness/native-evals/2026-10-25/，不提交完整会话或
账号配置。摘要以脚本重新解析轨迹，保留 trace SHA、提交、版本、原生调用、
usage 与缺失状态；可离线重算，不调用模型。独立日志另外绑定实际 fixture。
首批观测以 kind=delivery-outcome 追加到同一 docs/metrics.jsonl，按 case 去重；
不会混入默认 gate-health 窗口。首次不完整观测不因后来复验而被悄悄改绿。
这些是混合环境下的流程观测，不能当跨模型正确率或自动晋升依据。

DSH 基线 provider totalTokens 为 522095，首个原生组为 259089；二者所做工作
不同，初版 treatment 还可读取 evaluator、基线没有它。后续 fixture 隐去
evaluator 并记录派生提交。样本小、缓存、任务、版本和条件有差异，不能据此
宣称 token 节省比例或因果收益。缺失 usage 记 null；elapsed 是 CLI 时长，
不是完整 time-to-green。

仍需推进：Claude 可用额度下的真实任务；Codex 连通稳定后的完整任务；完整
工具结果/命令 receipt 的可靠归档；按风险、重复任务分层的评估集。原生目录
发现已经可验证，但三端交付闭环尚未全部验证。人类产品签收始终 pending。
