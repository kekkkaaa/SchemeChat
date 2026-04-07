const { ipcRenderer } = require('electron');
const {
  loadConfig,
  collectElementsBySelectors,
  findElement,
  findVisibleElement,
  isVisibleElement,
  readInputTextValue,
  createSubmitHandler,
  delay,
  setupIPCListeners,
  setupInputScanner,
  createUIControls,
  setupViewInfoListener,
  setupSupersizeListener,
  setupLoadingOverlay,
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
    delayedSyncDelays: [250, 1000, 2500],
  },
};

let inputElement = null;
let appendBaseText = null;

function isGeminiHost() {
  return window.location.hostname === 'gemini.google.com'
    || window.location.hostname.endsWith('.gemini.google.com');
}

function findGeminiInput(element) {
  if (!element) {
    return null;
  }

  if (element.tagName === 'RICH-TEXTAREA') {
    return element.querySelector('[contenteditable="true"]') || element;
  }

  if (element.contentEditable === 'true') {
    return element.querySelector('p') || element;
  }

  return element;
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

  if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
    inputElement.value = text;
    inputElement.selectionStart = text.length;
    inputElement.selectionEnd = text.length;
  } else if (inputElement.contentEditable === 'true' || inputElement.tagName === 'P') {
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
  } else {
    inputElement.textContent = text;
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
  appendBaseText = null;
}

function injectText(text) {
  const nextText = String(text || '');
  const resolvedInput = resolveInputElement();

  if (!resolvedInput) {
    ipcRenderer.invoke('selector-error', 'gemini', 'Input element not found');
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
  (element) => { inputElement = element; },
  (selector) => findGeminiInput(findElement(selector))
);

const getViewInfo = setupViewInfoListener((viewInfo) => {
  window.polygptGetViewInfo = () => viewInfo;
  createUIControls(viewInfo, GEMINI_UI_OPTIONS);
});

setupSupersizeListener();
setupLoadingOverlay();

waitForDOM(() => {
  const viewInfo = getViewInfo();
  if (viewInfo) {
    createUIControls(viewInfo, GEMINI_UI_OPTIONS);
  }
});
