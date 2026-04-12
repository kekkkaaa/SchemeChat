# SchemeChat AI War Room 行动任务书

## 目的

这份文档不是空泛 PRD，而是基于当前代码现实编写的行动任务书。

它回答四件事：

1. 当前代码已经具备哪些可直接复用的能力。
2. 为了落地新的统一方向，最小可行改动是什么。
3. 开发者用户和普通用户怎样共用同一套产品内核。
4. 接下来应按什么顺序实施，避免再次做成补丁堆叠。

本任务书与 `product/ai_war_room_unified_direction_2026-04-12.md` 配套使用。

---

## 目标定义

本阶段目标不是重做讨论系统，而是在现有讨论控制台之上，收束出一个更清晰的统一入口：

- 对外产品主故事：`SchemeChat AI War Room`
- 对内能力主路：保留现有 discussion controller
- 对用户入口表达：
  - 开发者能直接理解 repo / issue / PR / spec 场景
  - 普通用户也能直接拿来分析问题、生成方案、检查结果

一句话：

`保留现有自动讨论骨架，只重构入口表达、任务类型和结果物导向。`

---

## 当前代码现状

### 1. 讨论控制台已经是一个可工作的主入口

当前讨论控制台已经具备这些核心输入和操作：

- `讨论主题`
- `轮次模式`
- `本轮补充`
- `自动/手动推进`
- `临时对话`
- `同步`
- `跳过异常 AI`
- `开始首轮 / 发送本轮`

对应代码位置：

- `src/renderer/index.html`
- `src/renderer/renderer.js`

重点函数 / 结构：

- `renderHeader()`
- `renderModeSelector()`
- `buildDiscussionUiStateModel()`
- `updateDiscussionControlState()`

这说明：

`这次不需要新造第二套入口，只需要在现有入口上收束。`

### 2. 3 / 4 / 5 轮模式已经实现，而且已经是主系统能力

当前轮次模式已经在核心配置里存在：

- `fast-3`
- `standard-4`
- `deep-5`

并且已经包含：

- 展示 label
- 轮次总数
- 流程描述
- 各轮 round type
- 各轮 round goal

对应代码位置：

- `src/renderer/discussion-core.js`
- `src/renderer/renderer.js`

重点结构：

- `MODE_OPTIONS`
- `ROUND_TYPE_LABELS`
- `ROUND_GOAL_LABELS`
- `getRoundTypeLabel()`
- `getAutoPromptType()`

这说明：

`Quick / Standard / Deep 只是表达层改名，不需要重写编排器。`

### 3. 高层 discussion controller 已经能被 MCP 驱动

当前 MCP 高层主路已经具备：

- `get_discussion_flow_state`
- `update_discussion_flow`
- `trigger_discussion_action`
- `open_temporary_chats`

并且 `update_discussion_flow` 已经支持：

- `topic`
- `roundNote`
- `draft`
- `runMode`
- `modeId`

对应代码位置：

- `src/main/codex-mcp-server.js`
- `src/renderer/renderer.js`

重点接口：

- `get_discussion_flow_state`
- `update_discussion_flow`
- `trigger_discussion_action`
- `handleDiscussionControlRequest()`
- `runDiscussionControlAction()`

这说明：

`现有高层主路可以继续作为统一自动化入口，不应该再开新编排分支。`

### 4. 当前帮助文案已经开始偏“高层主路”

帮助弹窗已经在强调：

- 优先使用 discussion flow 工具
- 不要把低层 inject / submit / capture 当主编排
- 可用 `open_temporary_chats` 降低历史污染

对应代码位置：

- `src/renderer/help-modal.html`

这说明：

`新的入口表达可以直接接在现有帮助体系上，不必另起一套。`

---

## 当前缺口

虽然系统骨架已经具备，但从产品收束角度看，还缺 5 件关键事情。

### 缺口 1：入口仍然是“讨论控制台心智”，不是“任务入口心智”

现在用户看到的是：

- 讨论主题
- 轮次模式
- 本轮补充

这对熟悉项目的人没问题，但对第一次使用的人仍偏“内部实现语言”。

需要改成更接近任务语言：

- 你要处理什么任务
- 这次是分析问题、生成方案还是检查结果
- 想要快一点还是深一点

### 缺口 2：没有显式任务类型层

当前系统有轮次模式，但没有高层任务类型：

- `Explore`
- `Execute`
- `Review`

导致：

- Prompt 目标只能依赖通用轮次模板
- 结果物目标不够明确
- 普通用户看不懂“我现在该选什么”

### 缺口 3：轮次模式文案仍然过于内部化

当前模式名称是：

- `3 轮快收束`
- `4 轮标准`
- `5 轮深推演`

这本身不坏，但如果要兼容开发者与普通用户，表达最好更统一：

- `Quick`
- `Standard`
- `Deep`

内部仍继续复用原来的 `fast-3 / standard-4 / deep-5`。

### 缺口 4：系统已经在产出讨论结果，但还没有以“结果物”作为主目标

现在有：

- 轮次历史
- 最终总结
- Draft 来源

但还没有把这套流程显式收束成少数几种固定结果物，例如：

- `Decision Brief`
- `Execution Plan`
- `Review Memo`
- `Replay Snapshot`

### 缺口 5：开发者故事和普通用户故事还没有被统一到一套入口文案

目前项目讨论方向已经明确：

- GitHub 传播主故事偏开发者
- 产品入口必须兼容普通用户

但代码里的文案和界面结构还没有完成这层统一。

---

## 产品决策

### 决策 1：保留一个主入口，不再做双产品

不做：

- 一个“开发者版工作台”
- 一个“普通用户版工作台”

只做：

- 一个主入口
- 两套文案表达
- 同一套讨论与结果闭环

### 决策 2：保留 discussion controller 作为唯一主编排路径

不新增第二套“任务流程引擎”。

继续复用当前：

- 轮次模式
- Draft 生成
- 自动推进
- 总结者
- MCP 高层动作

新设计只改变：

- 入口抽象
- 文案层
- prompt 默认偏向
- 结果物导向

### 决策 3：任务类型优先于轮次模式暴露

对用户来说，应先决定：

- 这次是在分析问题
- 还是生成方案
- 还是检查结果

再决定：

- 快一点
- 标准
- 深一点

也就是：

`任务类型是第一层，讨论强度是第二层。`

### 决策 4：结果物要成为设计中心

后续界面与流程应围绕结果物来组织，而不是只围绕轮次状态来组织。

优先固定四类结果物：

- `Decision Brief`
- `Execution Plan`
- `Review Memo`
- `Replay Snapshot`

---

## 目标落地模型

### 用户入口

主入口建议收束成下面四个输入：

1. 任务内容
2. 任务类型
3. 讨论强度
4. 是否让 Codex / Claude Code 参与

对于普通用户的文案：

- 任务类型：
  - 分析问题
  - 生成方案
  - 检查结果
- 讨论强度：
  - 快速
  - 标准
  - 深入

对于开发者的文案映射：

- 分析问题 = `Explore`
- 生成方案 = `Execute`
- 检查结果 = `Review`
- 快速 = `Quick`
- 标准 = `Standard`
- 深入 = `Deep`

### 系统内部映射

内部先不改主编排骨架，只做映射：

- `Quick` -> `fast-3`
- `Standard` -> `standard-4`
- `Deep` -> `deep-5`

再给任务类型增加一层配置：

- `explore`
- `execute`
- `review`

这层配置主要影响：

- 首轮 Draft 模板语气
- 默认快捷补充
- 最终结果物类型

### 结果物映射

- `explore` -> `Decision Brief`
- `execute` -> `Execution Plan`
- `review` -> `Review Memo`

`Replay Snapshot` 则作为所有类型都可附带导出的公共结果物。

---

## 阶段 A：建立任务类型层

### 目标

在不破坏当前讨论系统的前提下，引入高层任务类型。

### 需要改的文件

- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/renderer/discussion-core.js`

### 具体动作

1. 在讨论主题区域附近新增任务类型 selector。
2. 任务类型先只做三个：
   - `explore`
   - `execute`
   - `review`
3. 给每个任务类型定义：
   - 用户可见标签
   - 开发者标签
   - 简短说明
   - 默认结果物类型
4. 将任务类型纳入 renderer state 和 UI snapshot。
5. 首轮 Draft 生成时，把任务类型信息注入 prompt builder。

### 验收标准

- 不改动现有自动推进主路
- 不破坏当前 3/4/5 轮能力
- UI 能明确看到三种任务类型
- 首轮 Draft 会因任务类型不同而出现可观察的语气差异

---

## 阶段 B：把轮次模式改成更稳定的“强度表达”

### 目标

保留内部 `modeId`，对外统一显示为强度档位。

### 需要改的文件

- `src/renderer/discussion-core.js`
- `src/renderer/renderer.js`
- `src/main/codex-mcp-server.js`
- `src/renderer/help-modal.html`

### 具体动作

1. 保留内部：
   - `fast-3`
   - `standard-4`
   - `deep-5`
2. 对 UI 主展示改成：
   - `Quick`
   - `Standard`
   - `Deep`
3. 在帮助文案中解释：
   - Quick = 3 轮
   - Standard = 4 轮
   - Deep = 5 轮
4. MCP 层短期仍保留 `modeId` 字段，不急着另起 `intensity` 字段。

### 验收标准

- 现有讨论流程与自动推进逻辑不受影响
- MCP 兼容旧 `modeId`
- UI 对普通用户更容易理解

---

## 阶段 C：让结果物进入主叙事

### 目标

让系统从“做了一场讨论”变成“产出了一份可用结果”。

### 需要改的文件

- `src/renderer/renderer.js`
- 必要时新增轻量结果物辅助模块

### 具体动作

1. 在 state 中增加当前结果物类型概念。
2. 根据任务类型自动推导结果物目标。
3. 在标题、副标题、总结文案中显式展示本轮最终目标是什么。
4. 优先先做文案收束，不急着上完整导出 UI。

### 验收标准

- 用户能感知这次讨论最终会产出什么
- 最终总结阶段的文案不再只是“最终总结”，而是更接近结果物名称

---

## 阶段 D：把开发者与普通用户文案统一起来

### 目标

做到“传播主故事偏开发者，界面入口兼容普通用户”。

### 需要改的文件

- `src/renderer/index.html`
- `src/renderer/help-modal.html`
- `README.md`

### 具体动作

1. 应用内主入口优先讲：
   - 分析问题
   - 生成方案
   - 检查结果
2. 帮助弹窗同时保留：
   - `Explore / Execute / Review`
   - `Quick / Standard / Deep`
3. README 对外叙事可以偏开发者，但要补一句普通场景也成立。

### 验收标准

- 普通用户第一次打开不会被 repo / PR / issue 术语吓退
- 开发者看 README 仍能快速理解项目差异点

---

## 阶段 E：让 MCP 跟上新的入口抽象

### 目标

让 Codex / Claude Code 能理解新的任务入口，而不是只能理解旧的讨论参数。

### 需要改的文件

- `src/main/codex-mcp-server.js`
- `src/renderer/renderer.js`
- `src/renderer/help-modal.html`

### 具体动作

1. 在 `update_discussion_flow` 中增加任务类型字段支持。
2. 在 `get_discussion_flow_state` 返回里增加任务类型与结果物目标。
3. 更新帮助文档，明确：
   - 什么时候改任务类型
   - 什么时候改 modeId
   - 什么时候先开临时对话

### 验收标准

- 外部 agent 能读到新的统一入口状态
- 不破坏现有 MCP 工具主路

---

## 暂不做的事情

为避免重新发散，本阶段明确不做下面这些内容：

- 不新增第二套自动讨论引擎
- 不重写 round state machine
- 不急着做完整 Gallery 首页
- 不急着做复杂导出面板
- 不急着引入大量新按钮和高级参数
- 不因为入口重构去动低层 MCP 调试工具定位

---

## 实施顺序建议

真实开发顺序建议如下：

1. 阶段 A：任务类型层
2. 阶段 B：强度表达收束
3. 阶段 C：结果物导向
4. 阶段 D：双层文案统一
5. 阶段 E：MCP 同步升级

原因很简单：

- 先把入口抽象做对
- 再把表达做顺
- 最后再补外部自动化接口

---

## 最终验收口径

当下面这些条件同时成立时，可以认为这轮收束完成：

1. 用户进入应用时，能先看到任务类型和强度，而不是先面对内部讨论术语。
2. 现有 3 / 4 / 5 轮系统继续正常工作，没有新增第二条主编排路径。
3. 普通用户能直接理解入口含义。
4. 开发者仍能把它当作 repo / issue / PR 的 AI War Room 使用。
5. Codex / Claude Code 仍能通过 MCP 读写主流程状态。
6. 结果物开始成为界面和流程中的明确目标。

---

## 一句话执行原则

`只重构入口抽象和结果导向，不重写已经跑通的讨论主骨架。`
