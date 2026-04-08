# Floating Discussion Console Layout Update

## Status
Implemented on 2026-04-08, then refined again on 2026-04-08 after reviewing the expanded workbench in real use.

This document records the layout decision after the first floating-panel version exposed new overflow problems.

---

## What V2 Solved

The earlier update successfully replaced the old full-width bottom discussion bar.

That solved three important problems:

- chat panes kept full available height under the top bar
- the bottom provider was no longer permanently compressed
- advanced discussion editing moved into a floating panel instead of a fixed bottom slab

The launcher + floating panel model remains correct and should not be rolled back.

---

## What V2 Did Not Solve

Real usage exposed a second-order problem:

- the right support column can grow faster than the panel height allows
- the footer action row is still vulnerable to being visually crowded
- the bottom-right resize handle competes with the primary action area
- the panel still carries duplicated status text across title, status band, and support content

In other words:

- pane obstruction was reduced
- workbench self-obstruction was not fully solved

---

## New Design Direction

The refreshed direction is now explicitly:

- **Notion** for visual tone
  - warm light surfaces
  - thin borders
  - quiet shadows
  - one clear blue primary action
- **Cal.com** for layout discipline
  - compact structure
  - clean card boundaries
  - less decorative explanation text
  - stronger separation between work area and tool area
- **Linear** for information density
  - thinner status treatment
  - denser chips and metadata
  - better compression of support information

This direction fits SchemeChat better than adopting a fully dark Raycast/Linear-style chrome.

---

## Current Decision

### 1. Keep the launcher + floating panel model
- collapsed state remains a small launcher at the bottom-right
- expanded state remains a floating workbench above provider panes
- dragging and manual resize remain valid

### 2. Make the panel "left main, right support"
- left side is the drafting workspace
- right side is a compact support rail
- footer becomes a stable action dock

### 3. Stop treating "no internal scroll" as a hard rule
The stronger rule is now:

- keep the footer visible
- keep the primary action visible
- keep the draft area dominant

If one internal scroll region is needed, it should be the right support rail first.

### 4. Compress support content by default
The right rail should primarily contain:

- round instruction summary
- sticky rule chips
- quick prompt chips
- participant summary
- collapsed draft source section
- collapsed more-actions section

It should not default to long-form explanatory blocks.

---

## Intended Priority Order

When the panel is expanded, the interface priority is:

1. understand the current round
2. edit or review the draft
3. trigger private / sync / primary action
4. optionally inspect sources or low-frequency tools

This is a stricter prioritization than the previous V2 interpretation.

---

## Layout Rules Going Forward

### Header
- keep it compact
- avoid repeated status language
- separate window actions from discussion actions

### Status Band
- preserve round / mode / speaking scope
- compress it into a thin metadata strip

### Main Workspace
- draft area must stay visually dominant
- support rail must summarize before it explains

### Footer
- must remain visible
- must not be pushed off by support content
- must remain the only place for the high-frequency action cluster

### Resize Handle
- must not intrude into the primary button hotspot

---

## Implementation Sync (2026-04-08)

The current renderer implementation now reflects the following structural decisions:

- the collapsed launcher compresses stage, mode, state, and field label into a single top row
- launcher status moved into the input area instead of taking a dedicated bottom row
- launcher bounds were increased slightly so the action row does not clip at common small heights
- the expanded workbench now uses a true left-main / right-support split
- the right rail now defaults to disclosure blocks instead of always-open stacked cards
- `本轮指令`, `参与 AI`, `Draft 来源`, and `更多操作` are now summary-first sections
- the participant area now reads as a compact count first, with detailed chips only after expanding
- the footer owns the action cluster, while the resize handle sits in a separate corner slot
- low-height mode now hides non-essential header copy before sacrificing footer visibility
- low-height mode also converts the footer into a stable two-row arrangement

This means the design direction is no longer only documented; it is partially enforced in the actual renderer layout.

---

## Current Acceptance Focus

The next validation pass should focus on whether the new structure holds under real use, especially:

- collapsed launcher at standard desktop height
- collapsed launcher at smaller window heights
- expanded panel with the right rail mostly collapsed
- expanded panel with multiple right-rail sections opened together
- footer visibility while resizing smaller
- participant summary clarity when panes are present and when none are present

These checks are tracked in:

- `product/discussion_console_ui_acceptance_checklist_2026-04-08.md`
- `product/discussion_console_acceptance_snapshot_2026-04-08.md`

---

## Related Documents To Follow

The refreshed design direction is further defined in:

- `discussion_console_information_architecture_v1.md`
- `discussion_console_low_fidelity_wireframe_v1.md`
- `discussion_console_no_scroll_layout_v2.md`
- `discussion_ui_clickflow_v1.md`
- `product/discussion_console_visual_direction_2026-04-08.md`
- `product/discussion_console_copy_guidelines_2026-04-08.md`
- `product/discussion_console_ui_acceptance_checklist_2026-04-08.md`
- `product/discussion_console_acceptance_snapshot_2026-04-08.md`

These documents now supersede the earlier "good enough for V2" interpretation of the floating panel.

---

## Final Note

The floating workbench remains the right product direction.

The adjustment needed now is not a return to the old bottom bar, but a refinement of the floating panel into a calmer, tighter, and more height-aware workspace.
