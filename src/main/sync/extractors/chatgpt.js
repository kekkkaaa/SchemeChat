const { createDomExtractor } = require('./base');

module.exports = createDomExtractor({
  providerKey: 'chatgpt',
  displayName: 'ChatGPT',
  hostPatterns: ['chat.openai.com', 'chatgpt.com'],
  rootSelectors: [
    'main article [data-message-author-role="assistant"]',
    'article [data-message-author-role="assistant"]',
    'main [data-message-author-role="assistant"]',
    '[data-message-author-role="assistant"]',
  ],
  contentSelectors: [
    '.markdown',
    '[class*="markdown"]',
    '.prose',
    '[class*="prose"]',
  ],
  busySelectors: [
    'button[data-testid="stop-button"]',
    'button[data-testid="composer-stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="停止"]',
  ],
  busyTextPatterns: [
    'stop generating',
    'stop response',
    '停止',
  ],
  noisePatterns: [
    'copy',
    'edit',
    'retry',
    'read aloud',
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
