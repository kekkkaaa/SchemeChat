const {
  createCompletionTracker,
  evaluateCompletionObservation,
  isCompletedCompletionState,
  mapCompletionReasonToLegacyStatusReason,
  mapCompletionStateToLegacyStatus,
} = require('../main/discussion/completion-policy');

function getCompletedPaneIdsFromTracks(paneIds = [], providerTracks = {}) {
  return paneIds.filter((paneId) => {
    const track = providerTracks?.[paneId];
    return track?.status === 'completed' && String(track?.latestReplyText || '').trim();
  });
}

function getSkippablePaneIdsFromTracks(paneIds = [], providerTracks = {}) {
  return paneIds.filter((paneId) => {
    const status = providerTracks?.[paneId]?.status || 'ready';
    return status !== 'completed' && status !== 'skipped' && status !== 'muted';
  });
}

function buildFallbackRoundResultsFromTracks(paneIds = [], providerTracks = {}, panesById = {}) {
  return paneIds.map((paneId) => {
    const track = providerTracks?.[paneId];
    const pane = panesById?.[paneId];
    const latestReplyText = String(track?.latestReplyText || '').trim();
    if (!latestReplyText) {
      return null;
    }

    return {
      paneId,
      providerKey: track?.providerKey || pane?.providerKey || '',
      providerName: track?.providerName || pane?.providerName || 'Unknown AI',
      latestReplyText,
      sourceMethod: 'track-cache',
      ok: true,
      busy: false,
      hasReply: true,
      hasUsableReply: true,
      replyQuality: 'usable',
      completionState: 'completed',
      completionReason: 'track-cache',
      status: 'completed',
      statusReason: 'track-cache',
      error: null,
    };
  }).filter(Boolean);
}

function mergeRoundResults(primaryResults = [], fallbackResults = [], orderedPaneIds = []) {
  const resultMap = new Map();
  fallbackResults.forEach((result) => {
    resultMap.set(result.paneId, result);
  });
  primaryResults.forEach((result) => {
    resultMap.set(result.paneId, result);
  });

  const orderedIds = orderedPaneIds.length > 0
    ? orderedPaneIds
    : Array.from(resultMap.keys());

  return orderedIds
    .map((paneId) => resultMap.get(paneId))
    .filter((result) => {
      if (!result || !String(result.latestReplyText || '').trim()) {
        return false;
      }

      return result.hasUsableReply !== false;
    });
}

function settleInspectionResults(
  results = [],
  completionTracker = new Map(),
  now = Date.now(),
  stallPauseMs = 45000,
  pollIntervalMs = 1500
) {
  const settledResults = results.map((result) => {
    const tracker = completionTracker.get(result?.paneId) || createCompletionTracker();
    const evaluation = evaluateCompletionObservation(result, tracker, {
      now,
      stallMs: stallPauseMs,
      pollIntervalMs,
      stablePassesRequired: 2,
      minIdleStableMs: pollIntervalMs,
      requireStableCompletion: true,
      allowSnapshotCompletion: false,
    });
    completionTracker.set(result?.paneId, evaluation.nextTracker);
    const completionState = evaluation.completionState;
    const isEffectivelyCompleted = isCompletedCompletionState(completionState);

    return {
      ...result,
      latestReplyText: evaluation.latestReplyText,
      replyLength: evaluation.replyLength,
      hasReply: evaluation.hasReply,
      hasUsableReply: evaluation.hasUsableReply,
      replyQuality: evaluation.replyQuality,
      completionState,
      completionReason: evaluation.completionReason,
      status: mapCompletionStateToLegacyStatus(completionState, evaluation),
      statusReason: mapCompletionReasonToLegacyStatusReason(completionState, evaluation),
      stablePasses: evaluation.stablePasses,
      busyStableMs: evaluation.busyStableMs,
      idleStableMs: evaluation.idleStableMs,
      isEffectivelyCompleted,
      isStalledBusy: completionState === 'stalled',
    };
  });

  return {
    settledResults,
    completedCount: settledResults.filter((result) => result.isEffectivelyCompleted).length,
    stalledResults: settledResults.filter((result) => result.isStalledBusy),
  };
}

function shouldAttemptStableCapture(settledResults = []) {
  if (!Array.isArray(settledResults) || settledResults.length === 0) {
    return false;
  }

  return settledResults.every((result) => {
    return isCompletedCompletionState(result?.completionState)
      || Boolean(result?.isEffectivelyCompleted);
  });
}

function getMissingCapturedPaneIds(paneIds = [], capturedResults = []) {
  return paneIds.filter((paneId) => {
    return !capturedResults.some((result) => {
      const hasUsableReply = result?.hasUsableReply !== undefined
        ? Boolean(result.hasUsableReply)
        : Boolean(String(result?.latestReplyText || '').trim());
      const hasCompletedReply = result?.completionState
        ? isCompletedCompletionState(result.completionState)
        : hasUsableReply;

      return result?.paneId === paneId
        && result?.ok
        && hasCompletedReply
        && String(result?.latestReplyText || '').trim();
    });
  });
}

module.exports = {
  buildFallbackRoundResultsFromTracks,
  getCompletedPaneIdsFromTracks,
  getMissingCapturedPaneIds,
  getSkippablePaneIdsFromTracks,
  mergeRoundResults,
  settleInspectionResults,
  shouldAttemptStableCapture,
};
