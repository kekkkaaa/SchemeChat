const crypto = require('crypto');
const {
  buildCompletionError,
  evaluateCompletionObservation,
  isTerminalFailureCompletionState,
  mapCompletionReasonToLegacyStatusReason,
  mapCompletionStateToLegacyStatus,
  resolveCompletionPolicyOptions,
  shouldFinalizeCompletion,
} = require('../discussion/completion-policy');

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

function resolveCapturePolicyOptions(options = {}) {
  const busyWait = options?.busyWait || {};
  const stability = options?.stability || {};

  return resolveCompletionPolicyOptions({
    pollIntervalMs: stability.pollIntervalMs || busyWait.pollIntervalMs || 700,
    stablePassesRequired: stability.stablePassesRequired || 2,
    minIdleStableMs: stability.minIdleStableMs,
    stallMs: options?.stallMs,
    requireStableCompletion: true,
    allowSnapshotCompletion: false,
  });
}

function buildStableCaptureResult(result = {}, evaluation = {}, override = {}) {
  const normalizedResult = {
    ...result,
    ...evaluation,
  };
  const completionState = override.completionState || evaluation?.completionState;
  const completionReason = override.completionReason || evaluation?.completionReason;
  const ok = override.ok !== undefined
    ? Boolean(override.ok)
    : !isTerminalFailureCompletionState(completionState);

  return {
    ...normalizedResult,
    ok,
    error: ok ? null : (override.error || buildCompletionError(normalizedResult, { timedOut: override.timedOut })),
    status: override.status || mapCompletionStateToLegacyStatus(completionState, normalizedResult),
    statusReason: override.statusReason || mapCompletionReasonToLegacyStatusReason(completionState, normalizedResult),
    completionState,
    completionReason,
  };
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
  const policy = resolveCapturePolicyOptions({
    stability: options,
  });
  const pollIntervalMs = policy.pollIntervalMs;
  const startedAt = Date.now();

  let currentResult = initialResult || await inspectFn();
  let tracker = {};
  let lastEvaluation = null;

  while (Date.now() - startedAt < timeoutMs) {
    const evaluation = evaluateCompletionObservation(currentResult, tracker, {
      ...policy,
      now: Date.now(),
    });
    tracker = evaluation.nextTracker;
    lastEvaluation = evaluation;

    if (shouldFinalizeCompletion(evaluation)) {
      return buildStableCaptureResult(currentResult, evaluation, { ok: true });
    }

    if (isTerminalFailureCompletionState(evaluation.completionState)) {
      return buildStableCaptureResult(currentResult, evaluation, { ok: false });
    }

    await delay(pollIntervalMs);
    currentResult = await inspectFn();
  }

  return buildStableCaptureResult(currentResult || initialResult || {}, lastEvaluation || {}, {
    ok: false,
    timedOut: true,
  });
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
