function getUniquePaneIds(paneIds = []) {
  return [...new Set((Array.isArray(paneIds) ? paneIds : []).filter(Boolean))];
}

function updateProviderTrackStatuses(config = {}) {
  const allPaneIds = Array.isArray(config.allPaneIds) ? config.allPaneIds : [];
  const targetPaneIds = new Set(getUniquePaneIds(config.targetPaneIds));
  const mutedPaneIds = new Set(getUniquePaneIds(config.mutedPaneIds));
  const targetStatus = String(config.targetStatus || 'ready');
  const mutedStatus = String(config.mutedStatus || 'muted');
  const defaultStatus = String(config.defaultStatus || 'ready');
  const clearErrors = config.clearErrors !== false;
  const resetTargetReplies = Boolean(config.resetTargetReplies);
  const updateTrack = typeof config.updateTrack === 'function'
    ? config.updateTrack
    : null;

  if (!updateTrack) {
    return;
  }

  allPaneIds.forEach((paneId) => {
    if (targetPaneIds.has(paneId)) {
      const patch = {
        status: targetStatus,
      };
      if (clearErrors) {
        patch.error = '';
      }
      if (resetTargetReplies) {
        patch.latestReplyText = '';
      }
      updateTrack(paneId, patch);
      return;
    }

    if (mutedPaneIds.has(paneId)) {
      const patch = {
        status: mutedStatus,
      };
      if (clearErrors) {
        patch.error = '';
      }
      updateTrack(paneId, patch);
      return;
    }

    const patch = {
      status: defaultStatus,
    };
    if (clearErrors) {
      patch.error = '';
    }
    updateTrack(paneId, patch);
  });
}

async function handleRoundFlowError(config = {}) {
  const automated = Boolean(config.automated);
  const message = String(config.message || '').trim();
  const meta = config.meta;
  const resumeAction = config.resumeAction;
  const automatedHandler = typeof config.automatedHandler === 'function'
    ? config.automatedHandler
    : null;
  const manualHandler = typeof config.manualHandler === 'function'
    ? config.manualHandler
    : null;
  const options = {};

  if (meta !== undefined) {
    options.meta = meta;
  }

  if (resumeAction !== undefined) {
    options.resumeAction = resumeAction;
  }

  if (automated) {
    if (automatedHandler) {
      await automatedHandler(message, options);
    }
    return;
  }

  if (manualHandler) {
    await Promise.resolve(manualHandler(message, options));
  }
}

module.exports = {
  handleRoundFlowError,
  updateProviderTrackStatuses,
};
