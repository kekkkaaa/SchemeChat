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
      status: 'completed',
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

function settleInspectionResults(results = [], busyStableTracker = new Map(), now = Date.now(), stallPauseMs = 45000) {
  const settledResults = results.map((result) => {
    const latestReplyText = String(result?.latestReplyText || '');
    const hasAnyReply = Boolean(result?.hasReply) && Boolean(latestReplyText);
    const hasUsableReply = result?.hasUsableReply !== undefined
      ? Boolean(result.hasUsableReply) && hasAnyReply
      : hasAnyReply;
    const previous = busyStableTracker.get(result.paneId) || {
      latestReplyText: '',
      unchangedSince: 0,
    };

    let unchangedSince = 0;
    if (result.busy && hasAnyReply) {
      unchangedSince = previous.latestReplyText === latestReplyText
        ? (previous.unchangedSince || now)
        : now;
    }

    busyStableTracker.set(result.paneId, {
      latestReplyText,
      unchangedSince,
    });

    const busyStableMs = unchangedSince > 0 ? now - unchangedSince : 0;
    const isEffectivelyCompleted = !result.busy && hasUsableReply;

    return {
      ...result,
      hasReply: hasAnyReply,
      hasUsableReply,
      busyStableMs,
      isEffectivelyCompleted,
      isStalledBusy: result.busy && hasAnyReply && busyStableMs >= stallPauseMs,
    };
  });

  return {
    settledResults,
    completedCount: settledResults.filter((result) => result.isEffectivelyCompleted).length,
    stalledResults: settledResults.filter((result) => result.isStalledBusy),
  };
}

function getMissingCapturedPaneIds(paneIds = [], capturedResults = []) {
  return paneIds.filter((paneId) => {
    return !capturedResults.some((result) => {
      const hasUsableReply = result?.hasUsableReply !== undefined
        ? Boolean(result.hasUsableReply)
        : Boolean(String(result?.latestReplyText || '').trim());

      return result?.paneId === paneId
        && result?.ok
        && hasUsableReply
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
};
