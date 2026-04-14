const crypto = require('crypto');

function normalizeWriteVerificationText(text) {
  return String(text || '')
    .replace(/\u200B/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hashWriteVerificationText(text) {
  return crypto
    .createHash('sha1')
    .update(String(text || ''), 'utf8')
    .digest('hex');
}

function buildVerificationPreview(text, maxLength = 160) {
  const normalized = normalizeWriteVerificationText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function buildInputWriteVerification(expectedText, actualText, options = {}) {
  const normalizer = typeof options?.normalizer === 'function'
    ? options.normalizer
    : normalizeWriteVerificationText;
  const normalizedExpected = normalizer(expectedText);
  const normalizedActual = normalizer(actualText);
  const expectedHash = hashWriteVerificationText(normalizedExpected);
  const actualHash = hashWriteVerificationText(normalizedActual);
  const verified = normalizedExpected === normalizedActual;

  return {
    expectedHash,
    actualHash,
    expectedLength: normalizedExpected.length,
    actualLength: normalizedActual.length,
    readbackPreview: buildVerificationPreview(normalizedActual, options?.previewLength),
    verified,
    mismatchReason: verified
      ? ''
      : normalizedActual.length !== normalizedExpected.length
        ? 'length-mismatch'
        : 'content-mismatch',
  };
}

function buildVerifiedWriteResult(expectedText, actualText, options = {}) {
  const verification = buildInputWriteVerification(expectedText, actualText, options);
  if (verification.verified) {
    return {
      ok: true,
      stage: options?.successStage || 'sync-text-injected',
      details: {
        verification,
      },
    };
  }

  return {
    ok: false,
    stage: options?.failureStage || 'sync-text-verify-failed',
    error: options?.failureMessage
      || `Prompt write verification failed: expected ${verification.expectedLength} chars but read back ${verification.actualLength}.`,
    details: {
      verification,
    },
  };
}

async function verifyWriteAcrossReadbacks(expectedText, readActualText, options = {}) {
  const delaysMs = Array.isArray(options?.delaysMs) && options.delaysMs.length > 0
    ? options.delaysMs
    : [0];
  const readback = typeof readActualText === 'function'
    ? readActualText
    : () => actualText;

  let lastVerification = buildInputWriteVerification(expectedText, '', options);
  for (const delayMs of delaysMs) {
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const actualText = readback();
    lastVerification = buildInputWriteVerification(expectedText, actualText, options);
    if (!lastVerification.verified) {
      return {
        ok: false,
        stage: options?.failureStage || 'sync-text-verify-failed',
        error: options?.failureMessage
          || `Prompt write verification failed: expected ${lastVerification.expectedLength} chars but read back ${lastVerification.actualLength}.`,
        details: {
          verification: lastVerification,
        },
      };
    }
  }

  return {
    ok: true,
    stage: options?.successStage || 'sync-text-injected',
    details: {
      verification: lastVerification,
    },
  };
}

module.exports = {
  buildInputWriteVerification,
  buildVerifiedWriteResult,
  verifyWriteAcrossReadbacks,
  hashWriteVerificationText,
  normalizeWriteVerificationText,
};
