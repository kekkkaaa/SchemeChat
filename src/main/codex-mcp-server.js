const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const z = require('zod/v4');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3769;
const WRITE_TOOLS_ENV_NAME = 'SCHEMECHAT_MCP_ENABLE_WRITE_TOOLS';
const TASK_TYPE_IDS = ['explore', 'execute', 'review'];

function createTextToolResult(label, payload, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: `${label}\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function buildBroadcastContextText({ topic = '', focus = '', context = '' } = {}) {
  const trimmedTopic = String(topic || '').trim();
  const trimmedFocus = String(focus || '').trim();
  const trimmedContext = String(context || '').trim();
  const sections = ['补充上下文'];

  if (trimmedTopic) {
    sections.push(`主题：\n${trimmedTopic}`);
  }

  if (trimmedFocus) {
    sections.push(`关注点：\n${trimmedFocus}`);
  }

  sections.push(`本轮补充信息：\n${trimmedContext}`);
  sections.push('请基于以上补充继续分析，只保留受影响的判断更新。');

  return sections.join('\n\n');
}

function createSchemeChatMcpServer(options = {}) {
  const host = String(options.host || process.env.SCHEMECHAT_MCP_HOST || DEFAULT_HOST);
  const requestedPort = Number.parseInt(process.env.SCHEMECHAT_MCP_PORT || options.port || DEFAULT_PORT, 10);
  const port = Number.isFinite(requestedPort) ? requestedPort : DEFAULT_PORT;
  const writeToolsEnabled = options.allowWriteTools === true || isTruthyFlag(process.env[WRITE_TOOLS_ENV_NAME]);
  const sessions = new Map();
  let httpServer = null;
  let expressApp = null;
  let serverUrl = null;

  function buildServer() {
    const server = new McpServer({
      name: 'schemechat-local',
      version: options.version || '0.1.0',
    });

    server.registerTool('get_workspace_snapshot', {
      title: 'Get Workspace Snapshot',
      description: 'Return the current SchemeChat pane, layout, and discussion console state.',
      inputSchema: {
        paneIds: z.array(z.string()).optional().describe('Optional pane IDs to scope the snapshot.'),
      },
    }, async ({ paneIds = [] }) => {
      const snapshot = await options.getWorkspaceSnapshot(paneIds);
      return createTextToolResult('SchemeChat workspace snapshot', snapshot, snapshot?.ok === false);
    });

    server.registerTool('inspect_round_status', {
      title: 'Inspect Round Status',
      description: 'Low-level debug tool: inspect whether each target pane is idle, waiting, completed, or failed.',
      inputSchema: {
        paneIds: z.array(z.string()).optional().describe('Optional pane IDs to inspect.'),
      },
    }, async ({ paneIds = [] }) => {
      const result = await options.inspectRoundStatus(paneIds);
      return createTextToolResult('SchemeChat round status', result, result?.ok === false);
    });

    server.registerTool('capture_latest_replies', {
      title: 'Capture Latest Replies',
      description: 'Low-level debug tool: capture the latest stable usable reply text from each target pane, with quality diagnostics.',
      inputSchema: {
        paneIds: z.array(z.string()).optional().describe('Optional pane IDs to capture.'),
      },
    }, async ({ paneIds = [] }) => {
      const result = await options.captureLatestReplies(paneIds);
      return createTextToolResult('SchemeChat latest replies', result, result?.ok === false);
    });

    if (typeof options.getDiscussionFlowState === 'function') {
      server.registerTool('get_discussion_flow_state', {
        title: 'Get Discussion Flow State',
        description: 'Recommended main-path tool: inspect the current discussion controller state, including task type, target artifact, mode, round, draft, and next available actions.',
        inputSchema: {},
      }, async () => {
        const result = await options.getDiscussionFlowState();
        return createTextToolResult('SchemeChat discussion flow state', result, result?.ok === false);
      });
    }

    if (writeToolsEnabled) {
      if (typeof options.updateDiscussionFlow === 'function') {
        server.registerTool('update_discussion_flow', {
          title: 'Update Discussion Flow',
          description: 'Recommended main-path tool: update discussion controller inputs such as topic, task type, round note, draft, or run mode. Respects the same editability rules as the UI.',
          inputSchema: {
            topic: z.string().optional().describe('Optional discussion topic. Pass an empty string to clear it.'),
            taskType: z.enum(TASK_TYPE_IDS).optional().describe('Optional task type. explore = 分析问题 / execute = 生成方案 / review = 检查结果.'),
            roundNote: z.string().optional().describe('Optional per-round note or temporary instruction. Pass an empty string to clear it.'),
            draft: z.string().optional().describe('Optional current draft text. Pass an empty string to clear it.'),
            runMode: z.enum(['manual', 'auto']).optional().describe('Optional discussion run mode to apply before the next action.'),
            modeId: z.enum(['fast-3', 'standard-4', 'deep-5']).optional().describe('Optional discussion intensity preset. fast-3 = Quick (3 rounds), standard-4 = Standard (4 rounds), deep-5 = Deep (5 rounds).'),
          },
        }, async ({ topic, taskType, roundNote, draft, runMode, modeId }) => {
          const patch = {};
          if (topic !== undefined) {
            patch.topic = topic;
          }
          if (taskType !== undefined) {
            patch.taskType = taskType;
          }
          if (roundNote !== undefined) {
            patch.roundNote = roundNote;
          }
          if (draft !== undefined) {
            patch.draft = draft;
          }
          if (runMode !== undefined) {
            patch.runMode = runMode;
          }
          if (modeId !== undefined) {
            patch.modeId = modeId;
          }

          const result = await options.updateDiscussionFlow(patch);
          return createTextToolResult('SchemeChat discussion flow update', result, result?.ok === false);
        });
      }

      if (typeof options.triggerDiscussionAction === 'function') {
        server.registerTool('trigger_discussion_action', {
          title: 'Trigger Discussion Action',
          description: 'Recommended main-path tool: trigger a high-level discussion controller action such as primary, generate, submit, resume, or next-round.',
          inputSchema: {
            action: z.enum([
              'primary',
              'generate-round-one',
              'submit-current-draft',
              'prepare-next-manual-round',
              'start-auto-run',
              'resume-auto-run',
              'regenerate-draft',
              'confirm-summarizer',
              'reset-console',
            ]).describe('Discussion controller action to trigger.'),
            waitForCompletion: z.boolean().optional().describe('When true, wait for the action promise to complete. Leave false for long-running auto flows.'),
          },
        }, async ({ action, waitForCompletion = false }) => {
          const result = await options.triggerDiscussionAction(action, {
            waitForCompletion,
          });
          return createTextToolResult('SchemeChat discussion action result', {
            action,
            waitForCompletion: Boolean(waitForCompletion),
            ...result,
          }, result?.ok === false);
        });
      }

      if (typeof options.openTemporaryChats === 'function') {
        server.registerTool('open_temporary_chats', {
          title: 'Open Temporary Chats',
          description: 'High-level session tool: switch supported panes into temporary/private chat before scratch analysis, reducing history pollution.',
          inputSchema: {
            paneIds: z.array(z.string()).optional().describe('Optional pane IDs to target. Empty means all supported panes.'),
          },
        }, async ({ paneIds = [] }) => {
          const result = await options.openTemporaryChats(paneIds);
          return createTextToolResult('SchemeChat temporary chat result', result, result?.ok === false);
        });
      }

      server.registerTool('inject_text_to_panes', {
        title: 'Inject Text To Panes',
        description: 'Low-level debug/manual tool: mirror raw text into the target SchemeChat pane input boxes.',
        inputSchema: {
          paneIds: z.array(z.string()).optional().describe('Optional pane IDs to receive the text. Empty means all panes.'),
          text: z.string().describe('Text to inject into the target pane inputs.'),
        },
      }, async ({ paneIds = [], text }) => {
        const result = await options.injectTextToPanes(paneIds, text);
        return createTextToolResult('SchemeChat text injection result', result, result?.ok === false);
      });

      server.registerTool('submit_message_to_panes', {
        title: 'Submit Message To Panes',
        description: 'Low-level debug/manual tool: submit the current input box content for the target panes.',
        inputSchema: {
          paneIds: z.array(z.string()).optional().describe('Optional pane IDs to submit. Empty means all panes.'),
        },
      }, async ({ paneIds = [] }) => {
        const result = await options.submitMessageToPanes(paneIds);
        return createTextToolResult('SchemeChat submit result', result, result?.ok === false);
      });

      server.registerTool('broadcast_context_to_panes', {
        title: 'Broadcast Context To Panes',
        description: 'Low-level debug/manual tool: format a shared context block, inject it into target panes, and optionally submit it.',
        inputSchema: {
          paneIds: z.array(z.string()).optional().describe('Optional pane IDs to receive the context. Empty means all panes.'),
          context: z.string().describe('The shared context to broadcast into the target pane inputs.'),
          topic: z.string().optional().describe('Optional topic heading for the broadcast block.'),
          focus: z.string().optional().describe('Optional focus or instruction heading for the broadcast block.'),
          sendNow: z.boolean().optional().describe('Whether to submit the injected content immediately. Defaults to false.'),
        },
      }, async ({ paneIds = [], context, topic = '', focus = '', sendNow = false }) => {
        const normalizedContext = String(context || '').trim();
        if (!normalizedContext) {
          return createTextToolResult('SchemeChat broadcast result', {
            ok: false,
            message: 'Context is required.',
          }, true);
        }

        const previewText = buildBroadcastContextText({
          topic,
          focus,
          context: normalizedContext,
        });

        const injectResult = await options.injectTextToPanes(paneIds, previewText);
        if (!injectResult?.ok) {
          return createTextToolResult('SchemeChat broadcast result', {
            ok: false,
            message: injectResult?.message || 'Failed to inject the broadcast context.',
            paneIds,
            sendNow: Boolean(sendNow),
            previewText,
            injectResult,
          }, true);
        }

        let submitResult = null;
        if (sendNow) {
          await delay(180);
          submitResult = await options.submitMessageToPanes(paneIds);
          if (!submitResult?.ok) {
            return createTextToolResult('SchemeChat broadcast result', {
              ok: false,
              message: submitResult?.message || 'Context was injected, but submit failed.',
              paneIds,
              sendNow: true,
              previewText,
              injectResult,
              submitResult,
            }, true);
          }
        }

        return createTextToolResult('SchemeChat broadcast result', {
          ok: true,
          message: sendNow
            ? 'Broadcast context injected and submitted.'
            : 'Broadcast context injected.',
          paneIds,
          sendNow: Boolean(sendNow),
          previewText,
          injectResult,
          submitResult,
        });
      });
    }

    return server;
  }

  async function closeSession(sessionId) {
    const entry = sessions.get(sessionId);
    if (!entry) {
      return;
    }

    sessions.delete(sessionId);

    try {
      await entry.transport.close();
    } catch (error) {
      console.error(`Failed to close MCP transport for session ${sessionId}:`, error);
    }

    try {
      await entry.server.close();
    } catch (error) {
      console.error(`Failed to close MCP server for session ${sessionId}:`, error);
    }
  }

  async function handlePostRequest(req, res) {
    const sessionId = req.headers['mcp-session-id'];

    try {
      let entry = sessionId ? sessions.get(sessionId) : null;

      if (!entry && !sessionId && isInitializeRequest(req.body)) {
        const server = buildServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            sessions.set(initializedSessionId, { server, transport });
          },
        });

        transport.onclose = () => {
          const activeSessionId = transport.sessionId;
          if (activeSessionId) {
            sessions.delete(activeSessionId);
          }
        };

        transport.onerror = (error) => {
          console.error('SchemeChat MCP transport error:', error);
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (!entry) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'No valid MCP session is available. Initialize a new session first.',
          },
          id: null,
        });
        return;
      }

      await entry.transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Failed to handle SchemeChat MCP POST request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error.',
          },
          id: null,
        });
      }
    }
  }

  async function handleGetRequest(req, res) {
    const sessionId = req.headers['mcp-session-id'];
    const entry = sessionId ? sessions.get(sessionId) : null;

    if (!entry) {
      res.status(400).send('Invalid or missing MCP session ID.');
      return;
    }

    try {
      await entry.transport.handleRequest(req, res);
    } catch (error) {
      console.error('Failed to handle SchemeChat MCP GET request:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error.');
      }
    }
  }

  async function handleDeleteRequest(req, res) {
    const sessionId = req.headers['mcp-session-id'];
    const entry = sessionId ? sessions.get(sessionId) : null;

    if (!entry) {
      res.status(400).send('Invalid or missing MCP session ID.');
      return;
    }

    try {
      await entry.transport.handleRequest(req, res);
      await closeSession(sessionId);
    } catch (error) {
      console.error('Failed to handle SchemeChat MCP DELETE request:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error.');
      }
    }
  }

  async function start() {
    if (httpServer) {
      return {
        ok: true,
        host,
        port,
        url: serverUrl,
      };
    }

    expressApp = createMcpExpressApp();
    expressApp.get('/health', (req, res) => {
      res.json({
        ok: true,
        name: 'schemechat-local',
        port,
        url: serverUrl,
        sessionCount: sessions.size,
        writeToolsEnabled,
      });
    });
    expressApp.post('/mcp', handlePostRequest);
    expressApp.get('/mcp', handleGetRequest);
    expressApp.delete('/mcp', handleDeleteRequest);

    await new Promise((resolve, reject) => {
      const candidateServer = expressApp.listen(port, host, () => {
        httpServer = candidateServer;
        serverUrl = `http://${host}:${port}/mcp`;
        resolve();
      });

      candidateServer.on('error', reject);
    });

    return {
      ok: true,
      host,
      port,
      url: serverUrl,
      writeToolsEnabled,
    };
  }

  async function stop() {
    const activeSessionIds = [...sessions.keys()];
    await Promise.all(activeSessionIds.map((sessionId) => closeSession(sessionId)));

    if (httpServer) {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      httpServer = null;
      serverUrl = null;
    }
  }

  return {
    start,
    stop,
    getUrl() {
      return serverUrl;
    },
    getPort() {
      return port;
    },
  };
}

module.exports = {
  createSchemeChatMcpServer,
};
