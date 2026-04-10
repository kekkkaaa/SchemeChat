# Discussion Sync Prompt Compaction 2026-04-09

## Background

The first-round draft was already compacted, but the active sync flow still used a longer cross-discussion prompt.
That meant the product could generate a short round-one prompt, then switch back to a longer prompt when syncing the latest replies across panes.

## This Change

The active sync prompt is now compacted too.

Single-source prompt:

```text
继续交叉讨论，不要寒暄。
请用 1/2/3 输出：1. 对方关键点 2. 你认同/不同意或要修正的点 3. 你的更新结论。
要求：高压缩，只保留影响判断的新信息，不重复题面。
其他 AI 最新回复：

[ChatGPT]
...
```

Aggregated multi-source prompt:

```text
继续交叉讨论，不要寒暄。
请用 1/2/3 输出：1. 其他 AI 的关键共识或分歧 2. 你认同/不同意或要修正的点 3. 你的更新结论。
要求：高压缩，只保留影响判断的新信息，不重复题面。
其他 AI 最新回复：

[ChatGPT]
...

[Gemini]
...
```

## Later Round Rule

The later-round prompt builders now follow the same compaction rule in both manual and auto flows:

- keep the editable/shared draft focused on round identity, task, and output structure
- append source material only at the final per-pane assembly step
- always exclude the target AI's own previous-round reply
- only attach other AIs' latest previous-round replies

## Active Scope

The currently active prompt assembly paths in code are:

1. Round-one draft generation in `src/renderer/renderer.js`
2. Sync / cross-discussion prompt generation in `src/main/index.js`
3. Later-round scaffold generation plus per-pane final assembly in `src/main/index.js` and `src/main/sync/prompt-builder.js`

For manual later rounds, the console now edits a shared scaffold first and the app appends sources only when the draft is actually sent.
For auto later rounds, the app still assembles prompts per pane directly, but it now applies the same self-exclusion rule.

## Expected Benefit

- shorter sync prompts
- less repeated instruction text
- lower model-side processing overhead during cross-discussion
- more consistent prompt style across round one and later sync stages
