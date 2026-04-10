# SchemeChat Codex Bootstrap

This note records the first-pass Codex integration shape for SchemeChat as of `2026-04-10`.

## Goal

Allow `Codex app` and the `Codex IDE extension` to connect to a running local SchemeChat workspace without replacing the existing Electron discussion UI.

## Integration shape

- SchemeChat remains the runtime host for:
  - provider web sessions
  - multi-pane layout
  - manual / auto discussion orchestration
- SchemeChat now exposes a local loopback MCP endpoint at `http://127.0.0.1:3769/mcp`.
- A local Codex plugin lives under `plugins/schemechat`.
- A local plugin marketplace entry lives under `.agents/plugins/marketplace.json`.

## First-pass MCP tools

- `get_workspace_snapshot`
- `inspect_round_status`
- `capture_latest_replies`
- `inject_text_to_panes`
- `broadcast_context_to_panes`
- `submit_message_to_panes`

## Discussion assist layer

The MCP surface now includes a lightweight discussion-assist primitive:

- `broadcast_context_to_panes` formats a shared context block with optional `topic` and `focus`
- injects the resulting text into one or more target panes
- can optionally submit immediately when `sendNow = true`

This keeps Codex-side coordination simple when the operator wants to add project context, round clarifications, or selective correction prompts across an active multi-AI discussion.

## Boundaries

- This first version does not embed Codex UI inside SchemeChat.
- This first version does not replace the SchemeChat discussion editor.
- High-side-effect runtime controls such as provider switching and layout mutation are intentionally excluded from the initial MCP surface.
