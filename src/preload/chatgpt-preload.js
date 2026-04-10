const { ipcRenderer } = require('electron');
const {
  loadConfig,
  clickElement,
  findElement,
  findActionElement,
  findElementByTextPatterns,
  findVisibleElement,
  findVisibleElements,
  readElementActionLabel,
  readInputTextValue,
  createSubmitHandler,
  delay,
  setupIPCListeners,
  setupInputScanner,
  createUIControls,
  setupViewInfoListener,
  setupSupersizeListener,
  waitForCondition,
  waitForDOM,
} = require('./shared-preload-utils');

const config = loadConfig();
const provider = 'chatgpt';
const CHATGPT_TEMP_PATTERNS = [
  'temporary chat',
  'temporary',
  '临时聊天',
  '臨時聊天',
  '临时对话',
  '臨時對話',
];
const CHATGPT_MODEL_MENU_PATTERNS = [
  'gpt',
  'chatgpt',
  'model',
  '模型',
  '模式',
];
const CHATGPT_UI_OPTIONS = {
  topBarInset: {
    observeDomMutations: false,
    observeScroll: false,
    delayedSyncDelays: [300, 1200],
  },
};

let inputElement = null;
let appendBaseText = null;

function resolveInputElement() {
  inputElement = findElement(config.chatgpt?.input);
  return inputElement;
}

function writeInputText(text) {
  inputElement = resolveInputElement();

  if (!inputElement) {
    ipcRenderer.invoke('selector-error', 'chatgpt', 'Input element not found');
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
    ipcRenderer.invoke('selector-error', 'chatgpt', 'Input element not found');
    return;
  }

  if (nextText.length === 0) {
    if (appendBaseText !== null) {
      writeInputText(appendBaseText);
      resetAppendState();
    }
    return;
  }

  if (appendBaseText === null) {
    appendBaseText = readInputTextValue(resolvedInput);
  }

  writeInputText(`${appendBaseText}${nextText}`);
}

function injectSyncText(text) {
  resetAppendState();
  writeInputText(String(text || ''));
}

function isChatgptHost() {
  return window.location.hostname === 'chat.openai.com'
    || window.location.hostname === 'chatgpt.com'
    || window.location.hostname.endsWith('.chatgpt.com');
}

function getTopBarScope() {
  return document.querySelector('header') || document.body;
}

function findChatgptTemporaryButton(scope = document) {
  return findActionElement(config.chatgpt?.privateNewChat, CHATGPT_TEMP_PATTERNS, scope);
}

function findChatgptModelMenuTrigger() {
  const candidateSelectors = config.chatgpt?.temporaryMenuTrigger || [];
  const candidates = findVisibleElements(candidateSelectors, document);
  if (candidates.length === 0) {
    return findElementByTextPatterns(
      CHATGPT_MODEL_MENU_PATTERNS,
      ['header button', 'header [role="button"]', 'button[aria-haspopup="menu"]', '[role="button"][aria-haspopup="menu"]'],
      document
    );
  }

  const scoredCandidates = candidates
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const label = readElementActionLabel(element);
      let score = rect.top < 220 ? 2 : 0;
      if (CHATGPT_MODEL_MENU_PATTERNS.some((pattern) => label.includes(pattern))) {
        score += 3;
      }
      if (element.getAttribute('aria-haspopup') === 'menu') {
        score += 2;
      }
      if (label.includes('temporary')) {
        score -= 5;
      }

      return { element, score };
    })
    .sort((left, right) => right.score - left.score);

  return scoredCandidates[0]?.element || null;
}

async function runChatgptTemporaryFlow() {
  if (!isChatgptHost()) {
    return {
      ok: false,
      error: `Host mismatch: ${window.location.hostname}`,
    };
  }

  const newChatButton = findVisibleElement(config.chatgpt?.newChat);
  if (newChatButton) {
    clickElement(newChatButton);
    await delay(700);
  }

  const directTemporaryButton = findChatgptTemporaryButton(getTopBarScope()) || findChatgptTemporaryButton(document);
  if (directTemporaryButton) {
    clickElement(directTemporaryButton);
    await delay(600);
    return { ok: true };
  }

  const menuTrigger = findChatgptModelMenuTrigger();
  if (!menuTrigger) {
    return {
      ok: false,
      error: 'ChatGPT temporary chat entry was not found.',
    };
  }

  clickElement(menuTrigger);
  await delay(450);

  const temporaryMenuItem = await waitForCondition(
    () => findChatgptTemporaryButton(document),
    { timeoutMs: 2500, intervalMs: 120 }
  );

  if (!temporaryMenuItem) {
    return {
      ok: false,
      error: 'ChatGPT temporary chat menu item was not found.',
    };
  }

  clickElement(temporaryMenuItem);
  await delay(600);

  return { ok: true };
}

async function handlePrivateNewChat(payload) {
  const result = await runChatgptTemporaryFlow();
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
  window.polygptGetViewInfo = () => viewInfo;
  createUIControls(viewInfo, CHATGPT_UI_OPTIONS);
});

setupSupersizeListener();

waitForDOM(() => {
  const viewInfo = getViewInfo();
  if (viewInfo) {
    createUIControls(viewInfo, CHATGPT_UI_OPTIONS);
  }
});
