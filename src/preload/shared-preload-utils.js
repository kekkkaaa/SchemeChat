const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

const POLYGPT_TOP_BAR_HEIGHT = 44;

function loadConfig() {
  try {
    const configPath = path.join(__dirname, '../../config/selectors.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Failed to load selectors config:', error);
    return {};
  }
}

function findElement(selectors) {
  if (!Array.isArray(selectors)) {
    selectors = [selectors];
  }

  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readInputTextValue(element) {
  if (!element) {
    return '';
  }

  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    return String(element.value || '').replace(/\r\n/g, '\n');
  }

  return String(element.innerText || element.textContent || '').replace(/\r\n/g, '\n');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isVisibleElement(element) {
  if (!element || !(element instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (!style || style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectElementsBySelectors(selectors, scope = document) {
  const normalizedSelectors = Array.isArray(selectors) ? selectors : [selectors];
  const results = [];
  const seen = new Set();

  normalizedSelectors.forEach((selector) => {
    if (!selector) {
      return;
    }

    try {
      scope.querySelectorAll(selector).forEach((element) => {
        if (!seen.has(element)) {
          seen.add(element);
          results.push(element);
        }
      });
    } catch (error) {
      // Ignore invalid selectors and continue with fallbacks.
    }
  });

  return results;
}

function findVisibleElement(selectors, scope = document) {
  return collectElementsBySelectors(selectors, scope).find((element) => isVisibleElement(element)) || null;
}

function findVisibleElements(selectors, scope = document) {
  return collectElementsBySelectors(selectors, scope).filter((element) => isVisibleElement(element));
}

function readElementActionLabel(element) {
  return normalizeText(
    [
      element?.getAttribute?.('aria-label') || '',
      element?.getAttribute?.('title') || '',
      element?.innerText || '',
      element?.textContent || '',
    ].join(' ')
  );
}

function findElementByTextPatterns(
  textPatterns,
  candidateSelectors = ['button', 'a', '[role="button"]', '[role="menuitem"]', '[aria-label]', '[title]'],
  scope = document
) {
  const normalizedPatterns = Array.isArray(textPatterns)
    ? textPatterns.map((pattern) => normalizeText(pattern)).filter(Boolean)
    : [];

  if (normalizedPatterns.length === 0) {
    return null;
  }

  const candidates = collectElementsBySelectors(candidateSelectors, scope);
  for (const candidate of candidates) {
    if (!isVisibleElement(candidate) || candidate.disabled) {
      continue;
    }

    const label = readElementActionLabel(candidate);
    if (normalizedPatterns.some((pattern) => label.includes(pattern))) {
      return candidate;
    }
  }

  return null;
}

function findActionElement(selectors, textPatterns = [], scope = document) {
  return findVisibleElement(selectors, scope)
    || findElementByTextPatterns(
      textPatterns,
      ['button', 'a', '[role="button"]', '[role="menuitem"]', '[aria-label]', '[title]'],
      scope
    );
}

function clickElement(element) {
  if (!element || typeof element.click !== 'function') {
    return false;
  }

  try {
    if (typeof element.focus === 'function') {
      element.focus();
    }

    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((eventName) => {
      const event = new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
      });
      element.dispatchEvent(event);
    });

    element.click();
    return true;
  } catch (error) {
    return false;
  }
}

async function waitForCondition(conditionFn, options = {}) {
  const timeoutMs = options.timeoutMs || 4000;
  const intervalMs = options.intervalMs || 150;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const result = await conditionFn();
      if (result) {
        return result;
      }
    } catch (error) {
      // Ignore transient DOM errors while polling.
    }

    await delay(intervalMs);
  }

  return null;
}

function createSubmitHandler(provider, config, getInputElement, getSubmitElement) {
  return function submitMessage() {
    const submitElement = findElement(config[provider]?.submit);

    if (submitElement) {
      submitElement.click();
    } else {
      const inputElement = getInputElement();
      if (inputElement) {
        // Dispatch a robust sequence of events to simulate a real Enter key press
        const eventOptions = {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window // Important for some frameworks
        };

        const keydown = new KeyboardEvent('keydown', eventOptions);
        const keypress = new KeyboardEvent('keypress', eventOptions);
        const keyup = new KeyboardEvent('keyup', eventOptions);

        inputElement.dispatchEvent(keydown);
        inputElement.dispatchEvent(keypress);
        inputElement.dispatchEvent(keyup);
        
        // Some React inputs might need a change event if the value was just set programmatically
        // but for "Enter" submission, the key events are usually the trigger.
      }
    }
  };
}

function setupIPCListeners(provider, config, injectTextFn, submitFn, options = {}) {
  let lastSentText = null;
  ipcRenderer.on('text-update', (event, text) => {
    if (text !== lastSentText) {
      lastSentText = text;
      injectTextFn(text);
    }
  });

  ipcRenderer.on('submit-message', () => {
    lastSentText = null;
    if (typeof options.onBeforeSubmit === 'function') {
      options.onBeforeSubmit();
    }
    submitFn();
  });

  ipcRenderer.on('inject-sync-text', (event, text) => {
    lastSentText = text;
    if (typeof options.onSyncText === 'function') {
      options.onSyncText(text);
      return;
    }

    injectTextFn(text);
  });

  ipcRenderer.on('new-chat', () => {
    lastSentText = null;
    if (typeof options.onBeforeNewChat === 'function') {
      options.onBeforeNewChat();
    }
    const newChatButton = findElement(config[provider]?.newChat);
    if (newChatButton) {
      newChatButton.click();
    } else {
      console.warn(`[${provider.charAt(0).toUpperCase() + provider.slice(1)}] New chat button not found`);
    }
  });

  if (typeof options.onPrivateNewChat === 'function') {
    ipcRenderer.on('private-new-chat', async (event, payload) => {
      try {
        await options.onPrivateNewChat(payload);
      } catch (error) {
        const requestId = payload?.requestId || null;
        const paneId = payload?.paneId || null;
        const message = error?.message || 'Private/temporary chat flow failed unexpectedly.';
        ipcRenderer.invoke('private-new-chat-result', {
          requestId,
          paneId,
          provider,
          ok: false,
          error: message,
        });
      }
    });
  }
}

function setupInputScanner(provider, config, getInputElement, setInputElement, findInputFn) {
  let scanAttempts = 0;
  const scanInterval = setInterval(() => {
    if (!getInputElement() && scanAttempts < 10) {
      const element = findInputFn ? findInputFn(config[provider]?.input) : findElement(config[provider]?.input);
      setInputElement(element);
      scanAttempts++;
    } else {
      clearInterval(scanInterval);
    }
  }, 500);
}

function removeExistingControls() {
  cleanupTopBarInsetTracking();
  const existingContainer = document.getElementById('polygpt-controls-container');
  if (existingContainer) {
    existingContainer.remove();
  }
}

function cleanupTopBarInsetTracking() {
  if (typeof window.__polygptTopInsetCleanup === 'function') {
    window.__polygptTopInsetCleanup();
    window.__polygptTopInsetCleanup = null;
  }

  resetAdjustedTopElements();
}

function resetAdjustedTopElements() {
  const adjustedElements = document.querySelectorAll('[data-polygpt-adjusted-top="true"]');
  adjustedElements.forEach((element) => {
    if (element.dataset.polygptOriginalInlineTop) {
      element.style.setProperty('top', element.dataset.polygptOriginalInlineTop, 'important');
    } else {
      element.style.removeProperty('top');
    }

    delete element.dataset.polygptAdjustedTop;
    delete element.dataset.polygptOriginalInlineTop;
  });
}

function shouldOffsetTopAnchoredElement(element, insetPx) {
  if (!element || element.id === 'polygpt-controls-container') {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (!style || !['fixed', 'sticky'].includes(style.position)) {
    return false;
  }

  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.height <= 0 || rect.bottom <= 0) {
    return false;
  }

  return rect.top < insetPx && rect.bottom > 0;
}

function collectTopAnchoredCandidates(insetPx) {
  if (typeof document.elementsFromPoint !== 'function') {
    return [];
  }

  const sampleXs = [...new Set([
    16,
    Math.floor(window.innerWidth / 2),
    Math.max(16, window.innerWidth - 16),
    Math.max(16, window.innerWidth - 120),
  ])].filter((value) => value > 0 && value < window.innerWidth);

  const sampleYs = [...new Set([
    4,
    16,
    28,
    40,
    Math.max(4, insetPx - 12),
    Math.max(4, insetPx - 4),
  ])].filter((value) => value < window.innerHeight);
  const candidates = new Set();

  sampleXs.forEach((x) => {
    sampleYs.forEach((y) => {
      const stack = document.elementsFromPoint(x, y);
      stack.forEach((element) => {
        let current = element;
        while (current && current !== document.body && current !== document.documentElement) {
          if (shouldOffsetTopAnchoredElement(current, insetPx)) {
            candidates.add(current);
          }
          current = current.parentElement;
        }
      });
    });
  });

  return [...candidates];
}

function applyTopOffsetToElement(element, insetPx) {
  const computedTop = window.getComputedStyle(element).top;
  const rect = element.getBoundingClientRect();
  const originalInlineTop = element.style.top || '';
  const shiftPx = Math.max(insetPx - rect.top, 0);

  element.dataset.polygptOriginalInlineTop = originalInlineTop;
  element.dataset.polygptAdjustedTop = 'true';

  if (computedTop && computedTop !== 'auto') {
    element.style.setProperty('top', `calc(${computedTop} + ${shiftPx}px)`, 'important');
    return;
  }

  const fallbackTop = Math.max(rect.top, 0) + shiftPx;
  element.style.setProperty('top', `${fallbackTop}px`, 'important');
}

function syncTopAnchoredElements(insetPx) {
  resetAdjustedTopElements();
  const candidates = collectTopAnchoredCandidates(insetPx);
  candidates.forEach((element) => applyTopOffsetToElement(element, insetPx));
}

function setupTopBarInsetTracking(insetPx, options = {}) {
  const observeDomMutations = options.observeDomMutations !== false;
  const observeScroll = options.observeScroll !== false;
  const observeResize = options.observeResize !== false;
  const delayedSyncDelays = Array.isArray(options.delayedSyncDelays)
    ? options.delayedSyncDelays.filter((delayMs) => Number.isFinite(delayMs) && delayMs >= 0)
    : [];

  let frameId = null;
  let ignoreObserverMutations = false;
  let ignoreObserverTimer = null;
  let mutationObserver = null;
  const delayedSyncTimers = [];

  const scheduleSync = () => {
    if (frameId !== null) {
      return;
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      ignoreObserverMutations = true;
      if (ignoreObserverTimer !== null) {
        window.clearTimeout(ignoreObserverTimer);
      }
      ignoreObserverTimer = window.setTimeout(() => {
        ignoreObserverMutations = false;
        ignoreObserverTimer = null;
      }, 0);
      syncTopAnchoredElements(insetPx);
    });
  };

  if (observeDomMutations) {
    mutationObserver = new MutationObserver(() => {
      if (ignoreObserverMutations) {
        return;
      }
      scheduleSync();
    });
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }

  if (observeResize) {
    window.addEventListener('resize', scheduleSync);
  }

  if (observeScroll) {
    window.addEventListener('scroll', scheduleSync, true);
  }

  delayedSyncDelays.forEach((delayMs) => {
    const timerId = window.setTimeout(scheduleSync, delayMs);
    delayedSyncTimers.push(timerId);
  });

  window.__polygptTopInsetCleanup = () => {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (ignoreObserverTimer !== null) {
      window.clearTimeout(ignoreObserverTimer);
      ignoreObserverTimer = null;
    }
    delayedSyncTimers.forEach((timerId) => window.clearTimeout(timerId));
    ignoreObserverMutations = false;
    if (observeResize) {
      window.removeEventListener('resize', scheduleSync);
    }
    if (observeScroll) {
      window.removeEventListener('scroll', scheduleSync, true);
    }
  };

  scheduleSync();
}

function applyTopBarInset(insetPx = POLYGPT_TOP_BAR_HEIGHT, options = {}) {
  const normalizedInsetPx = Math.max(0, Math.ceil(insetPx));
  const inset = `${normalizedInsetPx}px`;
  document.documentElement.style.setProperty('scroll-padding-top', inset);
  document.body.style.setProperty('padding-top', inset, 'important');
  document.body.style.setProperty('box-sizing', 'border-box', 'important');
  setupTopBarInsetTracking(normalizedInsetPx, options);
}

function createControlsContainer() {
  const container = document.createElement('div');
  container.id = 'polygpt-controls-container';
  Object.assign(container.style, {
    all: 'initial',
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    height: `${POLYGPT_TOP_BAR_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '6px',
    padding: '4px 10px',
    zIndex: '9999999',
    pointerEvents: 'none',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: '14px',
    fontWeight: 'normal',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    boxSizing: 'border-box',
    margin: '0',
    background: 'linear-gradient(to bottom, rgba(20, 20, 20, 0.92), rgba(20, 20, 20, 0.65), rgba(20, 20, 20, 0))',
  });
  return container;
}

function createProviderDropdown() {
  const dropdownContainer = document.createElement('div');
  dropdownContainer.id = 'polygpt-provider-dropdown';
  dropdownContainer.title = 'Switch Provider';

  const selected = document.createElement('div');
  selected.className = 'dropdown-selected';

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.style.display = 'none';

  dropdownContainer.appendChild(selected);
  dropdownContainer.appendChild(menu);

  return dropdownContainer;
}

function styleDropdown(dropdown) {
  const selected = dropdown.querySelector('.dropdown-selected');
  const menu = dropdown.querySelector('.dropdown-menu');

  Object.assign(dropdown.style, {
    position: 'relative',
    cursor: 'pointer',
    boxSizing: 'border-box',
    margin: '0',
    pointerEvents: 'auto',
  });

  Object.assign(selected.style, {
    border: 'none',
    borderRadius: '6px',
    background: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    fontSize: '14px',
    fontFamily: 'inherit',
    fontWeight: 'normal',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    padding: '8px 12px',
    height: '36px',
    minWidth: '100px',
    backdropFilter: 'blur(4px)',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    boxSizing: 'border-box',
    margin: '0',
  });

  Object.assign(menu.style, {
    position: 'absolute',
    top: '40px',
    left: '0',
    width: '100%',
    border: 'none',
    borderRadius: '6px',
    background: 'rgba(0, 0, 0, 0.9)',
    backdropFilter: 'blur(4px)',
    zIndex: '10000000',
    overflow: 'hidden',
    boxSizing: 'border-box',
    margin: '0',
    padding: '0',
  });
}

function populateDropdownOptions(dropdown, viewInfo) {
  const selected = dropdown.querySelector('.dropdown-selected');
  const menu = dropdown.querySelector('.dropdown-menu');

  const currentProvider = viewInfo.availableProviders.find(p => p.key === viewInfo.provider);
  selected.textContent = currentProvider ? currentProvider.name : '';

  viewInfo.availableProviders.forEach(provider => {
    const option = document.createElement('div');
    option.className = 'dropdown-option';
    option.dataset.value = provider.key;
    option.textContent = provider.name;

    Object.assign(option.style, {
      padding: '10px 12px',
      color: 'white',
      fontSize: '14px',
      fontFamily: 'inherit',
      fontWeight: 'normal',
      lineHeight: 'normal',
      letterSpacing: 'normal',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      background: provider.key === viewInfo.provider ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
      boxSizing: 'border-box',
      margin: '0',
      border: 'none',
    });

    option.addEventListener('mouseenter', () => {
      option.style.background = 'rgba(255, 255, 255, 0.2)';
    });

    option.addEventListener('mouseleave', () => {
      option.style.background = provider.key === viewInfo.provider ? 'rgba(255, 255, 255, 0.1)' : 'transparent';
    });

    menu.appendChild(option);
  });
}

function attachDropdownEventListeners(dropdown, viewInfo) {
  const selected = dropdown.querySelector('.dropdown-selected');
  const menu = dropdown.querySelector('.dropdown-menu');

  let hideTimeout;

  const showMenu = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    selected.style.background = 'rgba(0, 0, 0, 0.7)';
    menu.style.display = 'block';
  };

  const hideMenu = () => {
    hideTimeout = setTimeout(() => {
      selected.style.background = 'rgba(0, 0, 0, 0.5)';
      menu.style.display = 'none';
    }, 100);
  };

  dropdown.addEventListener('mouseenter', showMenu);
  dropdown.addEventListener('mouseleave', hideMenu);
  menu.addEventListener('mouseenter', showMenu);
  menu.addEventListener('mouseleave', hideMenu);

  menu.addEventListener('click', async (e) => {
    if (e.target.classList.contains('dropdown-option')) {
      const newProvider = e.target.dataset.value;
      selected.textContent = e.target.textContent;
      await ipcRenderer.invoke('change-provider', viewInfo.position, newProvider);
      if (hideTimeout) clearTimeout(hideTimeout);
      selected.style.background = 'rgba(0, 0, 0, 0.5)';
      menu.style.display = 'none';
    }
  });
}

function createSupersizeButton() {
  const button = document.createElement('button');
  button.id = 'polygpt-supersize-btn';
  button.title = 'Supersize / Restore';
  return button;
}

function styleButton(button) {
  Object.assign(button.style, {
    border: 'none',
    borderRadius: '6px',
    background: 'rgba(0, 0, 0, 0.5)',
    color: 'white',
    width: '36px',
    height: '36px',
    minWidth: '36px',
    minHeight: '36px',
    maxWidth: '36px',
    maxHeight: '36px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    transition: 'all 0.2s ease',
    padding: '0',
    margin: '0',
    fontSize: '16px',
    fontFamily: 'inherit',
    fontWeight: 'normal',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  });
}

function createButtonIcons(button) {
  const expandIcon = document.createElement('span');
  expandIcon.className = 'icon-expand';
  expandIcon.textContent = '⛶';
  expandIcon.style.display = 'block';

  const collapseIcon = document.createElement('span');
  collapseIcon.className = 'icon-collapse';
  collapseIcon.textContent = '◱';
  collapseIcon.style.display = 'none';

  button.appendChild(expandIcon);
  button.appendChild(collapseIcon);
}

function attachButtonEventListeners(button, viewInfo) {
  button.addEventListener('mouseenter', () => {
    button.style.background = 'rgba(0, 0, 0, 0.7)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = 'rgba(0, 0, 0, 0.5)';
  });

  button.addEventListener('mousedown', () => {
    button.style.transform = 'scale(0.95)';
  });

  button.addEventListener('mouseup', () => {
    button.style.transform = 'scale(1)';
  });

  button.addEventListener('click', async () => {
    await ipcRenderer.invoke('toggle-supersize', viewInfo.position);
  });
}

function createUIControls(viewInfo, options = {}) {
  removeExistingControls();

  const container = createControlsContainer();

  const dropdown = createProviderDropdown();
  styleDropdown(dropdown);
  populateDropdownOptions(dropdown, viewInfo);
  attachDropdownEventListeners(dropdown, viewInfo);

  const button = createSupersizeButton();
  styleButton(button);
  createButtonIcons(button);
  attachButtonEventListeners(button, viewInfo);

  container.appendChild(dropdown);
  container.appendChild(button);
  document.body.appendChild(container);

  const insetPx = container.getBoundingClientRect().bottom;
  applyTopBarInset(insetPx, options.topBarInset || {});
}

function setupViewInfoListener(createUIControlsFn) {
  let viewInfo = null;

  ipcRenderer.on('view-info', (event, info) => {
    viewInfo = info;
    if (document.body) {
      createUIControlsFn(info);
    }
  });

  return () => viewInfo;
}

function setupSupersizeListener() {
  ipcRenderer.on('supersize-state-changed', (event, supersizedPosition) => {
    const button = document.getElementById('polygpt-supersize-btn');
    const viewInfoGetter = window.polygptGetViewInfo;

    if (!button || !viewInfoGetter) return;

    const viewInfo = viewInfoGetter();
    if (!viewInfo) return;

    const expandIcon = button.querySelector('.icon-expand');
    const collapseIcon = button.querySelector('.icon-collapse');

    if (supersizedPosition === viewInfo.position) {
      expandIcon.style.display = 'none';
      collapseIcon.style.display = 'block';
    } else {
      expandIcon.style.display = 'block';
      collapseIcon.style.display = 'none';
    }
  });
}

function createLoadingOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'polygpt-loading-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    background: 'rgba(255, 255, 255, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '9999999',
    backdropFilter: 'blur(4px)',
  });

  const spinner = document.createElement('div');
  Object.assign(spinner.style, {
    width: '50px',
    height: '50px',
    border: '4px solid rgba(0, 0, 0, 0.1)',
    borderTop: '4px solid rgba(0, 0, 0, 0.6)',
    borderRadius: '50%',
    animation: 'polygpt-spin 1s linear infinite',
  });

  const style = document.createElement('style');
  style.textContent = `
    @keyframes polygpt-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  overlay.appendChild(spinner);
  document.body.appendChild(overlay);

  return overlay;
}

function setupLoadingOverlay() {
  let loadingOverlay = null;
  if (document.body) {
    loadingOverlay = createLoadingOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      loadingOverlay = createLoadingOverlay();
    });
  }

  window.addEventListener('load', () => {
    if (loadingOverlay) {
      loadingOverlay.style.opacity = '0';
      loadingOverlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => {
        if (loadingOverlay && loadingOverlay.parentNode) {
          loadingOverlay.parentNode.removeChild(loadingOverlay);
        }
        loadingOverlay = null;
      }, 300);
    }
  });
}

function waitForDOM(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

module.exports = {
  clickElement,
  collectElementsBySelectors,
  loadConfig,
  delay,
  findActionElement,
  findElement,
  findElementByTextPatterns,
  findVisibleElement,
  findVisibleElements,
  isVisibleElement,
  normalizeText,
  readElementActionLabel,
  readInputTextValue,
  createSubmitHandler,
  setupIPCListeners,
  setupInputScanner,
  createUIControls,
  setupViewInfoListener,
  setupSupersizeListener,
  createLoadingOverlay,
  setupLoadingOverlay,
  waitForCondition,
  waitForDOM,
};
