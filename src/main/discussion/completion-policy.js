const {
  hashArtifactText,
  normalizeArtifactText,
} = require('./reply-artifact');

const DEFAULT_COMPLETION_POLICY = Object.freeze({
  stablePassesRequired: 2,
  minIdleStableMs: 900,
  stallMs: 45000,
  allowSnapshotCompletion: true,
  requireStableCompletion: false,
});

function resolveCompletionPolicyOptions(options = {}) {
  const stablePassesRequired = Number.isFinite(options?.stablePassesRequired)
    ? Math.max(1, Math.floor(options.stablePassesRequired))
    : DEFAULT_COMPLETION_POLICY.stablePassesRequired;
  const pollIntervalMs = Number.isFinite(options?.pollIntervalMs)
    ? Math.max(100, Math.floor(options.pollIntervalMs))
    : 700;
  const minIdleStableMs = Number.isFinite(options?.minIdleStableMs)
    ? Math.max(0, Math.floor(options.minIdleStableMs))
    : Math.max(
      DEFAULT_COMPLETION_POLICY.minIdleStableMs,
      pollIntervalMs * Math.max(1, stablePassesRequired - 1)
    );

  return {
    stablePassesRequired,
    pollIntervalMs,
    minIdleStableMs,
    stallMs: Number.isFinite(options?.stallMs)
      ? Math.max(0, Math.floor(options.stallMs))
      : DEFAULT_COMPLETION_POLICY.stallMs,
    allowSnapshotCompletion: options?.allowSnapshotCompletion !== undefined
      ? Boolean(options.allowSnapshotCompletion)
      : DEFAULT_COMPLETION_POLICY.allowSnapshotCompletion,
    requireStableCompletion: options?.requireStableCompletion !== undefined
      ? Boolean(options.requireStableCompletion)
      : DEFAULT_COMPLETION_POLICY.requireStableCompletion,
  };
}

function createCompletionTracker(seed = {}) {
  return {
    lastFingerprint: String(seed?.lastFingerprint || '').trim(),
    lastBusy: Boolean(seed?.lastBusy),
    lastCompletionState: String(seed?.lastCompletionState || '').trim(),
    unchangedSince: Number.isFinite(seed?.unchangedSince) ? seed.unchangedSince : 0,
    idleSince: Number.isFinite(seed?.idleSince) ? seed.idleSince : 0,
    stablePasses: Number.isFinite(seed?.stablePasses) ? seed.stablePasses : 0,
  };
}

function normalizeCompletionObservation(result = {}) {
  const latestReplyText = normalizeArtifactText(result?.latestReplyText || result?.text || '');
  const hasReply = latestReplyText.length > 0;
  const hasUsableReply = result?.hasUsableReply !== undefined
    ? Boolean(result.hasUsableReply) && hasReply
    : hasReply;
  const diagnostics = result?.diagnostics && typeof result.diagnostics === 'object'
    ? result.diagnostics
    : {};
  const fingerprint = String(result?.fingerprint || '').trim()
    || (latestReplyText ? hashArtifactText(latestReplyText) : '');
  const confidence = Number.isFinite(result?.confidence) ? result.confidence : 0;
  const replyQuality = String(
    result?.replyQuality || (hasUsableReply ? 'usable' : hasReply ? 'weak' : 'missing')
  ).trim();
  const sourceMethod = String(result?.sourceMethod || 'dom').trim() || 'dom';
  const error = result?.error ? String(result.error) : null;

  return {
    ...result,
    ok: result?.ok !== undefined ? Boolean(result.ok) : true,
    busy: Boolean(result?.busy),
    text: latestReplyText,
    latestReplyText,
    replyLength: latestReplyText.length,
    hasReply,
    hasUsableReply,
    confidence,
    replyQuality,
    sourceMethod,
    diagnostics,
    error,
    fingerprint,
  };
}

function getWeakReplyReason(observation) {
  const qualityReason = String(observation?.diagnostics?.qualityReason || '').trim();
  if (qualityReason) {
    return `weak-reply:${qualityReason}`;
  }

  if (observation?.replyQuality) {
    return `weak-reply:${observation.replyQuality}`;
  }

  return 'weak-reply';
}

function getHardErrorReason(observation) {
  if (String(observation?.sourceMethod || '').trim() === 'unsupported') {
    return 'unsupported-provider';
  }

  if (observation?.error) {
    return observation.hasReply ? 'reply-with-error' : 'inspection-failed';
  }

  return 'inspection-failed';
}

function evaluateCompletionObservation(result = {}, tracker = {}, options = {}) {
  const policy = resolveCompletionPolicyOptions(options);
  const observation = normalizeCompletionObservation(result);
  const currentTracker = createCompletionTracker(tracker);
  const now = Number.isFinite(options?.now) ? options.now : Date.now();
  const sameFingerprint = Boolean(
    observation.fingerprint
      && currentTracker.lastFingerprint
      && observation.fingerprint === currentTracker.lastFingerprint
  );

  const stablePasses = observation.hasReply
    ? (sameFingerprint ? currentTracker.stablePasses + 1 : 1)
    : 0;
  const unchangedSince = observation.hasReply
    ? (sameFingerprint && currentTracker.unchangedSince > 0 ? currentTracker.unchangedSince : now)
    : 0;
  const idleSince = !observation.busy && observation.hasReply
    ? (sameFingerprint && !currentTracker.lastBusy && currentTracker.idleSince > 0
      ? currentTracker.idleSince
      : now)
    : 0;
  const busyStableMs = observation.busy && observation.hasReply && unchangedSince > 0
    ? now - unchangedSince
    : 0;
  const idleStableMs = !observation.busy && observation.hasReply && idleSince > 0
    ? now - idleSince
    : 0;

  let completionState = 'pending_capture';
  let completionReason = 'pending-latest-reply';

  if (!observation.hasReply) {
    if (!observation.ok && observation.error) {
      completionState = 'hard_error';
      completionReason = getHardErrorReason(observation);
    } else if (observation.busy) {
      completionState = 'pending_capture';
      completionReason = 'provider-busy';
    } else if (observation.sourceMethod === 'dom-pending' || observation.diagnostics?.pendingLatestReply) {
      completionState = 'pending_capture';
      completionReason = 'pending-latest-reply';
    } else {
      completionState = 'pending_capture';
      completionReason = 'no-reply';
    }
  } else if (!observation.ok && observation.error) {
    completionState = 'hard_error';
    completionReason = getHardErrorReason(observation);
  } else if (!observation.hasUsableReply) {
    completionState = 'weak_reply';
    completionReason = getWeakReplyReason(observation);
  } else if (observation.busy) {
    if (policy.stallMs > 0 && busyStableMs >= policy.stallMs) {
      completionState = 'stalled';
      completionReason = 'busy-stalled';
    } else {
      completionState = 'pending_capture';
      completionReason = 'provider-busy';
    }
  } else if (!policy.requireStableCompletion) {
    completionState = policy.allowSnapshotCompletion ? 'completed' : 'pending_capture';
    completionReason = policy.allowSnapshotCompletion ? 'usable-reply' : 'awaiting-stable-idle';
  } else if (
    stablePasses >= policy.stablePassesRequired
      && idleStableMs >= policy.minIdleStableMs
  ) {
    completionState = 'completed';
    completionReason = 'stable-reply';
  } else {
    completionState = 'pending_capture';
    completionReason = stablePasses < policy.stablePassesRequired
      ? 'awaiting-stable-repeat'
      : 'awaiting-stable-idle';
  }

  const nextTracker = createCompletionTracker({
    lastFingerprint: observation.fingerprint,
    lastBusy: observation.busy,
    lastCompletionState: completionState,
    unchangedSince,
    idleSince,
    stablePasses,
  });

  return {
    ...observation,
    completionState,
    completionReason,
    stablePasses,
    unchangedSince,
    idleSince,
    busyStableMs,
    idleStableMs,
    nextTracker,
  };
}

function isCompletedCompletionState(completionState) {
  return String(completionState || '').trim() === 'completed';
}

function isTerminalFailureCompletionState(completionState) {
  const normalized = String(completionState || '').trim();
  return normalized === 'hard_error' || normalized === 'stalled';
}

function shouldFinalizeCompletion(evaluation = {}) {
  return isCompletedCompletionState(evaluation?.completionState);
}

function mapCompletionStateToLegacyStatus(completionState, observation = {}) {
  const normalized = String(completionState || '').trim();

  switch (normalized) {
    case 'completed':
      return 'completed';
    case 'hard_error':
      return 'failed';
    case 'pending_capture':
    case 'weak_reply':
    case 'stalled':
      return observation?.busy || observation?.hasReply ? 'waiting' : 'idle';
    default:
      return observation?.busy || observation?.hasReply ? 'waiting' : 'idle';
  }
}

function mapCompletionReasonToLegacyStatusReason(completionState, evaluation = {}) {
  const normalizedState = String(completionState || '').trim();
  const normalizedReason = String(evaluation?.completionReason || '').trim();

  if (normalizedState === 'completed') {
    return normalizedReason || 'usable-reply';
  }

  if (normalizedState === 'hard_error') {
    return normalizedReason || 'inspection-failed';
  }

  if (normalizedState === 'stalled') {
    return normalizedReason || 'busy-stalled';
  }

  if (normalizedState === 'weak_reply') {
    return normalizedReason || getWeakReplyReason(evaluation);
  }

  if (normalizedReason) {
    return normalizedReason;
  }

  return evaluation?.busy ? 'provider-busy' : evaluation?.hasReply ? 'pending-latest-reply' : 'no-reply';
}

function buildCompletionError(evaluation = {}, options = {}) {
  const timedOut = Boolean(options?.timedOut);
  const state = String(evaluation?.completionState || '').trim();
  const qualityReason = String(evaluation?.diagnostics?.qualityReason || '').trim();

  if (state === 'hard_error') {
    return evaluation?.error || 'Latest reply inspection failed.';
  }

  if (state === 'stalled') {
    return 'Latest reply stopped changing for too long while the provider still looked busy.';
  }

  if (state === 'weak_reply') {
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

  if (timedOut) {
    if (!evaluation?.hasReply) {
      return evaluation?.error || 'No latest reply was found yet.';
    }

    return evaluation?.error || 'Timed out while waiting for the latest reply to stabilize.';
  }

  if (evaluation?.busy) {
    return evaluation?.error || 'Provider is still generating.';
  }

  if (!evaluation?.hasReply) {
    return evaluation?.error || 'No latest reply was found yet.';
  }

  return evaluation?.error || 'Latest reply is not stable enough to trust yet.';
}

module.exports = {
  DEFAULT_COMPLETION_POLICY,
  buildCompletionError,
  createCompletionTracker,
  evaluateCompletionObservation,
  isCompletedCompletionState,
  isTerminalFailureCompletionState,
  mapCompletionReasonToLegacyStatusReason,
  mapCompletionStateToLegacyStatus,
  normalizeCompletionObservation,
  resolveCompletionPolicyOptions,
  shouldFinalizeCompletion,
};
