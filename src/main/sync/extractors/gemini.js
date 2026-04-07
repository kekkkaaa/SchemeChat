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
  busySelectors: [
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
    'button[aria-label*="Cancel"]',
    'button[mattooltip*="Stop"]',
    '[data-test-id*="stop"]',
  ],
  busyTextPatterns: [
    'stop generating',
    'stop response',
    'cancel',
    '停止',
  ],
  noisePatterns: [
    'copy',
    'edit',
    'google it',
  ],
  minRootTextLength: 30,
  busyWait: {
    pollIntervalMs: 700,
    timeoutMs: 30000,
  },
  stability: {
    pollIntervalMs: 700,
    stablePassesRequired: 2,
    timeoutMs: 12000,
  },
});
