# MVP Task List, Build Order, and Acceptance Criteria

## Purpose
This document converts the product direction into an executable implementation plan for Codex.

The plan intentionally starts small:

1. ChatGPT adapter
2. Gemini adapter
3. two-agent relay flow

The objective is to get a real working chain instead of overdesigning the full platform.

---

## Stage 1 — Build ChatGPT Adapter

### Goal
Implement and verify a standalone ChatGPT adapter with the following abilities:
- bind current conversation
- create new conversation
- send message
- wait for reply completion
- capture current-round reply

### Required tasks

#### Task 1.1 — Create shared adapter base types
Implement:
- `ProviderAdapter` interface
- `ConversationBinding`
- `RoundMarker`
- `CapturedReply`
- `WaitOptions`
- `WaitResult`

Acceptance:
- base types compile cleanly
- no provider-specific logic inside base types

#### Task 1.2 — Create shared helper utilities
Implement:
- DOM query helpers
- visible element helpers
- text normalization helpers
- polling helpers
- error types

Acceptance:
- helper layer is reusable by both providers
- provider adapters can import helpers without duplication

#### Task 1.3 — Implement ChatGPT bindCurrentConversation
Acceptance:
- works when ChatGPT conversation page is already open
- returns normalized binding
- fails explicitly on wrong host/page

#### Task 1.4 — Implement ChatGPT createNewConversation
Acceptance:
- can trigger official new chat flow
- confirms the page changed into a fresh conversation state
- returns normalized binding

#### Task 1.5 — Implement ChatGPT sendMessage
Acceptance:
- injects text into input box
- sends successfully
- user message appears in thread

#### Task 1.6 — Implement ChatGPT waitForResponseComplete
Acceptance:
- does not return while response is still streaming
- returns timeout error if generation never settles

#### Task 1.7 — Implement ChatGPT captureLatestRoundReply
Acceptance:
- uses round marker boundary
- captures only reply generated after current send
- repeatable across at least two consecutive sends in same chat

#### Task 1.8 — Create simple debug harness for ChatGPT
The harness can be a small developer panel or command-triggered runner.

Minimum actions:
- bind current conversation
- new conversation
- send test message
- wait complete
- capture reply

Acceptance:
- developer can manually verify full ChatGPT flow without any relay logic

---

## Stage 2 — Build Gemini Adapter

### Goal
Reproduce the same behavior for Gemini while keeping the controller layer provider-agnostic.

### Required tasks

#### Task 2.1 — Implement Gemini bindCurrentConversation
Acceptance:
- detects valid Gemini conversation page
- returns normalized binding

#### Task 2.2 — Implement Gemini createNewConversation
Acceptance:
- triggers official new conversation flow
- confirms fresh conversation state

#### Task 2.3 — Implement Gemini sendMessage
Acceptance:
- injects and sends text correctly

#### Task 2.4 — Implement Gemini waitForResponseComplete
Acceptance:
- waits until response generation is complete
- avoids premature capture during streaming

#### Task 2.5 — Implement Gemini captureLatestRoundReply
Acceptance:
- uses round marker boundary
- captures only current-round generated reply

#### Task 2.6 — Extend debug harness to Gemini
Acceptance:
- same debug actions work for Gemini
- adapter API remains consistent with ChatGPT

---

## Stage 3 — Connect ChatGPT and Gemini into Relay Loop

### Goal
Build the smallest real multi-agent discussion flow using exactly two providers.

### Relay policy for MVP
Round 1:
- send the same user prompt to ChatGPT and Gemini independently

Round 2:
- send ChatGPT's round-1 reply to Gemini as peer input
- send Gemini's round-1 reply to ChatGPT as peer input

No auto-consensus logic yet.
No third provider yet.
No advanced summarizer yet.

### Required tasks

#### Task 3.1 — Create RelayController
Responsibilities:
- start round 1
- wait/capture both round-1 replies
- build round-2 relay payloads
- send round-2 prompts
- wait/capture both round-2 replies

Acceptance:
- controller depends only on adapter interface, not provider DOM internals

#### Task 3.2 — Define prompt templates
Templates needed:
- round-1 independent analysis prompt
- round-2 peer-review / revision prompt

Acceptance:
- templates are configurable constants, not hardcoded inline in controller logic

#### Task 3.3 — Implement relay payload builder
For two providers:
- payload for ChatGPT = Gemini's prior reply
- payload for Gemini = ChatGPT's prior reply

Acceptance:
- payload builder is separate from adapter code
- output structure is deterministic and easy to inspect in logs

#### Task 3.4 — Create minimal run flow
Example sequence:
1. bind or create both conversations
2. send round-1 prompt to both
3. wait/capture both
4. send round-2 relay prompt to both
5. wait/capture both
6. show collected outputs

Acceptance:
- full two-round loop can complete end-to-end manually

---

## Logging Requirements
Codex should include structured logs at every critical step.

Minimum log points:
- provider selected
- host verification result
- conversation bind result
- round marker created
- send action started/completed
- wait started/completed/timeout
- capture result length
- relay payload generated

Why this matters:
DOM automation failures are hard to debug without clear execution traces.

---

## Persistence Requirements for MVP
Keep persistence minimal.

Recommended stored objects:
- provider bindings
- round results
- relay payloads
- timestamps

This can be in-memory first, then optionally serialized to JSON for debugging.

Do not build a complex database layer yet.

---

## Minimal Acceptance Criteria for Entire MVP
The MVP is accepted only if all of the following are true:

1. ChatGPT adapter can be used standalone.
2. Gemini adapter can be used standalone.
3. Both adapters expose the same core interface.
4. Both adapters can create or reuse conversations.
5. Both adapters can send prompts and capture correct current-round replies.
6. The relay controller can complete two rounds across both providers.
7. Logs are sufficient to diagnose failures.

---

## Explicit Non-Goals for Codex in This Task
Do not spend time yet on:
- Claude support
- local file context pack injection flow
- advanced discussion session management
- final voting logic
- polished UI/UX
- plugin packaging/distribution
- resilience against all future provider DOM changes

The only goal is to make the core send/wait/capture/relay chain real and testable.

---

## Recommended Delivery Sequence
Codex should implement in this exact order:

1. shared adapter types and helpers
2. ChatGPT adapter
3. ChatGPT debug verification
4. Gemini adapter
5. Gemini debug verification
6. relay controller
7. end-to-end two-round test

This order minimizes wasted work and exposes DOM automation issues early.
