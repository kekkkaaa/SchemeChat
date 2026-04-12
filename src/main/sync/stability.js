const crypto = require('crypto');

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fingerprintText(text) {
  return crypto
    .createHash('sha1')
    .update(String(text || ''), 'utf8')
    .digest('hex');
}

function hasUsableReply(result) {
  if (!result) {
    return false;
  }

  const text = String(result.text || '').trim();
  if (!text) {
    return false;
  }

  if (typeof result.hasUsableReply === 'boolean') {
    return result.hasUsableReply;
  }

  return true;
}

function buildWeakReplyError(result) {
  const qualityReason = result?.diagnostics?.qualityReason || '';

  switch (qualityReason) {
    case 'matched-weak-pattern':
      return 'Latest reply still looks like provider UI text, not a stable assistant reply.';
    case 'short-root-fallback':
      return 'Latest reply is still too short and fallback-like to trust yet.';
    case 'short-low-structure':
      return 'Latest reply is still too short and weakly structured to trust yet.';
    case 'low-confidence':
      return 'Latest reply is still too low-confidence to trust yet.';
    default:
      return 'Latest reply is not stable enough to trust yet.';
  }
}

async function waitUntilNotBusy(inspectFn, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const pollIntervalMs = options.pollIntervalMs || 700;
  const startedAt = Date.now();

  let lastResult = await inspectFn();
  if (!lastResult.ok) {
    return lastResult;
  }

  while (lastResult.busy) {
    if (Date.now() - startedAt >= timeoutMs) {
      return {
        ...lastResult,
        ok: false,
        error: lastResult.error || 'Timed out while waiting for the provider to stop generating.',
      };
    }

    await delay(pollIntervalMs);
    lastResult = await inspectFn();
    if (!lastResult.ok) {
      return lastResult;
    }
  }

  return lastResult;
}

async function captureUntilStable(inspectFn, options = {}, initialResult = null) {
  const timeoutMs = options.timeoutMs || 12000;
  const pollIntervalMs = options.pollIntervalMs || 700;
  const stablePassesRequired = options.stablePassesRequired || 2;
  const startedAt = Date.now();

  let previousResult = initialResult || await inspectFn();
  if (!previousResult.ok) {
    return previousResult;
  }

  if (previousResult.busy) {
    return {
      ...previousResult,
      ok: false,
      error: previousResult.error || 'The provider is still generating.',
    };
  }

  if (!previousResult.text) {
    return {
      ...previousResult,
      ok: false,
      error: previousResult.error || 'No latest reply was found.',
    };
  }

  if (!hasUsableReply(previousResult)) {
    return {
      ...previousResult,
      ok: false,
      error: previousResult.error || buildWeakReplyError(previousResult),
    };
  }

  let previousFingerprint = previousResult.fingerprint || fingerprintText(previousResult.text);
  let stablePasses = 0;

  while (Date.now() - startedAt < timeoutMs) {
    await delay(pollIntervalMs);

    const currentResult = await inspectFn();
    if (!currentResult.ok) {
      return currentResult;
    }

    if (currentResult.busy) {
      previousResult = currentResult;
      previousFingerprint = currentResult.fingerprint || fingerprintText(currentResult.text);
      stablePasses = 0;
      continue;
    }

    if (!currentResult.text) {
      return {
        ...currentResult,
        ok: false,
        error: currentResult.error || 'No latest reply was found.',
      };
    }

    if (!hasUsableReply(currentResult)) {
      return {
        ...currentResult,
        ok: false,
        error: currentResult.error || buildWeakReplyError(currentResult),
      };
    }

    const currentFingerprint = currentResult.fingerprint || fingerprintText(currentResult.text);
    if (currentFingerprint === previousFingerprint) {
      stablePasses += 1;
      if (stablePasses >= stablePassesRequired) {
        return {
          ...currentResult,
          fingerprint: currentFingerprint,
        };
      }
    } else {
      stablePasses = 0;
    }

    previousResult = currentResult;
    previousFingerprint = currentFingerprint;
  }

  return {
    ...previousResult,
    ok: false,
    error: previousResult.error || 'Timed out while waiting for the latest reply to stabilize.',
  };
}

async function captureStableReply(inspectFn, options = {}) {
  const settledResult = await waitUntilNotBusy(inspectFn, options.busyWait);
  if (!settledResult.ok) {
    return settledResult;
  }

  return captureUntilStable(inspectFn, options.stability, settledResult);
}

module.exports = {
  captureStableReply,
  captureUntilStable,
  delay,
  fingerprintText,
  waitUntilNotBusy,
};
