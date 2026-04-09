const { createDomExtractor } = require('./base');

module.exports = createDomExtractor({
  providerKey: 'gemini',
  displayName: 'Gemini',
  hostPatterns: ['gemini.google.com'],
  rootSelectors: [
    'main model-response',
    'model-response',
    'main [data-response-id]',
    '[data-response-id]',
    'main .response-container',
  ],
  contentSelectors: [
    'message-content',
    '.markdown',
    '[class*="markdown"]',
    '.model-response-text',
    '.response-content',
  ],
  errorSelectors: [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[aria-live="polite"]',
    'mat-snack-bar-container',
    '.mat-mdc-snack-bar-container',
    '[class*="snack"]',
    '[class*="toast"]',
  ],
  errorTextPatterns: [
    'something went wrong',
    'went wrong',
    'try again',
    '发生问题',
    '出了问题',
    '出了点问题',
    '请重试',
    '重试',
    '(13)',
  ],
  busySelectors: [
    'button[aria-label*="Stop"]',
    'button[aria-label*="Cancel"]',
    'button[mattooltip*="Stop"]',
    '[data-test-id*="stop"]',
  ],
  busyTextPatterns: [
    'stop generating',
    'stop response',
    'cancel',
  ],
  noisePatterns: [
    'copy',
    'edit',
    'google it',
  ],
  minRootTextLength: 30,
  busyWait: {
    pollIntervalMs: 700,
    timeoutMs: 45000,
  },
  stability: {
    pollIntervalMs: 700,
    stablePassesRequired: 4,
    timeoutMs: 20000,
  },
});
