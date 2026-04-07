function normalizePromptText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildAggregatedDiscussionPrompt(sources, options = {}) {
  const normalizedSources = Array.isArray(sources)
    ? sources
      .map((source) => ({
        label: String(source?.label || '').trim(),
        text: normalizePromptText(source?.text || ''),
      }))
      .filter((source) => source.label && source.text)
    : [];

  if (normalizedSources.length === 0) {
    return '';
  }

  const maxLengthPerSource = Number.isFinite(options.maxLengthPerSource)
    ? Math.max(1, options.maxLengthPerSource)
    : null;

  const lines = [
    'Please read the latest replies from the other AI assistants and continue the discussion.',
    '',
    'First summarize their key points, then explain what you agree or disagree with, and finally give your updated conclusion.',
    '',
    'Latest replies:',
    '',
  ];

  normalizedSources.forEach((source, index) => {
    let text = source.text;
    if (maxLengthPerSource && text.length > maxLengthPerSource) {
      text = `${text.slice(0, maxLengthPerSource).trimEnd()}\n\n[Truncated]`;
    }

    lines.push(`[From ${source.label}]`);
    lines.push(text);

    if (index < normalizedSources.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n').trim();
}

function buildDiscussionPrompt(sourceProviderName, replyText, options = {}) {
  return buildAggregatedDiscussionPrompt(
    [
      {
        label: sourceProviderName,
        text: replyText,
      },
    ],
    options
  );
}

module.exports = {
  buildAggregatedDiscussionPrompt,
  buildDiscussionPrompt,
};
