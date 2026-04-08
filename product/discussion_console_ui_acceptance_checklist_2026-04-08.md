# Discussion Console UI Acceptance Checklist

## Purpose
This checklist is the validation baseline for the 2026-04-08 floating workbench refinement.

It exists to stop layout work from drifting back into one-off patching.

---

## Acceptance Rule

For every scenario below, the UI is only considered acceptable if:

- the primary action remains visible
- the footer is fully readable
- the resize handle does not cover the action hotspot
- the draft area remains the visual priority
- the right rail feels intentionally compressed rather than accidentally cut off

---

## Scenario 1: Collapsed Launcher At Standard Height

### Setup
- open the app in a normal desktop-size window
- keep the discussion workbench collapsed
- leave the console in `准备开始` state

### Must Pass
- stage, mode, state, and field label read as one compact top band
- the topic input is fully visible
- the status line below the input is readable
- all three launcher actions are visible
- no launcher action is clipped by the window edge

### Must Not Happen
- launcher buttons disappear below the fold
- the input pushes the action row out of view
- the launcher needs internal scrolling

---

## Scenario 2: Collapsed Launcher At Smaller Height

### Setup
- reduce window height until the launcher is under obvious pressure
- keep the workbench collapsed

### Must Pass
- launcher still shows the primary action without clipping
- top metadata remains one row or a controlled wrap, not a broken stack
- the input remains editable
- the status line may compress, but must stay readable

### Must Not Happen
- bottom action row becomes partially hidden
- the launcher looks like a cropped panel instead of a compact tool

---

## Scenario 3: Expanded Panel Default State

### Setup
- expand the workbench
- stay in `准备开始`
- keep the right rail sections collapsed by default

### Must Pass
- header, status band, main draft area, and footer all fit without collision
- topic input is clearly the dominant element
- footer actions remain visible
- resize handle is visually separate from the primary button
- the right rail reads as a stack of summaries, not a stack of full cards

### Must Not Happen
- footer overlaps with support content
- the resize handle appears inside the primary button hotspot
- right rail sections imply hidden clipped content while collapsed

---

## Scenario 4: Expanded Panel With Multiple Rail Sections Open

### Setup
- expand `本轮指令`
- expand `参与 AI`
- expand `Draft 来源`
- optionally expand `更多操作`

### Must Pass
- the right rail becomes the first internal scroll region
- footer remains fully visible
- the draft area still feels primary
- participant chips remain readable and do not create confusing half-hidden rows

### Must Not Happen
- opening the right rail pushes the footer out of view
- participant content looks cut off without a clear affordance
- multiple open sections make the whole workbench feel broken

---

## Scenario 5: Expanded Panel At Smaller Height

### Setup
- expand the workbench
- reduce height into low-height mode

### Must Pass
- eyebrow, subtitle, and other duplicated header copy may disappear first
- status band remains readable
- footer becomes a stable two-row layout if needed
- primary action remains visible

### Must Not Happen
- low-height mode hides the primary action before hiding secondary copy
- footer buttons become inaccessible
- the right rail steals space from the footer instead of scrolling

---

## Scenario 6: Participant Summary

### Setup
- test once with zero configured panes
- test once with multiple configured panes

### Must Pass
- collapsed summary clearly communicates count
- expanded content clearly communicates who is participating
- zero-state remains understandable without extra explanation text

### Must Not Happen
- the summary line wastes width on repetitive wording
- the expanded participant row looks like clipped or missing content

---

## Review Output

When running this checklist, record:

- which scenario failed
- whether the failure was caused by height, width, content density, or interaction state
- whether the issue belongs to header, draft area, right rail, footer, or resize behavior

That keeps follow-up fixes structural rather than patchy.
