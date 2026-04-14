const { createDomExtractor } = require('./base');

module.exports = createDomExtractor({
  providerKey: 'grok',
  displayName: 'Grok',
  hostPatterns: ['x.com'],
  rootSelectors: [
    '[data-testid*="conversation"]',
    '[data-testid*="response"]',
    '[data-testid*="message"]',
    'main [role="article"]',
    'main article',
    'article',
    'main section article',
    'main [data-testid="cellInnerDiv"]',
  ],
  busySelectors: [
    '[data-testid*="stop"]',
    'button[aria-label*="Stop"]',
    'button[title*="Stop"]',
    '[role="button"][aria-label*="Stop"]',
    '[role="progressbar"]',
  ],
  busyTextPatterns: [
    'stop',
    'generating',
    '停止',
  ],
  excludeSelectors: [
    '[data-testid="Grok_Compose_Textarea_ID"]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea',
    'form',
  ],
  anchorSelectors: [
    'button',
    '[role="button"]',
    '[aria-label]',
    '[title]',
  ],
  anchorTextPatterns: [
    'copy text',
    'copy markdown',
    'copy',
  ],
  noisePatterns: [
    'copy text',
    'copy markdown',
    'copy',
    'share',
    'regenerate',
    'good response',
    'bad response',
  ],
  minRootTextLength: 80,
  anchorAncestorDepth: 7,
  busyWait: {
    pollIntervalMs: 800,
    timeoutMs: 35000,
  },
  stability: {
    pollIntervalMs: 900,
    stablePassesRequired: 4,
    minIdleStableMs: 2800,
    timeoutMs: 22000,
  },
});
