# ChatGPT and Gemini Adapter Specification

## Purpose
This document explains exactly what Codex should implement for the first two provider adapters:

- ChatGPT adapter
- Gemini adapter

The adapters are the foundation of the entire system. They must be implemented first and verified independently before any multi-agent relay logic is added.

---

## Implementation Goal
For each provider, implement these five capabilities:

1. bind current conversation
2. create new conversation
3. send message
4. wait for reply completion
5. capture current-round reply

The adapter layer must hide provider-specific DOM details from upper layers.

---

## Shared Design Principles

### Principle 0: Provider compatibility should be centralized
For embedded web providers, runtime compatibility drift is expected.

Therefore, each provider should have a small compatibility profile that defines:
- session partition
- user-agent strategy
- waiting / error heuristics when needed

Current V1 policy:
- ChatGPT: dedicated partition + Chrome-like UA + minimal page injection
- Gemini: Chrome-like UA + minimal page injection
- Other providers: keep standard profile unless a real compatibility issue is observed

Maintenance note:
- ChatGPT should prefer a dedicated persistent partition so its site state does not share pollution with other providers
- when migrating from a shared partition, prefer copying auth cookies into the dedicated partition first
- routine recovery should prefer clearing non-cookie site storage while preserving auth cookies where possible
- hard reset that removes cookies should be treated as a last resort, not a normal user-facing action

This keeps performance fixes out of business logic and avoids scattering provider-specific runtime patches across the app.

### Principle 1: Do not hardcode business logic into adapters
Adapters should only know how to operate the website.

They should not know about:
- multi-agent debate policy
- round summaries
- consensus rules
- prompt semantics

### Principle 2: Prefer boundary-based capture over naive last-message capture
Before sending a new message, create a round marker.
After the assistant finishes responding, extract only the assistant content created after that marker.

### Principle 3: Provider-specific selectors must be isolated
All CSS selectors / DOM heuristics must be localized in each adapter implementation.
Do not spread provider DOM logic across controller code.

### Principle 4: Every action must have explicit failure states
For example:
- input not found
- send button not found
- generation never finished
- latest reply empty
- new conversation not confirmed

The adapter should return clear errors instead of silently guessing.

---

## Shared Adapter Contract

Suggested methods:

```ts
interface ProviderAdapter {
  providerName: string;

  bindCurrentConversation(): Promise<ConversationBinding>;
  createNewConversation(): Promise<ConversationBinding>;
  getConversationIdentity(): Promise<ConversationIdentity | null>;

  createRoundMarker(): Promise<RoundMarker>;
  sendMessage(text: string): Promise<void>;
  waitForResponseComplete(options?: WaitOptions): Promise<WaitResult>;
  captureLatestRoundReply(marker: RoundMarker): Promise<CapturedReply>;
}
```

---

## ChatGPT Adapter — Functional Requirements

### A. Bind Current Conversation
Behavior:
- assume the user already has a ChatGPT conversation page open
- inspect current URL and page state
- determine whether the page is a valid conversation page
- produce a `ConversationBinding`

Minimum requirements:
- store current URL
- try to infer conversation identity from URL/path if possible
- record provider = `chatgpt`

Failure conditions:
- page not loaded
- wrong host
- conversation surface not detected

---

### B. Create New Conversation
Behavior:
- locate the official new-chat entry point
- trigger it
- wait until a fresh conversation state is established
- confirm that the conversation changed

Success signals can include one or more:
- URL changed to a new conversation route
- conversation id changed
- message thread became empty/new
- visible new-chat state detected

Failure conditions:
- button not found
- click failed
- state never changed

Important:
Do not assume one DOM path forever. Build the logic so selectors can be updated centrally.

---

### C. Send Message
Behavior:
- locate the active input box
- inject the provided text
- dispatch the correct input/change events if needed
- locate and trigger send action

Requirements:
- must support multiline text
- must verify the text actually appeared in the input before sending
- should avoid sending empty messages

Failure conditions:
- input missing
- input not editable
- send control unavailable

---

### D. Wait for Reply Completion
Behavior:
- after send, poll the page until assistant generation is complete

Completion heuristics may include:
- stop button disappears
- streaming indicator disappears
- message text stops changing for a stable interval
- known assistant busy state clears

Recommended strategy:
- use a multi-signal completion rule instead of a single fragile signal
- set timeout and return explicit timeout error if needed

Suggested options:

```ts
interface WaitOptions {
  timeoutMs?: number;
  stableMs?: number;
  pollIntervalMs?: number;
}
```

---

### E. Capture Current-Round Reply
Behavior:
- compare current assistant messages against the `RoundMarker`
- identify assistant content created after the current send
- return normalized text

Acceptable capture strategy:
1. count assistant messages before send
2. after generation completes, get all assistant messages
3. select newly added assistant node(s)
4. merge text if the provider splits output across multiple assistant blocks

Do not simply return the very last page block without comparing to marker state.

---

## Gemini Adapter — Functional Requirements

Gemini adapter must implement the same five capabilities as ChatGPT.
The controller layer should not need provider-specific logic.

### A. Bind Current Conversation
Same requirement pattern:
- verify Gemini host/page
- identify conversation state
- produce normalized `ConversationBinding`

### B. Create New Conversation
Same requirement pattern:
- locate new chat/new conversation action
- trigger it
- wait for confirmed fresh conversation state

### C. Send Message
Same requirement pattern:
- locate active prompt input
- insert text
- trigger send

### D. Wait for Reply Completion
Same requirement pattern:
- detect streaming/generation complete
- use timeout and stable-content fallback

### E. Capture Current-Round Reply
Same requirement pattern:
- use round marker
- capture only newly produced assistant content

---

## Shared Utilities Codex Should Build

### 1. DOM Query Helpers
Utilities for:
- safe querySelector
- safe querySelectorAll
- visible element filtering
- clickable element detection
- editable input detection

### 2. Text Extraction Helpers
Utilities for:
- extracting normalized visible text
- trimming repeated whitespace
- preserving paragraph breaks where possible
- hashing message text for boundary comparison

### 3. Polling Helpers
Utilities for:
- polling until condition true
- timeout handling
- stable-value detection

### 4. Error Types
Suggested typed errors:
- `AdapterHostMismatchError`
- `ConversationBindError`
- `NewConversationError`
- `InputNotFoundError`
- `SendMessageError`
- `ResponseTimeoutError`
- `CaptureReplyError`

These make debugging much easier.

---

## Suggested Internal File Layout
This is one recommended direction. Codex may adjust naming, but the separation of responsibilities should remain clear.

```text
/src
  /adapters
    /base
      ProviderAdapter.ts
      adapterTypes.ts
      adapterErrors.ts
      domUtils.ts
      pollingUtils.ts
      textUtils.ts
    ChatGPTAdapter.ts
    GeminiAdapter.ts
```

---

## Adapter Verification Checklist
Each adapter must pass these tests manually or through a debug harness.

### Test 1 — Bind current conversation
- open a valid conversation
- call bind
- confirm provider and URL are recorded

### Test 2 — Create new conversation
- call new conversation
- confirm the page actually changed into a fresh conversation

### Test 3 — Send message
- send a short test prompt
- verify it appears in the page as a user message

### Test 4 — Wait complete
- verify the adapter does not capture too early while response is streaming

### Test 5 — Capture reply
- verify returned text matches the newly generated assistant reply
- verify old replies are not accidentally returned

### Test 6 — Repeatability
- run send -> wait -> capture twice in the same conversation
- confirm second capture is only the second-round reply

---

## Important Warning for Codex
The riskiest engineering bug in this project is **wrong round boundary capture**.

If the adapter cannot reliably tell which assistant content belongs to the current send action, the whole later relay system becomes unreliable.

Therefore Codex should optimize for:
- traceable marker creation
- explicit capture boundaries
- debuggable adapter logs

Do not prematurely optimize provider coverage before this is stable.
