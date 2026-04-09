function normalizePromptText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getDiscussionStructureLine(sourceCount) {
  if (sourceCount > 1) {
    return '请用 1/2/3 输出：1. 其他 AI 的关键共识或分歧 2. 你认同/不同意或要修正的点 3. 你的更新结论。';
  }

  return '请用 1/2/3 输出：1. 对方关键点 2. 你认同/不同意或要修正的点 3. 你的更新结论。';
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
    '继续交叉讨论，不要寒暄。',
    getDiscussionStructureLine(normalizedSources.length),
    '要求：高压缩，只保留影响判断的新信息，不重复题面。',
    '其他 AI 最新回复：',
    '',
  ];

  normalizedSources.forEach((source, index) => {
    let text = source.text;
    if (maxLengthPerSource && text.length > maxLengthPerSource) {
      text = `${text.slice(0, maxLengthPerSource).trimEnd()}\n\n[Truncated]`;
    }

    lines.push(`[${source.label}]`);
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
