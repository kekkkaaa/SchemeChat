# Discussion Multi-Agent Acceptance Snapshot

## Purpose

This note records the current implementation acceptance judgment for the multi-agent discussion workflow as of `2026-04-10`.

It is intentionally implementation-facing.

When older concept docs still contain exploratory or superseded wording, this snapshot should be treated as the current source-of-truth for the shipped baseline.

---

## Validation Basis

This snapshot is based on:

- renderer and main-process code inspection
- prompt-builder inspection
- current workbench state and round-flow inspection
- user-verified runtime behavior during recent `2 AI` and `3 AI` discussion tests

This is not a full end-to-end regression suite.

So each status below means:

- `Accepted`: implemented and already validated in the recent working flow
- `Accepted with watch`: implemented and behaving correctly now, but still worth watching
- `Not yet accepted`: still incomplete, unstable, or not aligned enough to call done

---

## Current Accepted Baseline

### 1. Provider Runtime Compatibility
- Status: `Accepted`
- Current baseline:
  - ChatGPT uses dedicated partition + Chrome-like UA + minimal injection
  - Gemini uses Chrome-like UA + minimal injection
  - per-pane provider dropdown and supersize controls are available again in low-overhead mode
- Why this matters:
  - this is the runtime baseline that made ChatGPT / Gemini usable again inside Electron

### 2. Default Run Mode
- Status: `Accepted`
- Current baseline:
  - workbench starts in `auto` run mode by default

### 3. Round 1 Dispatch Policy
- Status: `Accepted`
- Current baseline:
  - round 1 sends only the user topic and first-round draft
  - no previous-round peer material is attached

### 4. Follow-up Round Source Policy
- Status: `Accepted with watch`
- Current baseline:
  - generated follow-up rounds are assembled per target pane at send time
  - the workbench only shows a scaffold draft for generated rounds
  - the final per-pane prompt is built in the main process
  - self-source should be excluded
  - attached material should come from the other participating AIs' previous-round replies
- Why watch:
  - this was a confirmed regression area before the recent fix
  - any future relay or prompt-builder changes could accidentally reintroduce self-source or shared-draft leakage

### 5. `2 AI` Discussion Flow
- Status: `Accepted`
- Current baseline:
  - manual and auto flows both use generated-round preparation
  - final summarizer is a single pane
  - non-summarizer stays silent in the final round

### 6. `3 AI` Discussion Flow
- Status: `Accepted with watch`
- Current baseline:
  - all three panes can participate in first and intermediate rounds
  - auto-run can progress through the configured round plan
  - final summary is emitted by one summarizer pane only
- Why watch:
  - `3 AI` relay has only recently been stabilized
  - source-filtering and extractor completeness are still the most likely places for future regressions

### 7. Summarizer Selection Policy
- Status: `Accepted`
- Current baseline:
  - manual workbench selection has highest priority
  - if no manual summarizer is chosen, system falls back to provider priority
  - default does **not** parse AI voting text
  - current fallback priority still makes ChatGPT the default in ordinary cases

### 8. Final Summary Dispatch
- Status: `Accepted`
- Current baseline:
  - final-summary round targets only the resolved summarizer pane
  - other panes do not receive the final-summary draft

### 9. Auto-Run Waiting Rule
- Status: `Accepted with watch`
- Current baseline:
  - auto-run should wait for provider completion before advancing
  - if stable capture fails, the flow should pause instead of pushing truncated material into the next round
- Why watch:
  - extractor stability is provider-DOM-sensitive
  - this remains the most fragile non-UI part of the system

### 10. Finished-State Editability
- Status: `Accepted`
- Current baseline:
  - after a discussion finishes, the workbench is still editable
  - users can directly start the next topic without getting stuck in a greyed-out finished state

---

## Current Implementation Rules To Treat As Source-of-Truth

### Rule A: No default voting

The current implementation baseline is:

- manual summarizer selection first
- otherwise system priority fallback
- no automatic vote parsing by default

If older docs mention AI voting as the ordinary default path, that wording is now outdated for V1 implementation acceptance.

### Rule B: Round 2 and later are not shared final prompts

The workbench may display one generated scaffold, but the actual send path is:

1. generate scaffold draft
2. collect round sources
3. build one prompt per target pane
4. exclude the target pane's own previous-round reply
5. inject the final pane-specific prompt

### Rule C: Current relay policy prefers previous-round replies, not heavy structured-pack forwarding

Current implementation acceptance assumes:

- round 1 = user topic / first-round draft only
- later rounds = previous-round replies from the other AIs
- current V1 should not depend on a mandatory structured material-pack relay layer to remain functional

### Rule D: Final summary is a single-speaker round

The system is currently accepted only when:

- a summarizer can be resolved
- the final-summary draft is injected only into that summarizer pane
- all other panes remain silent for that round

---

## Known Remaining Risks

### 1. Extractor completeness
- Risk:
  - provider DOM changes can still cause partial capture or unstable completion detection
- Effect:
  - next-round relay quality degrades even when flow control looks correct

### 2. Renderer size and coupling
- Risk:
  - `renderer.js` still carries too much orchestration responsibility
- Effect:
  - state regressions are harder to reason about than they should be

### 3. Concept docs still contain older exploratory wording
- Risk:
  - team members may read an old “vote / structured-pack / summary-layer-first” paragraph and assume it is the shipped behavior
- Effect:
  - implementation and documentation can drift in day-to-day discussions

---

## Recommended Next Step

The next documentation step should be:

1. keep this snapshot as the current acceptance anchor
2. gradually normalize the older root docs so they reference this shipped baseline first
3. continue shrinking renderer orchestration into clearer modules before adding more discussion complexity

---

## Acceptance Summary

Current judgment:

- `2 AI` discussion baseline: accepted
- `3 AI` auto discussion baseline: accepted with watch
- final summarizer policy (manual override, default no vote): accepted
- provider runtime compatibility baseline: accepted

The multi-agent discussion system is no longer just a prototype chain.

It now has a usable V1 baseline, with the main remaining risk concentrated in relay extraction stability and renderer maintainability.
