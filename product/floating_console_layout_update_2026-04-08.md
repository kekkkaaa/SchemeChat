# Floating Discussion Console Layout Update

## Status
Implemented on 2026-04-08.

This update replaces the previous "full-width bottom discussion bar" approach.

## Current UI Decision
- Chat panes keep full available height under the top bar.
- Discussion controls no longer reserve bottom layout space.
- The default control entry is a small launcher at the bottom-right.
- Advanced discussion editing opens in a floating panel layered above provider pages.
- The floating panel can be dragged by its title bar.

## Why This Change Was Made
- The previous bottom bar compressed the lowest pane and caused visible obstruction.
- In stacked layouts, the bottom provider was consistently penalized.
- Small spacing tweaks could not solve the underlying layout problem.

## Implemented Interaction Model
- Collapsed state:
  - quick input
  - private chat trigger
  - sync trigger
  - primary action
- Expanded state:
  - round summary
  - sticky rules
  - temporary prompts
  - participant overview
  - draft source view
  - full topic / note / draft editing
  - footer action cluster

## Notes For Future Work
- Current UI supports round-1 preparation and send flow well enough for continued iteration.
- Multi-round state progression is still mostly product-defined but not fully implemented in runtime behavior.
- If panel placement needs polish later, adjust default anchor and initial bounds, not pane layout reservation.
