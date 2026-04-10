# SchemeChat Codex Plugin

This local plugin connects Codex to a running SchemeChat desktop workspace through a loopback MCP server.

Expected flow:

1. Launch SchemeChat.
2. Confirm the local health check is reachable at `http://127.0.0.1:3769/health`.
3. Install or load this local plugin in Codex.
4. Use the plugin tools to inspect panes, capture replies, inject text, broadcast shared context, and submit prompts.

This first version assumes SchemeChat is already open and logged into the provider web sessions it manages.

Tool guidance:

- Use `inject_text_to_panes` when you already have the exact prompt text you want to place into target inputs.
- Use `broadcast_context_to_panes` when you want Codex to package a shared topic/context/focus block and distribute it to one or more panes before optionally sending it.
