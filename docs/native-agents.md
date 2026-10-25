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

## 消费项目迁移与本地隔离

agentic-ops 从 0.1.41 接入时实测了两个顺序约束：旧解析器会拒绝新增的
context/maxBytes 字段；context 的 scope 只认可 Git inventory 中的文件。
因此在干净分支上，先对**旧声明**执行 pinned upgrade，再增加新声明：

```sh
./harness upgrade --manifest harness.manifest.json --to 0.1.46 \
  --tool-commit 1638ba8d1a14689d2bbe5655a2d0bac53bd09ea7
# 随后编辑源 delta、地图、context 与原生 compositions，不编辑生成物。
./harness sync --manifest harness.manifest.json
# git add 这次新增的地图/测试等文件，使 scope 能被校验；然后：
./harness doctor --manifest harness.manifest.json --strict
```

提交实现后先 `./harness prove --manifest harness.manifest.json --isolated --record
--timeout 300`，再跑完整 gates：旧 tool 的证明不因升级自动变新，命令全部通过
但 proof 陈旧时仍应拒绝交付。只发布生产 base 的仓库生成 attestation；消费者
不必为别人发布的 base 伪造自己的发行标签。实际结果由项目变更记录承载。
`upgrade` 的末尾 doctor 失败时，pin/lock/生成物可能已写入；检查 git diff 并
修正声明后重跑，不要把所有非零退出都解释为整笔事务回滚。

`prove --isolated` 的隔离对象是 Git 故障注入，不是网络/凭据/Agent 的安全边界；
它可能共享缓存。更强的可复现性检查使用独立 clone，不复制 .harness、.env、
runs、node_modules 或用户配置。例如对本仓库已推送的分支：

```sh
task_dir=$(mktemp -d /tmp/coding-harness-check.XXXXXX)
git clone --branch codex/native-agent-pilot \
  https://github.com/lijinchao/coding-harness.git "$task_dir/repo"
cd "$task_dir/repo"
git rev-parse HEAD
./harness gates --manifest harness.manifest.json --timeout 300 --report .harness/cold-check.jsonl
./harness check --manifest examples/consumer/harness.manifest.json
./harness attest --manifest harness.manifest.json --example examples/consumer/harness.manifest.json --verify
git status --short
```

核对输出 HEAD 为待验证 PR 的提交；长期复现应固定完整 SHA，而不是追随可移动分支。
本项目的测试/attestation 会读取 pin 对应的历史提交和发行 tag，须保留完整历史；
本轮 depth=1 冷 clone 实测因此失败。与 CI 的 fetch-depth: 0 对齐，不把它当缓存问题。
第一次 bootstrap 需要网络下载固定工具/base；全部门禁通过不代表禁网运行通过。
独立 clone 仍继承终端环境。运行不受信任 Agent 时，另用容器/VM/OS 沙箱设置
网络策略、只读挂载和凭据白名单；仅换目录或 HOME 不等于安全隔离。
