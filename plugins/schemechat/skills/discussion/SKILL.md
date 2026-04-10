# SchemeChat Discussion

Use this plugin when the user wants Codex to operate on a running SchemeChat workspace.

Guidelines:

- First call `get_workspace_snapshot` to see which panes and providers are currently active.
- Use `inspect_round_status` before `capture_latest_replies` if you need to know whether panes are still responding.
- Use `broadcast_context_to_panes` when the same discussion context, round material, or project update needs to be distributed to multiple panes.
- Use `inject_text_to_panes` only after confirming the target pane IDs.
- Prefer `broadcast_context_to_panes` over `inject_text_to_panes` when the task is "send the same context block to several panes, then maybe submit it."
- A safe default sequence is `get_workspace_snapshot` -> `broadcast_context_to_panes` -> `submit_message_to_panes` when the user wants a coordinated multi-pane follow-up.
- Use `submit_message_to_panes` only when the draft is ready to send.
- If the MCP server is unavailable, ask the user to launch SchemeChat first and verify `http://127.0.0.1:3769/health`.
