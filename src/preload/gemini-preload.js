const { ipcRenderer } = require('electron');
const {
  loadConfig,
  collectElementsBySelectors,
  findElement,
  findVisibleElement,
  isVisibleElement,
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
const provider = 'gemini';

const GEMINI_NAV_MENU_SELECTORS = [
  'button[data-test-id="e-nav-menu-button"]',
  '[data-test-id="e-nav-menu-button"]',
  'button[data-test-id="side-nav-menu-button"]',
  '[data-test-id="side-nav-menu-button"]',
  'button[data-testid="e-nav-menu-button"]',
  '[data-testid="e-nav-menu-button"]',
  'button[data-testid="side-nav-menu-button"]',
  '[data-testid="side-nav-menu-button"]',
  'button[aria-label*="Menu"]',
  'button[aria-label*="menu"]',
  'button[title*="Menu"]',
];
const GEMINI_UI_OPTIONS = {
  topBarInset: {
    observeDomMutations: false,
    observeScroll: false,
    delayedSyncDelays: [300, 1200],
  },
};

let inputElement = null;
let lastSubmittedText = '';

function isGeminiHost() {
  return window.location.hostname === 'gemini.google.com'
    || window.location.hostname.endsWith('.gemini.google.com');
}

function findGeminiInput(element) {
  if (!element) {
    return null;
  }

  if (element.tagName === 'RICH-TEXTAREA') {
    return element.querySelector('[contenteditable="true"]')
      || element.querySelector('[role="textbox"]')
      || element;
  }

  if (element.contentEditable === 'true') {
    return element;
  }

  return element;
}

function normalizeGeminiText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u200b/g, '');
}

function readGeminiInlineText(node) {
  if (!node) {
    return '';
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeGeminiText(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  if (node.tagName === 'BR') {
    return '\n';
  }

  return Array.from(node.childNodes || [])
    .map((child) => readGeminiInlineText(child))
    .join('');
}

function normalizeGeminiBlockLines(lines) {
  const normalizedLines = Array.isArray(lines)
    ? lines.map((line) => normalizeGeminiText(line))
    : [];

  while (normalizedLines.length > 0 && normalizedLines[0] === '') {
    normalizedLines.shift();
  }

  while (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] === '') {
    normalizedLines.pop();
  }

  if (normalizedLines.length === 0) {
    return '';
  }

  const squashedLines = [];
  let blankRunLength = 0;

  normalizedLines.forEach((line) => {
    if (line === '') {
      blankRunLength += 1;
      if (blankRunLength > 1) {
        return;
      }
    } else {
      blankRunLength = 0;
    }

    squashedLines.push(line);
  });

  return squashedLines.join('\n');
}

function readGeminiEditorText(element) {
  const resolvedElement = findGeminiInput(element);
  if (!resolvedElement) {
    return '';
  }

  if (resolvedElement.tagName === 'TEXTAREA' || resolvedElement.tagName === 'INPUT') {
    return normalizeGeminiText(resolvedElement.value || '');
  }

  if (resolvedElement.contentEditable !== 'true') {
    return normalizeGeminiText(resolvedElement.innerText || resolvedElement.textContent || '');
  }

  const blockLines = [];
  Array.from(resolvedElement.childNodes || []).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const rawText = normalizeGeminiText(node.textContent || '');
      if (rawText.length === 0) {
        return;
      }

      rawText.split('\n').forEach((line) => blockLines.push(line));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (node.tagName === 'BR') {
      blockLines.push('');
      return;
    }

    const blockText = readGeminiInlineText(node).replace(/\n+$/g, '');
    blockLines.push(blockText);
  });

  if (blockLines.length === 0 || blockLines.every((line) => line === '')) {
    return '';
  }

  return normalizeGeminiBlockLines(blockLines);
}

function moveCursorToEnd(element) {
  if (!element || typeof window.getSelection !== 'function') {
    return;
  }

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function writeGeminiContentEditableText(element, text) {
  const normalizedText = normalizeGeminiText(text);
  const fragment = document.createDocumentFragment();

  if (typeof element.focus === 'function') {
    element.focus();
  }

  const lines = normalizedText.length > 0
    ? normalizedText.split('\n')
    : [''];

  lines.forEach((line) => {
    const paragraph = document.createElement('p');
    if (line.length > 0) {
      paragraph.textContent = line;
    } else {
      paragraph.appendChild(document.createElement('br'));
    }

    fragment.appendChild(paragraph);
  });

  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren(fragment);
  } else {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }

    element.appendChild(fragment);
  }

  if (element.classList) {
    element.classList.toggle('ql-blank', normalizedText.length === 0);
  }

  moveCursorToEnd(element);
  return true;
}

function resolveInputElement() {
  const rawElement = findElement(config.gemini?.input);
  inputElement = findGeminiInput(rawElement);
  return inputElement;
}

function writeInputText(text) {
  inputElement = resolveInputElement();

  if (!inputElement) {
    ipcRenderer.invoke('selector-error', 'gemini', 'Input element not found');
    return false;
  }

  const normalizedText = normalizeGeminiText(text);

  if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
    inputElement.value = normalizedText;
    inputElement.selectionStart = normalizedText.length;
    inputElement.selectionEnd = normalizedText.length;
  } else if (inputElement.contentEditable === 'true') {
    writeGeminiContentEditableText(inputElement, normalizedText);
  } else {
    inputElement.textContent = normalizedText;
  }

  [
    new Event('input', { bubbles: true }),
    new Event('change', { bubbles: true }),
    new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'a',
    }),
  ].forEach((event) => inputElement.dispatchEvent(event));
  return true;
}

function resetAppendState() {
  lastSubmittedText = '';
}

function injectText(text) {
  if (!resolveInputElement()) {
    ipcRenderer.invoke('selector-error', 'gemini', 'Input element not found');
    return;
  }

  writeInputText(String(text || ''));
}

function injectSyncText(text) {
  resetAppendState();
  writeInputText(String(text || ''));
}

function dispatchGeminiEnterSubmit(element) {
  if (!element) {
    return false;
  }

  const eventOptions = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  };

  element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
  element.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
  element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  return true;
}

function clearSubmittedTextIfStillPresent(expectedText) {
  const normalizedExpected = normalizeGeminiText(expectedText);
  if (!normalizedExpected) {
    return;
  }

  [180, 700].forEach((delayMs) => {
    window.setTimeout(() => {
      const currentText = readGeminiEditorText(resolveInputElement());
      if (normalizeGeminiText(currentText) === normalizedExpected) {
        writeInputText('');
      }
    }, delayMs);
  });
}

function clickGeminiButtonOnce(element) {
  if (!element || typeof element.click !== 'function') {
    return false;
  }

  try {
    if (typeof element.focus === 'function') {
      element.focus();
    }

    element.click();
    return true;
  } catch (error) {
    return false;
  }
}

function findGeminiTempButton(scope = document) {
  return collectElementsBySelectors(config.gemini?.privateNewChat || [], scope)
    .find((element) => isVisibleElement(element) && !element.disabled) || null;
}

function findGeminiTemporaryIndicator(scope = document) {
  return collectElementsBySelectors(config.gemini?.temporaryIndicator || [], scope)
    .find((element) => isVisibleElement(element)) || null;
}

function isGeminiTemporaryModeActive() {
  const mainScope = document.querySelector('#app-root main') || document.querySelector('main') || document.body;
  if (!mainScope) {
    return false;
  }

  return Boolean(findGeminiTemporaryIndicator(mainScope));
}

async function runGeminiTemporaryFlow() {
  if (!isGeminiHost()) {
    return {
      ok: false,
      error: `Host mismatch: ${window.location.hostname}`,
    };
  }

  if (isGeminiTemporaryModeActive()) {
    return { ok: true };
  }

  let tempButton = await waitForCondition(
    () => findGeminiTempButton(document),
    { timeoutMs: 9000, intervalMs: 180 }
  );

  if (!tempButton) {
    const navMenuButton = findVisibleElement(GEMINI_NAV_MENU_SELECTORS, document);
    if (navMenuButton) {
      clickGeminiButtonOnce(navMenuButton);
      await delay(350);
      tempButton = await waitForCondition(
        () => findGeminiTempButton(document),
        { timeoutMs: 2500, intervalMs: 150 }
      );
    }
  }

  if (!tempButton) {
    return {
      ok: false,
      error: 'Gemini temporary chat button was not found in the official left navigation.',
    };
  }

  try {
    tempButton.scrollIntoView({ block: 'center', inline: 'center' });
  } catch (error) {
    // Ignore scroll failures and continue with the click attempt.
  }

  if (!clickGeminiButtonOnce(tempButton)) {
    return {
      ok: false,
      error: 'Gemini temporary chat button click failed.',
    };
  }

  const activated = await waitForCondition(
    () => isGeminiTemporaryModeActive(),
    { timeoutMs: 5000, intervalMs: 120 }
  );

  if (!activated) {
    return {
      ok: false,
      error: 'Gemini temporary chat did not activate.',
    };
  }

  return { ok: true };
}

async function handlePrivateNewChat(payload) {
  const result = await runGeminiTemporaryFlow();
  await ipcRenderer.invoke('private-new-chat-result', {
    requestId: payload?.requestId || null,
    paneId: payload?.paneId || null,
    provider,
    ...result,
  });
}

function submitMessage() {
  const resolvedInput = resolveInputElement();
  if (!resolvedInput) {
    ipcRenderer.invoke('selector-error', 'gemini', 'Input element not found');
    return;
  }

  lastSubmittedText = readGeminiEditorText(resolvedInput);
  const submitElement = findVisibleElement(config.gemini?.submit, document);
  const clicked = submitElement && !submitElement.disabled
    ? clickGeminiButtonOnce(submitElement)
    : false;

  if (!clicked) {
    dispatchGeminiEnterSubmit(resolvedInput);
  }

  clearSubmittedTextIfStillPresent(lastSubmittedText);
}

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
  (element) => { inputElement = element; },
  (selector) => findGeminiInput(findElement(selector))
);

const getViewInfo = setupViewInfoListener((viewInfo) => {
  window.polygptGetViewInfo = () => viewInfo;
  createUIControls(viewInfo, GEMINI_UI_OPTIONS);
});

setupSupersizeListener();

waitForDOM(() => {
  const viewInfo = getViewInfo();
  if (viewInfo) {
    createUIControls(viewInfo, GEMINI_UI_OPTIONS);
  }
});
