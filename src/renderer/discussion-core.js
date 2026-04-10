const MODE_OPTIONS = [
  {
    id: 'fast-3',
    label: '3 轮快收束',
    totalRounds: 3,
    description: '独立分析 -> 交叉讨论 -> 最终总结',
    summary: '独立分析 · 交叉讨论',
  },
  {
    id: 'standard-4',
    label: '4 轮标准',
    totalRounds: 4,
    description: '独立分析 -> 交叉讨论 -> 分歧压缩 -> 最终总结',
    summary: '独立分析 · 分歧压缩',
  },
  {
    id: 'deep-5',
    label: '5 轮深推演',
    totalRounds: 5,
    description: '独立分析 -> 交叉质疑 -> 修正方案 -> 确认总结者 -> 最终总结',
    summary: '独立分析 · 修正方案',
  },
];

const STICKY_RULE_OPTIONS = [
  {
    id: 'compressed',
    label: '高压缩',
    prompt: '请高压缩表达，只保留真正影响判断的重点。',
  },
  {
    id: 'focus',
    label: '只说重点',
    prompt: '避免空话和长铺垫，先说结论，再说关键理由。',
  },
  {
    id: 'independent',
    label: '理性独立',
    prompt: '请保持理性独立推理，不要奉承，不要迎合。',
  },
  {
    id: 'numbered',
    label: '1 2 3 排版',
    prompt: '请尽量使用 1、2、3 的结构化排版。',
  },
  {
    id: 'relay',
    label: '面向 AI 阅读',
    prompt: '你的回答会给其他 AI 阅读，请清晰、紧凑、方便转述。',
  },
];

const QUICK_PROMPT_OPTIONS = [
  {
    id: 'cost',
    label: '成本优先',
    tag: '成本优先',
    prompt: '这轮请优先从成本、复杂度和落地代价角度判断。',
  },
  {
    id: 'risk',
    label: '风险边界',
    tag: '风险边界',
    prompt: '这轮请明确指出风险边界、不成立条件和潜在副作用。',
  },
  {
    id: 'stance',
    label: '明确表态',
    tag: '明确表态',
    prompt: '这轮请直接表态，不要只给模糊分析。',
  },
];

const STICKY_RULE_SUMMARIES = {
  compressed: '高压缩',
  focus: '先结论后理由',
  independent: '独立判断，不迎合',
  numbered: '用 1/2/3',
  relay: '便于其他 AI 转述',
};

const QUICK_PROMPT_SUMMARIES = {
  cost: '优先看成本、复杂度、落地代价',
  risk: '明确风险边界、不成立条件和副作用',
  stance: '直接表态，不要只给模糊分析',
};

const DEFAULT_STICKY_RULE_IDS = STICKY_RULE_OPTIONS.map((option) => option.id);
const AUTO_WAIT_POLL_INTERVAL_MS = 1500;
const AUTO_WAIT_TIMEOUT_MS = 180000;
const BUSY_STALL_PAUSE_MS = 45000;

const ROUND_TYPE_LABELS = {
  'fast-3': ['首轮分析', '交叉讨论', '最终总结'],
  'standard-4': ['首轮分析', '交叉讨论', '分歧压缩', '最终总结'],
  'deep-5': ['首轮分析', '交叉质疑', '修正方案', '确认总结者', '最终总结'],
};

const ROUND_GOAL_LABELS = {
  首轮分析: '让每个 AI 先独立给出高压缩、可转述的首轮判断。',
  交叉讨论: '让各 AI 阅读他方观点后，回应、修正并继续推进结论。',
  交叉质疑: '让各 AI 明确指出他方问题与自身修正点，避免表面认同。',
  修正方案: '让各 AI 基于前两轮结果主动修正方案，收紧分歧。',
  分歧压缩: '只保留仍影响决策的分歧，压缩重复内容，准备收束。',
  确认总结者: '确认是否还有关键异议，并决定由谁输出最终方案。',
  最终总结: '由总结者输出最终方案，其他 AI 静默。',
};

const SUMMARIZER_PROVIDER_PRIORITY = {
  chatgpt: 5,
  claude: 4,
  gemini: 3,
  perplexity: 2,
  grok: 1,
};

function normalizeTextBlock(text) {
  return String(text || '')
    .replace(/\u200B/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function summarizeOptionPrompts(options, summaryMap) {
  return (Array.isArray(options) ? options : [])
    .map((option) => summaryMap?.[option.id] || option.prompt)
    .filter(Boolean);
}

function getModeOption(modeOptions, modeId) {
  return (Array.isArray(modeOptions) ? modeOptions : []).find((option) => option.id === modeId)
    || (Array.isArray(modeOptions) ? modeOptions[1] : null)
    || null;
}

function getRoundTypeLabel(roundTypeLabels, roundNumber, modeId) {
  const labels = roundTypeLabels?.[modeId] || roundTypeLabels?.['standard-4'] || [];
  if (!Number.isFinite(roundNumber) || roundNumber <= 0) {
    return '准备开始';
  }

  return labels[roundNumber - 1] || `第 ${roundNumber} 轮`;
}

function getRoundGoalLabel(roundGoalLabels, roundType) {
  return roundGoalLabels?.[roundType] || '围绕当前轮次目标继续推进讨论。';
}

function chooseAutoSummarizerPaneId(results, panes, priorityMap) {
  const normalizedResults = Array.isArray(results)
    ? results.filter((result) => result?.paneId)
    : [];
  const paneFallbackId = Array.isArray(panes) ? panes[0]?.id || '' : '';

  if (normalizedResults.length === 0) {
    const paneResults = (Array.isArray(panes) ? panes : [])
      .filter((pane) => pane?.id)
      .map((pane) => ({
        paneId: pane.id,
        providerKey: pane.providerKey || '',
      }));

    return getProviderPriorityFallbackPaneId(paneResults, priorityMap, paneFallbackId);
  }

  if (normalizedResults.length === 1) {
    return normalizedResults[0]?.paneId || paneFallbackId;
  }

  return getProviderPriorityFallbackPaneId(normalizedResults, priorityMap, paneFallbackId);
}

function getProviderPriorityFallbackPaneId(results, priorityMap, paneFallbackId) {
  const normalizedResults = Array.isArray(results)
    ? results.filter((result) => result?.paneId)
    : [];
  const sortedResults = [...normalizedResults].sort((left, right) => {
    const leftPriority = priorityMap?.[left.providerKey] || 0;
    const rightPriority = priorityMap?.[right.providerKey] || 0;
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }

    return String(left.providerName || '').localeCompare(String(right.providerName || ''));
  });

  return sortedResults[0]?.paneId || paneFallbackId;
}

function buildRoundOneDraftText(config) {
  const stickyRuleOptions = Array.isArray(config?.stickyRuleOptions) ? config.stickyRuleOptions : [];
  const quickPromptOptions = Array.isArray(config?.quickPromptOptions) ? config.quickPromptOptions : [];
  const stickyRuleIds = Array.isArray(config?.stickyRuleIds) ? config.stickyRuleIds : [];
  const quickPromptIds = Array.isArray(config?.quickPromptIds) ? config.quickPromptIds : [];

  const stickyRules = stickyRuleOptions.filter((option) => stickyRuleIds.includes(option.id));
  const quickPrompts = quickPromptOptions.filter((option) => quickPromptIds.includes(option.id));
  const requirementParts = summarizeOptionPrompts(stickyRules, config?.stickyRuleSummaries || {});
  const temporaryLines = summarizeOptionPrompts(quickPrompts, config?.quickPromptSummaries || {});

  if (String(config?.roundNote || '').trim()) {
    temporaryLines.push(String(config.roundNote).trim());
  }

  const lines = [
    '第 1 轮独立分析，不回应其他 AI。',
    `题目：${String(config?.topic || '').trim()}`,
    '请用 1/2/3 输出：1. 核心结论 2. 关键依据或判断路径 3. 主要不足、风险或最不确定的一点。',
  ];

  if (requirementParts.length > 0) {
    lines.push(`要求：${requirementParts.join('；')}。`);
  }

  if (temporaryLines.length > 0) {
    lines.push(`补充：${temporaryLines.join('；')}`);
  }

  lines.push('直接开始，不寒暄，不复述题目。');
  return lines.join('\n');
}

function buildStableMaterialSummary(text, maxLength = 520) {
  const normalizedText = normalizeTextBlock(text)
    .replace(/(?<!\n)(\d+[.)、]\s*)/g, '\n$1')
    .replace(/(?<!\n)([-*•]\s+)/g, '\n$1');

  if (!normalizedText) {
    return '';
  }

  const blocks = normalizedText
    .split('\n')
    .map((block) => block.trim())
    .filter(Boolean);

  const uniqueBlocks = [];
  const seen = new Set();

  blocks.forEach((block) => {
    const normalizedBlock = block.replace(/\s+/g, ' ').trim();
    if (!normalizedBlock || seen.has(normalizedBlock)) {
      return;
    }

    const alreadyCovered = uniqueBlocks.some((existingBlock) => {
      return existingBlock.includes(normalizedBlock) || normalizedBlock.includes(existingBlock);
    });

    if (alreadyCovered) {
      return;
    }

    seen.add(normalizedBlock);
    uniqueBlocks.push(normalizedBlock);
  });

  const summary = uniqueBlocks.slice(0, 8).join('\n');
  if (summary.length <= maxLength) {
    return summary;
  }

  return `${summary.slice(0, maxLength).trimEnd()}...`;
}

function buildStableMaterialSnapshot(text, maxLength = 2200, maxBlocks = 18) {
  const normalizedText = normalizeTextBlock(text)
    .replace(/(?<!\n)(\d+[.)、]\s*)/g, '\n$1')
    .replace(/(?<!\n)([-*•]\s+)/g, '\n$1');

  if (!normalizedText) {
    return '';
  }

  const blocks = normalizedText
    .split('\n')
    .map((block) => block.trim())
    .filter(Boolean);

  const uniqueBlocks = [];
  const seen = new Set();

  blocks.forEach((block) => {
    const normalizedBlock = block.replace(/\s+/g, ' ').trim();
    if (!normalizedBlock || seen.has(normalizedBlock)) {
      return;
    }

    seen.add(normalizedBlock);
    uniqueBlocks.push(normalizedBlock);
  });

  const snapshot = uniqueBlocks.slice(0, maxBlocks).join('\n');
  if (snapshot.length <= maxLength) {
    return snapshot;
  }

  return `${snapshot.slice(0, maxLength).trimEnd()}...`;
}

function splitMaterialBlocks(text, maxBlocks = 8) {
  const normalizedText = normalizeTextBlock(text)
    .replace(/(?<!\n)(\d+[.)、]\s*)/g, '\n$1')
    .replace(/(?<!\n)([-*•]\s+)/g, '\n$1');

  if (!normalizedText) {
    return [];
  }

  const seen = new Set();
  const uniqueBlocks = [];

  normalizedText
    .split('\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .forEach((block) => {
      const normalizedBlock = block.replace(/\s+/g, ' ').trim();
      if (!normalizedBlock || seen.has(normalizedBlock)) {
        return;
      }

      seen.add(normalizedBlock);
      uniqueBlocks.push(normalizedBlock);
    });

  return uniqueBlocks.slice(0, maxBlocks);
}

function stripMaterialBlockPrefix(block) {
  return String(block || '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateMaterialLine(text, maxLength = 120) {
  const normalizedText = stripMaterialBlockPrefix(text);
  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxLength).trimEnd()}...`;
}

function dedupeMaterialLines(lines = [], maxItems = 4) {
  const uniqueLines = [];
  const seen = new Set();

  lines.forEach((line) => {
    const normalizedLine = truncateMaterialLine(line, 140);
    if (!normalizedLine) {
      return;
    }

    const dedupeKey = normalizedLine.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }

    const alreadyCovered = uniqueLines.some((existingLine) => {
      return existingLine.includes(normalizedLine) || normalizedLine.includes(existingLine);
    });

    if (alreadyCovered) {
      return;
    }

    seen.add(dedupeKey);
    uniqueLines.push(normalizedLine);
  });

  return uniqueLines.slice(0, maxItems);
}

function classifyMaterialBlock(block) {
  const normalizedBlock = stripMaterialBlockPrefix(block);
  if (!normalizedBlock) {
    return 'other';
  }

  if (/(待确认|需确认|需要确认|待验证|需验证|需要验证|仍需确认|仍需验证|不确定|是否|能否|可否|前提|条件|边界)/.test(normalizedBlock)) {
    return 'open';
  }

  if (/(分歧|异议|争议|冲突|质疑|反对|不同意|不认同|保留意见|漏洞|问题|不足|副作用|风险|限制)/.test(normalizedBlock)) {
    return 'disagreement';
  }

  if (/(共识|一致|都认为|结论|建议|方案|推荐|优先|应该|保留|可行|收敛|方向)/.test(normalizedBlock)) {
    return 'consensus';
  }

  return 'other';
}

function fillMaterialSection(targetItems, fallbackItems, maxItems, usedItems) {
  while (targetItems.length < maxItems && fallbackItems.length > 0) {
    const nextItem = fallbackItems.shift();
    const dedupeKey = String(nextItem || '').toLowerCase();
    if (!nextItem || usedItems.has(dedupeKey)) {
      continue;
    }

    usedItems.add(dedupeKey);
    targetItems.push(nextItem);
  }
}

function parseStructuredMaterialPackText(text) {
  const sections = {
    consensus: [],
    disagreements: [],
    openQuestions: [],
    quotes: [],
  };
  let currentSection = '';

  String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (line === '当前共识：') {
        currentSection = 'consensus';
        return;
      }
      if (line === '当前剩余分歧：') {
        currentSection = 'disagreements';
        return;
      }
      if (line === '待确认点：') {
        currentSection = 'openQuestions';
        return;
      }
      if (line === '必要引用：') {
        currentSection = 'quotes';
        return;
      }

      if (!currentSection || !line.startsWith('- ')) {
        return;
      }

      const normalizedLine = truncateMaterialLine(line.slice(2), currentSection === 'quotes' ? 90 : 120);
      if (!normalizedLine) {
        return;
      }

      sections[currentSection].push(normalizedLine);
    });

  return sections;
}

function collectRoundMaterialItems(roundEntry, getPaneEntryById, isLatestRound) {
  const consensusItems = [];
  const disagreementItems = [];
  const openQuestionItems = [];
  const fallbackItems = [];
  const quoteItems = [];

  const existingMaterialPackText = String(roundEntry?.materialPack?.latestReplyText || '').trim();
  if (existingMaterialPackText) {
    const sections = parseStructuredMaterialPackText(existingMaterialPackText);
    consensusItems.push(...sections.consensus);
    disagreementItems.push(...sections.disagreements);
    openQuestionItems.push(...sections.openQuestions);
    if (isLatestRound) {
      quoteItems.push(...sections.quotes);
    }
    return {
      consensusItems,
      disagreementItems,
      openQuestionItems,
      fallbackItems,
      quoteItems,
    };
  }

  (Array.isArray(roundEntry?.results) ? roundEntry.results : []).forEach((result) => {
    const providerName = result?.providerName || getPaneEntryById(result?.paneId)?.providerName || 'Unknown AI';
    const blocks = splitMaterialBlocks(buildStableMaterialSnapshot(result?.latestReplyText || '', 1400, 20), 10);
    blocks.forEach((block, blockIndex) => {
      const normalizedBlock = truncateMaterialLine(block, 120);
      if (!normalizedBlock) {
        return;
      }

      if (isLatestRound && blockIndex < 2) {
        quoteItems.push(`${providerName}：${truncateMaterialLine(normalizedBlock, 90)}`);
      }

      switch (classifyMaterialBlock(normalizedBlock)) {
        case 'consensus':
          consensusItems.push(normalizedBlock);
          break;
        case 'disagreement':
          disagreementItems.push(normalizedBlock);
          break;
        case 'open':
          openQuestionItems.push(normalizedBlock);
          break;
        default:
          fallbackItems.push(normalizedBlock);
          break;
      }
    });
  });

  return {
    consensusItems,
    disagreementItems,
    openQuestionItems,
    fallbackItems,
    quoteItems,
  };
}

function buildStructuredMaterialPack(config) {
  const roundHistory = Array.isArray(config?.roundHistory) ? config.roundHistory : [];
  const getPaneEntryById = typeof config?.getPaneEntryById === 'function' ? config.getPaneEntryById : () => null;
  if (roundHistory.length === 0) {
    return [];
  }

  const consensusItems = [];
  const disagreementItems = [];
  const openQuestionItems = [];
  const fallbackItems = [];
  const quoteItems = [];

  roundHistory.forEach((roundEntry, roundIndex) => {
    const isLatestRound = roundIndex === roundHistory.length - 1;
    const materialItems = collectRoundMaterialItems(roundEntry, getPaneEntryById, isLatestRound);
    consensusItems.push(...materialItems.consensusItems);
    disagreementItems.push(...materialItems.disagreementItems);
    openQuestionItems.push(...materialItems.openQuestionItems);
    fallbackItems.push(...materialItems.fallbackItems);
    quoteItems.push(...materialItems.quoteItems);
  });

  const consensus = dedupeMaterialLines(consensusItems, 4);
  const disagreements = dedupeMaterialLines(disagreementItems, 4);
  const openQuestions = dedupeMaterialLines(openQuestionItems, 4);
  const fallback = dedupeMaterialLines(fallbackItems, 8);
  const usedItems = new Set([
    ...consensus.map((item) => item.toLowerCase()),
    ...disagreements.map((item) => item.toLowerCase()),
    ...openQuestions.map((item) => item.toLowerCase()),
  ]);

  fillMaterialSection(consensus, fallback, 3, usedItems);
  fillMaterialSection(disagreements, fallback, 3, usedItems);
  fillMaterialSection(openQuestions, fallback, 3, usedItems);

  const keyQuotes = dedupeMaterialLines(quoteItems, 4);
  const sections = [];

  if (consensus.length > 0) {
    sections.push('当前共识：');
    consensus.forEach((item) => {
      sections.push(`- ${item}`);
    });
  }

  if (disagreements.length > 0) {
    sections.push('');
    sections.push('当前剩余分歧：');
    disagreements.forEach((item) => {
      sections.push(`- ${item}`);
    });
  }

  if (openQuestions.length > 0) {
    sections.push('');
    sections.push('待确认点：');
    openQuestions.forEach((item) => {
      sections.push(`- ${item}`);
    });
  }

  if (keyQuotes.length > 0) {
    sections.push('');
    sections.push('必要引用：');
    keyQuotes.forEach((item) => {
      sections.push(`- ${item}`);
    });
  }

  const latestReplyText = sections.join('\n').trim();
  if (!latestReplyText) {
    return [];
  }

  return [
    {
      paneId: '__structured_material_pack__',
      providerKey: 'system',
      providerName: 'Structured Material Pack',
      label: '结构化材料包',
      latestReplyText,
      materialType: 'structured-pack',
    },
  ];
}

function buildLatestRoundMaterialSources(config) {
  const lastRoundResults = Array.isArray(config?.lastRoundResults) ? config.lastRoundResults : [];
  const getPaneEntryById = typeof config?.getPaneEntryById === 'function' ? config.getPaneEntryById : () => null;

  return lastRoundResults
    .map((result) => {
      const providerName = result?.providerName || getPaneEntryById(result?.paneId)?.providerName || 'Unknown AI';
      const originalReplyText = normalizeTextBlock(result?.latestReplyText || '');
      if (!originalReplyText) {
        return null;
      }

      return {
        paneId: result?.paneId || '',
        providerKey: result?.providerKey || '',
        providerName,
        label: providerName,
        latestReplyText: originalReplyText,
      };
    })
    .filter(Boolean);
}

function buildCumulativeRoundMaterialSources(config) {
  return buildLatestRoundMaterialSources(config);
}

function getAutoPromptType(roundNumber, modeId) {
  if (modeId === 'fast-3') {
    if (roundNumber === 2) {
      return 'discussion';
    }
    if (roundNumber === 3) {
      return 'final-summary';
    }
    return '';
  }

  if (modeId === 'standard-4') {
    if (roundNumber === 2) {
      return 'discussion';
    }
    if (roundNumber === 3) {
      return 'compression';
    }
    if (roundNumber === 4) {
      return 'final-summary';
    }
    return '';
  }

  if (modeId === 'deep-5') {
    if (roundNumber === 2) {
      return 'questioning';
    }
    if (roundNumber === 3) {
      return 'revision';
    }
    if (roundNumber === 4) {
      return 'confirmation';
    }
    if (roundNumber === 5) {
      return 'final-summary';
    }
  }

  return '';
}

function getAutoRoundSourceMaxLength(promptType) {
  return null;
}

function getAutoRoundSources(config) {
  return buildLatestRoundMaterialSources(config);
}

module.exports = {
  AUTO_WAIT_POLL_INTERVAL_MS,
  AUTO_WAIT_TIMEOUT_MS,
  BUSY_STALL_PAUSE_MS,
  DEFAULT_STICKY_RULE_IDS,
  MODE_OPTIONS,
  QUICK_PROMPT_OPTIONS,
  QUICK_PROMPT_SUMMARIES,
  ROUND_GOAL_LABELS,
  ROUND_TYPE_LABELS,
  STICKY_RULE_OPTIONS,
  STICKY_RULE_SUMMARIES,
  SUMMARIZER_PROVIDER_PRIORITY,
  buildRoundOneDraftText,
  buildStructuredMaterialPack,
  chooseAutoSummarizerPaneId,
  getAutoPromptType,
  getAutoRoundSourceMaxLength,
  getAutoRoundSources,
  getModeOption,
  getRoundGoalLabel,
  getRoundTypeLabel,
};
