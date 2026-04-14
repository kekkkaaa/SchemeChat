const {
  buildRoundPrompt,
  buildRoundPromptFromDraft,
  buildRoundPromptScaffold,
} = require('../sync/prompt-builder');
const {
  hashArtifactText,
  normalizeArtifactText,
} = require('./reply-artifact');

function normalizePromptPlanSource(source = {}) {
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
    sourceArtifactHash: String(source?.sourceArtifactHash || '').trim() || hashArtifactText(text),
    materialVersion: Number.isFinite(source?.materialVersion) ? source.materialVersion : 1,
    materialType: String(source?.materialType || 'stable-reply-source').trim() || 'stable-reply-source',
    completedAt: String(source?.completedAt || '').trim(),
  };
}

function normalizePromptPlanEntry(entry = {}) {
  const finalPromptText = normalizeArtifactText(entry?.finalPromptText || entry?.prompt || '');
  if (!finalPromptText) {
    return null;
  }

  return {
    paneId: String(entry?.paneId || '').trim(),
    providerName: String(entry?.providerName || '').trim() || 'Unknown AI',
    finalPromptText,
    promptHash: String(entry?.promptHash || '').trim() || hashArtifactText(finalPromptText),
    sourceMaterialHashes: Array.isArray(entry?.sourceMaterialHashes)
      ? [...new Set(entry.sourceMaterialHashes.map((hash) => String(hash || '').trim()).filter(Boolean))]
      : [],
  };
}

function getScopedSourcesForPane(sources = [], paneId = '') {
  const normalizedPaneId = String(paneId || '').trim();
  return (Array.isArray(sources) ? sources : []).filter((source) => {
    if (!source) {
      return false;
    }

    if (!source.paneId) {
      return true;
    }

    return source.paneId !== normalizedPaneId;
  });
}

function buildPromptPlan(options = {}) {
  const promptType = String(options?.promptType || '').trim();
  const paneEntries = Array.isArray(options?.paneEntries)
    ? options.paneEntries.filter((paneEntry) => paneEntry?.id)
    : [];
  if (!promptType || paneEntries.length === 0) {
    return null;
  }

  const sourceSnapshot = (Array.isArray(options?.sources) ? options.sources : [])
    .map((source) => normalizePromptPlanSource(source))
    .filter(Boolean);
  const promptOptions = {
    topic: options?.topic || '',
    taskTypeId: options?.taskTypeId || '',
    summarizerName: options?.summarizerName || '',
    maxLengthPerSource: options?.maxLengthPerSource,
  };
  const explicitBaseDraft = normalizeArtifactText(options?.baseDraft || '');
  const shouldUseDraftScaffold = Boolean(options?.useDraftScaffold);
  const draftDisplayText = explicitBaseDraft
    || (shouldUseDraftScaffold
      ? buildRoundPromptScaffold(promptType, {
        ...promptOptions,
        sourceCount: Math.max(0, sourceSnapshot.length - 1),
      })
      : '');
  const baseDraftText = explicitBaseDraft
    || (shouldUseDraftScaffold
      ? buildRoundPrompt(promptType, [], promptOptions)
      : '');
  const generatedAt = String(options?.generatedAt || new Date().toISOString());
  const roundNumber = Number.isFinite(options?.roundNumber) ? options.roundNumber : 0;

  const panePlans = paneEntries
    .map((paneEntry) => {
      const scopedSources = getScopedSourcesForPane(sourceSnapshot, paneEntry.id);
      const scopedPromptOptions = {
        ...promptOptions,
        sourceCount: scopedSources.length,
      };
      const finalPromptText = baseDraftText
        ? buildRoundPromptFromDraft(promptType, baseDraftText, scopedSources, scopedPromptOptions)
        : buildRoundPrompt(promptType, scopedSources, scopedPromptOptions);
      const normalizedPromptText = normalizeArtifactText(finalPromptText);
      if (!normalizedPromptText) {
        return null;
      }

      return normalizePromptPlanEntry({
        paneId: paneEntry.id,
        providerName: paneEntry?.providerName || paneEntry?.label || 'Unknown AI',
        finalPromptText: normalizedPromptText,
        sourceMaterialHashes: scopedSources.map((source) => source.sourceArtifactHash),
      });
    })
    .filter(Boolean);

  if (panePlans.length !== paneEntries.length) {
    return null;
  }

  const sourceMaterialHashes = [...new Set(
    sourceSnapshot.map((source) => source.sourceArtifactHash).filter(Boolean)
  )];
  const targetPaneIds = paneEntries.map((paneEntry) => paneEntry.id);

  return {
    planType: 'prompt-plan',
    planVersion: 1,
    planId: `prompt-plan:${roundNumber}:${promptType}:${Date.now()}`,
    roundNumber,
    promptType,
    generatedAt,
    baseDraftText,
    draftDisplayText,
    usedDraftScaffold: !explicitBaseDraft && shouldUseDraftScaffold,
    sourceSnapshot,
    sourceMaterialHashes,
    targetPaneIds,
    panePlans,
    previewPrompt: panePlans[0]?.finalPromptText || '',
  };
}

function normalizePromptPlan(plan = {}) {
  const sourceSnapshot = (Array.isArray(plan?.sourceSnapshot) ? plan.sourceSnapshot : [])
    .map((source) => normalizePromptPlanSource(source))
    .filter(Boolean);
  const panePlans = (Array.isArray(plan?.panePlans) ? plan.panePlans : [])
    .map((entry) => normalizePromptPlanEntry(entry))
    .filter(Boolean);
  const promptType = String(plan?.promptType || '').trim();
  const targetPaneIds = Array.isArray(plan?.targetPaneIds)
    ? [...new Set(plan.targetPaneIds.map((paneId) => String(paneId || '').trim()).filter(Boolean))]
    : panePlans.map((entry) => entry.paneId);

  if (!promptType || panePlans.length === 0 || targetPaneIds.length === 0) {
    return null;
  }

  return {
    planType: 'prompt-plan',
    planVersion: Number.isFinite(plan?.planVersion) ? plan.planVersion : 1,
    planId: String(plan?.planId || '').trim() || `prompt-plan:${promptType}:${Date.now()}`,
    roundNumber: Number.isFinite(plan?.roundNumber) ? plan.roundNumber : 0,
    promptType,
    generatedAt: String(plan?.generatedAt || new Date().toISOString()),
    baseDraftText: normalizeArtifactText(plan?.baseDraftText || ''),
    draftDisplayText: normalizeArtifactText(plan?.draftDisplayText || plan?.baseDraftText || ''),
    usedDraftScaffold: Boolean(plan?.usedDraftScaffold),
    sourceSnapshot,
    sourceMaterialHashes: Array.isArray(plan?.sourceMaterialHashes)
      ? [...new Set(plan.sourceMaterialHashes.map((hash) => String(hash || '').trim()).filter(Boolean))]
      : [...new Set(sourceSnapshot.map((source) => source.sourceArtifactHash).filter(Boolean))],
    targetPaneIds,
    panePlans,
    previewPrompt: normalizeArtifactText(plan?.previewPrompt || panePlans[0]?.finalPromptText || ''),
  };
}

function getPromptPlanPromptMap(plan = {}) {
  const normalizedPlan = normalizePromptPlan(plan);
  if (!normalizedPlan) {
    return new Map();
  }

  return new Map(
    normalizedPlan.panePlans.map((entry) => [entry.paneId, entry.finalPromptText])
  );
}

module.exports = {
  buildPromptPlan,
  getPromptPlanPromptMap,
  normalizePromptPlan,
  normalizePromptPlanEntry,
  normalizePromptPlanSource,
};
