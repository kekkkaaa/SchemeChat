# SchemeChat / PolyGPT Project Context and Grok Sync Analysis

This document is meant to be pasted into other AI tools so they can analyze the project, the current sync architecture, the Grok-related implementation, and the Grok sync failure history.

Important context:

1. The user has already reverted all experimental sync and Grok patches from earlier attempts.
2. So this document combines:
   - the current real repository state
   - the real failure history observed during previous attempts
3. In other words, the current code does not contain the reverted Grok sync experiments, but those past failures still matter for analysis.

---

## 1. What this project is

This is an Electron desktop app. The package name is `polygpt` and the current version is `0.2.8`.

It is not using official model APIs. Instead, it works like this:

1. It opens real AI provider web pages inside Electron.
2. The user types once in a shared bottom input box.
3. The app mirrors that text into each provider page input.
4. When the user clicks Send, the app triggers each provider page's own send action.
5. For sync, the app tries to inspect the DOM of each provider page, extract the latest assistant reply, and inject discussion text into the other pane input.

So this is basically a multi-provider web-wrapper desktop app, not a backend proxy and not a local inference app.

---

## 2. Current tech stack

### Base stack

- Electron `^31.0.0`
- electron-builder `^24.9.1`
- electron-updater `^6.7.3`
- Node.js with CommonJS modules
- Local JSON config files

### Runtime model

The app follows a standard Electron split:

1. Main process
   - window creation
   - pane management
   - IPC handlers
   - sync logic

2. Renderer process
   - top bar UI
   - bottom control bar UI
   - settings modal UI

3. Preload scripts
   - one preload per provider
   - DOM automation for provider input / submit / new chat

### Not present in the project

The current repo does not have:

- a custom backend service
- a database
- official provider API integration
- a dedicated automated test suite for sync
- DOM extraction regression tests

This is a DOM-automation Electron app, so provider page changes are always a major risk.

---

## 3. Root structure and important directories

Main items in the repo root:

- `package.json`
- `package-lock.json`
- `README.md`
- `BUILD.md`
- `start-windows.cmd`
- `local_agent_gateway_taskbook.md`
- `assets/`
- `config/`
- `product/`
- `src/`

Important directories:

### `src/`

Main application code:

- `src/main/`
  - Electron main process
- `src/preload/`
  - provider-specific preload scripts
- `src/renderer/`
  - app-owned UI views
- `src/utils/`
  - small utilities

### `config/`

Configuration files:

- `selectors.json`
  - provider input / submit / new-chat selectors
- `window-layout.json`
  - persisted pane layout
- `settings-window.json`
  - persisted settings modal size

### `product/`

Product documents. Some product docs showed mojibake when viewed through the current terminal output path, so they are not a reliable source for direct copy/paste analysis from terminal alone.

---

## 4. Real runtime architecture

### Main window structure

The main window is not one normal page. It is built from multiple `WebContentsView` instances:

1. one top bar view
2. multiple provider pane views
3. one bottom control bar view

Main file:

- `src/main/window-manager.js`

The middle area contains the actual provider websites. The top and bottom bars are app-owned HTML.

### Provider pages are embedded as Electron WebContentsView

This gives the app several useful abilities:

1. inject preload scripts
2. collect provider console logs
3. run `executeJavaScript` inside the provider page
4. inspect the provider DOM directly

But it also makes the app fragile:

1. provider DOM changes can break features
2. each provider may need special handling
3. sync reliability depends on page structure that the app does not control

---

## 5. What `package.json` tells us

File:

- `package.json`

Important values:

- app name: `polygpt`
- version: `0.2.8`
- main entry: `src/main/index.js`
- `start`: `electron .`
- `dev`: `electron . --dev`
- `build`: `electron-builder`

Current description string:

- `Mirror text to ChatGPT and Gemini simultaneously`

This is important because it shows the product and codebase have evolved beyond the old 2-provider model, but several strings and assumptions still reflect the older ChatGPT/Gemini-only design.

---

## 6. Current supported providers

File:

- `src/main/window-manager.js`

Current provider list:

1. `chatgpt`
2. `gemini`
3. `perplexity`
4. `claude`
5. `grok`

Current URLs:

- ChatGPT: `https://chat.openai.com`
- Gemini: `https://gemini.google.com`
- Perplexity: `https://www.perplexity.ai`
- Claude: `https://claude.ai`
- Grok: `https://x.com/i/grok`

Relevant code:

- `src/main/window-manager.js:43`

### Important Grok-specific detail

Grok uses its own persistent Electron session partition:

- `persist:grok`

Other providers use:

- `persist:shared`

Relevant code:

- `src/main/window-manager.js:447-450`

This means Grok login/session state is intentionally isolated from the other providers.

---

## 7. Current UI and feature state

### Bottom control bar

Files:

- `src/renderer/index.html`
- `src/renderer/renderer.js`

Current controls:

1. shared text input
2. character count
3. `New Chat`
4. `Sync`
5. `Send`
6. `Refresh`
7. zoom out
8. zoom in

The input placeholder still says:

- `Type here to mirror to ChatGPT and Gemini...`

That is another sign that some product/UI text is still based on the older 2-provider mental model.

### Settings modal

Files:

- `src/renderer/settings-modal.html`
- `src/main/window-manager.js`

The settings modal allows:

1. changing pane count
2. changing layout mode
3. previewing the layout

The UI even says:

- `No hard cap in code`

This matters because the layout system is already designed for multiple panes, but sync is not.

---

## 8. Current main-process responsibilities

File:

- `src/main/index.js`

This file handles:

1. Electron app lifecycle
2. permissions
3. window creation
4. IPC registration
5. sync entry point

### The most important sync entry today

Relevant code:

- `src/main/index.js:142-190`

The current `sync-latest-round` behavior is:

1. get all pane entries
2. if pane count is not exactly 2, fail immediately
3. capture stable latest reply from left pane and right pane
4. if either provider is still replying, fail
5. if either provider has no latest reply, fail
6. otherwise inject each side's latest reply into the opposite side input box
7. do not auto-send

This is the single most important current-state fact:

## Current sync only supports exactly 2 panes

That is not a guess. It is hardcoded.

The current code explicitly returns:

- `Sync currently supports exactly 2 panes.`

So although the layout system supports multiple panes, the sync system does not.

---

## 9. Current sync design

Files:

- `src/main/index.js`
- `src/main/provider-sync.js`

### What sync currently does

Current sync does not auto-submit messages. It only:

1. reads the latest assistant reply from each pane
2. builds a discussion prompt from that reply
3. injects that text into the other pane input

### Current data flow

The flow is:

1. user clicks `Sync`
2. `renderer.js` calls IPC `sync-latest-round`
3. main process calls `captureStableLatestReply(view)`
4. `provider-sync.js` runs DOM inspection inside the provider page with `executeJavaScript`
5. it returns `latestReplyText`
6. main process wraps the text using `buildDiscussionPrompt(...)`
7. main process sends `inject-sync-text` to the preload script
8. preload writes that text into the provider page input

### Current stability strategy

`provider-sync.js` currently uses:

- `POLL_INTERVAL_MS = 900`
- `STABLE_POLLS_REQUIRED = 1`
- `STABLE_TIMEOUT_MS = 8000`

Relevant code:

- `src/main/provider-sync.js:1-3`

That means the stability check is relatively light. It can work for providers where one final reply becomes stable as one block, but it is likely too weak for providers that stream, split, or append content across multiple DOM segments.

---

## 10. Current real state of `provider-sync.js`

File:

- `src/main/provider-sync.js`

This is one of the most important files for outside analysis.

### Current support is only ChatGPT and Gemini

The current `PROVIDER_SYNC_SPECS` contains only:

1. `chatgpt`
2. `gemini`

Relevant code:

- `src/main/provider-sync.js:5-53`

There is no current `grok` entry.

That means:

## In the current official repo state, Grok is not actually supported by sync extraction yet

This is extremely important because the user's recent Grok truncation issue happened during previous experiments that were later reverted.

So outside analysis must separate:

1. current repo state
2. reverted failure history

### Current extraction model

The current DOM inspection logic roughly does this:

1. find assistant message root nodes using provider selectors
2. filter visible nodes
3. for each assistant node, find content candidates
4. choose the longest text among the content candidates
5. deduplicate
6. take the last reply as the latest reply

Relevant code:

- `src/main/provider-sync.js:61-188`

This design contains a very important assumption:

## One logical assistant reply can be represented by one "best" text block

That assumption may be okay for some pages, but it is very likely wrong for Grok.

### Encoding problem inside `buildDiscussionPrompt`

At the end of `provider-sync.js`, the prompt-building strings are visibly mojibake in the current file content when inspected in the current environment.

That strongly suggests at least one of these problems:

1. source file encoding corruption
2. bad text introduced during previous edits
3. mismatch between file encoding and current terminal decoding

Regardless of root cause, this means:

## The prompt-building layer itself should be treated as suspect and in need of cleanup

That file is both a logic hotspot and an encoding-risk hotspot.

---

## 11. How Grok is currently implemented

### Grok provider registration

File:

- `src/main/window-manager.js`

Grok configuration includes:

1. URL `https://x.com/i/grok`
2. preload `grok-preload.js`
3. custom user agent
4. dedicated `persist:grok` partition

Relevant code:

- `src/main/window-manager.js:68-73`
- `src/main/window-manager.js:447-450`

### Grok selectors

File:

- `config/selectors.json`

Current Grok input selectors:

- `[data-testid='Grok_Compose_Textarea_ID']`
- `div[role='textbox'][contenteditable='true']`
- `textarea`

Current Grok submit selectors:

- `[data-testid='Grok_Compose_Send_Button']`
- `button[aria-label*='Send']`
- `button[type='submit']`

Current Grok new-chat selectors:

- `a[href='/i/grok']`
- `button[aria-label*='New chat']`

These selectors are primarily for input and sending, not for reply extraction.

### Grok preload

File:

- `src/preload/grok-preload.js`

What Grok preload currently does:

1. find the Grok input element
2. inject text into the page input
3. dispatch `input`, `change`, and `keyup`
4. reuse shared submit logic
5. reuse shared new-chat logic

Relevant code:

- `src/preload/grok-preload.js:21-64`
- `src/preload/grok-preload.js:66-95`

### Shared preload utility layer

File:

- `src/preload/shared-preload-utils.js`

Shared preload responsibilities:

1. load `selectors.json`
2. find elements by selector lists
3. submit handling
4. shared IPC listeners
5. input scanning
6. provider dropdown injection
7. supersize button injection
8. top-inset handling so provider page headers are not fully covered

Important design fact:

## Preload is the input automation layer, not the reply extraction layer

Reply extraction currently belongs to `provider-sync.js`, not to provider preload files.

---

## 12. Major current design mismatches

These are important because they explain why the project feels increasingly inconsistent.

### Layout supports many panes, sync supports only 2

Current situation:

1. settings can increase pane count
2. layout code supports many panes
3. provider switching supports many panes
4. sync hardcodes `paneEntries.length !== 2`

So:

## display architecture and sync architecture are currently out of sync

### App supports 5 providers, sync extraction supports only 2

Current situation:

1. window manager supports 5 providers
2. preloads exist for all of them
3. `provider-sync.js` supports only ChatGPT and Gemini

So:

## sending capability and reply-reading capability are asymmetric

### UI and wording still reflect the older 2-provider design

Examples:

1. `package.json` description still says ChatGPT and Gemini
2. input placeholder still says ChatGPT and Gemini
3. sync logic and wording still assume "both sides"

### Some files show encoding/mojibake issues

Observed areas:

1. `src/main/provider-sync.js`
2. `src/renderer/index.html` icon text
3. `src/preload/shared-preload-utils.js` icon text
4. some `product/` docs when viewed through the current terminal path

So:

## the repository currently has at least some encoding hygiene problems

### There is no automated sync regression protection

The repo currently has no visible:

- `test/` folder
- sync unit tests
- provider DOM extraction tests
- cross-provider regression harness

That makes provider-specific breakage much easier.

---

## 13. The actual Grok problem history

This section is not describing current code. It describes the recent real failure history that happened before the user reverted the experimental changes.

### Intended feature goal

The user's desired sync behavior was:

1. support `2 panes and above`
2. when Sync is clicked, each pane should receive the latest replies from the other panes
3. inject only, do not auto-send
4. wait until all panes finish replying before sync

### What went wrong during Grok-related sync attempts

During earlier attempts to extend sync and add Grok support, the user repeatedly saw this pattern:

1. Grok's real reply in the page was long and multi-paragraph
2. but the sync-injected text captured only a short fragment
3. the fragment was usually just one paragraph from the full Grok answer

Examples of the short captured fragments included:

- only the "definition is vague" section
- only the "rigid priority" section
- only the "cannot handle logical conflicts" section

But the user's pasted full Grok replies included many sections, such as:

1. the Three Laws summary
2. logical conflict problem
3. vague definitions
4. inability to handle complex ethics
5. malicious human exploitation
6. limits for modern AI
7. summary / conclusion

So the failure pattern was not "empty result".

It was:

## a partial fragment was captured instead of the full latest Grok reply

### User confirmed Grok can manually copy the full reply

The user described Grok's UI behavior:

1. clicking the copy button opens two small options
2. one is `Copy text`
3. one is `Copy markdown`

This is a very important clue, because it means:

## Grok itself already has a notion of the full reply as one exportable unit

That suggests a future design might not need to rely only on guessed DOM aggregation.

---

## 14. Important observed debug evidence from previous attempts

### Grok debug logs showed no reliable response roots

During earlier Grok debugging, logs like this appeared:

```json
{
  "provider": "grok",
  "responseRootCount": 0,
  "fallbackResponseCount": 0,
  "groupedResponseCount": 0,
  "latestReplyLength": 82,
  "latestReplyPreview": "...",
  "candidates": []
}
```

and:

```json
{
  "provider": "grok",
  "responseRootCount": 0,
  "fallbackResponseCount": 0,
  "groupedResponseCount": 0,
  "latestReplyLength": 52,
  "latestReplyPreview": "...",
  "candidates": []
}
```

That strongly suggests:

1. the assumed Grok message container selectors were not correct in the user's actual session/page
2. the final extracted text was probably coming from a weak fallback path
3. that fallback path was probably picking one visible text block, not reconstructing the whole logical answer

### Gemini also sometimes appeared to keep spinning

The user also observed Gemini sometimes "kept spinning".

However, the available logs mainly showed:

1. CSP warnings
2. blocked ad/tracking requests
3. slow-network warnings

There is currently not enough evidence to conclude:

## the Gemini spinning problem was directly caused by sync changes

That should be treated as a separate or still-unconfirmed symptom.

---

## 15. Most likely technical explanation for the Grok truncation

This is not a proven final answer, but it is the strongest current hypothesis.

### Current repo state fact

In the current official code state, Grok does not yet have a real sync extractor.

That is important because outside analysis should not assume that Grok already has a stable extractor in the repo.

### High-probability failure mode from the reverted attempts

The failure pattern strongly suggests that the problem was not "no message exists", but:

## one logical Grok answer is probably rendered as multiple DOM blocks or segments

Possible reasons:

1. multiple sibling content blocks
2. multiple markdown sections
3. lazy rendering or virtualization
4. different DOM nodes for headings, bullets, summary, and body
5. a single answer represented by multiple rendered nodes

### Why the current general extraction model is a poor fit for Grok

The current extraction idea is basically:

1. find assistant nodes
2. for each one, find candidate content nodes
3. choose the longest candidate
4. take the last reply

That can fail badly if Grok does any of the following:

1. stores one answer in multiple blocks
2. uses a message wrapper that does not match expected assistant selectors
3. puts only part of the answer in the longest block
4. uses a last node that is not the whole answer

So the likely root issue is:

## the "longest content block equals full latest reply" assumption is wrong for Grok

### Why the copy action is promising

The user has already seen:

1. `Copy text`
2. `Copy markdown`

That means there are at least two plausible future directions:

#### Option A: build a better DOM-based Grok extractor

Pros:

1. no UI clicking dependency
2. conceptually cleaner
3. can stay inside the DOM inspection model

Cons:

1. highly dependent on Grok DOM structure
2. probably needs provider-specific logic, not generic "pick longest node"
3. may break easily after page updates

#### Option B: use Grok's own copy affordance

Pros:

1. the page already knows what the full answer is
2. copied content may match the user-visible final answer more closely
3. avoids some DOM guessing

Cons:

1. requires interacting with copy UI
2. may require clipboard workflow or button targeting
3. may need to choose between `Copy text` and `Copy markdown`

Based on the observed failures, Option B deserves serious consideration.

---

## 16. Files that outside AI should inspect first

### `src/main/index.js`

Why it matters:

1. sync entry point
2. hardcoded exactly-2-pane limitation
3. inject-only behavior
4. failure messages

Important region:

- `src/main/index.js:142-190`

### `src/main/provider-sync.js`

Why it matters:

1. current extraction architecture
2. only ChatGPT/Gemini support
3. longest-block assumption
4. stability polling
5. encoded prompt text issues
6. strong candidate for refactor

Important regions:

- `src/main/provider-sync.js:5-53`
- `src/main/provider-sync.js:61-188`
- `src/main/provider-sync.js:226` onward

### `src/main/window-manager.js`

Why it matters:

1. overall pane architecture
2. provider registry
3. dedicated Grok partition
4. console log collection from pane web contents
5. layout already supports many panes

Important regions:

- `src/main/window-manager.js:43-74`
- `src/main/window-manager.js:439-459`
- `src/main/window-manager.js:581-599`

### `config/selectors.json`

Why it matters:

1. Grok input selectors
2. Grok submit selectors
3. Grok new-chat selectors

Important note:

These selectors support input automation, not latest-reply extraction.

### `src/preload/grok-preload.js`

Why it matters:

1. current Grok input injection path
2. current separation between input automation and reply extraction
3. possible future place for copy-based behavior, if needed

### `src/preload/shared-preload-utils.js`

Why it matters:

1. shared preload abstraction
2. current input / submit IPC model
3. likely reuse point if provider automation is refactored

---

## 17. Main technical debt areas

These are important because the user is worried that the code keeps getting longer and more fragile.

### `provider-sync.js` is becoming a likely bloat hotspot

Right now it already mixes:

1. provider sync specs
2. DOM extraction logic
3. stability polling
4. prompt building

If more special cases are added there for each provider, the file will become harder and harder to maintain.

### Missing provider-specific reply extractor layer

A cleaner future direction may be something like:

1. `sync-extractors/chatgpt.js`
2. `sync-extractors/gemini.js`
3. `sync-extractors/grok.js`

That would be much cleaner than putting every provider's DOM quirks into one file.

### Product capability and sync capability are not aligned

Current project state already has:

1. multi-pane layout support
2. multi-provider support
3. provider switching

But sync is still based on a strict 2-pane model.

So even without Grok, sync architecture is already behind the rest of the app.

### Encoding hygiene is poor

Some files already show mojibake symptoms. If refactoring continues on top of that without cleanup, maintainability will get worse.

### No automated protection

Because there are no DOM/sync tests, the team is forced into manual trial-and-error for provider breakage.

---

## 18. The key questions outside AI should answer

If this document is given to other AI tools, these are the most useful questions to answer.

### Architecture questions

1. Should the current sync architecture be rewritten instead of patched further?
2. Should `provider-sync.js` be split? If yes, how?
3. How should the project unify multi-pane layout and multi-pane sync?

### Grok-specific questions

1. Why is Grok likely returning only a partial fragment instead of the full reply?
2. Is the "pick the longest block" strategy fundamentally wrong for Grok?
3. Should the app use DOM aggregation or Grok's own `Copy text` / `Copy markdown` flow?

### Multi-pane sync design questions

The desired end state is:

1. support `2 panes and above`
2. every pane receives the latest replies from other panes
3. inject only, do not auto-send
4. wait until all panes finish generating

Outside AI should propose:

1. a clear data model for N-pane sync
2. a module structure that does not keep bloating one file
3. failure handling and logging strategy
4. provider-specific fallback rules

### Maintainability questions

1. which files should be split first
2. whether encoding cleanup should happen before logic refactor
3. whether the team should first redesign sync, then add Grok, rather than the other way around

---

## 19. My current overall judgment

This is my current synthesis based on the actual repo and the observed failure history.

### Current code reality

The current codebase is not "Grok sync exists but is broken".

It is:

1. current official repo state does not yet include a real Grok sync extractor
2. previous attempts tried to add one
3. those attempts were reverted because the extraction approach was not working

### Most likely failure direction in the reverted attempts

The strongest current explanation is a combination of:

1. wrong assumptions about Grok's message DOM
2. a generic extraction model that expects one answer to map cleanly to one best text node
3. a "last node" heuristic that may not represent the whole final answer
4. too much responsibility accumulating in `provider-sync.js`

### What probably should not happen next

It is probably a bad idea to:

1. keep adding more and more Grok-specific hacks into the current `provider-sync.js`
2. continue patching sync without first defining the N-pane sync model
3. keep building on top of files with existing encoding problems

### More promising direction

A better direction is probably:

1. redesign sync around an N-pane model first
2. split provider reply extraction by provider
3. design a Grok-specific extractor
4. seriously evaluate DOM aggregation vs copy-based extraction
5. clean encoding / wording / structural issues instead of just adding more patch logic

---

## 20. Ready-to-paste request for another AI

This block can be pasted directly into another AI tool together with this document:

```text
Please analyze this Electron multi-provider AI desktop app and tell me whether the current sync architecture should be rewritten instead of patched.

Please focus on these questions:

1. Should sync be redesigned from "exactly 2 panes" to "2 panes and above" at the architecture level first?
2. Should provider-sync.js be split? If yes, what module structure would you recommend?
3. Why would Grok likely capture only one paragraph fragment instead of the full latest reply?
4. For Grok, should the app keep using DOM-based reply extraction, or should it leverage Grok's own Copy text / Copy markdown UI?
5. Please propose a concrete implementation direction that avoids making provider-sync.js longer and longer.
6. If you think refactoring should happen before adding Grok sync again, please explain the order clearly.

Constraints:

- The user already reverted all previous experimental code changes
- The current official repo only supports sync for exactly 2 panes
- The current provider-sync.js only supports ChatGPT and Gemini latest-reply extraction
- The desired behavior is inject-only, not auto-send
- The user does not want provider-sync.js to keep growing without structure
```

---

## 21. Key file list

Files worth reading first:

- `package.json`
- `src/main/index.js`
- `src/main/provider-sync.js`
- `src/main/window-manager.js`
- `config/selectors.json`
- `src/preload/grok-preload.js`
- `src/preload/shared-preload-utils.js`
- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/renderer/settings-modal.html`

---

## 22. One-sentence summary

This project is currently a WebContentsView-based Electron wrapper around multiple AI websites; its layout architecture already supports many panes, but its sync architecture is still locked to exactly two panes, and the earlier Grok truncation failures were most likely caused by trying to apply a generic "longest block + last node" reply-extraction model to a provider whose full answer is rendered across multiple DOM segments.
