const { ipcRenderer } = require('electron');
const {
  loadConfig,
  clickElement,
  findElement,
  findActionElement,
  readInputTextValue,
  createSubmitHandler,
  delay,
  setupIPCListeners,
  setupInputScanner,
  createUIControls,
  setupViewInfoListener,
  setupSupersizeListener,
  setupLoadingOverlay,
  waitForDOM,
} = require('./shared-preload-utils');

const config = loadConfig();
const provider = 'grok';
const GROK_PRIVATE_PATTERNS = [
  'private chat',
  'private mode',
  'private',
  '私密聊天',
  '私人聊天',
];

let inputElement = null;
let appendBaseText = null;

function resolveInputElement() {
  inputElement = findElement(config.grok?.input);
  return inputElement;
}

function writeInputText(text) {
  inputElement = resolveInputElement();

  if (!inputElement) {
    ipcRenderer.invoke('selector-error', 'grok', 'Input element not found');
    return false;
  }

  if (inputElement.tagName === 'TEXTAREA') {
    inputElement.value = text;
    inputElement.selectionStart = text.length;
    inputElement.selectionEnd = text.length;
  } else if (inputElement.contentEditable === 'true') {
    while (inputElement.firstChild) {
      inputElement.removeChild(inputElement.firstChild);
    }

    const lines = text.split('\n');
    lines.forEach((line, index) => {
      inputElement.appendChild(document.createTextNode(line));
      if (index < lines.length - 1) {
        inputElement.appendChild(document.createElement('br'));
      }
    });
  } else if (inputElement.tagName === 'INPUT') {
    inputElement.value = text;
  }

  const events = [
    new Event('input', { bubbles: true }),
    new Event('change', { bubbles: true }),
    new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'a',
    }),
  ];

  events.forEach((event) => inputElement.dispatchEvent(event));
  return true;
}

function resetAppendState() {
  appendBaseText = null;
}

function injectText(text) {
  const nextText = String(text || '');
  const resolvedInput = resolveInputElement();

  if (!resolvedInput) {
    ipcRenderer.invoke('selector-error', 'grok', 'Input element not found');
    return {
      ok: false,
      stage: 'input-missing',
      error: 'Input element not found.',
    };
  }

  if (nextText.length === 0) {
    if (appendBaseText !== null) {
      const restored = writeInputText(appendBaseText);
      resetAppendState();
      return restored
        ? { ok: true, stage: 'text-restored' }
        : { ok: false, stage: 'text-restore-failed', error: 'Input element not found.' };
    }
    return {
      ok: true,
      stage: 'text-cleared',
    };
  }

  if (appendBaseText === null) {
    appendBaseText = readInputTextValue(resolvedInput);
  }

  const wrote = writeInputText(`${appendBaseText}${nextText}`);
  return wrote
    ? { ok: true, stage: 'text-injected' }
    : { ok: false, stage: 'text-inject-failed', error: 'Input element not found.' };
}

function injectSyncText(text) {
  resetAppendState();
  const wrote = writeInputText(String(text || ''));
  return wrote
    ? { ok: true, stage: 'sync-text-injected' }
    : { ok: false, stage: 'sync-text-inject-failed', error: 'Input element not found.' };
}

function isGrokHost() {
  return window.location.hostname === 'x.com'
    || window.location.hostname.endsWith('.x.com');
}

async function runGrokPrivateFlow() {
  if (!isGrokHost()) {
    return {
      ok: false,
      error: `Host mismatch: ${window.location.hostname}`,
    };
  }

  const privateButton = findActionElement(config.grok?.privateNewChat, GROK_PRIVATE_PATTERNS);
  if (!privateButton) {
    return {
      ok: false,
      error: 'Grok private chat entry was not found.',
    };
  }

  clickElement(privateButton);
  await delay(500);

  return { ok: true };
}

async function handlePrivateNewChat(payload) {
  const result = await runGrokPrivateFlow();
  await ipcRenderer.invoke('private-new-chat-result', {
    requestId: payload?.requestId || null,
    paneId: payload?.paneId || null,
    provider,
    ...result,
  });
}

const submitMessage = createSubmitHandler(
  provider,
  config,
  () => inputElement,
  null
);

setupIPCListeners(provider, config, injectText, submitMessage, {
  onSyncText: injectSyncText,
  onBeforeSubmit: resetAppendState,
  onBeforeNewChat: resetAppendState,
  onPrivateNewChat: handlePrivateNewChat,
});

setupInputScanner(
  provider,
  config,
  () => inputElement,
  (el) => { inputElement = el; },
  null
);

const getViewInfo = setupViewInfoListener((viewInfo) => {
  window.schemechatGetViewInfo = () => viewInfo;
  createUIControls(viewInfo);
});

setupSupersizeListener();

setupLoadingOverlay();

waitForDOM(() => {
  const viewInfo = getViewInfo();
  if (viewInfo) createUIControls(viewInfo);
});
