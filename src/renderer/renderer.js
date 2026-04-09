const { ipcRenderer } = require('electron');
const throttle = require('../utils/throttle');
const {
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
  chooseAutoSummarizerPaneId: chooseAutoSummarizerPaneIdFromCore,
  getAutoPromptType: getAutoPromptTypeFromCore,
  getAutoRoundSourceMaxLength: getAutoRoundSourceMaxLengthFromCore,
  getAutoRoundSources: getAutoRoundSourcesFromCore,
  getModeOption: getModeOptionFromCore,
  getRoundGoalLabel: getRoundGoalLabelFromCore,
  getRoundTypeLabel: getRoundTypeLabelFromCore,
  shouldIncludeSelfSourcesForPrompt,
} = require('./discussion-core');

const state = {
  isPanelExpanded: false,
  consoleState: 'idle',
  runMode: 'manual',
  modeId: 'standard-4',
  stickyRuleIds: [...DEFAULT_STICKY_RULE_IDS],
  quickPromptIds: [],
  topic: '',
  roundNote: '',
  draft: '',
  draftSent: false,
  draftNeedsRefresh: false,
  sourcesExpanded: false,
  panes: [],
  providerTracks: {},
  autoRunActive: false,
  autoPauseReason: '',
  autoPauseMeta: '',
  autoPauseResumeAction: 'resume-waiting',
  autoRunToken: 0,
  currentRoundNumber: 0,
  currentRoundType: '准备开始',
  expectedPaneIds: [],
  lastRoundResults: [],
  roundHistory: [],
  summarizerPaneId: '',
  summarizerProviderName: '',
  summarizerSelectionSource: 'auto',
  finalResultText: '',
  roundStartedAt: 0,
  feedbackMessage: '先输入讨论主题',
  feedbackIsError: false,
  feedbackMeta: '写清这轮要讨论的问题、任务或方案。',
};

let syncInFlight = false;
let privateNewChatInFlight = false;
let dragState = null;
let resizeState = null;

const refs = {
  launcherCard: document.getElementById('launcherCard'),
  floatingPanel: document.getElementById('floatingPanel'),
  panelDragHandle: document.getElementById('panelDragHandle'),
  panelResizeHandle: document.getElementById('panelResizeHandle'),
  launcherRunModeBtn: document.getElementById('launcherRunModeBtn'),
  panelRunModeBtn: document.getElementById('panelRunModeBtn'),
  toggleConsoleBtn: document.getElementById('toggleConsoleBtn'),
  collapseConsoleBtn: document.getElementById('collapseConsoleBtn'),
  dockStageBadge: document.getElementById('dockStageBadge'),
  dockModeBadge: document.getElementById('dockModeBadge'),
  dockStateBadge: document.getElementById('dockStateBadge'),
  dockInputLabel: document.getElementById('dockInputLabel'),
  dockInput: document.getElementById('dockInput'),
  launcherPrivateBtn: document.getElementById('launcherPrivateBtn'),
  launcherSyncBtn: document.getElementById('launcherSyncBtn'),
  launcherSkipBtn: document.getElementById('launcherSkipBtn'),
  launcherPrimaryBtn: document.getElementById('launcherPrimaryBtn'),
  syncStatus: document.getElementById('syncStatus'),
  workspaceEyebrow: document.getElementById('workspaceEyebrow'),
  workspaceTitle: document.getElementById('workspaceTitle'),
  workspaceSubtitle: document.getElementById('workspaceSubtitle'),
  draftStatusBadge: document.getElementById('draftStatusBadge'),
  stageBadge: document.getElementById('stageBadge'),
  roundBadge: document.getElementById('roundBadge'),
  modeBadge: document.getElementById('modeBadge'),
  roundGoalText: document.getElementById('roundGoalText'),
  speakerScopeText: document.getElementById('speakerScopeText'),
  draftSourcesBtn: document.getElementById('draftSourcesBtn'),
  draftSourcesPanel: document.getElementById('draftSourcesPanel'),
  sourceQuestionValue: document.getElementById('sourceQuestionValue'),
  sourceRulesValue: document.getElementById('sourceRulesValue'),
  sourceTemplateValue: document.getElementById('sourceTemplateValue'),
  sourceTemporaryValue: document.getElementById('sourceTemporaryValue'),
  draftSourcesSummaryText: document.getElementById('draftSourcesSummaryText'),
  moreActionsSummaryText: document.getElementById('moreActionsSummaryText'),
  stickyRuleTags: document.getElementById('stickyRuleTags'),
  temporaryTagRow: document.getElementById('temporaryTagRow'),
  participantCountBadge: document.getElementById('participantCountBadge'),
  participantSummaryText: document.getElementById('participantSummaryText'),
  participantTags: document.getElementById('participantTags'),
  summarizerSummaryText: document.getElementById('summarizerSummaryText'),
  summarizerModeBadge: document.getElementById('summarizerModeBadge'),
  summarizerHintText: document.getElementById('summarizerHintText'),
  summarizerTags: document.getElementById('summarizerTags'),
  clearSummarizerBtn: document.getElementById('clearSummarizerBtn'),
  roundHistorySummaryText: document.getElementById('roundHistorySummaryText'),
  roundHistoryCountBadge: document.getElementById('roundHistoryCountBadge'),
  roundHistoryList: document.getElementById('roundHistoryList'),
  modeDescription: document.getElementById('modeDescription'),
  modeFlowHint: document.getElementById('modeFlowHint'),
  supportSummaryMeta: document.getElementById('supportSummaryMeta'),
  modeSelector: document.getElementById('modeSelector'),
  idlePanel: document.getElementById('idlePanel'),
  topicInput: document.getElementById('topicInput'),
  roundNoteInput: document.getElementById('roundNoteInput'),
  quickPromptRow: document.getElementById('quickPromptRow'),
  draftPanel: document.getElementById('draftPanel'),
  draftInput: document.getElementById('draftInput'),
  charCountLine: document.getElementById('charCountLine'),
  panelStatusLine: document.getElementById('panelStatusLine'),
  draftMetaLine: document.getElementById('draftMetaLine'),
  newChatBtn: document.getElementById('newChatBtn'),
  panelPrivateBtn: document.getElementById('panelPrivateBtn'),
  panelSyncBtn: document.getElementById('panelSyncBtn'),
  panelSkipBtn: document.getElementById('panelSkipBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  zoomOutBtn: document.getElementById('zoomOutBtn'),
  zoomInBtn: document.getElementById('zoomInBtn'),
  regenerateDraftBtn: document.getElementById('regenerateDraftBtn'),
  resetConsoleBtn: document.getElementById('resetConsoleBtn'),
  panelPrimaryBtn: document.getElementById('panelPrimaryBtn'),
  resetRulesBtn: document.getElementById('resetRulesBtn'),
};

const sendTextUpdate = throttle((text) => {
  ipcRenderer.invoke('send-text-update', text).catch((error) => {
    console.error('Failed to mirror text:', error);
  });
}, 60);

const moveDiscussionConsoleBy = throttle((deltaX, deltaY) => {
  ipcRenderer.send('move-discussion-console-by', deltaX, deltaY);
}, 16);

const resizeDiscussionConsoleBy = throttle((deltaX, deltaY) => {
  ipcRenderer.send('resize-discussion-console-by', deltaX, deltaY);
}, 16);

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getModeOption() {
  return getModeOptionFromCore(MODE_OPTIONS, state.modeId);
}

function getStickyRuleOptions() {
  return STICKY_RULE_OPTIONS.filter((option) => state.stickyRuleIds.includes(option.id));
}

function getQuickPromptOptions() {
  return QUICK_PROMPT_OPTIONS.filter((option) => state.quickPromptIds.includes(option.id));
}

function getPaneEntries() {
  return Array.isArray(state.panes) ? state.panes : [];
}

function getPaneEntryById(paneId) {
  return getPaneEntries().find((pane) => pane.id === paneId) || null;
}

function getRoundTypeLabel(roundNumber = state.currentRoundNumber, modeId = state.modeId) {
  return getRoundTypeLabelFromCore(ROUND_TYPE_LABELS, roundNumber, modeId);
}

function getRoundGoalLabel(roundType = state.currentRoundType) {
  return getRoundGoalLabelFromCore(ROUND_GOAL_LABELS, roundType);
}

function createProviderTrack(pane, previousTrack = {}) {
  return {
    paneId: pane.id,
    providerKey: pane.providerKey,
    providerName: pane.providerName,
    status: previousTrack.status || 'ready',
    latestReplyText: previousTrack.latestReplyText || '',
    error: previousTrack.error || '',
  };
}

function syncProviderTracks() {
  const nextTracks = {};
  getPaneEntries().forEach((pane) => {
    nextTracks[pane.id] = createProviderTrack(pane, state.providerTracks[pane.id]);
  });
  state.providerTracks = nextTracks;
}

function resetAllProviderTrackStatuses(nextStatus = 'ready') {
  syncProviderTracks();
  Object.keys(state.providerTracks).forEach((paneId) => {
    updateProviderTrack(paneId, {
      status: nextStatus,
      latestReplyText: '',
      error: '',
    });
  });
}

function getProviderTrack(paneId) {
  return state.providerTracks[paneId] || null;
}

function updateProviderTrack(paneId, patch) {
  if (!state.providerTracks[paneId]) {
    return;
  }

  state.providerTracks[paneId] = {
    ...state.providerTracks[paneId],
    ...patch,
  };
}

function getSpeakingPaneIds() {
  return getPaneEntries().map((pane) => pane.id);
}

function getSilentPaneIds(speakingPaneIds = []) {
  const speakingPaneIdSet = new Set(speakingPaneIds);
  return getPaneEntries()
    .map((pane) => pane.id)
    .filter((paneId) => !speakingPaneIdSet.has(paneId));
}

function getCompletedSpeakingCount() {
  return state.expectedPaneIds.filter((paneId) => {
    return getProviderTrack(paneId)?.status === 'completed';
  }).length;
}

function getCurrentRoundScopeLabelLegacy__unused() {
  const speakingPaneIds = Array.isArray(state.expectedPaneIds) ? state.expectedPaneIds : [];
  if (speakingPaneIds.length === 0) {
    return '发言：等待参与 AI';
  }

  if (speakingPaneIds.length === getPaneEntries().length) {
    if (isWaitingState()) {
      return `发言：全员（${getCompletedSpeakingCount()} / ${speakingPaneIds.length} 已完成）`;
    }
    return `发言：全员（${speakingPaneIds.length} 个）`;
  }

  if (speakingPaneIds.length === 1) {
    const summarizerPane = getPaneEntryById(speakingPaneIds[0]);
    const summarizerLabel = summarizerPane?.providerName || state.summarizerProviderName || '总结者';
    if (isWaitingState()) {
      return `发言：${summarizerLabel}（总结者）`;
    }
    return `发言：${summarizerLabel}（仅总结者）`;
  }

  return `发言：${speakingPaneIds.length} 个参与 AI`;
}

function getRunModeLabel() {
  return state.runMode === 'auto' ? '自动推进' : '手动推进';
}

function chooseAutoSummarizerPaneId(results = state.lastRoundResults) {
  return chooseAutoSummarizerPaneIdFromCore(results, getPaneEntries(), SUMMARIZER_PROVIDER_PRIORITY);
}

function getResolvedSummarizerPaneId() {
  if (state.summarizerPaneId && getPaneEntryById(state.summarizerPaneId)) {
    return state.summarizerPaneId;
  }

  return '';
}

function getResolvedSummarizerLabel() {
  const paneId = getResolvedSummarizerPaneId();
  if (paneId) {
    return getPaneEntryById(paneId)?.providerName || getProviderTrack(paneId)?.providerName || state.summarizerProviderName || '总结者';
  }

  return state.summarizerProviderName || '默认自动推荐';
}

function setManualSummarizer(paneId) {
  const pane = getPaneEntryById(paneId);
  if (!pane) {
    return;
  }

  state.summarizerPaneId = pane.id;
  state.summarizerProviderName = pane.providerName;
  state.summarizerSelectionSource = 'manual';
}

function clearManualSummarizer() {
  state.summarizerPaneId = '';
  state.summarizerProviderName = '';
  state.summarizerSelectionSource = 'auto';
}

function summarizeText(text, maxLength = 54) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) {
    return '无';
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function createStaticChip(label, className = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `tag-chip ${className}`.trim();
  element.textContent = label;
  element.disabled = true;
  return element;
}

function syncTextareaValue(element, value) {
  if (element.value !== value) {
    element.value = value;
  }
}

function getDraftStateLabel() {
  if (state.consoleState === 'round-waiting') {
    return '等待中';
  }

  if (state.consoleState === 'round-review') {
    return '已完成';
  }

  if (state.consoleState === 'auto-paused') {
    return '自动暂停';
  }

  if (state.consoleState === 'finished') {
    return '最终方案';
  }

  if (state.consoleState !== 'draft-ready') {
    return '待生成';
  }

  if (state.draftNeedsRefresh) {
    return '需刷新';
  }

  return state.draftSent ? '已发送' : '可发送';
}

function setFeedback(message, options = {}) {
  state.feedbackMessage = message;
  state.feedbackIsError = Boolean(options.error);

  if (typeof options.meta === 'string') {
    state.feedbackMeta = options.meta;
  }

  renderFeedback();
}

function renderFeedback() {
  refs.syncStatus.textContent = state.feedbackMessage;
  refs.syncStatus.classList.toggle('is-error', state.feedbackIsError);
  refs.panelStatusLine.textContent = state.feedbackMessage;
  refs.panelStatusLine.classList.toggle('is-error', state.feedbackIsError);
  refs.draftMetaLine.textContent = state.feedbackMeta;
}

function getProviderTrackStatusLabel(track) {
  switch (track?.status) {
    case 'waiting':
      return '生成中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '异常';
    case 'muted':
      return '静默';
    case 'skipped':
      return '跳过';
    default:
      return '待发送';
  }
}

function isWaitingState() {
  return state.consoleState === 'round-waiting';
}

function isReviewState() {
  return state.consoleState === 'round-review';
}

function isAutoPausedState() {
  return state.consoleState === 'auto-paused';
}

function isFinishedState() {
  return state.consoleState === 'finished';
}

function getRoundStatusCounts(paneIds = state.expectedPaneIds) {
  return paneIds.reduce((counts, paneId) => {
    const status = getProviderTrack(paneId)?.status || 'ready';
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    } else {
      counts.other += 1;
    }
    return counts;
  }, {
    total: paneIds.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    waiting: 0,
    muted: 0,
    ready: 0,
    idle: 0,
    other: 0,
  });
}

function getCompletedPaneIds(paneIds = state.expectedPaneIds) {
  return paneIds.filter((paneId) => {
    const track = getProviderTrack(paneId);
    return track?.status === 'completed' && String(track?.latestReplyText || '').trim();
  });
}

function getSkippablePaneIds() {
  const paneIds = Array.isArray(state.expectedPaneIds) ? state.expectedPaneIds : [];
  return paneIds.filter((paneId) => {
    const status = getProviderTrack(paneId)?.status || 'ready';
    return status !== 'completed' && status !== 'skipped' && status !== 'muted';
  });
}

function getCanSkipProblemPanes() {
  return isAutoPausedState()
    && getSkippablePaneIds().length > 0
    && getCompletedPaneIds().length > 0;
}

function getRoundProgressLabel(paneIds = state.expectedPaneIds) {
  if (!(isWaitingState() || isReviewState() || isAutoPausedState() || isFinishedState())) {
    return '';
  }

  const counts = getRoundStatusCounts(paneIds);
  const parts = [];
  if (counts.completed > 0) {
    parts.push(`${counts.completed} \u5df2\u5b8c\u6210`);
  }
  if (counts.skipped > 0) {
    parts.push(`${counts.skipped} \u5df2\u8df3\u8fc7`);
  }
  if (counts.failed > 0) {
    parts.push(`${counts.failed} \u5f02\u5e38`);
  }
  if (counts.waiting > 0) {
    parts.push(`${counts.waiting} \u7b49\u5f85\u4e2d`);
  }
  if (parts.length === 0 && counts.total > 0) {
    parts.push(`${counts.total} \u4e2a`);
  }
  return parts.join(' / ');
}

function getCurrentRoundScopeLabel() {
  const speakingPaneIds = Array.isArray(state.expectedPaneIds) ? state.expectedPaneIds : [];
  if (speakingPaneIds.length === 0) {
    return '\u53d1\u8a00\uff1a\u7b49\u5f85\u53c2\u4e0e AI';
  }

  if (speakingPaneIds.length === getPaneEntries().length) {
    const progressLabel = getRoundProgressLabel(speakingPaneIds);
    if (progressLabel) {
      return `\u53d1\u8a00\uff1a\u5168\u5458\uff08${progressLabel}\uff09`;
    }
    return `\u53d1\u8a00\uff1a\u5168\u5458\uff08${speakingPaneIds.length} \u4e2a\uff09`;
  }

  if (speakingPaneIds.length === 1) {
    const summarizerPane = getPaneEntryById(speakingPaneIds[0]);
    const summarizerLabel = summarizerPane?.providerName || state.summarizerProviderName || '\u603b\u7ed3\u8005';
    const progressLabel = getRoundProgressLabel(speakingPaneIds);
    if (progressLabel && progressLabel !== '1 \u4e2a') {
      return `\u53d1\u8a00\uff1a${summarizerLabel}\uff08${progressLabel}\uff09`;
    }
    if (isWaitingState()) {
      return `\u53d1\u8a00\uff1a${summarizerLabel}\uff08\u603b\u7ed3\u8005\uff09`;
    }
    return `\u53d1\u8a00\uff1a${summarizerLabel}\uff08\u4ec5\u603b\u7ed3\u8005\uff09`;
  }

  const progressLabel = getRoundProgressLabel(speakingPaneIds);
  if (progressLabel) {
    return `\u53d1\u8a00\uff1a${speakingPaneIds.length} \u4e2a\u53c2\u4e0e AI\uff08${progressLabel}\uff09`;
  }
  return `\u53d1\u8a00\uff1a${speakingPaneIds.length} \u4e2a\u53c2\u4e0e AI`;
}

function refreshIdleFeedback() {
  if (state.consoleState !== 'idle') {
    return;
  }

  setFeedback(state.topic.trim() ? '可生成首轮 Draft' : '先输入讨论主题', {
    meta: state.topic.trim()
      ? '可继续补充本轮限制，或直接开始'
      : '写清这轮要讨论的问题、任务或方案。',
  });
}

function markDraftStale(message) {
  if (state.consoleState !== 'draft-ready') {
    return;
  }

  const wasStale = state.draftNeedsRefresh;
  state.draftNeedsRefresh = true;

  if (!wasStale) {
    setFeedback(message, {
      meta: '当前 Draft 仍可发送，但如果你想把最新规则写进去，请点“重生成”。',
    });
  }
}

function buildRoundOneDraft() {
  return buildRoundOneDraftText({
    topic: state.topic,
    roundNote: state.roundNote,
    stickyRuleIds: state.stickyRuleIds,
    quickPromptIds: state.quickPromptIds,
    stickyRuleOptions: STICKY_RULE_OPTIONS,
    quickPromptOptions: QUICK_PROMPT_OPTIONS,
    stickyRuleSummaries: STICKY_RULE_SUMMARIES,
    quickPromptSummaries: QUICK_PROMPT_SUMMARIES,
  });
}

function renderParticipants() {
  const panes = getPaneEntries();
  refs.participantTags.innerHTML = '';

  if (panes.length === 0) {
    refs.participantTags.appendChild(createStaticChip('等待参与 AI', 'is-empty'));
    refs.participantCountBadge.textContent = '0 个';
    refs.participantSummaryText.textContent = '等待参与 AI';
    refs.participantSummaryText.title = '等待参与 AI';
    refs.speakerScopeText.textContent = '发言：等待参与 AI';
    return;
  }

  const showTrackStatuses = isWaitingState() || isReviewState() || isAutoPausedState() || isFinishedState();
  const participantPreview = panes.map((pane) => {
    const track = getProviderTrack(pane.id);
    if (showTrackStatuses && track) {
      return `${pane.providerName}·${getProviderTrackStatusLabel(track)}`;
    }

    return pane.providerName;
  }).join(' / ');
  const participantSummary = summarizeText(participantPreview, 32);

  panes.forEach((pane) => {
    const track = getProviderTrack(pane.id);
    const chipLabel = showTrackStatuses && track
      ? `${pane.providerName} · ${getProviderTrackStatusLabel(track)}`
      : pane.providerName;
    const chipClass = showTrackStatuses && ['failed', 'skipped'].includes(track?.status)
      ? 'is-note'
      : 'is-participant';
    refs.participantTags.appendChild(
      createStaticChip(chipLabel, chipClass)
    );
  });

  refs.participantCountBadge.textContent = `${panes.length} 个`;
  refs.participantSummaryText.textContent = participantSummary;
  refs.participantSummaryText.title = participantPreview;
  if (showTrackStatuses && state.expectedPaneIds.length > 0) {
    refs.speakerScopeText.textContent = getCurrentRoundScopeLabel();
    return;
  }

  refs.speakerScopeText.textContent = `发言：${panes.length} 个参与 AI`;
}

function renderSummarizerSelector() {
  const panes = getPaneEntries();
  refs.summarizerTags.innerHTML = '';

  if (panes.length === 0) {
    refs.summarizerSummaryText.textContent = '等待参与 AI';
    refs.summarizerModeBadge.textContent = '自动';
    refs.summarizerHintText.textContent = '先配置参与 AI，系统才能推荐或指定总结者。';
    refs.clearSummarizerBtn.disabled = true;
    refs.summarizerTags.appendChild(createStaticChip('等待参与 AI', 'is-empty'));
    return;
  }

  const manualSelected = state.summarizerSelectionSource === 'manual' && getResolvedSummarizerPaneId();
  const currentSummarizerId = manualSelected || chooseAutoSummarizerPaneId();
  const currentSummarizerLabel = getPaneEntryById(currentSummarizerId)?.providerName || '默认自动推荐';

  refs.summarizerSummaryText.textContent = currentSummarizerLabel;
  refs.summarizerModeBadge.textContent = manualSelected ? '手动' : '自动';
  refs.summarizerHintText.textContent = manualSelected
    ? '最终总结轮会优先使用你手动指定的总结者。'
    : '当前按默认策略自动推荐；你也可以提前手动指定。';
  refs.clearSummarizerBtn.disabled = !manualSelected;

  panes.forEach((pane) => {
    const button = document.createElement('button');
    const isSelected = pane.id === currentSummarizerId;
    const isManual = manualSelected && pane.id === manualSelected;
    button.type = 'button';
    button.className = `tag-chip is-participant${isSelected ? ' is-summarizer' : ''}${isManual ? ' is-manual' : ''}`.trim();
    button.textContent = isManual
      ? `${pane.providerName} · 手动总结者`
      : isSelected
        ? `${pane.providerName} · 当前总结者`
        : pane.providerName;
    button.addEventListener('click', () => {
      setManualSummarizer(pane.id);
      render();
      setFeedback(`已指定 ${pane.providerName} 为总结者。`, {
        meta: '自动模式到达最终总结轮时，会优先只向该 AI 发送总结 Draft。',
      });
    });
    refs.summarizerTags.appendChild(button);
  });
}

function getSortedRoundHistory() {
  return [...state.roundHistory].sort((left, right) => left.roundNumber - right.roundNumber);
}

function renderRoundHistoryLegacy__unused() {
  const roundHistory = getSortedRoundHistory();
  refs.roundHistoryList.innerHTML = '';

  if (roundHistory.length === 0) {
    refs.roundHistorySummaryText.textContent = '还没有已完成轮次';
    refs.roundHistoryCountBadge.textContent = '0 轮';
    refs.roundHistoryList.appendChild(createStaticChip('等待首轮完成', 'is-empty'));
    return;
  }

  refs.roundHistorySummaryText.textContent = isFinishedState()
    ? '整场讨论已完成，可回看各轮结果'
    : `已完成 ${roundHistory.length} 轮，可回看稳定结果`;
  refs.roundHistoryCountBadge.textContent = `${roundHistory.length} 轮`;

  roundHistory.forEach((roundEntry) => {
    const card = document.createElement('article');
    const isFinalRound = roundEntry.roundType === '最终总结';
    card.className = `round-history-card${isFinalRound ? ' is-final' : ''}`;

    const header = document.createElement('div');
    header.className = 'round-history-card-header';

    const title = document.createElement('span');
    title.className = 'round-history-card-title';
    title.textContent = `第 ${roundEntry.roundNumber} 轮 · ${roundEntry.roundType}`;

    const meta = document.createElement('span');
    meta.className = 'round-history-card-meta';
    meta.textContent = `${Array.isArray(roundEntry.results) ? roundEntry.results.length : 0} 条结果`;

    header.appendChild(title);
    header.appendChild(meta);
    card.appendChild(header);

    const entryList = document.createElement('div');
    entryList.className = 'round-history-entry-list';

    (Array.isArray(roundEntry.results) ? roundEntry.results : []).forEach((result) => {
      const entry = document.createElement('div');
      const isSummarizerResult = Boolean(state.summarizerPaneId) && result.paneId === state.summarizerPaneId;
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
      body.textContent = summarizeText(result.latestReplyText || '', 180);
      body.title = result.latestReplyText || '';

      entryHead.appendChild(label);
      entryHead.appendChild(entryMeta);
      entry.appendChild(entryHead);
      entry.appendChild(body);
      entryList.appendChild(entry);
    });

    card.appendChild(entryList);
    refs.roundHistoryList.appendChild(card);
  });
}

function renderStickyRuleTags() {
  refs.stickyRuleTags.innerHTML = '';

  STICKY_RULE_OPTIONS.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tag-chip${state.stickyRuleIds.includes(option.id) ? ' is-selected' : ''}`;
    button.textContent = option.label;
    button.title = option.prompt;
    button.addEventListener('click', () => {
      if (state.stickyRuleIds.includes(option.id)) {
        state.stickyRuleIds = state.stickyRuleIds.filter((ruleId) => ruleId !== option.id);
      } else {
        state.stickyRuleIds = [...state.stickyRuleIds, option.id];
      }

      markDraftStale(`已更新常驻规则：${option.label}`);
      render();
    });
    refs.stickyRuleTags.appendChild(button);
  });
}

function renderQuickPromptRow() {
  refs.quickPromptRow.innerHTML = '';

  QUICK_PROMPT_OPTIONS.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tag-chip${state.quickPromptIds.includes(option.id) ? ' is-selected' : ''}`;
    button.textContent = option.label;
    button.title = option.prompt;
    button.addEventListener('click', () => {
      if (state.quickPromptIds.includes(option.id)) {
        state.quickPromptIds = state.quickPromptIds.filter((promptId) => promptId !== option.id);
      } else {
        state.quickPromptIds = [...state.quickPromptIds, option.id];
      }

      markDraftStale(`已更新本轮补充：${option.label}`);
      render();
    });
    refs.quickPromptRow.appendChild(button);
  });
}

function renderTemporaryTags() {
  refs.temporaryTagRow.innerHTML = '';
  const quickPrompts = getQuickPromptOptions();

  quickPrompts.forEach((option) => {
    refs.temporaryTagRow.appendChild(createStaticChip(option.tag, 'is-note'));
  });

  if (state.roundNote.trim()) {
    refs.temporaryTagRow.appendChild(
      createStaticChip(`备注：${summarizeText(state.roundNote, 26)}`, 'is-note')
    );
  }

  if (quickPrompts.length === 0 && !state.roundNote.trim()) {
    refs.temporaryTagRow.appendChild(createStaticChip('当前轮没有额外补充', 'is-empty'));
  }
}

function renderModeSelector() {
  refs.modeSelector.innerHTML = '';
  const selectorLocked = syncInFlight || privateNewChatInFlight || isWaitingState() || isAutoPausedState() || isFinishedState() || state.autoRunActive;

  MODE_OPTIONS.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `segment-btn${option.id === state.modeId ? ' is-selected' : ''}`;
    button.textContent = option.label;
    button.disabled = selectorLocked;
    button.addEventListener('click', () => {
      state.modeId = option.id;
      if (state.currentRoundNumber > 0) {
        state.currentRoundType = getRoundTypeLabel(state.currentRoundNumber, option.id);
      }
      markDraftStale(`已切换轮次模式：${option.label}`);
      render();
    });
    refs.modeSelector.appendChild(button);
  });
}

function renderDraftSourcesPanel() {
  refs.draftSourcesPanel.open = state.sourcesExpanded;
}

function renderSupportSummaries() {
  const stickyCount = getStickyRuleOptions().length;
  const temporaryCount = getQuickPromptOptions().length + (state.roundNote.trim() ? 1 : 0);
  const topicSummary = state.topic.trim() ? '主题已填' : '待填主题';
  const ruleSummary = `${stickyCount} 规则`;
  const tempSummary = temporaryCount > 0 ? `${temporaryCount} 补充` : '无补充';
  const runModeSummary = state.runMode === 'auto' ? '自动推进' : '手动推进';
  const summarizerSummary = state.summarizerSelectionSource === 'manual' ? '手动总结者' : '自动总结者';

  refs.supportSummaryMeta.textContent = `${runModeSummary} · ${ruleSummary} · ${tempSummary}`;
  refs.draftSourcesSummaryText.textContent = `${topicSummary} · ${runModeSummary} · ${summarizerSummary} · ${tempSummary}`;
  refs.moreActionsSummaryText.textContent = state.consoleState === 'draft-ready'
    ? '新对话 / 刷新 / 回到准备阶段'
    : '新对话 / 刷新 / 缩放';
}

function renderRoundHistory() {
  const roundHistory = getSortedRoundHistory();
  refs.roundHistoryList.innerHTML = '';

  if (roundHistory.length === 0) {
    refs.roundHistorySummaryText.textContent = '\u8fd8\u6ca1\u6709\u5df2\u5b8c\u6210\u8f6e\u6b21';
    refs.roundHistoryCountBadge.textContent = '0 \u8f6e';
    refs.roundHistoryList.appendChild(createStaticChip('\u7b49\u5f85\u9996\u8f6e\u5b8c\u6210', 'is-empty'));
    return;
  }

  refs.roundHistorySummaryText.textContent = isFinishedState()
    ? '\u6574\u573a\u8ba8\u8bba\u5df2\u5b8c\u6210\uff0c\u53ef\u56de\u770b\u5404\u8f6e\u7ed3\u679c'
    : `\u5df2\u5b8c\u6210 ${roundHistory.length} \u8f6e\uff0c\u53ef\u56de\u770b\u7a33\u5b9a\u7ed3\u679c`;
  refs.roundHistoryCountBadge.textContent = `${roundHistory.length} \u8f6e`;

  roundHistory.forEach((roundEntry) => {
    const card = document.createElement('article');
    const isFinalRound = roundEntry.roundType === '\u6700\u7ec8\u603b\u7ed3';
    card.className = `round-history-card${isFinalRound ? ' is-final' : ''}`;

    const header = document.createElement('div');
    header.className = 'round-history-card-header';

    const title = document.createElement('span');
    title.className = 'round-history-card-title';
    title.textContent = `\u7b2c ${roundEntry.roundNumber} \u8f6e / ${roundEntry.roundType}`;

    const meta = document.createElement('span');
    meta.className = 'round-history-card-meta';
    const skippedPaneIds = Array.isArray(roundEntry.skippedPaneIds) ? roundEntry.skippedPaneIds : [];
    meta.textContent = skippedPaneIds.length > 0
      ? `${Array.isArray(roundEntry.results) ? roundEntry.results.length : 0} \u6761\u7ed3\u679c / \u8df3\u8fc7 ${skippedPaneIds.length} \u4e2a`
      : `${Array.isArray(roundEntry.results) ? roundEntry.results.length : 0} \u6761\u7ed3\u679c`;

    header.appendChild(title);
    header.appendChild(meta);
    card.appendChild(header);

    const entryList = document.createElement('div');
    entryList.className = 'round-history-entry-list';

    (Array.isArray(roundEntry.results) ? roundEntry.results : []).forEach((result) => {
      const entry = document.createElement('div');
      const summarizerPaneId = roundEntry.summarizerPaneId || state.summarizerPaneId;
      const isSummarizerResult = Boolean(summarizerPaneId) && result.paneId === summarizerPaneId;
      entry.className = `round-history-entry${isSummarizerResult ? ' is-summarizer' : ''}`;

      const entryHead = document.createElement('div');
      entryHead.className = 'round-history-entry-head';

      const label = document.createElement('span');
      label.className = 'round-history-entry-label';
      label.textContent = result.providerName || '\u672a\u77e5 AI';

      const entryMeta = document.createElement('span');
      entryMeta.className = 'round-history-entry-meta';
      entryMeta.textContent = isSummarizerResult
        ? '\u603b\u7ed3\u8005'
        : (result.sourceMethod ? `\u6765\u6e90\uff1a${result.sourceMethod}` : '\u5df2\u5b8c\u6210');

      const body = document.createElement('div');
      body.className = 'round-history-entry-body';
      body.textContent = summarizeText(result.latestReplyText || '', 180);
      body.title = result.latestReplyText || '';

      entryHead.appendChild(label);
      entryHead.appendChild(entryMeta);
      entry.appendChild(entryHead);
      entry.appendChild(body);
      entryList.appendChild(entry);
    });

    card.appendChild(entryList);

    if (skippedPaneIds.length > 0) {
      const skipNote = document.createElement('div');
      skipNote.className = 'round-history-skip-note';
      const skippedLabels = skippedPaneIds.map((paneId) => {
        return getPaneEntryById(paneId)?.providerName || getProviderTrack(paneId)?.providerName || '\u672a\u77e5 AI';
      });
      skipNote.textContent = `\u672c\u8f6e\u8df3\u8fc7\uff1a${skippedLabels.join(' / ')}`;
      card.appendChild(skipNote);
    }

    refs.roundHistoryList.appendChild(card);
  });
}

function updateDraftSources() {
  refs.sourceQuestionValue.textContent = state.topic.trim()
    ? summarizeText(state.topic, 80)
    : '尚未填写';

  const stickyLabels = getStickyRuleOptions().map((option) => option.label);
  refs.sourceRulesValue.textContent = stickyLabels.length > 0 ? stickyLabels.join(' / ') : '0 条';
  refs.sourceTemplateValue.textContent = `${state.currentRoundType || '首轮分析'}模板`;

  const temporarySources = getQuickPromptOptions().map((option) => option.tag);
  if (state.roundNote.trim()) {
    temporarySources.push(summarizeText(state.roundNote, 42));
  }

  refs.sourceTemporaryValue.textContent = temporarySources.length > 0
    ? temporarySources.join(' / ')
    : '无';
}

function updateCharacterCount() {
  const count = state.draft.length;
  refs.charCountLine.textContent = `${count} 字`;
}

function renderPanelVisibility() {
  refs.launcherCard.classList.toggle('hidden', state.isPanelExpanded);
  refs.floatingPanel.classList.toggle('hidden', !state.isPanelExpanded);
}

function renderHeader() {
  const mode = getModeOption();
  const stateLabel = getDraftStateLabel();
  const paneCount = getPaneEntries().length;
  const runModeLabel = getRunModeLabel();
  const roundNumber = state.currentRoundNumber || 0;
  const roundType = state.currentRoundType || getRoundTypeLabel(roundNumber);

  refs.modeBadge.textContent = mode.label;
  refs.dockModeBadge.textContent = mode.label;
  refs.modeDescription.textContent = mode.summary || mode.description;
  refs.modeDescription.title = mode.description;
  refs.modeFlowHint.textContent = mode.description;
  refs.modeFlowHint.title = mode.description;
  refs.workspaceEyebrow.textContent = '讨论工作台';
  refs.launcherRunModeBtn.textContent = runModeLabel;
  refs.panelRunModeBtn.textContent = runModeLabel;

  if (state.consoleState === 'round-waiting') {
    refs.stageBadge.textContent = roundType;
    refs.dockStageBadge.textContent = roundType;
    refs.roundBadge.textContent = `第 ${roundNumber} / ${mode.totalRounds} 轮`;
    refs.roundGoalText.textContent = `${getRoundGoalLabel(roundType)} 当前正在等待本轮回复完成。`;
    refs.workspaceTitle.textContent = state.topic.trim()
      ? summarizeText(state.topic, 32)
      : `${roundType}进行中`;
    refs.workspaceSubtitle.textContent = `第 ${roundNumber} / ${mode.totalRounds} 轮 · ${roundType} · ${state.runMode === 'auto' ? '自动等待中' : '等待本轮完成'}`;

    refs.draftStatusBadge.textContent = stateLabel;
    refs.draftStatusBadge.className = 'status-pill is-running';
    refs.launcherPrimaryBtn.textContent = '等待本轮完成';
    refs.panelPrimaryBtn.textContent = '等待本轮完成';
    refs.launcherSyncBtn.textContent = '同步';
    refs.panelSyncBtn.textContent = '同步';
    refs.dockStateBadge.textContent = stateLabel;
    refs.dockInputLabel.textContent = '讨论主题';
    refs.dockInput.placeholder = '系统正在等待本轮完成';
    refs.idlePanel.classList.add('hidden');
    refs.draftPanel.classList.remove('hidden');
    return;
  }

  if (state.consoleState === 'round-review') {
    refs.stageBadge.textContent = '本轮完成';
    refs.dockStageBadge.textContent = '本轮完成';
    refs.roundBadge.textContent = `第 ${roundNumber} / ${mode.totalRounds} 轮`;
    refs.roundGoalText.textContent = `${roundType}已完成，可查看结果并决定下一步。`;
    refs.workspaceTitle.textContent = state.topic.trim()
      ? summarizeText(state.topic, 32)
      : `${roundType}已完成`;
    refs.workspaceSubtitle.textContent = `第 ${roundNumber} / ${mode.totalRounds} 轮 · ${roundType} · 本轮结果已就绪`;

    refs.draftStatusBadge.textContent = stateLabel;
    refs.draftStatusBadge.className = 'status-pill is-sent';
    refs.launcherPrimaryBtn.textContent = '本轮已完成';
    refs.panelPrimaryBtn.textContent = '本轮已完成';
    refs.launcherSyncBtn.textContent = '同步';
    refs.panelSyncBtn.textContent = '同步';
    refs.dockStateBadge.textContent = stateLabel;
    refs.dockInputLabel.textContent = '讨论主题';
    refs.dockInput.placeholder = '本轮结果已就绪';
    refs.idlePanel.classList.add('hidden');
    refs.draftPanel.classList.remove('hidden');
    return;
  }

  if (state.consoleState === 'auto-paused') {
    refs.stageBadge.textContent = '自动暂停';
    refs.dockStageBadge.textContent = '自动暂停';
    refs.roundBadge.textContent = `第 ${roundNumber} / ${mode.totalRounds} 轮`;
    refs.roundGoalText.textContent = state.autoPauseReason || '自动运行已暂停，等待你决定是继续还是接管。';
    refs.workspaceTitle.textContent = state.topic.trim()
      ? summarizeText(state.topic, 32)
      : '自动运行已暂停';
    refs.workspaceSubtitle.textContent = `第 ${roundNumber} / ${mode.totalRounds} 轮 · ${roundType} · 等待用户接管`;

    refs.draftStatusBadge.textContent = stateLabel;
    refs.draftStatusBadge.className = 'status-pill is-paused';
    refs.launcherPrimaryBtn.textContent = '继续自动运行';
    refs.panelPrimaryBtn.textContent = '继续自动运行';
    refs.launcherSyncBtn.textContent = '同步';
    refs.panelSyncBtn.textContent = '同步';
    refs.dockStateBadge.textContent = stateLabel;
    refs.dockInputLabel.textContent = '讨论主题';
    refs.dockInput.placeholder = '自动运行已暂停，可继续或改为手动接管';
    refs.idlePanel.classList.add('hidden');
    refs.draftPanel.classList.remove('hidden');
    return;
  }

  if (state.consoleState === 'finished') {
    const summarizerLabel = state.summarizerProviderName || '总结者';
    refs.stageBadge.textContent = '自动完成';
    refs.dockStageBadge.textContent = '自动完成';
    refs.roundBadge.textContent = `第 ${roundNumber} / ${mode.totalRounds} 轮`;
    refs.roundGoalText.textContent = `整场讨论已完成，最终方案由 ${summarizerLabel} 输出。`;
    refs.workspaceTitle.textContent = state.topic.trim()
      ? summarizeText(state.topic, 32)
      : '最终方案已生成';
    refs.workspaceSubtitle.textContent = `第 ${roundNumber} / ${mode.totalRounds} 轮 · 最终总结 · ${summarizerLabel} 已完成输出`;

    refs.draftStatusBadge.textContent = stateLabel;
    refs.draftStatusBadge.className = 'status-pill is-sent';
    refs.launcherPrimaryBtn.textContent = '已自动完成';
    refs.panelPrimaryBtn.textContent = '已自动完成';
    refs.launcherSyncBtn.textContent = '同步';
    refs.panelSyncBtn.textContent = '同步';
    refs.dockStateBadge.textContent = stateLabel;
    refs.dockInputLabel.textContent = '最终方案';
    refs.dockInput.placeholder = '最终方案已生成';
    refs.idlePanel.classList.add('hidden');
    refs.draftPanel.classList.remove('hidden');
    return;
  }

  if (state.consoleState === 'draft-ready') {
    refs.stageBadge.textContent = roundType;
    refs.dockStageBadge.textContent = roundType;
    refs.roundBadge.textContent = `第 ${roundNumber || 1} / ${mode.totalRounds} 轮`;
    refs.roundGoalText.textContent = getRoundGoalLabel(roundType);
    refs.workspaceTitle.textContent = state.topic.trim()
      ? summarizeText(state.topic, 32)
      : (state.draftSent ? `${roundType} Draft 已发送` : `${roundType} Draft 已就绪`);
    refs.workspaceSubtitle.textContent = `第 ${roundNumber || 1} / ${mode.totalRounds} 轮 · ${roundType} · ${paneCount > 0 ? `${paneCount} 个参与 AI` : '等待参与 AI'}`;

    refs.draftStatusBadge.textContent = stateLabel;
    refs.draftStatusBadge.className = `status-pill${state.draftNeedsRefresh ? ' is-stale' : (state.draftSent ? ' is-sent' : ' is-editable')}`;
    refs.launcherPrimaryBtn.textContent = state.draftSent ? '再次发送' : (state.runMode === 'auto' ? '自动完成' : '发送首轮');
    refs.panelPrimaryBtn.textContent = refs.launcherPrimaryBtn.textContent;
    refs.launcherSyncBtn.textContent = '同步';
    refs.panelSyncBtn.textContent = '同步';
    refs.dockStateBadge.textContent = stateLabel;
    refs.dockInputLabel.textContent = 'Draft 编辑';
    refs.dockInput.placeholder = '修改首轮提示词，或直接再次发送';
    refs.idlePanel.classList.add('hidden');
    refs.draftPanel.classList.remove('hidden');
  } else {
    refs.stageBadge.textContent = '准备开始';
    refs.dockStageBadge.textContent = '准备开始';
    refs.roundBadge.textContent = `第 0 / ${mode.totalRounds} 轮`;
    refs.roundGoalText.textContent = '目标：先明确讨论主题，再生成首轮 Draft。';
    refs.workspaceTitle.textContent = '准备讨论主题';
    refs.workspaceSubtitle.textContent = `第 0 / ${mode.totalRounds} 轮 · 准备开始 · ${paneCount > 0 ? `${paneCount} 个参与 AI` : '等待参与 AI'}`;

    refs.draftStatusBadge.textContent = '待生成';
    refs.draftStatusBadge.className = 'status-pill';
    refs.launcherPrimaryBtn.textContent = state.runMode === 'auto' ? '自动完成' : '开始首轮';
    refs.panelPrimaryBtn.textContent = refs.launcherPrimaryBtn.textContent;
    refs.launcherSyncBtn.textContent = '同步';
    refs.panelSyncBtn.textContent = '同步';
    refs.dockStateBadge.textContent = '待生成';
    refs.dockInputLabel.textContent = '讨论主题';
    refs.dockInput.placeholder = state.runMode === 'auto' ? '写清主题后，自动跑完整场讨论' : '写清主题后，开始首轮';
    refs.idlePanel.classList.remove('hidden');
    refs.draftPanel.classList.add('hidden');
  }
}

function renderActionButtons() {
  const hasPanes = getPaneEntries().length > 0;
  const hasTopic = Boolean(state.topic.trim());
  const hasDraft = Boolean(state.draft.trim());
  const controlsBusy = syncInFlight || privateNewChatInFlight;
  const isWaiting = isWaitingState();
  const isAutoPaused = isAutoPausedState();
  const isRoundReview = isReviewState();
  const isFinished = isFinishedState();
  const canSkipProblemPanes = getCanSkipProblemPanes();
  const canReset = state.consoleState === 'draft-ready'
    || hasTopic
    || Boolean(state.roundNote.trim())
    || state.quickPromptIds.length > 0;

  let primaryDisabled = false;
  if (controlsBusy || isWaiting) {
    primaryDisabled = true;
  } else if (isAutoPaused) {
    primaryDisabled = !hasPanes;
  } else if (isFinished) {
    primaryDisabled = true;
  } else if (isRoundReview) {
    primaryDisabled = true;
  } else if (state.consoleState === 'draft-ready') {
    primaryDisabled = !hasPanes || !hasDraft;
  } else {
    primaryDisabled = !hasTopic;
  }

  refs.launcherPrimaryBtn.disabled = primaryDisabled;
  refs.panelPrimaryBtn.disabled = refs.launcherPrimaryBtn.disabled;
  refs.launcherSyncBtn.disabled = syncInFlight || !hasPanes || isWaiting || isFinished;
  refs.panelSyncBtn.disabled = refs.launcherSyncBtn.disabled;
  refs.launcherSkipBtn.disabled = !canSkipProblemPanes;
  refs.panelSkipBtn.disabled = refs.launcherSkipBtn.disabled;
  refs.launcherPrivateBtn.disabled = controlsBusy || !hasPanes || isWaiting || isFinished;
  refs.panelPrivateBtn.disabled = refs.launcherPrivateBtn.disabled;
  refs.regenerateDraftBtn.disabled = state.consoleState !== 'draft-ready' || !hasTopic;
  refs.resetConsoleBtn.disabled = !canReset;
  refs.launcherRunModeBtn.disabled = controlsBusy || (state.autoRunActive && !isAutoPaused && !isRoundReview && !isFinished);
  refs.panelRunModeBtn.disabled = refs.launcherRunModeBtn.disabled;
}

function renderInputs() {
  syncTextareaValue(refs.topicInput, state.topic);
  syncTextareaValue(refs.roundNoteInput, state.roundNote);
  syncTextareaValue(refs.draftInput, state.draft);
  syncTextareaValue(refs.dockInput, state.consoleState === 'draft-ready' || isFinishedState() ? state.draft : state.topic);
  const draftEditable = state.consoleState === 'draft-ready';
  const inputEditable = !isWaitingState() && !isFinishedState();
  refs.topicInput.disabled = !inputEditable;
  refs.roundNoteInput.disabled = !inputEditable;
  refs.draftInput.disabled = !draftEditable;
  refs.dockInput.disabled = isWaitingState() || isFinishedState();
}

function render() {
  renderPanelVisibility();
  refs.floatingPanel.classList.toggle('is-idle', state.consoleState === 'idle');
  refs.floatingPanel.classList.toggle('is-draft-ready', state.consoleState === 'draft-ready');
  renderHeader();
  renderModeSelector();
  renderStickyRuleTags();
  renderQuickPromptRow();
  renderTemporaryTags();
  renderParticipants();
  renderSummarizerSelector();
  renderRoundHistory();
  renderSupportSummaries();
  renderDraftSourcesPanel();
  updateDraftSources();
  renderInputs();
  updateCharacterCount();
  renderFeedback();
  renderActionButtons();
}

function focusPrimaryField() {
  if (state.isPanelExpanded) {
    if (state.consoleState === 'draft-ready') {
      refs.draftInput.focus();
      return;
    }

    refs.topicInput.focus();
    return;
  }

  refs.dockInput.focus();
}

async function setPanelExpanded(nextExpanded) {
  try {
    const applied = await ipcRenderer.invoke('set-discussion-console-expanded', nextExpanded);
    state.isPanelExpanded = Boolean(applied);
    render();
    focusPrimaryField();
  } catch (error) {
    console.error('Failed to toggle discussion console:', error);
    state.isPanelExpanded = Boolean(nextExpanded);
    render();
  }
}

async function loadExpandedState() {
  try {
    state.isPanelExpanded = Boolean(
      await ipcRenderer.invoke('get-discussion-console-expanded')
    );
    render();
  } catch (error) {
    console.error('Failed to load expanded state:', error);
  }
}

async function loadSettingsState() {
  try {
    const settingsState = await ipcRenderer.invoke('get-settings-state');
    state.panes = Array.isArray(settingsState?.panes) ? settingsState.panes : [];
    syncProviderTracks();
    if (state.summarizerPaneId && !getPaneEntryById(state.summarizerPaneId)) {
      clearManualSummarizer();
    }
    render();
  } catch (error) {
    console.error('Failed to load pane settings:', error);
    setFeedback('读取参与 AI 信息失败。', {
      error: true,
      meta: '仍可继续编辑控制台，但参与者状态可能不准确。',
    });
  }
}

function resetConsoleToIdle() {
  state.autoRunToken += 1;
  state.consoleState = 'idle';
  state.autoRunActive = false;
  state.autoPauseReason = '';
  state.autoPauseMeta = '';
  state.autoPauseResumeAction = 'resume-waiting';
  state.currentRoundNumber = 0;
  state.currentRoundType = '准备开始';
  state.expectedPaneIds = [];
  state.lastRoundResults = [];
  state.roundHistory = [];
  if (state.summarizerSelectionSource !== 'manual') {
    state.summarizerPaneId = '';
    state.summarizerProviderName = '';
  }
  state.finalResultText = '';
  state.roundStartedAt = 0;
  state.draft = '';
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  resetAllProviderTrackStatuses();
  render();
  setFeedback('已回到准备阶段', {
    meta: '可重写主题、模式或本轮补充，再生成首轮 Draft',
  });
}

function setRunMode(nextRunMode) {
  if (!['manual', 'auto'].includes(nextRunMode) || nextRunMode === state.runMode) {
    return;
  }

  if (state.autoRunActive && !isAutoPausedState() && !isReviewState()) {
    return;
  }

  state.runMode = nextRunMode;
  if (nextRunMode === 'manual' && isAutoPausedState()) {
    state.autoRunActive = false;
    state.autoPauseReason = '';
    state.autoPauseMeta = '';
    state.autoPauseResumeAction = 'resume-waiting';
    state.consoleState = 'round-review';
  }
  render();
  setFeedback(nextRunMode === 'auto' ? '已切到自动推进模式。' : '已切到手动推进模式。', {
    meta: nextRunMode === 'auto'
      ? '点击“自动完成”后，系统会自动发送并等待首轮完成。'
      : '你可以逐轮生成、修改并发送本轮 Draft；如果刚才处于自动暂停，现在已切到手动接管。',
  });
}

function applyProviderInspectionResults(results = []) {
  results.forEach((result) => {
    const nextStatus = result.status
      || (!result.ok
        ? 'failed'
        : result.busy
          ? 'waiting'
          : result.hasReply
            ? 'completed'
            : 'ready');

    updateProviderTrack(result.paneId, {
      status: nextStatus,
      latestReplyText: result.latestReplyText || getProviderTrack(result.paneId)?.latestReplyText || '',
      error: result.error || '',
    });
  });
}

async function pauseAutoRun(reason, options = {}) {
  state.autoRunToken += 1;
  state.autoRunActive = false;
  state.autoPauseReason = reason;
  state.autoPauseMeta = options.meta || '你可以稍后继续自动运行，或改为手动接管。';
  state.autoPauseResumeAction = options.resumeAction || 'resume-waiting';
  state.consoleState = 'auto-paused';
  render();
  setFeedback(reason, {
    error: true,
    meta: state.autoPauseMeta,
  });
}

function clearAutoPauseState() {
  state.autoPauseReason = '';
  state.autoPauseMeta = '';
  state.autoPauseResumeAction = 'resume-waiting';
}

function buildFallbackRoundResultsFromTracks(paneIds = []) {
  return paneIds.map((paneId) => {
    const track = getProviderTrack(paneId);
    const pane = getPaneEntryById(paneId);
    const latestReplyText = String(track?.latestReplyText || '').trim();
    if (!latestReplyText) {
      return null;
    }

    return {
      paneId,
      providerKey: track?.providerKey || pane?.providerKey || '',
      providerName: track?.providerName || pane?.providerName || 'Unknown AI',
      latestReplyText,
      sourceMethod: 'track-cache',
      ok: true,
      busy: false,
      hasReply: true,
      status: 'completed',
      error: null,
    };
  }).filter(Boolean);
}

async function captureCompletedRoundResultsForPaneIds(paneIds = []) {
  if (!Array.isArray(paneIds) || paneIds.length === 0) {
    return [];
  }

  const captureResult = await ipcRenderer.invoke('capture-provider-round-results', { paneIds });
  if (!Array.isArray(captureResult?.results)) {
    return [];
  }

  return captureResult.results
    .filter((result) => result?.ok && String(result?.latestReplyText || '').trim())
    .map((result) => ({
      ...result,
      status: 'completed',
    }));
}

function mergeRoundResults(primaryResults = [], fallbackResults = [], orderedPaneIds = []) {
  const resultMap = new Map();
  fallbackResults.forEach((result) => {
    resultMap.set(result.paneId, result);
  });
  primaryResults.forEach((result) => {
    resultMap.set(result.paneId, result);
  });

  const orderedIds = orderedPaneIds.length > 0
    ? orderedPaneIds
    : Array.from(resultMap.keys());

  return orderedIds
    .map((paneId) => resultMap.get(paneId))
    .filter((result) => result && String(result.latestReplyText || '').trim());
}

function recordCompletedRound(results = [], options = {}) {
  const skippedPaneIds = Array.isArray(options.skippedPaneIds)
    ? [...new Set(options.skippedPaneIds.filter(Boolean))]
    : [];
  state.lastRoundResults = results;
  state.roundHistory = [
    ...state.roundHistory.filter((entry) => entry.roundNumber !== state.currentRoundNumber),
    {
      roundNumber: state.currentRoundNumber,
      roundType: state.currentRoundType,
      results,
      skippedPaneIds,
      summarizerPaneId: options.summarizerPaneId || state.summarizerPaneId || '',
    },
  ];
}

function getAutoPromptType(roundNumber, modeId = state.modeId) {
  return getAutoPromptTypeFromCore(roundNumber, modeId);
}

function getAutoRoundSources(promptType) {
  return getAutoRoundSourcesFromCore({
    promptType,
    lastRoundResults: state.lastRoundResults,
    roundHistory: getSortedRoundHistory(),
    getPaneEntryById,
  });
}

function getAutoRoundSourceMaxLength(promptType) {
  return getAutoRoundSourceMaxLengthFromCore(promptType);
}

function getAutoRoundFeedback(roundNumber, promptType, paneIds) {
  const feedbackByType = {
    discussion: {
      message: `第 ${roundNumber} 轮已自动发送。`,
      meta: '系统正在等待交叉讨论轮完成。',
    },
    questioning: {
      message: `第 ${roundNumber} 轮已自动发送。`,
      meta: '系统正在等待交叉质疑轮完成。',
    },
    compression: {
      message: `第 ${roundNumber} 轮已自动发送。`,
      meta: '系统正在等待分歧压缩轮完成。',
    },
    revision: {
      message: `第 ${roundNumber} 轮已自动发送。`,
      meta: '系统正在等待修正方案轮完成。',
    },
    confirmation: {
      message: `第 ${roundNumber} 轮已自动发送。`,
      meta: '系统正在等待确认总结者轮完成。',
    },
    'final-summary': {
      message: `第 ${roundNumber} 轮已自动发送。`,
      meta: paneIds.length === 1
        ? `系统已按默认策略选择 ${state.summarizerProviderName || '总结者'} 做最终总结，其余 AI 静默。`
        : '系统正在等待最终总结轮完成。',
    },
  };

  return feedbackByType[promptType] || {
    message: `第 ${roundNumber} 轮已自动发送。`,
    meta: '系统正在等待本轮完成。',
  };
}

function resolveAutoSummarizer() {
  const manualPaneId = getResolvedSummarizerPaneId();
  const paneId = manualPaneId || chooseAutoSummarizerPaneId();
  const pane = getPaneEntryById(paneId);
  state.summarizerPaneId = paneId;
  state.summarizerProviderName = pane?.providerName || getProviderTrack(paneId)?.providerName || '总结者';
  if (!manualPaneId) {
    state.summarizerSelectionSource = 'auto';
  }
  return paneId;
}

async function prepareAndSubmitAutoRound(options = {}) {
  const paneIds = Array.isArray(options.paneIds)
    ? [...new Set(options.paneIds.filter(Boolean))]
    : [];
  const roundSources = getAutoRoundSources(options.promptType);
  const includeSelf = shouldIncludeSelfSourcesForPrompt(options.promptType);
  const maxLengthPerSource = options.maxLengthPerSource || getAutoRoundSourceMaxLength(options.promptType);

  if (paneIds.length === 0) {
    await pauseAutoRun('自动推进缺少可发言的目标面板。', {
      meta: '请检查参与 AI 是否仍然存在。',
      resumeAction: 'advance-next-round',
    });
    return;
  }

  if (!Array.isArray(roundSources) || roundSources.length === 0) {
    await pauseAutoRun('自动推进缺少上一轮可用结果。', {
      meta: '请先确认上一轮是否已成功完成并抓取到稳定回复。',
      resumeAction: 'advance-next-round',
    });
    return;
  }

  let prepareResult;
  try {
    prepareResult = await ipcRenderer.invoke('prepare-generated-round', {
      promptType: options.promptType,
      paneIds,
      sources: roundSources,
      includeSelf,
      topic: state.topic,
      summarizerName: state.summarizerProviderName,
      maxLengthPerSource,
    });
  } catch (error) {
    console.error('Failed to prepare generated round:', error);
    await pauseAutoRun(`自动准备第 ${options.roundNumber} 轮失败。`, {
      meta: error?.message || '请检查当前 AI 页面是否仍可写入输入框。',
      resumeAction: 'advance-next-round',
    });
    return;
  }

  if (!prepareResult?.ok) {
    await pauseAutoRun(prepareResult?.message || `自动准备第 ${options.roundNumber} 轮失败。`, {
      meta: '你可以先手动检查输入框状态，或改为手动接管。',
      resumeAction: 'advance-next-round',
    });
    return;
  }

  state.currentRoundNumber = options.roundNumber;
  state.currentRoundType = getRoundTypeLabel(options.roundNumber);
  state.draft = prepareResult.previewPrompt || '';
  state.draftSent = true;
  state.draftNeedsRefresh = false;
  render();

  let submitResult;
  try {
    submitResult = await ipcRenderer.invoke('submit-message-to-panes', { paneIds });
  } catch (error) {
    console.error('Failed to auto-submit generated round:', error);
    await pauseAutoRun(`自动发送第 ${options.roundNumber} 轮失败。`, {
      meta: error?.message || '请检查各 AI 输入框是否仍可交互。',
      resumeAction: 'advance-next-round',
    });
    return;
  }

  if (!submitResult?.ok) {
    await pauseAutoRun(submitResult?.message || `自动发送第 ${options.roundNumber} 轮失败。`, {
      meta: '请检查各 AI 输入框是否仍可交互。',
      resumeAction: 'advance-next-round',
    });
    return;
  }

  const feedbackCopy = getAutoRoundFeedback(options.roundNumber, options.promptType, paneIds);
  await startWaitingForCurrentRound({
    paneIds,
    silentPaneIds: getSilentPaneIds(paneIds),
    automated: true,
    feedbackMessage: feedbackCopy.message,
    feedbackMeta: feedbackCopy.meta,
  });
}

function getBusyStallPaneLabels(results = []) {
  return results
    .filter((result) => result.busy && result.hasReply && result.busyStableMs >= BUSY_STALL_PAUSE_MS)
    .map((result) => result.providerName || getPaneEntryById(result.paneId)?.providerName || 'Unknown AI');
}

async function finishAutoRun() {
  const finalResult = Array.isArray(state.lastRoundResults) ? state.lastRoundResults[0] : null;
  const finalPane = getPaneEntryById(finalResult?.paneId || state.summarizerPaneId);

  state.autoRunActive = false;
  state.summarizerPaneId = finalResult?.paneId || state.summarizerPaneId || '';
  state.summarizerProviderName = finalPane?.providerName || finalResult?.providerName || state.summarizerProviderName || '总结者';
  if (state.summarizerSelectionSource !== 'manual') {
    state.summarizerSelectionSource = 'auto';
  }
  state.finalResultText = finalResult?.latestReplyText || '';
  state.draft = state.finalResultText || state.draft;
  state.draftSent = true;
  state.draftNeedsRefresh = false;
  state.consoleState = 'finished';
  state.expectedPaneIds = state.summarizerPaneId ? [state.summarizerPaneId] : [];
  render();

  setFeedback('整场讨论已自动完成。', {
    meta: `${state.summarizerProviderName} 已输出最终方案，你现在可以直接查看结果。`,
  });
}

async function skipProblemPanes() {
  if (!isAutoPausedState()) {
    return;
  }

  const skippablePaneIds = getSkippablePaneIds();
  const completedPaneIds = getCompletedPaneIds();
  if (skippablePaneIds.length === 0) {
    setFeedback('\u5f53\u524d\u6ca1\u6709\u53ef\u8df3\u8fc7\u7684\u5f02\u5e38 AI\u3002', {
      error: true,
      meta: '\u53ea\u6709\u672c\u8f6e\u5f85\u7b49\u5f85\u6216\u5df2\u5931\u8d25\u7684 AI \u624d\u80fd\u88ab\u8df3\u8fc7\u3002',
    });
    return;
  }

  if (completedPaneIds.length === 0) {
    setFeedback('\u5f53\u524d\u6ca1\u6709\u53ef\u4fdd\u7559\u7684\u672c\u8f6e\u7ed3\u679c\uff0c\u65e0\u6cd5\u901a\u8fc7\u8df3\u8fc7\u7ee7\u7eed\u63a8\u8fdb\u3002', {
      error: true,
      meta: '\u81f3\u5c11\u9700\u8981\u6709 1 \u4e2a AI \u5df2\u5b8c\u6210\u56de\u590d\uff0c\u7cfb\u7edf\u624d\u80fd\u5e26\u7740\u5df2\u6709\u6750\u6599\u7ee7\u7eed\u8fd0\u884c\u3002',
    });
    return;
  }

  let capturedResults = [];
  try {
    capturedResults = await captureCompletedRoundResultsForPaneIds(completedPaneIds);
  } catch (error) {
    console.error('Failed to capture completed round results for skip flow:', error);
  }

  const fallbackResults = buildFallbackRoundResultsFromTracks(completedPaneIds);
  const usableResults = mergeRoundResults(capturedResults, fallbackResults, completedPaneIds);
  if (usableResults.length === 0) {
    setFeedback('\u8df3\u8fc7\u540e\u4ecd\u6ca1\u6709\u53ef\u7528\u7684\u672c\u8f6e\u6750\u6599\u3002', {
      error: true,
      meta: '\u8bf7\u5148\u786e\u8ba4\u81f3\u5c11\u6709 1 \u4e2a AI \u7684\u56de\u590d\u5df2\u7a33\u5b9a\u5b8c\u6210\uff0c\u6216\u6539\u4e3a\u624b\u52a8\u63a5\u7ba1\u3002',
    });
    return;
  }

  skippablePaneIds.forEach((paneId) => {
    updateProviderTrack(paneId, {
      status: 'skipped',
    });
  });

  usableResults.forEach((result) => {
    updateProviderTrack(result.paneId, {
      status: 'completed',
      latestReplyText: result.latestReplyText || '',
      error: '',
    });
  });

  recordCompletedRound(usableResults, {
    skippedPaneIds: skippablePaneIds,
  });

  clearAutoPauseState();
  state.consoleState = 'round-review';
  render();

  const skippedLabels = skippablePaneIds.map((paneId) => {
    return getPaneEntryById(paneId)?.providerName || getProviderTrack(paneId)?.providerName || 'Unknown AI';
  });
  const skippedLabelText = skippedLabels.join(' / ');
  const mode = getModeOption();

  if (state.currentRoundNumber >= mode.totalRounds) {
    await finishAutoRun();
    return;
  }

  if (usableResults.length === 1) {
    const soleResult = usableResults[0];
    const keepManualSummarizer = state.summarizerSelectionSource === 'manual'
      && state.summarizerPaneId === soleResult.paneId;
    state.summarizerPaneId = soleResult.paneId;
    state.summarizerProviderName = soleResult.providerName || getPaneEntryById(soleResult.paneId)?.providerName || state.summarizerProviderName;
    state.summarizerSelectionSource = keepManualSummarizer ? 'manual' : 'auto';

    setFeedback(`\u5df2\u8df3\u8fc7 ${skippedLabelText}\uff0c\u56e0\u4ec5\u5269 1 \u4e2a\u53ef\u7528 AI\uff0c\u7cfb\u7edf\u76f4\u63a5\u8fdb\u5165\u6700\u7ec8\u603b\u7ed3\u3002`, {
      meta: `${state.summarizerProviderName || '\u603b\u7ed3\u8005'} \u4f1a\u57fa\u4e8e\u5f53\u524d\u4ec5\u5b58\u7684\u8f6e\u6b21\u6750\u6599\u8f93\u51fa\u6700\u7ec8\u65b9\u6848\u3002`,
    });

    await prepareAndSubmitAutoRound({
      roundNumber: mode.totalRounds,
      promptType: 'final-summary',
      paneIds: [soleResult.paneId],
    });
    return;
  }

  setFeedback(`\u5df2\u8df3\u8fc7 ${skippedLabelText}\uff0c\u7cfb\u7edf\u5c06\u7ee7\u7eed\u81ea\u52a8\u63a8\u8fdb\u3002`, {
    meta: `\u672c\u8f6e\u4fdd\u7559 ${usableResults.length} \u6761\u53ef\u7528\u7ed3\u679c\uff0c\u4e0b\u4e00\u8f6e\u4f1a\u7ee7\u7eed\u4f7f\u7528\u8fd9\u4e9b\u6750\u6599\u3002`,
  });
  await maybeAdvanceAutoRunAfterRound();
}

async function maybeAdvanceAutoRunAfterRound() {
  const mode = getModeOption();

  if (state.currentRoundNumber >= mode.totalRounds) {
    await finishAutoRun();
    return;
  }

  const nextRoundNumber = state.currentRoundNumber + 1;
  const promptType = getAutoPromptType(nextRoundNumber, mode.id);
  if (!promptType) {
    await pauseAutoRun(`自动推进暂不支持第 ${nextRoundNumber} 轮。`, {
      meta: '请先改为手动接管，或补充该轮的自动 Draft builder。',
      resumeAction: 'advance-next-round',
    });
    return;
  }

  let paneIds = getSpeakingPaneIds();
  if (promptType === 'final-summary') {
    const summarizerPaneId = resolveAutoSummarizer();
    if (!summarizerPaneId) {
      await pauseAutoRun('自动推进无法确定总结者。', {
        meta: '请先手动选择总结者，或确认当前参与 AI 是否仍然存在。',
        resumeAction: 'advance-next-round',
      });
      return;
    }
    paneIds = [summarizerPaneId];
  }

  await prepareAndSubmitAutoRound({
    roundNumber: nextRoundNumber,
    promptType,
    paneIds,
  });
}

async function pollRoundCompletion(token, paneIds, automated) {
  const busyStableTracker = new Map();

  while (state.autoRunToken === token && state.consoleState === 'round-waiting') {
    let inspection;

    try {
      inspection = await ipcRenderer.invoke('inspect-provider-round-statuses', { paneIds });
    } catch (error) {
      console.error('Failed to inspect provider round statuses:', error);
      await pauseAutoRun('无法读取当前轮状态。', {
        meta: error?.message || '请检查当前 Provider 页面是否仍在可交互状态。',
      });
      return;
    }

    if (state.autoRunToken !== token) {
      return;
    }

    if (!Array.isArray(inspection?.results) || inspection.results.length === 0) {
      await pauseAutoRun('当前轮没有可用的 Provider 状态。', {
        meta: '请检查参与 AI 是否仍然存在。',
      });
      return;
    }

    applyProviderInspectionResults(inspection.results);
    render();

    const failedInspection = inspection.results.find((result) => !result.ok);
    if (failedInspection) {
      await pauseAutoRun(`${failedInspection.providerName} 状态检查失败。`, {
        meta: failedInspection.error || '请检查该 AI 页面是否仍可读取。',
      });
      return;
    }

    const settledResults = inspection.results.map((result) => {
      const latestReplyText = String(result.latestReplyText || '');
      const previous = busyStableTracker.get(result.paneId) || {
        latestReplyText: '',
        unchangedSince: 0,
      };

      let unchangedSince = 0;
      if (result.busy && result.hasReply && latestReplyText) {
        unchangedSince = previous.latestReplyText === latestReplyText
          ? (previous.unchangedSince || Date.now())
          : Date.now();
      }

      busyStableTracker.set(result.paneId, {
        latestReplyText,
        unchangedSince,
      });

      const busyStableMs = unchangedSince > 0 ? Date.now() - unchangedSince : 0;
      const isEffectivelyCompleted = !result.busy && result.hasReply;

      return {
        ...result,
        busyStableMs,
        isEffectivelyCompleted,
      };
    });

    const completedCount = settledResults.filter((result) => result.isEffectivelyCompleted).length;
    setFeedback(`正在等待第 ${state.currentRoundNumber} 轮完成`, {
      meta: `已完成 ${completedCount} / ${paneIds.length}。`,
    });

    const stalledPaneLabels = getBusyStallPaneLabels(settledResults);
    if (stalledPaneLabels.length > 0) {
      await pauseAutoRun(`第 ${state.currentRoundNumber} 轮长时间无进展。`, {
        meta: `${stalledPaneLabels.join(' / ')} 仍显示生成中，但回复长时间没有继续增长。`,
      });
      return;
    }

    const allDone = settledResults.every((result) => result.isEffectivelyCompleted);
    if (allDone) {
      let captureResult;

      try {
        captureResult = await ipcRenderer.invoke('capture-provider-round-results', { paneIds });
      } catch (error) {
        console.error('Failed to capture provider round results:', error);
        await pauseAutoRun('本轮稳定结果抓取失败。', {
          meta: error?.message || '你可以稍后继续自动运行。',
        });
        return;
      }

      if (state.autoRunToken !== token) {
        return;
      }

      const missingPaneIds = paneIds.filter((paneId) => {
        return !captureResult?.results?.some((result) => result?.paneId === paneId && result?.ok && String(result?.latestReplyText || '').trim());
      });

      if (!Array.isArray(captureResult?.results) || captureResult.results.length === 0 || !captureResult?.ok || missingPaneIds.length > 0) {
        const failedCapture = captureResult?.results?.find((result) => !result.ok);
        await pauseAutoRun(failedCapture ? `${failedCapture.providerName} 最终结果抓取失败。` : '本轮稳定结果抓取失败。', {
          meta: failedCapture?.error || (missingPaneIds.length > 0
            ? '仍有 AI 未抓取到完整稳定结果，系统已暂停，避免把半截内容推进到下一轮。'
            : '你可以稍后继续自动运行。'),
        });
        return;
      }

      const completedResults = captureResult.results.map((result) => ({
        ...result,
        status: 'completed',
      }));
      applyProviderInspectionResults(completedResults);
      recordCompletedRound(captureResult.results);
      state.consoleState = 'round-review';
      render();

      if (automated) {
        await maybeAdvanceAutoRunAfterRound();
      } else {
        setFeedback(`第 ${state.currentRoundNumber} 轮已完成。`, {
          meta: `已完成 ${captureResult.results.length} / ${captureResult.results.length}，可继续下一步。`,
        });
      }
      return;
    }

    if (Date.now() - state.roundStartedAt >= AUTO_WAIT_TIMEOUT_MS) {
      await pauseAutoRun(`第 ${state.currentRoundNumber} 轮等待超时。`, {
        meta: '你可以继续自动运行、手动检查网页，或改为手动接管。',
      });
      return;
    }

    await delay(AUTO_WAIT_POLL_INTERVAL_MS);
  }
}

async function startWaitingForCurrentRound(options = {}) {
  const paneIds = Array.isArray(options.paneIds) && options.paneIds.length > 0
    ? options.paneIds
    : getSpeakingPaneIds();
  const silentPaneIds = Array.isArray(options.silentPaneIds)
    ? options.silentPaneIds
    : getSilentPaneIds(paneIds);

  syncProviderTracks();
  state.expectedPaneIds = [...paneIds];
  state.roundStartedAt = Date.now();
  state.consoleState = 'round-waiting';
  Object.keys(state.providerTracks).forEach((paneId) => {
    if (paneIds.includes(paneId)) {
      updateProviderTrack(paneId, {
        status: 'waiting',
        latestReplyText: '',
        error: '',
      });
      return;
    }

    if (silentPaneIds.includes(paneId)) {
      updateProviderTrack(paneId, {
        status: 'muted',
        error: '',
      });
      return;
    }

    updateProviderTrack(paneId, {
      status: 'ready',
      error: '',
    });
  });
  render();

  if (options.feedbackMessage) {
    setFeedback(options.feedbackMessage, {
      meta: options.feedbackMeta || '系统正在等待本轮完成。',
    });
  }

  const token = ++state.autoRunToken;
  if (options.automated) {
    state.autoRunActive = true;
  }

  await pollRoundCompletion(token, paneIds, Boolean(options.automated));
}

async function resumeAutoRun() {
  if (!isAutoPausedState()) {
    return;
  }

  const resumeAction = state.autoPauseResumeAction || 'resume-waiting';
  clearAutoPauseState();

  if (resumeAction === 'advance-next-round') {
    await maybeAdvanceAutoRunAfterRound();
    return;
  }

  await startWaitingForCurrentRound({
    paneIds: state.expectedPaneIds.length > 0 ? state.expectedPaneIds : getSpeakingPaneIds(),
    automated: true,
    feedbackMessage: `正在继续等待第 ${state.currentRoundNumber} 轮完成。`,
    feedbackMeta: '系统会继续观察各 AI 的回复状态。',
  });
}

async function startAutoRun() {
  if (getPaneEntries().length < 2) {
    setFeedback('自动推进至少需要 2 个参与 AI。', {
      error: true,
      meta: '请先在设置里配置两个及以上可用面板，再启动自动运行。',
    });
    return;
  }

  state.autoRunActive = true;
  state.autoPauseReason = '';
  state.autoPauseMeta = '';
  state.lastRoundResults = [];
  state.roundHistory = [];
  if (state.summarizerSelectionSource !== 'manual') {
    state.summarizerPaneId = '';
    state.summarizerProviderName = '';
  }
  state.finalResultText = '';
  state.currentRoundNumber = 1;
  state.currentRoundType = getRoundTypeLabel(1);
  resetAllProviderTrackStatuses();
  await generateRoundOneDraft();
  if (state.consoleState !== 'draft-ready' || !state.draft.trim()) {
    state.autoRunActive = false;
    return;
  }
  await submitRoundOneDraft({ automated: true });
}

async function generateRoundOneDraft() {
  if (!state.topic.trim()) {
    setFeedback('先输入讨论主题', {
      error: true,
      meta: '至少要有一个明确的问题、任务或方案。',
    });
    focusPrimaryField();
    return;
  }

  setFeedback('正在生成首轮 Draft', {
    meta: '系统正在合并主题、模式和本轮补充',
  });

  state.draft = buildRoundOneDraft();
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  state.currentRoundNumber = 1;
  state.currentRoundType = getRoundTypeLabel(1);
  state.consoleState = 'draft-ready';
  render();
  sendTextUpdate(state.draft);
  focusPrimaryField();
  setFeedback('已生成首轮 Draft，可发送', {
    meta: `将发送给 ${Math.max(getPaneEntries().length, 0)} 个参与 AI；发送前可继续修改`,
  });
}

async function regenerateDraft() {
  if (!state.topic.trim()) {
    setFeedback('当前还没有讨论主题，无法重新生成草稿。', {
      error: true,
      meta: '请先填写讨论主题。',
    });
    return;
  }

  await generateRoundOneDraft();
}

async function submitRoundOneDraft(options = {}) {
  if (getPaneEntries().length === 0) {
    setFeedback('当前没有可发送的 AI 面板。', {
      error: true,
      meta: '请先在设置里配置至少一个参与面板，再发送首轮 Draft。',
    });
    return;
  }

  if (!state.draft.trim()) {
    setFeedback('当前 Draft 为空，无法发送。', {
      error: true,
      meta: '请先生成或补全首轮 Draft。',
    });
    focusPrimaryField();
    return;
  }

  try {
    await ipcRenderer.invoke('send-text-update', state.draft);
    await ipcRenderer.invoke('submit-message');
    state.draftSent = true;
    if (options.automated) {
      await startWaitingForCurrentRound({
        paneIds: getSpeakingPaneIds(),
        automated: true,
        feedbackMessage: '首轮已自动发送。',
        feedbackMeta: '系统正在等待首轮完成。',
      });
      return;
    }

    render();
    setFeedback('首轮已发送。', {
      meta: '如果还想继续补充，可以修改后再次发送。后续多轮自动等待我们已经开始接入。',
    });
  } catch (error) {
    console.error('Failed to submit round one draft:', error);
    setFeedback('发送首轮失败。', {
      error: true,
      meta: error?.message || '提交消息到各个 AI 面板时发生错误。',
    });
  }
}

async function handlePrimaryAction() {
  if (isAutoPausedState()) {
    await resumeAutoRun();
    return;
  }

  if (state.consoleState === 'draft-ready') {
    await submitRoundOneDraft({
      automated: state.runMode === 'auto',
    });
    return;
  }

  if (state.runMode === 'auto') {
    await startAutoRun();
    return;
  }

  await generateRoundOneDraft();
}

async function syncLatestRound() {
  if (syncInFlight) {
    return;
  }

  syncInFlight = true;
  render();
  setFeedback('正在同步最新回复', {
    meta: '系统会抓取每侧最新稳定回复，并交叉写入对侧输入框。',
  });

  try {
    const result = await ipcRenderer.invoke('sync-latest-round');
    setFeedback(result?.message || '同步完成。', {
      error: !result?.ok,
      meta: result?.ok
        ? '同步只影响网页里的输入框，不会自动改写工作台里的 Draft。'
        : '如果某一侧仍在回复，等完成后再试。',
    });
  } catch (error) {
    console.error('Failed to sync latest round:', error);
    setFeedback('同步失败。', {
      error: true,
      meta: '抓取最新回复时发生错误。',
    });
  } finally {
    syncInFlight = false;
    render();
  }
}

async function triggerPrivateNewChat() {
  if (privateNewChatInFlight) {
    return;
  }

  privateNewChatInFlight = true;
  render();
  setFeedback('正在打开临时对话', {
    meta: '会同时尝试触发 Grok private、ChatGPT temporary、Gemini temporary。',
  });

  try {
    const result = await ipcRenderer.invoke('private-new-chat');
    setFeedback(result?.message || '临时对话处理完成。', {
      error: !result?.ok,
      meta: result?.ok
        ? '工作台内容不会清空，你可以继续沿用当前 Draft。'
        : '如果某个 AI 失败，可以稍后再试。',
    });
  } catch (error) {
    console.error('Failed to trigger private new chat:', error);
    setFeedback('打开临时对话失败。', {
      error: true,
      meta: '请稍后重试。',
    });
  } finally {
    privateNewChatInFlight = false;
    render();
  }
}

function updateDockValue(nextValue) {
  if (state.consoleState === 'draft-ready') {
    state.draft = nextValue;
    state.draftSent = false;
    state.draftNeedsRefresh = false;
    render();
    sendTextUpdate(state.draft);
    return;
  }

  state.topic = nextValue;
  render();
  refreshIdleFeedback();
}

function handleDragMove(event) {
  if (!dragState) {
    return;
  }

  const deltaX = event.screenX - dragState.lastScreenX;
  const deltaY = event.screenY - dragState.lastScreenY;
  dragState.lastScreenX = event.screenX;
  dragState.lastScreenY = event.screenY;

  if (deltaX !== 0 || deltaY !== 0) {
    moveDiscussionConsoleBy(deltaX, deltaY);
  }
}

function handleResizeMove(event) {
  if (!resizeState) {
    return;
  }

  const deltaX = event.screenX - resizeState.lastScreenX;
  const deltaY = event.screenY - resizeState.lastScreenY;
  resizeState.lastScreenX = event.screenX;
  resizeState.lastScreenY = event.screenY;

  if (deltaX !== 0 || deltaY !== 0) {
    resizeDiscussionConsoleBy(deltaX, deltaY);
  }
}

function stopDrag() {
  dragState = null;
  window.removeEventListener('mousemove', handleDragMove);
  window.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('blur', stopDrag);
}

function stopResize() {
  resizeState = null;
  window.removeEventListener('mousemove', handleResizeMove);
  window.removeEventListener('mouseup', stopResize);
  window.removeEventListener('blur', stopResize);
}

refs.panelDragHandle.addEventListener('mousedown', (event) => {
  if (event.button !== 0) {
    return;
  }

  if (event.target.closest('button, textarea, input')) {
    return;
  }

  dragState = {
    lastScreenX: event.screenX,
    lastScreenY: event.screenY,
  };

  window.addEventListener('mousemove', handleDragMove);
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('blur', stopDrag);
  event.preventDefault();
});

if (refs.panelResizeHandle) {
  refs.panelResizeHandle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }

    resizeState = {
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
    };

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('blur', stopResize);
    event.preventDefault();
  });
}

refs.toggleConsoleBtn.addEventListener('click', () => {
  setPanelExpanded(true);
});

refs.collapseConsoleBtn.addEventListener('click', () => {
  setPanelExpanded(false);
});

refs.launcherRunModeBtn.addEventListener('click', () => {
  setRunMode(state.runMode === 'auto' ? 'manual' : 'auto');
});

refs.panelRunModeBtn.addEventListener('click', () => {
  setRunMode(state.runMode === 'auto' ? 'manual' : 'auto');
});

refs.dockInput.addEventListener('input', (event) => {
  updateDockValue(event.target.value);
});

refs.dockInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    handlePrimaryAction();
  }
});

refs.topicInput.addEventListener('input', (event) => {
  state.topic = event.target.value;
  if (state.consoleState === 'draft-ready') {
    markDraftStale('已更新讨论主题');
  }
  render();
  refreshIdleFeedback();
});

refs.roundNoteInput.addEventListener('input', (event) => {
  state.roundNote = event.target.value;
  if (state.consoleState === 'draft-ready') {
    markDraftStale('已更新本轮补充');
  }
  render();
  refreshIdleFeedback();
});

refs.draftInput.addEventListener('input', (event) => {
  state.draft = event.target.value;
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  render();
  sendTextUpdate(state.draft);
});

refs.draftInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    submitRoundOneDraft();
  }
});

refs.resetRulesBtn.addEventListener('click', () => {
  state.stickyRuleIds = [...DEFAULT_STICKY_RULE_IDS];
  if (state.consoleState === 'draft-ready') {
    markDraftStale('已恢复默认规则');
  }
  render();
});

refs.clearSummarizerBtn.addEventListener('click', () => {
  clearManualSummarizer();
  render();
  setFeedback('已恢复自动推荐总结者。', {
    meta: '最终总结轮会按默认策略自动选择总结者，你仍可以随时再手动改选。',
  });
});

refs.draftSourcesPanel.addEventListener('toggle', () => {
  state.sourcesExpanded = refs.draftSourcesPanel.open;
  renderDraftSourcesPanel();
});

refs.regenerateDraftBtn.addEventListener('click', () => {
  regenerateDraft();
});

refs.resetConsoleBtn.addEventListener('click', () => {
  resetConsoleToIdle();
});

refs.launcherPrimaryBtn.addEventListener('click', () => {
  handlePrimaryAction();
});

refs.panelPrimaryBtn.addEventListener('click', () => {
  handlePrimaryAction();
});

refs.newChatBtn.addEventListener('click', () => {
  ipcRenderer.invoke('new-chat').then(() => {
    state.draftSent = false;
    render();
    setFeedback('已在所有面板中打开新对话。', {
      meta: '当前工作台内容会保留，你可以继续生成或发送新的 Draft。',
    });
  }).catch((error) => {
    console.error('Failed to start new chat:', error);
    setFeedback('打开新对话失败。', {
      error: true,
      meta: '请稍后重试。',
    });
  });
});

refs.launcherPrivateBtn.addEventListener('click', () => {
  triggerPrivateNewChat();
});

refs.panelPrivateBtn.addEventListener('click', () => {
  triggerPrivateNewChat();
});

refs.launcherSyncBtn.addEventListener('click', () => {
  syncLatestRound();
});

refs.panelSyncBtn.addEventListener('click', () => {
  syncLatestRound();
});

refs.launcherSkipBtn.addEventListener('click', () => {
  skipProblemPanes();
});

refs.panelSkipBtn.addEventListener('click', () => {
  skipProblemPanes();
});

refs.refreshBtn.addEventListener('click', () => {
  ipcRenderer.invoke('refresh-pages').then(() => {
    setFeedback('已刷新所有网页。', {
      meta: '工作台内容保持不变。',
    });
  }).catch((error) => {
    console.error('Failed to refresh pages:', error);
    setFeedback('刷新网页失败。', {
      error: true,
      meta: '请稍后重试。',
    });
  });
});

refs.zoomInBtn.addEventListener('click', () => {
  ipcRenderer.invoke('zoom-in').catch((error) => {
    console.error('Failed to zoom in:', error);
  });
});

refs.zoomOutBtn.addEventListener('click', () => {
  ipcRenderer.invoke('zoom-out').catch((error) => {
    console.error('Failed to zoom out:', error);
  });
});

ipcRenderer.on('selector-error', (event, payload) => {
  setFeedback(`${payload?.source || '某个面板'} 注入失败。`, {
    error: true,
    meta: payload?.error || '请检查当前网页是否仍在可交互状态。',
  });
});

ipcRenderer.on('discussion-console-expanded-changed', (event, nextExpanded) => {
  state.isPanelExpanded = Boolean(nextExpanded);
  render();
  focusPrimaryField();
});

window.addEventListener('focus', () => {
  loadSettingsState();
});

render();
loadExpandedState();
loadSettingsState();
focusPrimaryField();
