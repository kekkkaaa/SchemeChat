# Discussion State Machine And Manual Round Flow 2026-04-09

## What Changed

The discussion console now uses explicit runtime states for the main round lifecycle instead of collapsing most transitions into only `draft-ready`, `round-waiting`, and `round-review`.

Added runtime states:

- `draft-preparing`
- `round-dispatching`
- `summarizer-selecting`
- `round-partial-error`
- `global-error`

The existing `auto-paused` state remains as an auto-run specific pause state.

## Manual Flow

Manual mode now has a complete round loop:

1. Generate current-round draft
2. Send current-round draft
3. Enter waiting state
4. Capture stable round results
5. Enter round review
6. Generate next-round draft
7. Repeat until final summary

This closes the previous gap where manual mode could generate and send the first draft, but did not reliably continue into later rounds.

## Final Round Behavior

When the next step is final summary, manual mode now enters `summarizer-selecting` first.

From there:

- the user can keep the auto-recommended summarizer
- the user can manually switch the summarizer
- confirming the summarizer generates the final-summary draft

After the final-summary round completes, both manual mode and auto mode now transition into `finished`.

## Draft Assembly Behavior

For manual later rounds, the renderer now uses one editable shared draft and mirrors it only to the current target panes.

This is different from auto mode:

- manual mode: shared editable draft, targeted send
- auto mode: per-pane generated prompt, then direct submit

The manual shared draft keeps the user-editable workflow intact while still respecting:

- speaking panes
- silent panes
- summarizer-only final round

## Error Handling

Manual mode now distinguishes:

- `round-partial-error` for wait/capture problems that can still continue
- `global-error` for steps that must be retried before the flow can continue

Auto mode still uses `auto-paused` as the operator-facing recovery state.

## IPC Additions

New IPC handlers were added to support the updated flow:

- `send-text-update-to-panes`
- `build-generated-round-draft`

They are used by the renderer to:

- mirror an editable draft only into the target panes
- build a shared later-round draft without directly injecting per-pane variants
