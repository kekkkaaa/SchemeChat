const { ipcRenderer, clipboard } = require('electron');
const os = require('os');
const path = require('path');
const { initThemeSync } = require('./theme-sync');

initThemeSync();

// ─── 配置片段 ───
const snippets = {
  codex: [
    '[mcp_servers.schemechat_local]',
    'url = "http://127.0.0.1:3769/mcp"',
    'startup_timeout_sec = 10',
    'tool_timeout_sec = 60',
    'enabled = true',
  ].join('\n'),

  ccJson: JSON.stringify(
    {
      mcpServers: {
        'schemechat-local': {
          type: 'http',
          url: 'http://127.0.0.1:3769/mcp',
        },
      },
    },
    null,
    2
  ),

  ccCli: 'claude mcp add schemechat-local --transport http http://127.0.0.1:3769/mcp',
};

// ─── 填入代码块 ───
document.getElementById('codexSnippet').textContent  = snippets.codex;
document.getElementById('ccJsonSnippet').textContent = snippets.ccJson;
document.getElementById('ccCliSnippet').textContent  = snippets.ccCli;

// ─── 复制按钮 ───
document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key  = btn.dataset.key;
    const text = snippets[key] || '';
    try {
      clipboard.writeText(text);
    } catch {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    btn.textContent = '已复制 ✓';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '复制';
      btn.classList.remove('copied');
    }, 2000);
  });
});

// ─── 关闭按钮 ───
document.getElementById('closeBtn').addEventListener('click', () => {
  ipcRenderer.invoke('close-help-modal').catch(() => {
    window.close();
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ipcRenderer.invoke('close-help-modal').catch(() => {
      window.close();
    });
  }
});
