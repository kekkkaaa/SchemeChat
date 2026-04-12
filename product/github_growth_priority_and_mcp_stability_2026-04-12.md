# GitHub 增长优先级与 MCP 稳定性记录

## 目的
这份文档用于固定当前阶段的两个核心判断：

1. 从产品增长和 GitHub stars 角度看，SchemeChat 下一步最值得优先做什么。
2. 在继续推进新方向之前，当前 MCP 低层自动讨论链路存在哪个必须先修的稳定性问题。

---

## 本次结论

### 产品方向结论
当前最值得优先投入的方向，不是继续堆零散功能，也不是继续把项目往“多网页聊天壳”方向做大，而是明确把 SchemeChat 推向：

`Repo / PR / Issue AI War Room`

也就是：

- 给定本地仓库、GitHub issue、PR、任务书或 spec
- 让多个网页 AI 按角色进行多轮讨论
- 通过 MCP 把 Codex / Claude Code 拉入执行链路
- 回传 diff、patch、测试结果、风险说明
- 再由多模型继续收束成最终方案

这是当前最符合项目已有优势、最容易被开发者理解、也最容易形成传播视频和 README 演示的方向。

### 工程顺序结论
这轮修复完成后，**当前不再建议继续围绕 MCP 低层 repeated inject / submit / capture 追加补丁**。

现在更合适的工程顺序是：

1. 保持高层 discussion controller 作为默认主路
2. 转入面向仓库的 AI War Room 主场景
3. 再补导出、回放、分享能力
4. 最后再做 agent / skill gallery 生态扩展

---

## 本次讨论背景

### 参与对象
本次判断基于当前真实项目能力，而不是空想功能：

- SchemeChat 是 Electron 桌面应用
- 直接承载官方网页 AI，不依赖 API key
- 当前核心多 pane 组合是 ChatGPT / Gemini / Grok
- 已有讨论工作台：多轮讨论、自动推进、总结者、轮次历史、收束
- 已有本地 MCP server，可让 Codex / Claude Code 读取 pane 状态、抓取回复、更新讨论流、触发动作

### 真实问题
本次尝试使用 MCP 低层能力，驱动一场围绕“怎样让项目更受开发者和 AI power users 喜爱、并更容易获得 GitHub stars”的 5 轮自动讨论。

实际结果是：

- 成功拿到了 3 个 AI 的首轮有效判断
- 但继续推进到第 2 轮时，当前 MCP 低层 repeated send / capture 在 ChatGPT / Gemini 上不够稳定
- 因此没有继续硬跑完整 5 轮

停止原因不是功能不想做，而是为了避免把不稳定抓取结果继续传播到后续轮次，导致整场讨论失真。

一句话：

`这次产品结论可信，但这次 5 轮自动编排链路本身还不够可信。`

---

## 已拿到的首轮判断

### ChatGPT 首轮方向
ChatGPT 给出的最高优先级方向是：

`repo-aware AI War Room for coding tasks`

核心意思：

- 不要继续做成“又一个统一聊天界面”
- 应该把 panes 变成 planner / critic / reviewer 等角色
- 通过 MCP 把 Codex / Claude Code 的 patch、diff、测试结果带回讨论流
- 形成“讨论 -> 执行 -> 验证 -> 再讨论”的闭环

它给出的第二优先级方向是：

`shareable debate artifacts / replay / export`

### Gemini 首轮方向
Gemini 给出的最高优先级方向是：

`Shadow Prompt + Artifact Synchronization Engine`

核心意思：

- 一个全局 prompt 自动映射到不同 panes
- 自动同步和对比多 pane 输出的代码块、UI 结果、artifact
- 强调可演示性和“比较工作台”的视觉冲击

它给出的第二优先级方向是：

`preconfigured debate roles / model personality presets`

### Grok 首轮方向
Grok 给出的最高优先级方向是：

`open MCP Agent SDK + in-app Gallery`

核心意思：

- 把 SchemeChat 做成“web AI swarm platform”
- 允许开发者提交可插拔 agent 模板
- 通过 gallery 放大生态和社区 PR

它给出的第二优先级方向是：

`interactive replay + one-click export`

---

## 综合判断

综合上面三家的首轮判断，当前最值得优先固定的排序如下。

### 第一优先级
`Repo / PR / Issue AI War Room`

原因：

- 最贴合当前已有能力：网页 AI + 多轮讨论 + MCP + 外部代理
- 最能被开发者一眼看懂
- 最容易形成 30 秒可传播 demo
- 最容易和现有“统一聊天工具”类项目拉开差异
- 2 到 6 周内可拆出可演示 MVP

### 第二优先级
`Discussion replay / artifact export / shareable result`

原因：

- 这是非常强的传播放大器
- 能把一场讨论变成 Markdown、HTML、GitHub issue comment、PR note 等可分享内容
- 但它更像放大器，不是最核心的“为什么值得 star”

### 第三优先级
`Open agent / skill / role gallery`

原因：

- 很有潜力形成社区生态
- 但更适合作为主场景跑通后的扩展层
- 如果现在就做，容易把项目重新拉回“平台化过早”的状态

---

## 当前必须先修的问题

### 问题定义
当前 MCP 低层工具可以做到：

- `inject_text_to_panes`
- `submit_message_to_panes`
- `inspect_round_status`
- `capture_latest_replies`

但在多轮连续自动编排中，`ChatGPT / Gemini` 仍然会出现下面这类不稳定现象：

- 某个 pane 实际已回复，但抓取结果不完整
- 某个 pane 的 reply capture 偶发拿不到完整文本
- 多轮连续注入和发送后，pane 间稳定性不一致
- 若在第 2 轮继续基于这些结果转发，会把脏数据带进后续轮次

### 当前判断
这不是“产品方向不对”，而是：

`MCP 低层能力已经能用，但还没稳定到足以支撑高可信度的多轮自动编排。`

### 当前修复进度
截至本次记录更新，稳定性修复已经完成一轮真实运行时验收：

- 已完成：
  - 明确高层讨论控制流是外部 agent 的默认主路
  - 低层 MCP pane 工具已降级为调试 / 人工干预定位
  - 已删除脱离主链的旧 sync 实现
  - 已在共享 extractor / stability 层加入 reply quality 判断
  - 已定向收紧 Gemini 抓取规则，降低短假回复被当成稳定结果的风险
  - 已让自动等待与轮次完成判定优先基于“usable reply”而不是“非空 reply”
  - 已让低层 MCP payload 返回更多可判断弱结果的结构化字段

- 已完成的运行时验收：
  - 已确认 MCP 服务在运行时暴露高层讨论主路：
    - `get_discussion_flow_state`
    - `update_discussion_flow`
    - `trigger_discussion_action`
  - 已确认低层工具 description 与 payload 字段在运行时生效
  - 已用真实 3 pane 环境跑通一轮高层自动讨论：
    - `update_discussion_flow -> trigger_discussion_action(primary)`
    - 4 轮自动流程最终进入 `finished`
    - `capture_latest_replies` 返回 3/3 usable replies
  - 已确认最终运行态下：
    - ChatGPT usable
    - Gemini usable
    - Grok usable

一句话：

`这轮稳定性收口已经通过主路径验收，可以停止继续补丁，回到下一阶段产品工作。`

### 验收后的判断
这次收口后，建议默认遵循下面的使用边界：

1. 多轮讨论主路优先走高层 discussion controller MCP 工具
2. 低层 `inject / submit / inspect / capture` 仅作为调试、人工干预和恢复工具
3. 后续如果再出现稳定性问题，先复现并记录，不再回到“边测边叠补丁”的方式
4. 下一阶段工作可以回到产品推进，而不是继续扩张低层自动编排分支

---

## 推荐的下一阶段工作顺序

### 阶段 1：做 War Room MVP
最小版本建议：

- 输入：本地 repo 路径 / issue / PR / task spec
- 角色：planner / critic / reviewer
- 外部执行：Codex / Claude Code 通过 MCP 参与
- 输出：方案、风险、patch proposal、测试建议

### 阶段 2：做导出和分享
- Markdown 导出
- HTML replay
- GitHub issue / PR comment 友好格式

### 阶段 3：做开放生态
- role templates
- task templates
- agent / skill gallery

---

## 当前 source of truth

本阶段关于“产品优先级”和“是否应立即继续做长链路自动讨论”的 source of truth 以本文档为准。

尤其是以下两条：

1. **产品方向上，优先做 Repo / PR / Issue AI War Room。**
2. **工程顺序上，默认走高层 discussion controller 主路，不再继续扩张低层自动编排分支。**

补充说明：

3. **当前稳定性修复已经通过本轮运行时验收，先停补丁，再进入下一阶段工作。**

---

## 2026-04-12 运行时验收快照

本轮由本地 MCP 自测得到的关键结果：

- `/health` 正常，`writeToolsEnabled: true`
- 高层主路可正常调用：
  - `update_discussion_flow`
  - `trigger_discussion_action`
  - `get_discussion_flow_state`
- 真实自动讨论结果：
  - 成功从 `idle` 进入首轮 Draft
  - 自动推进完成 4 轮
  - 最终状态为 `finished`
  - `roundHistoryCount = 4`
- 最终抓取结果：
  - `capture_latest_replies.summary.completed = 3`
  - `capture_latest_replies.summary.withUsableReply = 3`
  - `capture_latest_replies.summary.weakReply = 0`

这意味着本次修复目标已经达到：

- 主路径可用
- 三家 provider 当前都能完成一轮真实自动讨论
- 临时执行计划文档可以删除
