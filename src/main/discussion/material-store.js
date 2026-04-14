const {
  createLegacyRoundResultFromArtifact,
  createMaterialSourceFromArtifact,
  createStableReplyArtifact,
  normalizeArtifactText,
} = require('./reply-artifact');

function normalizeMaterialSource(source = {}) {
  const text = normalizeArtifactText(source?.text || source?.latestReplyText || '');
  if (!text) {
    return null;
  }

  const providerName = String(source?.providerName || source?.label || '').trim() || 'Unknown AI';

  return {
    paneId: String(source?.paneId || '').trim(),
    providerKey: String(source?.providerKey || '').trim(),
    providerName,
    label: String(source?.label || providerName).trim() || providerName,
    text,
    latestReplyText: text,
    sourceArtifactId: String(source?.sourceArtifactId || '').trim(),
    sourceArtifactHash: String(source?.sourceArtifactHash || '').trim(),
    materialVersion: Number.isFinite(source?.materialVersion) ? source.materialVersion : 1,
    materialType: String(source?.materialType || 'stable-reply-source').trim() || 'stable-reply-source',
    completedAt: String(source?.completedAt || '').trim(),
  };
}

function freezeRoundReplyArtifacts(results = [], options = {}) {
  return (Array.isArray(results) ? results : [])
    .map((result) => createStableReplyArtifact(result, options))
    .filter(Boolean);
}

function buildMaterialSourcesFromArtifacts(artifacts = []) {
  return (Array.isArray(artifacts) ? artifacts : [])
    .map((artifact) => createMaterialSourceFromArtifact(artifact))
    .filter(Boolean);
}

function buildFallbackMaterialSourcesFromResults(results = [], getPaneEntryById = () => null) {
  return (Array.isArray(results) ? results : [])
    .map((result) => {
      const text = normalizeArtifactText(result?.latestReplyText || '');
      if (!text) {
        return null;
      }

      const providerName = result?.providerName || getPaneEntryById(result?.paneId)?.providerName || 'Unknown AI';
      return normalizeMaterialSource({
        paneId: result?.paneId || '',
        providerKey: result?.providerKey || '',
        providerName,
        label: providerName,
        text,
        latestReplyText: text,
        materialVersion: 0,
        materialType: 'legacy-round-result',
      });
    })
    .filter(Boolean);
}

function createFrozenRoundEntry(options = {}) {
  const results = Array.isArray(options?.results) ? options.results : [];
  const replyArtifacts = freezeRoundReplyArtifacts(results, {
    roundNumber: options?.roundNumber,
    capturedAt: options?.capturedAt,
  });

  return {
    roundNumber: Number.isFinite(options?.roundNumber) ? options.roundNumber : 0,
    roundType: String(options?.roundType || '').trim(),
    capturedAt: String(options?.capturedAt || new Date().toISOString()),
    results,
    replyArtifacts,
    materialSources: buildMaterialSourcesFromArtifacts(replyArtifacts),
    skippedPaneIds: Array.isArray(options?.skippedPaneIds)
      ? [...new Set(options.skippedPaneIds.filter(Boolean))]
      : [],
    summarizerPaneId: String(options?.summarizerPaneId || '').trim(),
  };
}

function getLatestRoundMaterialSources(config = {}) {
  const roundHistory = Array.isArray(config?.roundHistory) ? config.roundHistory : [];
  const getPaneEntryById = typeof config?.getPaneEntryById === 'function' ? config.getPaneEntryById : () => null;
  const latestRound = [...roundHistory]
    .filter(Boolean)
    .sort((left, right) => (left?.roundNumber || 0) - (right?.roundNumber || 0))
    .pop();

  if (Array.isArray(latestRound?.materialSources) && latestRound.materialSources.length > 0) {
    return latestRound.materialSources
      .map((source) => normalizeMaterialSource(source))
      .filter(Boolean);
  }

  return buildFallbackMaterialSourcesFromResults(config?.lastRoundResults, getPaneEntryById);
}

function restoreRoundResults(roundEntry = {}) {
  const results = Array.isArray(roundEntry?.results) ? roundEntry.results.filter(Boolean) : [];
  if (results.length > 0) {
    return results;
  }

  return (Array.isArray(roundEntry?.replyArtifacts) ? roundEntry.replyArtifacts : [])
    .map((artifact) => createLegacyRoundResultFromArtifact(artifact))
    .filter(Boolean);
}

module.exports = {
  buildFallbackMaterialSourcesFromResults,
  buildMaterialSourcesFromArtifacts,
  createFrozenRoundEntry,
  freezeRoundReplyArtifacts,
  getLatestRoundMaterialSources,
  normalizeMaterialSource,
  restoreRoundResults,
};
