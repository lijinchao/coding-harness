# 原生接入与真实任务运行

本轮先在 coding-harness 自身试点，设计见
[0048](decisions/0048-self-host-native-agent-pilot.md)。使用已有 composition，
不需要新增加载器；接入状态和任务结果分开判断。

## 指令与技能的真源

AGENTS.md 继续由 AGENTS.delta.md 与固定 base 组合。评审任务明确读取 REVIEW.md。
三个固定技能各生成两份原生入口，内容由同一 base source 提供，hash 进入 lock：

| Agent | 项目指令 | 原生技能 |
|---|---|---|
| Codex | AGENTS.md | .agents/skills/<id>/SKILL.md |
| Claude Code | 当前版本可直接读 AGENTS.md，受加载模式影响 | .claude/skills/<id>/SKILL.md |
| 本地 DSH | 由 agent-instructions 插件读取 AGENTS.md | filesystem skill provider 的 .agents/skills/<id>/SKILL.md |

不要直接改这些生成文件；修改固定 base 的源技能需要新版本，再 upgrade/sync。
业务项目不必导出所有技能：仅为已声明且相关的技能添加对应 composition，例如：

```json
{"output": ".agents/skills/verification-tiers/SKILL.md",
 "sources": ["base:skills/verification-tiers/SKILL.md"]}
```

Claude 使用相同来源，但输出到 .claude/skills。先 sync，再开启新会话核对实际
发现的技能；manifest 中登记了技能，不等于已经进入原生目录。新会话应避免
同时加载人工复制、内容漂移的多个版本。

## Claude Code 的版本边界

上一轮“一概依赖 CLAUDE.md”的判断已过时。官方文档说明原生支持始于 2.1.277；
本机全局 CLI 为 2.1.71，本轮在临时 npm 缓存运行固定的 2.1.310。
默认 claude-md-or-agents-md 会在工作目录或上级存在 CLAUDE 文件时选择后者；
claude-md-and-agents-md 模式可读两者。2.1.285 起的内置插件 ID 为
cc-plugin-agents-md@builtin，加载模式可通过用户设置、--settings 或 managed
设置指定，项目/本地 settings 不控制这个选项。不要为此静默改用户全局配置。

本轮实验用命令行临时设置 both 模式，不默认创建 CLAUDE.md，不把目录文件存在
当成 AGENTS 正文已被模型消费。官方依据：
[memory](https://code.claude.com/docs/en/memory)、
[skills](https://code.claude.com/docs/en/skills)。
Codex 的原生目录依据：[官方 skills 文档](https://learn.chatgpt.com/docs/build-skills)。

## 有界真实任务

评估脚本只处理本仓库的只读 review/context 任务，使用隔离的真实提交副本。
它是当前维护分支的试点脚本，不是所有固定 Kernel 的消费者都会自动安装的能力。
原始轨迹、诊断及报告存于仓库外或被忽略的 .harness 下，不提交账号配置。
模型调用不进入 npm test。显式运行示例（路径替换为实际值）：

```sh
node scripts/native-agent-eval.mjs --execute yes --agent codex \
  --variant native --revision <完整提交> --task context --timeout 240 \
  --out <仓库外的新绝对目录>
```

Claude 使用 --agent claude；DSH 另加 --agent dsh --dsh-root <现有源码绝对目录>。
DSH 的解析配置与 DSH_HOME 仅在子进程指定，不改源码或用户全局设置。
输入版本、模型（轨迹提供时）、调用证据、耗时、token usage、超时、工作树状态
和独立回归结果都记录；missing usage 不能按 0 统计。

发现目录、读取技能、执行检查、完成任务、满足仓库 DoD 和人工签收是不同事实。
仅模型声称通过不能计成功。超时即使进程返回 0 也不计完成；仓库 DoD 另检查
完整 npm test 与 example check。原生技能的定向检查不能替代这些必需项。
不要在 prove 借用缓存期间并行写同一缓存或日志。

已有轨迹可离线汇总（不调用模型）：

```sh
node scripts/native-agent-eval.mjs --summarize .harness/native-evals/2026-10-25 \
  --out docs/native-agent-pilot.results.json
```

投影被截断时，可用 --verify-delivery <某次报告目录> 在相同干净 fixture 上
独立执行完整测试与 example；随后重新汇总，独立复验与原生投影状态分开保留。
--metrics docs/metrics.jsonl 将首批观测按 case 去重追加为 delivery-outcome；
默认 gate-health 窗口不会混入它们，后续复验不会覆盖首次观测。
