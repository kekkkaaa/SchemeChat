function normalizePromptText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeSources(sources) {
  return Array.isArray(sources)
    ? sources
      .map((source) => ({
        paneId: String(source?.paneId || '').trim(),
        label: String(source?.label || source?.providerName || '').trim(),
        text: normalizePromptText(source?.text || source?.latestReplyText || ''),
      }))
      .filter((source) => source.label && source.text)
    : [];
}

function truncateSourceText(text, maxLengthPerSource) {
  if (!Number.isFinite(maxLengthPerSource)) {
    return text;
  }

  const safeMaxLength = Math.max(1, maxLengthPerSource);
  if (text.length <= safeMaxLength) {
    return text;
  }

  return `${text.slice(0, safeMaxLength).trimEnd()}\n\n[Truncated]`;
}

function buildPromptBody(config) {
  const lines = [];
  if (config.topic) {
    lines.push(`题目：${config.topic}`);
  }

  lines.push(config.intro);
  lines.push(config.structure);

  if (config.requirements) {
    lines.push(config.requirements);
  }

  return lines.join('\n').trim();
}

function appendPromptSources(baseText, config, sources, options = {}) {
  const normalizedSources = normalizeSources(sources);
  if (normalizedSources.length === 0) {
    return normalizePromptText(baseText);
  }

  const lines = [];
  const normalizedBaseText = normalizePromptText(baseText);
  if (normalizedBaseText) {
    lines.push(normalizedBaseText);
    lines.push('');
  }

  lines.push(config.sourcesHeading || '其他 AI 最新回复：');
  lines.push('');

  normalizedSources.forEach((source, index) => {
    lines.push(`[${source.label}]`);
    lines.push(truncateSourceText(source.text, options.maxLengthPerSource));

    if (index < normalizedSources.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n').trim();
}

function getDiscussionStructureLine(sourceCount) {
  if (sourceCount > 1) {
    return '请用 1/2/3 输出：1. 其他 AI 的关键共识或分歧 2. 你认同、反对或要修正的点 3. 你的更新结论。';
  }

  return '请用 1/2/3 输出：1. 对方关键点 2. 你认同、反对或要修正的点 3. 你的更新结论。';
}

function getPromptConfig(promptType, options = {}) {
  const normalizedTopic = options.topic ? normalizePromptText(options.topic) : '';
  const sourceCount = Number.isFinite(options.sourceCount) ? options.sourceCount : 0;
  const summarizerName = normalizePromptText(options.summarizerName || '');

  switch (promptType) {
    case 'discussion':
      return {
        topic: normalizedTopic,
        intro: '继续交叉讨论，不要寒暄。',
        structure: getDiscussionStructureLine(sourceCount),
        requirements: '要求：高压缩，只保留影响判断的新信息，不重复题面。',
        sourcesHeading: '其他 AI 上一轮回复：',
      };
    case 'questioning':
      return {
        topic: normalizedTopic,
        intro: '继续交叉质疑，不要寒暄。',
        structure: '请用 1/2/3 输出：1. 你认为其他 AI 最值得质疑的点 2. 你因此修正了自己哪一点 3. 你的更新立场。',
        requirements: '要求：高压缩，只点出真正影响结论的冲突、漏洞和修正，不重复题面。',
        sourcesHeading: '其他 AI 上一轮回复：',
      };
    case 'compression':
      return {
        topic: normalizedTopic,
        intro: '继续压缩分歧，不要寒暄。',
        structure: '请用 1/2/3 输出：1. 当前最稳共识 2. 仍影响决策的剩余分歧 3. 你的压缩结论或建议。',
        requirements: '要求：优先基于其他 AI 上一轮回复继续收束，只保留仍影响决策的内容。',
        sourcesHeading: '其他 AI 上一轮回复：',
      };
    case 'revision':
      return {
        topic: normalizedTopic,
        intro: '继续修正方案，不要寒暄。',
        structure: '请用 1/2/3 输出：1. 你决定保留的结论 2. 你基于他方观点做的修正 3. 修正后的方案或判断。',
        requirements: '要求：优先基于其他 AI 上一轮回复修正方案，明确保留什么、修正什么、为什么修正。',
        sourcesHeading: '其他 AI 上一轮回复：',
      };
    case 'confirmation':
      return {
        topic: normalizedTopic,
        intro: '继续确认收束，不要寒暄。',
        structure: '请用 1/2/3 输出：1. 当前最稳结论 2. 是否还有关键异议 3. 你建议谁来做最终总结，以及一句理由。',
        requirements: '要求：优先基于其他 AI 上一轮回复做最后检查，只保留仍影响收束的判断。',
        sourcesHeading: '其他 AI 上一轮回复：',
      };
    case 'final-summary':
      return {
        topic: normalizedTopic,
        intro: summarizerName
          ? `你是本轮总结者（${summarizerName}），请输出最终方案，不要寒暄。`
          : '你是本轮总结者，请输出最终方案，不要寒暄。',
        structure: '请用 1/2/3 输出：1. 最终方案或结论 2. 关键理由与取舍 3. 主要风险、限制与执行建议。',
        requirements: '要求：优先吸收其他 AI 上一轮回复里的有效结论，明确共识；若仍有保留分歧，只保留最关键的那一点。',
        sourcesHeading: '其他 AI 上一轮回复：',
      };
    default:
      return null;
  }
}

function buildPromptFromSources(config, sources, options = {}) {
  if (!config) {
    return '';
  }

  return appendPromptSources(buildPromptBody(config), config, sources, options);
}

function buildAggregatedDiscussionPrompt(sources, options = {}) {
  const normalizedSources = normalizeSources(sources);
  return buildPromptFromSources(
    getPromptConfig('discussion', {
      ...options,
      sourceCount: normalizedSources.length,
    }),
    normalizedSources,
    options
  );
}

function buildQuestioningPrompt(sources, options = {}) {
  return buildPromptFromSources(
    getPromptConfig('questioning', options),
    sources,
    options
  );
}

function buildCompressionPrompt(sources, options = {}) {
  return buildPromptFromSources(
    getPromptConfig('compression', options),
    sources,
    options
  );
}

function buildRevisionPrompt(sources, options = {}) {
  return buildPromptFromSources(
    getPromptConfig('revision', options),
    sources,
    options
  );
}

function buildConfirmationPrompt(sources, options = {}) {
  return buildPromptFromSources(
    getPromptConfig('confirmation', options),
    sources,
    options
  );
}

function buildFinalSummaryPrompt(sources, options = {}) {
  return buildPromptFromSources(
    getPromptConfig('final-summary', options),
    sources,
    options
  );
}

function buildRoundPromptScaffold(promptType, options = {}) {
  const config = getPromptConfig(promptType, options);
  if (!config) {
    return '';
  }

  const baseText = buildPromptBody(config);
  const scaffoldLines = [baseText];
  if (promptType !== 'round-one') {
    scaffoldLines.push('发送时系统会自动附上其他 AI 上一轮回复，不会包含当前 AI 自己的回复。');
  }

  return scaffoldLines.join('\n').trim();
}

function buildRoundPromptFromDraft(promptType, draftText, sources, options = {}) {
  const config = getPromptConfig(promptType, {
    ...options,
    sourceCount: normalizeSources(sources).length,
  });
  if (!config) {
    return '';
  }

  const baseText = normalizePromptText(draftText) || buildPromptBody(config);
  return appendPromptSources(baseText, config, sources, options);
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

function buildRoundPrompt(promptType, sources, options = {}) {
  switch (promptType) {
    case 'discussion':
      return buildAggregatedDiscussionPrompt(sources, options);
    case 'questioning':
      return buildQuestioningPrompt(sources, options);
    case 'compression':
      return buildCompressionPrompt(sources, options);
    case 'revision':
      return buildRevisionPrompt(sources, options);
    case 'confirmation':
      return buildConfirmationPrompt(sources, options);
    case 'final-summary':
      return buildFinalSummaryPrompt(sources, options);
    default:
      return '';
  }
}

module.exports = {
  appendPromptSources,
  buildAggregatedDiscussionPrompt,
  buildCompressionPrompt,
  buildConfirmationPrompt,
  buildDiscussionPrompt,
  buildFinalSummaryPrompt,
  buildQuestioningPrompt,
  buildRoundPromptFromDraft,
  buildRoundPromptScaffold,
  buildRevisionPrompt,
  buildRoundPrompt,
};
