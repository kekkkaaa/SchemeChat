# SchemeChat

SchemeChat 是一个面向真实任务的 `AI War Room`。

它不是普通的多模型聊天聚合器，而是一个让多个网页 AI 围绕同一个问题进行多轮讨论、交叉质疑、收束结论，并最终沉淀成 Markdown 结果物的工作台。

当前产品方向来自上级目录 `../product/` 下的产品文档，核心定位是：

- 围绕一个真实任务发起多 AI 讨论
- 用简单入口选择任务类型和讨论强度
- 在真实网页会话里协调 ChatGPT、Gemini、Grok 等 provider
- 把讨论过程收束为可读、可复盘、可复用的结果

## 核心能力

- 多 AI 分屏工作台：同时打开多个官方网页会话，而不是依赖 API 聚合
- 多轮讨论编排：从独立分析到交叉讨论，再到最终总结
- 任务导向入口：支持 `Explore / Execute / Review`
- 讨论强度预设：支持 `Quick / Standard / Deep`
- 结果导向输出：目标不是聊天记录，而是清晰的 Markdown artifact
- 外部执行者接入：支持把 Codex / Claude Code 作为执行者或信息提供者接入闭环
- 临时对话与会话隔离：减少历史上下文污染

## 典型工作流

1. 输入一个题目、任务、issue、spec 或现实问题。
2. 选择任务类型：
   - `Explore`：分析问题、比较方案、压缩分歧
   - `Execute`：生成方案、拆任务、明确验收
   - `Review`：检查结果、找问题、收束风险
3. 选择讨论强度：
   - `Quick`：3 轮快速收束
   - `Standard`：4 轮平衡推进
   - `Deep`：5 轮深入推演
4. 让多个 AI 在真实网页中按轮次推进，最后输出结论、计划或审查结果。

## 结果物

SchemeChat 目前的主结果物方向是 Markdown artifact，而不是继续堆更多聊天 UI。

典型结果包括：

- `Decision Brief`
- `Execution Plan`
- `Review Memo`
- `Replay Snapshot`

## 项目结构

```text
SchemeChat/
  assets/      图标与打包资源
  config/      provider selector 与配置
  src/
    main/      Electron 主进程、讨论编排、同步与抓取
    preload/   各 provider 页面注入、提交与校验桥接
    renderer/  讨论工作台 UI、轮次状态与交互逻辑
    utils/     通用工具
```

## 本地运行

要求：

- Node.js 20+
- npm
- macOS / Windows / Linux 之一

安装依赖：

```bash
npm install
```

开发启动：

```bash
npm start
```

带调试启动：

```bash
npm run dev
```

构建安装包：

```bash
npm run build
```

## 相关文档

产品与架构资料位于上级目录 `../product/`，建议优先看这些文件：

- `../product/README.md`
- `../product/ai_war_room_unified_direction_2026-04-12.md`
- `../product/discussion_console_information_architecture_v1.md`
- `../product/discussion_state_machine_v1.md`
- `../product/discussion_draft_assembly_rules_v1.md`
- `../product/reply_pipeline_refactor_taskbook_2026-04-14.md`

## 当前定位

SchemeChat 当前的统一方向不是“继续堆聊天壳功能”，而是：

`用一个简单入口，把多 AI 讨论、外部 agent 执行、结果导出和模板沉淀串成一个闭环。`
