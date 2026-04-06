# Multi-AI Official Web Session Relay Tool — MVP Plan

## Purpose
This document defines the first practical MVP for a multi-AI round-based discussion relay system built on official web sessions rather than APIs. The immediate goal is **not** to build the full orchestration system at once. The goal is to first build stable single-site adapters, then connect two sites into a minimal relay loop.

The development scope is split into three concrete stages:

1. Build a **ChatGPT single-site adapter**.
2. Duplicate the adapter pattern for **Gemini**.
3. Connect ChatGPT and Gemini into a **2-agent round relay flow**.

This document is written as a product/development brief for implementation.

---

## Final MVP Goal
A local desktop/web tool that can:

- reuse the user's existing official web login state
- bind to a currently open conversation
- create a new conversation on demand
- send a message into that conversation
- wait until the assistant finishes responding
- capture the latest reply for the current round
- later relay another agent's reply into the same conversation

For the first integration target, the system only needs to support:

- ChatGPT
- Gemini

No API usage. No automatic scoring. No semantic planner. No vector database. No complex UI.

---

## Product Positioning
This is **not** a simple multi-chat comparer.

It is a **web-session-based message relay tool** that works on top of official AI websites and keeps long-lived conversations per provider.

The system is responsible for:

- controlling message input/output on official websites
- keeping per-provider session continuity
- extracting current-round replies
- relaying one provider's output to another provider in later rounds

The system is **not** responsible for:

- deep semantic reasoning
- automatic consensus detection
- advanced summarization
- replacing the AI's own compression and judgment ability

---

## Core Product Rules

### Rule 1: Official web accounts only
The system uses the user's already logged-in official web accounts.

### Rule 2: Long-lived conversations are first-class
Each provider can either:
- reuse the current conversation
- create a fresh conversation

### Rule 3: Manual round advancement is acceptable
The first version does not need fully automatic round progression. Human confirmation is allowed.

### Rule 4: Adapter architecture
Each provider must be wrapped by an adapter with the same core interface.

### Rule 5: Extract current-round reply, not arbitrary page text
The adapter must capture the reply produced after the current send action, not simply "whatever last message exists on the page".

---

## MVP Stage Breakdown

### Stage 1 — ChatGPT Single-Site Adapter
Build a working adapter for ChatGPT official web.

Required abilities:
- bind current conversation
- create new conversation
- send message
- detect response completion
- extract current-round reply

### Stage 2 — Gemini Single-Site Adapter
Build the same ability set for Gemini official web.

Required abilities:
- bind current conversation
- create new conversation
- send message
- detect response completion
- extract current-round reply

### Stage 3 — Two-Agent Relay Loop
Connect ChatGPT and Gemini.

Required abilities:
- send first-round prompt to both
- collect both replies
- build relay payloads
- send ChatGPT's reply to Gemini
- send Gemini's reply to ChatGPT
- collect second-round replies

This is sufficient for the first real validation.

---

## Recommended Architecture

### 1. ProviderAdapter Interface
Every provider adapter should expose the same methods.

Suggested interface:

```ts
interface ProviderAdapter {
  providerName: string;

  bindCurrentConversation(): Promise<ConversationBinding>;
  createNewConversation(): Promise<ConversationBinding>;
  getConversationIdentity(): Promise<ConversationIdentity | null>;

  sendMessage(input: string): Promise<void>;
  waitForResponseComplete(options?: WaitOptions): Promise<WaitResult>;
  captureLatestRoundReply(marker: RoundMarker): Promise<CapturedReply>;

  createRoundMarker(): Promise<RoundMarker>;
}
```

The purpose of this interface is to make ChatGPT and Gemini interchangeable from the controller layer.

---

### 2. ConversationBinding
Represents the conversation currently controlled by the adapter.

Suggested structure:

```ts
interface ConversationBinding {
  provider: "chatgpt" | "gemini";
  conversationId?: string;
  url: string;
  title?: string;
  createdAt: number;
}
```

---

### 3. RoundMarker
A round marker records the message-state boundary before a new send action.

Suggested structure:

```ts
interface RoundMarker {
  provider: string;
  timestamp: number;
  assistantMessageCountBefore: number;
  lastAssistantNodeIdBefore?: string;
  lastAssistantTextHashBefore?: string;
}
```

This is critical for extracting **newly generated content only**.

---

### 4. CapturedReply
The normalized reply extracted for the current round.

```ts
interface CapturedReply {
  provider: string;
  conversationId?: string;
  text: string;
  rawHtml?: string;
  capturedAt: number;
  messageNodeId?: string;
}
```

---

### 5. RelayController
Used only in Stage 3.

Responsibilities:
- issue round 1 prompts
- wait for both providers
- capture both outputs
- generate relay payloads
- issue round 2 prompts
- capture round 2 outputs

---

## Initial UX Scope
Keep the UI minimal.

One simple panel is enough.

Per provider card:
- Bind Current Conversation
- New Conversation
- Send Test Message
- Capture Latest Reply
- Status display

Global actions:
- Start Round 1
- Capture Both Replies
- Start Round 2 Relay

The goal is debugging and validation, not polished product UI.

---

## Non-Goals for This Phase
Do not build these yet:

- automatic consensus engine
- automatic multi-round stop condition
- vector retrieval
- complex local file context management
- multi-provider voting system
- semantic summarizer
- browser extension marketplace packaging
- complex persistence layer

---

## Definition of Success
The MVP is considered successful if:

1. ChatGPT adapter works end-to-end.
2. Gemini adapter works end-to-end.
3. Both can reuse or create conversations.
4. Both can send a prompt and capture the correct current-round reply.
5. A controller can relay one provider's reply into the other provider.
6. The system can complete two discussion rounds across ChatGPT and Gemini.

---

## Engineering Priorities
Priority order must be:

1. reliability of send/capture flow
2. correctness of round boundary tracking
3. provider abstraction consistency
4. only then minimal orchestration

Do not optimize UI before adapters are stable.

---

## Delivery Strategy
Implementation should be committed in this order:

1. shared adapter abstractions and utilities
2. ChatGPT adapter
3. Gemini adapter
4. two-agent relay controller
5. simple debug UI

This order reduces risk and keeps validation tight.
