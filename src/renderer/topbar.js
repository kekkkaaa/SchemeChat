const { ipcRenderer, clipboard } = require('electron');
const os = require('os');
const path = require('path');

const settingsBtn = document.getElementById('settingsBtn');
const discussionConsoleBtn = document.getElementById('discussionConsoleBtn');
const codexHelpBtn = document.getElementById('codexHelpBtn');

const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
const codexTomlSnippet = [
  '[mcp_servers.schemechat_local]',
  'url = "http://127.0.0.1:3769/mcp"',
  'startup_timeout_sec = 10',
  'tool_timeout_sec = 60',
  'enabled = true',
].join('\n');
const codexHelpMessage = [
  '接入 Codex 的方法：',
  '',
  `1. 打开 ${codexConfigPath}`,
  '2. 加入下面这段配置：',
  '',
  codexTomlSnippet,
  '',
  '3. 保存后，重启 Codex app 或 VS Code 里的 Codex 扩展。',
  '4. 然后就可以调用 get_workspace_snapshot 等工具来连接 SchemeChat。',
].join('\n');

discussionConsoleBtn.addEventListener('click', () => {
  ipcRenderer.invoke('set-discussion-console-expanded', true).catch((error) => {
    console.error('Failed to open discussion console:', error);
  });
});

ipcRenderer.on('discussion-console-expanded-changed', (event, nextExpanded) => {
  discussionConsoleBtn.classList.toggle('is-active', Boolean(nextExpanded));
});

settingsBtn.addEventListener('click', () => {
  ipcRenderer.invoke('open-settings-modal').catch((error) => {
    console.error('Failed to open settings modal:', error);
  });
});

codexHelpBtn.addEventListener('click', () => {
  try {
    clipboard.writeText(codexTomlSnippet);
    window.alert([
      'Codex 接入配置已复制到剪贴板。',
      '',
      `请把它粘贴到：${codexConfigPath}`,
      '',
      '保存后重启 Codex app 或 VS Code 里的 Codex 扩展即可。',
      '',
      '已复制内容：',
      codexTomlSnippet,
    ].join('\n'));
  } catch (error) {
    console.error('Failed to copy Codex config snippet:', error);
    window.alert(codexHelpMessage);
  }
});
