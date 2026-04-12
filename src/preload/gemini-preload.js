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
const GEMINI_UNSAFE_LOGIN_NOTICE_ID = 'schemechat-gemini-unsafe-login-notice';
const GEMINI_UNSAFE_LOGIN_STRONG_PATTERNS = [
  '此浏览器或应用可能不安全',
  'this browser or app may not be secure',
];
const GEMINI_UNSAFE_LOGIN_SIGN_IN_PATTERNS = [
  '无法登录',
  'couldn’t sign you in',
  "couldn't sign you in",
];
const GEMINI_UNSAFE_LOGIN_AUX_PATTERNS = [
  '请尝试使用其他浏览器',
  'try using a different browser',
  '如果您使用的是受支持的浏览器，可以重新尝试登录',
  "if you're already using a supported browser, you can try again to sign in",
];

let inputElement = null;
let lastSubmittedText = '';
let hasReportedUnsafeGeminiLogin = false;
let unsafeGeminiLoginObserver = null;
let unsafeGeminiLoginFrameId = null;
let unsafeGeminiLoginDismissed = false;

function isGeminiHost() {
  return window.location.hostname === 'gemini.google.com'
    || window.location.hostname.endsWith('.gemini.google.com');
}

function isGoogleAccountsHost() {
  return window.location.hostname === 'accounts.google.com'
    || window.location.hostname.endsWith('.accounts.google.com');
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

function readGeminiPageSurfaceText() {
  return normalizeGeminiText([
    document.title || '',
    document.body?.textContent || '',
  ].join('\n')).toLowerCase();
}

function isUnsafeGeminiLoginPage() {
  if (!isGoogleAccountsHost()) {
    return false;
  }

  const pageText = readGeminiPageSurfaceText();
  const hasStrongMatch = GEMINI_UNSAFE_LOGIN_STRONG_PATTERNS.some((pattern) => {
    const normalizedPattern = normalizeGeminiText(pattern).toLowerCase();
    return normalizedPattern.length > 0 && pageText.includes(normalizedPattern);
  });
  if (hasStrongMatch) {
    return true;
  }

  const hasSignInFailure = GEMINI_UNSAFE_LOGIN_SIGN_IN_PATTERNS.some((pattern) => {
    const normalizedPattern = normalizeGeminiText(pattern).toLowerCase();
    return normalizedPattern.length > 0 && pageText.includes(normalizedPattern);
  });
  if (!hasSignInFailure) {
    return false;
  }

  return GEMINI_UNSAFE_LOGIN_AUX_PATTERNS.some((pattern) => {
    const normalizedPattern = normalizeGeminiText(pattern).toLowerCase();
    return normalizedPattern.length > 0 && pageText.includes(normalizedPattern);
  });
}

function teardownUnsafeGeminiLoginGuard() {
  if (unsafeGeminiLoginObserver) {
    unsafeGeminiLoginObserver.disconnect();
    unsafeGeminiLoginObserver = null;
  }

  if (unsafeGeminiLoginFrameId !== null) {
    window.cancelAnimationFrame(unsafeGeminiLoginFrameId);
    unsafeGeminiLoginFrameId = null;
  }
}

function removeUnsafeGeminiLoginNotice() {
  const existingNotice = document.getElementById(GEMINI_UNSAFE_LOGIN_NOTICE_ID);
  if (existingNotice) {
    existingNotice.remove();
  }
}

function ensureUnsafeGeminiLoginNotice() {
  if (document.getElementById(GEMINI_UNSAFE_LOGIN_NOTICE_ID)) {
    return;
  }

  const notice = document.createElement('div');
  notice.id = GEMINI_UNSAFE_LOGIN_NOTICE_ID;
  Object.assign(notice.style, {
    position: 'fixed',
    top: '56px',
    right: '16px',
    width: '340px',
    maxWidth: 'calc(100vw - 32px)',
    zIndex: '10000001',
    borderRadius: '14px',
    padding: '14px 16px 16px',
    background: 'rgba(120, 53, 15, 0.96)',
    color: '#fff7ed',
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.28)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    lineHeight: '1.45',
    pointerEvents: 'auto',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '6px',
  });

  const title = document.createElement('div');
  title.textContent = 'Gemini 登录被 Google 拦截';
  Object.assign(title.style, {
    fontSize: '14px',
    fontWeight: '700',
    flex: '1',
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '关闭';
  Object.assign(closeButton.style, {
    border: 'none',
    borderRadius: '999px',
    padding: '4px 10px',
    background: 'rgba(255, 247, 237, 0.14)',
    color: '#fff7ed',
    cursor: 'pointer',
    fontSize: '12px',
  });
  closeButton.addEventListener('click', () => {
    unsafeGeminiLoginDismissed = true;
    removeUnsafeGeminiLoginNotice();
  });

  const body = document.createElement('div');
  body.textContent = '当前页面属于 Google 对内嵌浏览器的登录拦截，不是 SchemeChat 提交失败。新用户首次登录 Gemini 可能无法完成，请优先使用已有会话，或先改用其他 Provider。';
  Object.assign(body.style, {
    fontSize: '12px',
    opacity: '0.96',
  });

  header.appendChild(title);
  header.appendChild(closeButton);
  notice.appendChild(header);
  notice.appendChild(body);
  document.body.appendChild(notice);
}

function syncUnsafeGeminiLoginState() {
  if (!document.body) {
    return;
  }

  if (!isGoogleAccountsHost()) {
    removeUnsafeGeminiLoginNotice();
    hasReportedUnsafeGeminiLogin = false;
    unsafeGeminiLoginDismissed = false;
    teardownUnsafeGeminiLoginGuard();
    return;
  }

  if (isUnsafeGeminiLoginPage()) {
    if (!unsafeGeminiLoginDismissed) {
      ensureUnsafeGeminiLoginNotice();
    }
    if (!hasReportedUnsafeGeminiLogin) {
      hasReportedUnsafeGeminiLogin = true;
      ipcRenderer.invoke('provider-warning', 'gemini', 'unsafe-login-blocked');
    }
    return;
  }

  removeUnsafeGeminiLoginNotice();
  hasReportedUnsafeGeminiLogin = false;
  unsafeGeminiLoginDismissed = false;
}

function scheduleUnsafeGeminiLoginStateSync() {
  if (unsafeGeminiLoginFrameId !== null) {
    return;
  }

  unsafeGeminiLoginFrameId = window.requestAnimationFrame(() => {
    unsafeGeminiLoginFrameId = null;
    syncUnsafeGeminiLoginState();
  });
}

function setupUnsafeGeminiLoginGuard() {
  if (!isGoogleAccountsHost()) {
    teardownUnsafeGeminiLoginGuard();
    return;
  }

  if (unsafeGeminiLoginObserver || !document.documentElement) {
    scheduleUnsafeGeminiLoginStateSync();
    return;
  }

  unsafeGeminiLoginObserver = new MutationObserver(() => {
    scheduleUnsafeGeminiLoginStateSync();
  });

  unsafeGeminiLoginObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  [0, 400, 1200, 2600].forEach((delayMs) => {
    window.setTimeout(scheduleUnsafeGeminiLoginStateSync, delayMs);
  });
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
    return {
      ok: false,
      stage: 'input-missing',
      error: 'Input element not found.',
    };
  }

  const wrote = writeInputText(String(text || ''));
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
    return {
      ok: false,
      stage: 'input-missing',
      error: 'Input element not found.',
    };
  }

  lastSubmittedText = readGeminiEditorText(resolvedInput);
  const submitElement = findVisibleElement(config.gemini?.submit, document);
  const clicked = submitElement && !submitElement.disabled
    ? clickGeminiButtonOnce(submitElement)
    : false;

  if (!clicked) {
    const submittedByEnter = dispatchGeminiEnterSubmit(resolvedInput);
    if (!submittedByEnter) {
      return {
        ok: false,
        stage: 'submit-unavailable',
        error: 'Gemini submit action was unavailable.',
      };
    }

    clearSubmittedTextIfStillPresent(lastSubmittedText);
    return {
      ok: true,
      stage: 'enter-submitted',
    };
  }

  clearSubmittedTextIfStillPresent(lastSubmittedText);
  return {
    ok: true,
    stage: 'submit-clicked',
  };
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
  window.schemechatGetViewInfo = () => viewInfo;
  createUIControls(viewInfo, GEMINI_UI_OPTIONS);
});

setupSupersizeListener();

waitForDOM(() => {
  setupUnsafeGeminiLoginGuard();
  const viewInfo = getViewInfo();
  if (viewInfo) {
    createUIControls(viewInfo, GEMINI_UI_OPTIONS);
  }
});
