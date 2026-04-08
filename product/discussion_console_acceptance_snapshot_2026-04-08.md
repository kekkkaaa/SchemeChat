# Discussion Console Acceptance Snapshot

## Purpose
This note records the current acceptance judgment after the 2026-04-08 refinement pass.

Unlike the checklist, this document captures the current result, not just the target.

---

## Validation Scope

This snapshot is based on:

- renderer structure inspection
- layout and responsive CSS inspection
- startup validation via `npm run dev`
- renderer syntax validation

This snapshot is **not** a full screenshot-by-screenshot visual QA pass.

So the statuses below mean:

- `Code-pass`: implementation appears aligned in code and startup behavior
- `Code-pass, visual check pending`: likely correct in code, but still worth checking in the live UI
- `Watch`: structurally improved, but still the most likely place future regressions could reappear

---

## Scenario Status

### 1. Collapsed Launcher At Standard Height
- Status: `Code-pass`
- Reason:
  - launcher metadata is compressed into a single top band
  - launcher status moved under the input instead of taking a full extra row
  - launcher height is explicitly increased to reduce button clipping risk

### 2. Collapsed Launcher At Smaller Height
- Status: `Code-pass, visual check pending`
- Reason:
  - low-height rules compress launcher spacing and input height
  - launcher remains structured as a compact tool instead of a stacked panel
- Remaining uncertainty:
  - this still deserves one real small-height visual check because launcher failure is usually about final pixel pressure, not logic

### 3. Expanded Panel Default State
- Status: `Code-pass`
- Reason:
  - left-main / right-support split is now stable
  - right rail defaults to collapsed summaries instead of full cards
  - footer actions and resize handle occupy separate zones

### 4. Expanded Panel With Multiple Rail Sections Open
- Status: `Code-pass, visual check pending`
- Reason:
  - right rail is the first scroll region
  - participant area, draft sources, and more-actions are all progressive disclosure blocks
- Remaining uncertainty:
  - the final visual feel with several sections open together still benefits from a live resize-and-open pass

### 5. Expanded Panel At Smaller Height
- Status: `Code-pass`
- Reason:
  - low-height mode now hides eyebrow, subtitle, and goal before sacrificing footer visibility
  - footer can move into a stable two-row layout
  - right rail remains scrollable instead of pushing the footer away

### 6. Participant Summary
- Status: `Watch`
- Reason:
  - the old always-open participant card is gone
  - summary now communicates count first and participant preview second
  - detailed chips only appear when expanded
- Why still watch:
  - this area was a confirmed pain point during the refinement
  - if future content density grows, this is still one of the first places likely to feel tight again

---

## Current Wins

- launcher no longer wastes a dedicated bottom row on status
- footer and resize handle no longer compete for the same hotspot
- right rail now behaves like a summary rail instead of a stack of full cards
- participant information is compressed by default instead of permanently occupying height
- low-height behavior now removes duplicate copy before sacrificing actions
- footer wording is calmer and less noisy than earlier iterations

---

## Current Risks

- final polish still depends on one live visual pass, especially at smaller window heights
- the participant summary remains the most regression-prone right-rail section
- if more right-rail modules are added later, the summary-first rule must remain enforced or the rail will bloat again

---

## Recommended Next Step

If work continues, the next step should not be another structural rewrite.

It should be a short live QA pass against the acceptance checklist, then only fix what fails that pass.
