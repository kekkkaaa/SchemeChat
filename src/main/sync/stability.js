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

function buildPendingCaptureError(result) {
  if (!result) {
    return 'Latest reply is not stable enough to trust yet.';
  }

  const text = String(result.text || '').trim();
  if (!text) {
    return result.error || 'No latest reply was found yet.';
  }

  if (!hasUsableReply(result)) {
    return result.error || buildWeakReplyError(result);
  }

  return result.error || 'Timed out while waiting for the latest reply to stabilize.';
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

  let currentResult = initialResult || await inspectFn();
  let lastObservedResult = currentResult;
  let lastUsableResult = null;
  let lastUsableFingerprint = null;
  let stablePasses = 0;

  while (Date.now() - startedAt < timeoutMs) {
    if (!currentResult.ok) {
      return currentResult;
    }

    lastObservedResult = currentResult;

    if (!currentResult.busy) {
      const currentText = String(currentResult.text || '').trim();
      if (currentText && hasUsableReply(currentResult)) {
        const currentFingerprint = currentResult.fingerprint || fingerprintText(currentText);
        if (currentFingerprint === lastUsableFingerprint) {
          stablePasses += 1;
        } else {
          lastUsableResult = currentResult;
          lastUsableFingerprint = currentFingerprint;
          stablePasses = 1;
        }

        if (stablePasses >= stablePassesRequired) {
          return {
            ...currentResult,
            fingerprint: currentFingerprint,
          };
        }
      } else {
        lastUsableResult = null;
        lastUsableFingerprint = null;
        stablePasses = 0;
      }
    } else {
      lastUsableResult = null;
      lastUsableFingerprint = null;
      stablePasses = 0;
    }

    await delay(pollIntervalMs);
    currentResult = await inspectFn();
  }

  const fallbackResult = lastObservedResult || lastUsableResult || currentResult;
  return {
    ...fallbackResult,
    ok: false,
    error: buildPendingCaptureError(fallbackResult),
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
