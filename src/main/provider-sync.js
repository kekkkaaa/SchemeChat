const POLL_INTERVAL_MS = 900;
const STABLE_POLLS_REQUIRED = 1;
const STABLE_TIMEOUT_MS = 8000;

const PROVIDER_SYNC_SPECS = {
  chatgpt: {
    hostPatterns: ['chat.openai.com', 'chatgpt.com'],
    assistantSelectors: [
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
    busyTextPatterns: ['stop generating', '停止生成'],
  },
  gemini: {
    hostPatterns: ['gemini.google.com'],
    assistantSelectors: [
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
    busyTextPatterns: ['stop generating', 'stop response', '停止'],
  },
};

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runProviderInspection(spec) {
  const normalizeText = (text) => {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const isVisible = (element) => {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const queryAllVisible = (selectors) => {
    const results = [];
    const seen = new Set();

    selectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (!seen.has(element) && isVisible(element)) {
            seen.add(element);
            results.push(element);
          }
        });
      } catch (error) {
        // Ignore selector failures and continue trying fallbacks.
      }
    });

    return results;
  };

  const extractBestText = (node) => {
    if (!node) {
      return '';
    }

    const contentCandidates = [];
    (spec.contentSelectors || []).forEach((selector) => {
      try {
        node.querySelectorAll(selector).forEach((child) => {
          contentCandidates.push(child);
        });
      } catch (error) {
        // Ignore selector failures and continue trying fallbacks.
      }
    });

    const candidates = contentCandidates.length > 0 ? contentCandidates : [node];
    let bestText = '';
    candidates.forEach((candidate) => {
      const text = normalizeText(candidate.innerText || candidate.textContent || '');
      if (text.length > bestText.length) {
        bestText = text;
      }
    });

    return bestText;
  };

  const hostMatches = (spec.hostPatterns || []).some((pattern) => {
    return window.location.hostname === pattern || window.location.hostname.endsWith(`.${pattern}`);
  });

  if (!hostMatches) {
    return {
      ok: false,
      busy: false,
      latestReplyText: '',
      error: `Host mismatch: ${window.location.hostname}`,
      url: window.location.href,
      title: document.title,
    };
  }

  const assistantNodes = queryAllVisible(spec.assistantSelectors || []);
  const replies = [];
  const replySet = new Set();

  assistantNodes.forEach((node) => {
    const text = extractBestText(node);
    if (!text) {
      return;
    }

    if (!replySet.has(text)) {
      replySet.add(text);
      replies.push(text);
    }
  });

  const busyBySelector = queryAllVisible(spec.busySelectors || []).length > 0;
  const busyByText = Array.from(document.querySelectorAll('button, [role="button"]')).some((element) => {
    if (!isVisible(element)) {
      return false;
    }

    const labelText = normalizeText(
      [
        element.getAttribute('aria-label') || '',
        element.getAttribute('title') || '',
        element.innerText || '',
        element.textContent || '',
      ].join(' ')
    ).toLowerCase();

    return (spec.busyTextPatterns || []).some((pattern) => labelText.includes(pattern.toLowerCase()));
  });

  return {
    ok: true,
    busy: busyBySelector || busyByText,
    latestReplyText: replies.length > 0 ? replies[replies.length - 1] : '',
    replyCount: replies.length,
    url: window.location.href,
    title: document.title,
  };
}

async function inspectProviderView(view) {
  const providerKey = view.providerKey;
  const spec = PROVIDER_SYNC_SPECS[providerKey];

  if (!spec) {
    return {
      ok: false,
      providerKey,
      busy: false,
      latestReplyText: '',
      error: `Provider ${providerKey} is not supported for sync yet.`,
    };
  }

  try {
    const result = await view.webContents.executeJavaScript(
      `(${runProviderInspection.toString()})(${JSON.stringify(spec)})`,
      true
    );

    return {
      providerKey,
      ...result,
    };
  } catch (error) {
    return {
      ok: false,
      providerKey,
      busy: false,
      latestReplyText: '',
      error: error.message || `Failed to inspect ${providerKey}.`,
    };
  }
}

async function captureStableLatestReply(view, options = {}) {
  const timeoutMs = options.timeoutMs || STABLE_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs || POLL_INTERVAL_MS;
  const stablePollsRequired = options.stablePollsRequired || STABLE_POLLS_REQUIRED;
  const startedAt = Date.now();

  let previousResult = await inspectProviderView(view);
  if (!previousResult.ok || previousResult.busy || !previousResult.latestReplyText) {
    return previousResult;
  }

  let stablePolls = 0;

  while (Date.now() - startedAt < timeoutMs) {
    await delay(pollIntervalMs);

    const currentResult = await inspectProviderView(view);
    if (!currentResult.ok || currentResult.busy || !currentResult.latestReplyText) {
      return currentResult;
    }

    if (currentResult.latestReplyText === previousResult.latestReplyText) {
      stablePolls += 1;
      if (stablePolls >= stablePollsRequired) {
        return currentResult;
      }
    } else {
      stablePolls = 0;
    }

    previousResult = currentResult;
  }

  return previousResult;
}

function buildDiscussionPrompt(sourceProviderName, replyText) {
  return [
    `请阅读下面来自 ${sourceProviderName} 的最新回复，并继续讨论。`,
    '先简要总结对方的关键点，再指出你认同或不同意的地方，最后给出你更新后的结论。',
    '',
    `${sourceProviderName} 最新回复：`,
    replyText,
  ].join('\n');
}

module.exports = {
  buildDiscussionPrompt,
  captureStableLatestReply,
  inspectProviderView,
};
