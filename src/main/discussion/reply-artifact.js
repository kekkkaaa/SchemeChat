const crypto = require('crypto');

function normalizeArtifactText(text) {
  return String(text || '')
    .replace(/\u200B/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hashArtifactText(text) {
  return crypto
    .createHash('sha1')
    .update(String(text || ''), 'utf8')
    .digest('hex');
}

function createStableReplyArtifact(result = {}, options = {}) {
  const text = normalizeArtifactText(result?.latestReplyText || result?.text || '');
  if (!text) {
    return null;
  }

  const paneId = String(result?.paneId || '').trim();
  if (!paneId) {
    return null;
  }

  const providerKey = String(result?.providerKey || '').trim();
  const providerName = String(result?.providerName || '').trim() || 'Unknown AI';
  const hash = hashArtifactText(text);
  const roundNumber = Number.isFinite(options?.roundNumber) ? options.roundNumber : 0;
  const completedAt = String(options?.capturedAt || new Date().toISOString());

  return {
    artifactType: 'stable-reply',
    artifactId: `stable-reply:${roundNumber}:${paneId}:${hash.slice(0, 12)}`,
    roundNumber,
    paneId,
    providerKey,
    providerName,
    text,
    hash,
    completedAt,
    sourceMethod: String(result?.sourceMethod || 'capture').trim() || 'capture',
    replyQuality: String(result?.replyQuality || '').trim(),
    confidence: Number.isFinite(result?.confidence) ? result.confidence : 0,
    completionState: String(result?.completionState || 'completed').trim() || 'completed',
    completionReason: String(result?.completionReason || result?.statusReason || '').trim(),
    captureDiagnostics: result?.diagnostics && typeof result.diagnostics === 'object'
      ? result.diagnostics
      : {},
  };
}

function createLegacyRoundResultFromArtifact(artifact = {}, fallback = {}) {
  const text = normalizeArtifactText(artifact?.text || fallback?.latestReplyText || fallback?.text || '');
  if (!text) {
    return null;
  }

  return {
    ...fallback,
    paneId: artifact?.paneId || fallback?.paneId || '',
    providerKey: artifact?.providerKey || fallback?.providerKey || '',
    providerName: artifact?.providerName || fallback?.providerName || 'Unknown AI',
    latestReplyText: text,
    replyLength: text.length,
    hasReply: true,
    hasUsableReply: true,
    ok: fallback?.ok !== undefined ? Boolean(fallback.ok) : true,
    busy: false,
    completionState: artifact?.completionState || fallback?.completionState || 'completed',
    completionReason: artifact?.completionReason || fallback?.completionReason || 'stable-reply',
    status: fallback?.status || 'completed',
    statusReason: fallback?.statusReason || artifact?.completionReason || 'usable-reply',
    sourceMethod: artifact?.sourceMethod || fallback?.sourceMethod || 'artifact',
    replyQuality: artifact?.replyQuality || fallback?.replyQuality || 'usable',
    confidence: Number.isFinite(fallback?.confidence)
      ? fallback.confidence
      : (Number.isFinite(artifact?.confidence) ? artifact.confidence : 0),
    diagnostics: artifact?.captureDiagnostics || fallback?.diagnostics || {},
    error: null,
    replyArtifactId: artifact?.artifactId || '',
    replyArtifactHash: artifact?.hash || '',
  };
}

function createMaterialSourceFromArtifact(artifact = {}) {
  const text = normalizeArtifactText(artifact?.text || '');
  if (!text) {
    return null;
  }

  const paneId = String(artifact?.paneId || '').trim();
  if (!paneId) {
    return null;
  }

  const providerName = String(artifact?.providerName || '').trim() || 'Unknown AI';

  return {
    paneId,
    providerKey: String(artifact?.providerKey || '').trim(),
    providerName,
    label: providerName,
    text,
    latestReplyText: text,
    sourceArtifactId: String(artifact?.artifactId || '').trim(),
    sourceArtifactHash: String(artifact?.hash || '').trim(),
    materialVersion: 1,
    materialType: 'stable-reply-source',
    completedAt: String(artifact?.completedAt || '').trim(),
  };
}

module.exports = {
  createLegacyRoundResultFromArtifact,
  createMaterialSourceFromArtifact,
  createStableReplyArtifact,
  hashArtifactText,
  normalizeArtifactText,
};
