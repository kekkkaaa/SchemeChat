function createRoundHistoryCardHeader(roundEntry) {
  const header = document.createElement('div');
  header.className = 'round-history-card-header';

  const title = document.createElement('span');
  title.className = 'round-history-card-title';
  title.textContent = `第 ${roundEntry.roundNumber} 轮 / ${roundEntry.roundType}`;

  const meta = document.createElement('span');
  meta.className = 'round-history-card-meta';
  const skippedPaneIds = Array.isArray(roundEntry.skippedPaneIds) ? roundEntry.skippedPaneIds : [];
  meta.textContent = skippedPaneIds.length > 0
    ? `${Array.isArray(roundEntry.results) ? roundEntry.results.length : 0} 条结果 / 跳过 ${skippedPaneIds.length} 个`
    : `${Array.isArray(roundEntry.results) ? roundEntry.results.length : 0} 条结果`;

  header.appendChild(title);
  header.appendChild(meta);
  return header;
}

function createRoundHistoryEntry(result, options = {}) {
  const entry = document.createElement('div');
  const isSummarizerResult = Boolean(options.summarizerPaneId) && result.paneId === options.summarizerPaneId;
  entry.className = `round-history-entry${isSummarizerResult ? ' is-summarizer' : ''}`;

  const entryHead = document.createElement('div');
  entryHead.className = 'round-history-entry-head';

  const label = document.createElement('span');
  label.className = 'round-history-entry-label';
  label.textContent = result.providerName || '未知 AI';

  const entryMeta = document.createElement('span');
  entryMeta.className = 'round-history-entry-meta';
  entryMeta.textContent = isSummarizerResult
    ? '总结者'
    : (result.sourceMethod ? `来源：${result.sourceMethod}` : '已完成');

  const body = document.createElement('div');
  body.className = 'round-history-entry-body';
  body.textContent = options.summarizeText(result.latestReplyText || '', 180);
  body.title = result.latestReplyText || '';

  entryHead.appendChild(label);
  entryHead.appendChild(entryMeta);
  entry.appendChild(entryHead);
  entry.appendChild(body);

  return entry;
}

function createRoundHistoryEntries(roundEntry, options = {}) {
  const entryList = document.createElement('div');
  entryList.className = 'round-history-entry-list';

  (Array.isArray(roundEntry.results) ? roundEntry.results : []).forEach((result) => {
    entryList.appendChild(createRoundHistoryEntry(result, options));
  });

  return entryList;
}

function createRoundHistorySkipNote(roundEntry, options = {}) {
  const skippedPaneIds = Array.isArray(roundEntry.skippedPaneIds) ? roundEntry.skippedPaneIds : [];
  if (skippedPaneIds.length === 0) {
    return null;
  }

  const skipNote = document.createElement('div');
  skipNote.className = 'round-history-skip-note';
  const skippedLabels = skippedPaneIds.map((paneId) => {
    return options.getPaneEntryById(paneId)?.providerName
      || options.getProviderTrack(paneId)?.providerName
      || '未知 AI';
  });
  skipNote.textContent = `本轮跳过：${skippedLabels.join(' / ')}`;
  return skipNote;
}

function createRoundHistoryCard(roundEntry, options = {}) {
  const card = document.createElement('article');
  card.className = `round-history-card${roundEntry.roundType === '最终总结' ? ' is-final' : ''}`;
  card.appendChild(createRoundHistoryCardHeader(roundEntry));
  card.appendChild(createRoundHistoryEntries(roundEntry, options));

  const skipNote = createRoundHistorySkipNote(roundEntry, options);
  if (skipNote) {
    card.appendChild(skipNote);
  }

  return card;
}

function renderRoundHistory(config = {}) {
  const refs = config.refs || {};
  const roundHistory = Array.isArray(config.roundHistory) ? config.roundHistory : [];
  const roundHistoryList = refs.roundHistoryList;

  if (!roundHistoryList) {
    return;
  }

  roundHistoryList.innerHTML = '';

  if (roundHistory.length === 0) {
    if (refs.roundHistorySummaryText) {
      refs.roundHistorySummaryText.textContent = '还没有已完成轮次';
    }
    if (refs.roundHistoryCountBadge) {
      refs.roundHistoryCountBadge.textContent = '0 轮';
    }
    roundHistoryList.appendChild(config.createStaticChip('等待首轮完成', 'is-empty'));
    return;
  }

  if (refs.roundHistorySummaryText) {
    refs.roundHistorySummaryText.textContent = config.isFinished
      ? '整场讨论已完成，可回看各轮结果'
      : `已完成 ${roundHistory.length} 轮，可回看稳定结果`;
  }

  if (refs.roundHistoryCountBadge) {
    refs.roundHistoryCountBadge.textContent = `${roundHistory.length} 轮`;
  }

  roundHistory.forEach((roundEntry) => {
    roundHistoryList.appendChild(createRoundHistoryCard(roundEntry, {
      createStaticChip: config.createStaticChip,
      getPaneEntryById: config.getPaneEntryById,
      getProviderTrack: config.getProviderTrack,
      summarizeText: config.summarizeText,
      summarizerPaneId: roundEntry.summarizerPaneId || config.summarizerPaneId || '',
    }));
  });
}

module.exports = {
  renderRoundHistory,
};
