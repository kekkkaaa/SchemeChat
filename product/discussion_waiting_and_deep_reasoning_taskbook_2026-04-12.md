# SchemeChat 自动等待 / Deep 推理 / 临时对话 详细任务书

## 1. 任务目的

这份任务书只处理一个收口方向：

`让自动讨论在真实网页 AI、Deep 长推理、临时对话不稳定时，仍能稳定区分“继续等”“弱抓取”“应暂停”“应失败”，而不是统一掉进固定超时。`

本任务书是后续实现的唯一执行口径。

它明确约束三件事：

1. Deep / 长推理等待策略
2. pane 级状态语义拆分
3. temporary / private chat 预检 gate

## 2. 设计边界

本任务书明确要求：

1. 不新造第二套自动讨论主循环，继续复用现有 discussion controller。
2. 不额外发明新的产品入口，只收口当前自动推进链路。
3. 不把问题甩给“单纯加大 timeout”，因为这只会让失败更慢暴露。
4. 不把 temporary chat 当作“尽量试一下”的附属动作，而要把它做成前置准备状态。
5. 不继续叠补丁。新逻辑落地后，要替换旧判断，不保留平行分支。

非目标：

1. 不重写整套状态机。
2. 不改 prompt 体系。
3. 不改总结者机制。
4. 不改多轮讨论产品结构。
5. 不在本阶段全量重写 provider selector。

## 3. 当前真实问题复盘

最近一次真实测试中，系统已经能做到：

1. 打开 3 个 pane。
2. 进入临时对话测试场景。
3. 发起首轮自动讨论。
4. 至少拿到 1 个可用回复。

但自动推进到下一轮时仍暴露出关键问题：

1. ChatGPT 没形成稳定 latest reply，更接近 `pending_capture`。
2. Gemini 临时对话激活失败，后续只抓到 `Gemini 話` 这类弱文本，更接近 `weak_reply`。
3. Grok 拿到了真正可推进的回复，更接近 `usable_reply`。
4. 高层等待循环没有把这三种状态分开，而是统一停在 `round-waiting`。
5. 最终触发固定 180 秒整轮超时，进入 `auto-paused`。

所以当前问题不是“自动流程完全不能用”，而是：

`底层已经能看到一些细粒度差异，但高层控制器没有把这些差异提升成真正的等待决策。`

## 4. 当前代码事实

### 4.1 外层等待是固定常量

当前常量位于：

- `src/renderer/discussion-core.js`

现状：

- `AUTO_WAIT_POLL_INTERVAL_MS = 1500`
- `AUTO_WAIT_TIMEOUT_MS = 180000`
- `BUSY_STALL_PAUSE_MS = 45000`

问题：

1. `Quick / Standard / Deep` 没有独立等待档位。
2. 只要达到总时长上限，就统一暂停。
3. Busy stall 判定也没有结合“是否仍有进展”。

### 4.2 当前完成判定过粗

当前核心逻辑位于：

- `src/renderer/discussion-auto-run.js`
- `src/renderer/renderer.js`

现状：

- `settleInspectionResults()` 里核心完成条件仍是 `!busy && hasUsableReply`
- `pollRoundCompletion()` 里以整轮等待为中心做轮询、暂停和超时

问题：

1. `thinking` 与 `pending_capture` 没分开。
2. `weak_reply` 与 `hard_error` 没分开。
3. 一旦有 pane 不满足“非 busy 且 usable”，整轮就继续卡住。

### 4.3 抓取层有更多信息，但没被高层真正消费

当前入口位于：

- `src/main/index.js`
- `src/main/sync/stability.js`
- `src/main/sync/extractors/base.js`
- `src/main/sync/extractors/chatgpt.js`
- `src/main/sync/extractors/gemini.js`
- `src/main/sync/extractors/grok.js`

现状：

1. `buildInspectionPayload()` 已能区分 `usable-reply`、`weak-reply:*`、`pending-latest-reply` 等口径。
2. `waitUntilNotBusy()` 与 `captureUntilStable()` 已有 provider 级轮询与稳定窗口。
3. provider extractor 已有 busy / stability 的局部策略。

问题：

1. 底层状态没有被提升成统一 pane state。
2. 当前控制层只把这些信息折算成 waiting / completed / failed。
3. 结果是“慢思考”“弱抓取”“抓取未稳”“真正错误”在用户层看起来很像。

### 4.4 temporary chat 还不是正式 gate

当前入口位于：

- `src/main/index.js`
- `src/preload/chatgpt-preload.js`
- `src/preload/gemini-preload.js`
- `src/preload/grok-preload.js`
- `config/selectors.json`

现状：

1. `triggerTemporaryChatsForPaneIds()` 会触发 provider preload 去切临时对话。
2. 目前 12 秒内若收到结果就汇总返回。
3. 某个 pane temporary 失败后，自动讨论链路仍可能继续把它带入。

问题：

1. 临时测试场景下，失败 pane 仍可能污染真实历史。
2. 某 pane 根本未 ready，却继续进入自动讨论，拖累等待判断。
3. 当前没有“严格临时模式”的 preflight gate。

## 5. 根因判断

当前问题的根因不是一个点，而是三个层级叠加：

1. `temporary` 没变成前置 gate，导致未准备好的 pane 进入主流程。
2. `inspection` 能看见细节，但高层没有 pane state 语义模型。
3. 等待策略仍然以固定超时为主，而不是以“是否持续有进展”为主。

一句话：

`现在系统知道得不够细，所以只能用粗暴时间阈值来兜底。`

## 6. 本次实现的目标状态

本次实现完成后，自动讨论应能做到：

1. 临时测试前先明确哪些 pane 真正进入了 temporary/private 模式。
2. 自动等待时明确区分 pane 当前到底是思考中、待抓取、弱回复、可用回复、停滞还是硬错误。
3. `Deep` 模式可以更久等待，但前提是 pane 仍在产生有效进展。
4. 某个 pane 只要进入 `weak_reply` 或 `pending_capture`，系统要给出相应处理，不再无差别卡死整轮。
5. 整轮暂停时，原因要尽量解释成“为什么暂停”，而不是笼统的“等待超时”。

## 7. 统一状态模型

本次任务只新增一套统一 pane state，并要求高层等待全部基于它判断。

### 7.1 temporary preflight state

temporary preflight 结果只允许三类：

| 状态 | 含义 | 是否可进入自动讨论 |
| --- | --- | --- |
| `temporary_ready` | 已确认进入临时 / 私密对话模式 | 可以 |
| `temporary_failed` | 本次 provider 支持临时模式，但本轮激活失败 | 不可以 |
| `temporary_unsupported` | provider 当前不支持临时模式 | 本阶段默认不进入严格临时测试 |

规则：

1. 严格临时模式下，只允许 `temporary_ready` 的 pane 进入 `expectedPaneIds`。
2. 严格临时模式下，若 ready pane 少于 2 个，自动讨论直接不启动。
3. preflight 失败信息必须保留到控制台状态中，不能只写日志。

### 7.2 pane wait state

统一 pane state 为 6 类：

| 状态 | 定义 | 典型来源 | 高层动作 |
| --- | --- | --- | --- |
| `thinking` | provider 仍在生成，且最近仍有进展 | `busy=true` 且 busy / fingerprint / 文本持续变化 | 继续等待 |
| `pending_capture` | 当前还没拿到 usable reply，但无硬错误，像是抓取还未稳定 | `dom-pending`、无 latest reply、候选文本尚不稳定 | 给短窗口重试 |
| `weak_reply` | 已抓到文本，但明显偏弱、像 UI 噪声或残片 | `weak-reply:*`、极短、结构异常 | 限次重试，之后转软失败 |
| `usable_reply` | 已拿到稳定、可进入下一轮的回复 | `usable-reply` | 计为完成 |
| `stalled` | 看起来仍 busy，但长时间无进展 | busy 长时不变、fingerprint 长时不变 | 触发暂停 |
| `hard_error` | host mismatch、页面异常、temporary 失败、明确报错 | preload / inspect 返回硬失败 | 直接失败或跳过 |

## 8. 进展信号定义

为了让等待不只靠时间，本次实现必须定义“有效进展”。

以下任一项成立，都算 pane 仍有进展：

1. `busy=true` 且本次 busy 仍连续存在，没有明显断档。
2. `latestReplyText` 长度增长。
3. reply fingerprint 变化。
4. 候选回复数量增加。
5. `sourceMethod` 从 `dom-pending` 进入更稳定来源。
6. provider 明确仍在生成中。

以下情况不算有效进展：

1. busy 维持不变，但文本和 fingerprint 长时间完全不变。
2. 连续多次只抓到同一段弱文本。
3. 只出现 UI 标签残片，例如 `Gemini 話` 这类没有讨论内容的文本。

## 9. 两层等待时间模型

本次任务明确改成双时间模型：

1. `progress timeout`
2. `hard timeout`

含义：

1. `progress timeout`
   只要 pane 在最近这段时间内仍有进展，就可以继续等待；超过该时长没有进展，才考虑转 `stalled`。
2. `hard timeout`
   无论如何都不能无限等，到达上限必须暂停或失败。

第一版建议值：

| 模式 | progress timeout | hard timeout |
| --- | --- | --- |
| `Quick` | 60-90 秒 | 300 秒 |
| `Standard` | 90-120 秒 | 480 秒 |
| `Deep` | 180-240 秒 | 900 秒 |

补充要求：

1. `BUSY_STALL_PAUSE_MS` 不再直接作为唯一 stall 定义，而是演化成 mode-aware 的 progress timeout。
2. provider extractor 的 busy wait / stability 也应与模式协同，而不是继续写死短值。

## 10. 高层决策规则

自动等待循环后续必须只基于统一 pane state 做决策。

### 情况 A：全部 `usable_reply`

动作：

1. 执行稳定抓取。
2. 进入 `round-review`。
3. 自动推进下一轮。

### 情况 B：存在 `thinking`，且最近仍有进展

动作：

1. 继续等待。
2. 更新 pane 最近进展时间。
3. 不触发整轮暂停。

### 情况 C：存在 `pending_capture`

动作：

1. 进入短窗口抓取重试。
2. 仅对该 pane 做额外 capture，不拖其他已 usable pane 重新判定。
3. 若重试后仍无改观，再转 `stalled` 或软失败候选。

### 情况 D：存在 `weak_reply`

动作：

1. 限次重试。
2. 超过重试阈值后，标记为软失败 / 可跳过。
3. 不再无限等待它自动变好。

### 情况 E：存在 `stalled`

动作：

1. 自动暂停。
2. 明确告诉用户是“长时间无进展”而不是笼统超时。
3. 给出继续等待 / 跳过异常 pane / 手动接管等恢复动作。

### 情况 F：存在 `hard_error`

动作：

1. 立即暴露失败来源。
2. 不再继续伪装成普通等待。
3. 根据场景进入 partial error 或自动暂停。

## 11. 执行分阶段计划

本次建议按 4 个阶段实施，不能并行乱改。

### 阶段 1：temporary preflight gate

目标：

`先保证进入自动讨论的 pane 是真的 ready。`

涉及文件：

- `src/main/index.js`
- `src/preload/chatgpt-preload.js`
- `src/preload/gemini-preload.js`
- `src/preload/grok-preload.js`
- `config/selectors.json`
- `src/renderer/renderer.js`

实施项：

1. 给 temporary flow 增加明确返回状态，不再只返回模糊 ok / false。
2. 严格临时模式下，只把 `temporary_ready` pane 写入本轮 `expectedPaneIds`。
3. 若 ready pane 少于 2 个，禁止启动自动讨论。
4. 在控制台展示失败 pane 与失败原因。
5. Gemini 现有 selector 脆弱点保持在同一阶段处理，不拖到后面。

验收：

1. 某 pane temporary 失败时，不再继续参与本轮自动流程。
2. 严格临时模式下，不会悄悄回退到普通聊天。
3. 用户能直接看出哪一个 pane 没准备好。

### 阶段 2：统一 pane state 输出

目标：

`先把底层看得到的细节，变成高层真正可用的统一状态。`

涉及文件：

- `src/main/index.js`
- `src/main/sync/stability.js`
- `src/main/sync/extractors/base.js`
- `src/main/sync/extractors/chatgpt.js`
- `src/main/sync/extractors/gemini.js`
- `src/main/sync/extractors/grok.js`

实施项：

1. 在 inspection payload 中产出统一 pane state。
2. 把 `dom-pending` 明确折算为 `pending_capture`，而不是 generic waiting。
3. 把 `weak-reply:*` 明确折算为 `weak_reply`。
4. 把 provider preload / inspect 的硬失败折算为 `hard_error`。
5. 补充最近进展时间、文本长度、fingerprint 变化等必要字段。

验收：

1. ChatGPT 抓不到稳定 latest reply 时，不会直接被混成普通 completed / waiting。
2. Gemini `Gemini 話` 这类弱文本能稳定落入 `weak_reply`。
3. inspection 结果可以独立解释每个 pane 当前处于什么阶段。

### 阶段 3：高层等待决策替换

目标：

`让自动等待真正基于 pane state 决策，而不是继续只盯 busy + usable。`

涉及文件：

- `src/renderer/discussion-auto-run.js`
- `src/renderer/renderer.js`

实施项：

1. 重写 `settleInspectionResults()` 的完成 / stalled / pending 判定口径。
2. 让 `pollRoundCompletion()` 基于统一 pane state 做等待、暂停、恢复。
3. 区分“整轮还在思考”与“某个 pane 抓取偏弱”。
4. 区分“可继续等待”与“应立刻暂停”。
5. 暂停原因细化，不再统一使用“等待超时”。

验收：

1. 1 个 `usable_reply` + 1 个 `pending_capture` + 1 个 `weak_reply` 时，系统不会把整轮错误地描述成“全部超时”。
2. `stalled` 与 `hard_error` 的暂停文案可区分。
3. `pending_capture` 会得到短窗口重试，而不是立刻失败或无限等待。

### 阶段 4：Deep 自适应等待

目标：

`最后再把等待时长变聪明，而不是先单纯调大常量。`

涉及文件：

- `src/renderer/discussion-core.js`
- `src/renderer/discussion-auto-run.js`
- `src/main/sync/stability.js`
- provider extractor 配置与参数入口

实施项：

1. 为 `Quick / Standard / Deep` 提供独立等待参数。
2. 以 `progress timeout + hard timeout` 取代单一固定总超时逻辑。
3. provider 级 busy wait / stability 跟随模式调优。
4. Deep 模式下，只要 pane 仍有进展，就继续等待。
5. Deep 模式下，若长时间无进展，仍应进入 `stalled`。

验收：

1. `Deep` 不再在旧 180 秒点粗暴暂停。
2. `Quick` 不会被无意义地拖慢。
3. 同一轮里慢 pane 仍有进展时，系统能继续等；没进展时，能及时停。

## 12. 删除与替换原则

这部分是为了防止代码继续冗余。

实现时必须遵守：

1. 新 pane state 生效后，旧的“只看 `busy + hasUsableReply`”路径应退场，不能双轨常驻。
2. 新 temporary preflight 生效后，旧的“尝试失败也照常启动”路径应删除或降为明确非严格模式。
3. 新 mode-aware waiting 生效后，旧 `AUTO_WAIT_TIMEOUT_MS = 180000` 不能继续作为所有模式唯一真理。
4. 若某旧字段仅为过渡兼容而保留，必须在代码里明确注释“兼容层”，避免下次继续叠分支。

## 13. 观测与日志要求

如果没有观测字段，这次实现后仍然会继续靠猜。

本次必须至少补齐以下信息：

1. 每个 pane 当前统一 state。
2. 最近一次有效进展时间。
3. 最近一次文本长度变化。
4. 最近一次 fingerprint 变化时间。
5. 当前正在等待的原因。
6. 当前暂停的原因。
7. temporary preflight 结果。

最低要求是：开发者能从日志里直接回答下面四个问题：

1. 它是不是还在思考。
2. 它是不是只是抓取还没稳。
3. 它是不是只抓到了弱文本。
4. 它是不是已经真的失败。

## 14. 测试矩阵

本阶段至少覆盖以下 8 组测试：

1. `Quick` + 3 pane + 普通短回复。
2. `Standard` + 3 pane + 1 个 pane 稍慢。
3. `Deep` + 3 pane + 1 个 provider 长推理。
4. ChatGPT 进入 `dom-pending`。
5. Gemini 返回弱文本。
6. Gemini temporary 激活失败。
7. 仅 2 个 pane ready 的严格临时模式。
8. 某 pane `hard_error`，其余 pane 正常。

每组测试至少要记录：

1. preflight 结果。
2. 各 pane 最终 state。
3. 整轮最终动作。
4. 控制台暂停或完成文案是否正确。

## 15. 成功标准

本任务书完成后的最低成功标准如下：

1. 系统能明确知道某 pane 是 `thinking`、`pending_capture`、`weak_reply`、`usable_reply`、`stalled` 还是 `hard_error`。
2. 严格临时模式下，temporary 失败 pane 不再被带入自动讨论。
3. 自动等待不再只有“180 秒超时”这一种解释。
4. `Deep` 模式不会因为长推理被粗暴误判。
5. 当前自动讨论主链仍保持单一路径，没有再长出第二套隐藏编排器。

## 16. 实施顺序结论

后续真正动代码时，顺序必须固定为：

1. 先做 `temporary preflight gate`
2. 再做 `统一 pane state`
3. 再替换 `高层等待决策`
4. 最后做 `Deep 自适应等待`

原因很简单：

`必须先让系统知道自己在看什么，才能决定自己应该等多久。`
