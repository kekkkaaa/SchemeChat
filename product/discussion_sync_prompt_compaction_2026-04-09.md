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

## Active Scope

The currently active prompt assembly paths in code are:

1. Round-one draft generation in `src/renderer/renderer.js`
2. Sync / cross-discussion prompt generation in `src/main/index.js`
3. Aggregated sync prompt generation in `src/main/sync/prompt-builder.js`

Later round-specific draft builders are not fully implemented yet in the renderer state flow.
When those rounds are implemented, they should follow the same compaction rule:

- round identity
- current task
- source material
- output structure
- minimal constraints only

## Expected Benefit

- shorter sync prompts
- less repeated instruction text
- lower model-side processing overhead during cross-discussion
- more consistent prompt style across round one and later sync stages
