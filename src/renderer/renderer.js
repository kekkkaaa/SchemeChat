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
const {
  buildFallbackRoundResultsFromTracks: buildFallbackRoundResultsFromAutoRun,
  getCompletedPaneIdsFromTracks,
  getMissingCapturedPaneIds,
  getSkippablePaneIdsFromTracks,
  mergeRoundResults,
  settleInspectionResults,
} = require('./discussion-auto-run');
const {
  deriveHeaderState,
  deriveActionButtonState,
  deriveInputState,
} = require('./discussion-view-state');

const state = {
  isPanelExpanded: false,
  consoleState: 'idle',
  runMode: 'auto',
  modeId: 'standard-4',
  stickyRuleIds: [...DEFAULT_STICKY_RULE_IDS],
  quickPromptIds: [],
  topic: '',
  roundNote: '',
  draft: '',
  draftSent: false,
  draftNeedsRefresh: false,
  draftPaneIds: [],
  draftPromptType: '',
  sourcesExpanded: false,
  panes: [],
  providerTracks: {},
  autoRunActive: false,
  autoPauseReason: '',
  autoPauseMeta: '',
  autoPauseResumeAction: 'resume-waiting',
  partialErrorResumeAction: 'resume-waiting',
  globalErrorResumeAction: '',
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

const sendTextUpdate = throttle((text, paneIds = []) => {
  const targetPaneIds = Array.isArray(paneIds) ? paneIds.filter(Boolean) : [];
  const channel = targetPaneIds.length > 0 ? 'send-text-update-to-panes' : 'send-text-update';
  const payload = targetPaneIds.length > 0 ? { paneIds: targetPaneIds, text } : text;

  ipcRenderer.invoke(channel, payload).catch((error) => {
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

function getUniquePaneIds(paneIds = []) {
  return [...new Set((Array.isArray(paneIds) ? paneIds : []).filter(Boolean))];
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

function getDraftPaneIds() {
  return getUniquePaneIds(state.draftPaneIds);
}

function setDraftPaneIds(paneIds = []) {
  state.draftPaneIds = getUniquePaneIds(paneIds);
}

function clearDraftContext() {
  state.draftPaneIds = [];
  state.draftPromptType = '';
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
  const paneId = getResolvedSummarizerPaneId() || chooseAutoSummarizerPaneId();
  if (paneId) {
    return getPaneEntryById(paneId)?.providerName || getProviderTrack(paneId)?.providerName || state.summarizerProviderName || '总结者';
  }

  return '待手动指定';
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
  if (isDraftPreparingState()) {
    return '生成中';
  }

  if (isDispatchingState()) {
    return '发送中';
  }

  if (isWaitingState()) {
    return '等待中';
  }

  if (isReviewState()) {
    return '已完成';
  }

  if (isSummarizerSelectingState()) {
    return '待确认';
  }

  if (isPartialErrorState()) {
    return '局部异常';
  }

  if (isAutoPausedState()) {
    return '自动暂停';
  }

  if (isGlobalErrorState()) {
    return '流程异常';
  }

  if (isFinishedState()) {
    return '最终方案';
  }

  if (!isDraftReadyState()) {
    return '待生成';
  }

  if (state.draftNeedsRefresh) {
    return '需刷新';
  }

  return state.draftSent ? '已发送' : '可发送';
}

function getSendButtonLabel(roundType = state.currentRoundType) {
  switch (roundType) {
    case '首轮分析':
      return '发送首轮';
    case '交叉讨论':
      return '发送交叉讨论';
    case '交叉质疑':
      return '发送交叉质疑';
    case '修正方案':
      return '发送修正方案';
    case '分歧压缩':
      return '发送压缩轮';
    case '确认总结者':
      return '发送确认轮';
    case '最终总结':
      return '发送最终总结';
    default:
      return '发送本轮';
  }
}

function getRoundReviewPrimaryLabel() {
  const mode = getModeOption();
  if (state.currentRoundNumber >= mode.totalRounds) {
    return '完成讨论';
  }

  const nextRoundNumber = state.currentRoundNumber + 1;
  const promptType = getAutoPromptType(nextRoundNumber, mode.id);
  if (promptType === 'final-summary') {
    return '进入总结者选择';
  }

  const nextRoundType = getRoundTypeLabel(nextRoundNumber);
  switch (nextRoundType) {
    case '交叉讨论':
      return '开始交叉讨论';
    case '交叉质疑':
      return '开始交叉质疑';
    case '修正方案':
      return '进入修正轮';
    case '分歧压缩':
      return '进入压缩轮';
    case '确认总结者':
      return '进入确认轮';
    default:
      return `进入${nextRoundType}`;
  }
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
    case 'dispatching':
      return '发送中';
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

function isDraftPreparingState() {
  return state.consoleState === 'draft-preparing';
}

function isDraftReadyState() {
  return state.consoleState === 'draft-ready';
}

function isDispatchingState() {
  return state.consoleState === 'round-dispatching';
}

function isWaitingState() {
  return state.consoleState === 'round-waiting';
}

function isReviewState() {
  return state.consoleState === 'round-review';
}

function isSummarizerSelectingState() {
  return state.consoleState === 'summarizer-selecting';
}

function isPartialErrorState() {
  return state.consoleState === 'round-partial-error';
}

function isAutoPausedState() {
  return state.consoleState === 'auto-paused';
}

function isGlobalErrorState() {
  return state.consoleState === 'global-error';
}

function isFinishedState() {
  return state.consoleState === 'finished';
}

function getScopePaneIds() {
  if (isSummarizerSelectingState()) {
    const summarizerPaneId = getResolvedSummarizerPaneId() || chooseAutoSummarizerPaneId();
    return summarizerPaneId ? [summarizerPaneId] : [];
  }

  if (isDraftPreparingState() || isDraftReadyState() || isDispatchingState()) {
    return getDraftPaneIds();
  }

  return getUniquePaneIds(state.expectedPaneIds);
}

function mirrorDraftToTargetPanes() {
  const paneIds = getDraftPaneIds();
  if (paneIds.length === 0) {
    return;
  }

  sendTextUpdate(state.draft, paneIds);
}

async function mirrorDraftToTargetPanesNow() {
  const paneIds = getDraftPaneIds();
  if (paneIds.length === 0) {
    return;
  }

  await ipcRenderer.invoke('send-text-update-to-panes', {
    paneIds,
    text: state.draft,
  });
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
    dispatching: 0,
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
  return getCompletedPaneIdsFromTracks(paneIds, state.providerTracks);
}

function getSkippablePaneIds() {
  const paneIds = Array.isArray(state.expectedPaneIds) ? state.expectedPaneIds : [];
  return getSkippablePaneIdsFromTracks(paneIds, state.providerTracks);
}

function getCanSkipProblemPanes() {
  return (isAutoPausedState() || isPartialErrorState())
    && getSkippablePaneIds().length > 0
    && getCompletedPaneIds().length > 0;
}

function getRoundProgressLabel(paneIds = state.expectedPaneIds) {
  if (!(isDispatchingState() || isWaitingState() || isReviewState() || isPartialErrorState() || isAutoPausedState() || isFinishedState())) {
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
  if (counts.dispatching > 0) {
    parts.push(`${counts.dispatching} \u53d1\u9001\u4e2d`);
  }
  if (counts.waiting > 0) {
    parts.push(`${counts.waiting} \u7b49\u5f85\u4e2d`);
  }
  if (parts.length === 0 && counts.total > 0) {
    parts.push(`${counts.total} \u4e2a`);
  }
  return parts.join(' / ');
}

function getCurrentRoundScopeLabel(paneIds = getScopePaneIds()) {
  const speakingPaneIds = getUniquePaneIds(paneIds);
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
  const scopePaneIds = getScopePaneIds();

  if (panes.length === 0) {
    refs.participantTags.appendChild(createStaticChip('等待参与 AI', 'is-empty'));
    refs.participantCountBadge.textContent = '0 个';
    refs.participantSummaryText.textContent = '等待参与 AI';
    refs.participantSummaryText.title = '等待参与 AI';
    refs.speakerScopeText.textContent = '发言：等待参与 AI';
    return;
  }

  const showTrackStatuses = isDispatchingState()
    || isWaitingState()
    || isReviewState()
    || isPartialErrorState()
    || isAutoPausedState()
    || isFinishedState();
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

  if (scopePaneIds.length > 0) {
    refs.speakerScopeText.textContent = getCurrentRoundScopeLabel(scopePaneIds);
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
  const currentSummarizerLabel = getPaneEntryById(currentSummarizerId)?.providerName || '待手动指定';

  refs.summarizerSummaryText.textContent = currentSummarizerLabel;
  refs.summarizerModeBadge.textContent = manualSelected ? '手动' : '自动';
  refs.summarizerHintText.textContent = manualSelected
    ? '最终总结轮会优先使用你手动指定的总结者。'
    : currentSummarizerId
      ? '当前按确认轮推荐优先、默认策略兜底自动推荐；你也可以提前手动指定。'
      : '当前未形成明确自动推荐，请手动指定后再进入最终总结。';
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
  refs.moreActionsSummaryText.textContent = isDraftReadyState()
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
  const roundNumber = state.currentRoundNumber || 0;
  const roundType = state.currentRoundType || getRoundTypeLabel(roundNumber);
  const summarizerPaneId = getResolvedSummarizerPaneId() || chooseAutoSummarizerPaneId();
  const headerState = deriveHeaderState({
    modeLabel: mode.label,
    modeDescription: mode.description,
    modeSummary: mode.summary,
    runModeLabel: getRunModeLabel(),
    roundNumber,
    totalRounds: mode.totalRounds,
    roundType,
    stateLabel: getDraftStateLabel(),
    topicSummary: state.topic.trim() ? summarizeText(state.topic, 32) : '',
    paneCount: getPaneEntries().length,
    runMode: state.runMode,
    summarizerLabel: getResolvedSummarizerLabel(),
    hasResolvedSummarizer: Boolean(summarizerPaneId),
    feedbackMessage: state.feedbackMessage,
    autoPauseReason: state.autoPauseReason,
    roundGoalLabel: getRoundGoalLabel(roundType),
    roundReviewPrimaryLabel: getRoundReviewPrimaryLabel(),
    sendButtonLabel: getSendButtonLabel(roundType),
    draftSent: state.draftSent,
    draftNeedsRefresh: state.draftNeedsRefresh,
    isPreparing: isDraftPreparingState(),
    isDispatching: isDispatchingState(),
    isWaiting: isWaitingState(),
    isReview: isReviewState(),
    isSummarizerSelecting: isSummarizerSelectingState(),
    isPartialError: isPartialErrorState(),
    isAutoPaused: isAutoPausedState(),
    isGlobalError: isGlobalErrorState(),
    isFinished: isFinishedState(),
    isDraftReady: isDraftReadyState(),
  });

  refs.modeBadge.textContent = headerState.modeBadgeText;
  refs.dockModeBadge.textContent = headerState.dockModeBadgeText;
  refs.modeDescription.textContent = headerState.modeDescriptionText;
  refs.modeDescription.title = headerState.modeDescriptionTitle;
  refs.modeFlowHint.textContent = headerState.modeFlowHintText;
  refs.modeFlowHint.title = headerState.modeFlowHintTitle;
  refs.workspaceEyebrow.textContent = headerState.workspaceEyebrowText;
  refs.launcherRunModeBtn.textContent = headerState.launcherRunModeText;
  refs.panelRunModeBtn.textContent = headerState.panelRunModeText;
  refs.stageBadge.textContent = headerState.stageBadgeText;
  refs.dockStageBadge.textContent = headerState.dockStageBadgeText;
  refs.roundBadge.textContent = headerState.roundBadgeText;
  refs.roundGoalText.textContent = headerState.roundGoalText;
  refs.workspaceTitle.textContent = headerState.workspaceTitleText;
  refs.workspaceSubtitle.textContent = headerState.workspaceSubtitleText;
  refs.draftStatusBadge.textContent = headerState.draftStatusBadgeText;
  refs.draftStatusBadge.className = headerState.draftStatusBadgeClassName;
  refs.launcherPrimaryBtn.textContent = headerState.launcherPrimaryText;
  refs.panelPrimaryBtn.textContent = headerState.panelPrimaryText;
  refs.launcherSyncBtn.textContent = headerState.launcherSyncText;
  refs.panelSyncBtn.textContent = headerState.panelSyncText;
  refs.dockStateBadge.textContent = headerState.dockStateBadgeText;
  refs.dockInputLabel.textContent = headerState.dockInputLabelText;
  refs.dockInput.placeholder = headerState.dockInputPlaceholder;
  refs.idlePanel.classList.toggle('hidden', headerState.idlePanelHidden);
  refs.draftPanel.classList.toggle('hidden', headerState.draftPanelHidden);
}

function renderActionButtons() {
  const hasPanes = getPaneEntries().length > 0;
  const hasTopic = Boolean(state.topic.trim());
  const hasDraft = Boolean(state.draft.trim());
  const controlsBusy = syncInFlight || privateNewChatInFlight;
  const isPreparing = isDraftPreparingState();
  const isDispatching = isDispatchingState();
  const isWaiting = isWaitingState();
  const isSummarizerSelecting = isSummarizerSelectingState();
  const isPartialError = isPartialErrorState();
  const isAutoPaused = isAutoPausedState();
  const isGlobalError = isGlobalErrorState();
  const isRoundReview = isReviewState();
  const isFinished = isFinishedState();
  const canSkipProblemPanes = getCanSkipProblemPanes();
  const canReset = isDraftReadyState()
    || hasTopic
    || Boolean(state.roundNote.trim())
    || state.quickPromptIds.length > 0;

  const actionState = deriveActionButtonState({
    controlsBusy,
    hasPanes,
    hasTopic,
    hasDraft,
    canSkipProblemPanes,
    canReset,
    autoRunActive: state.autoRunActive,
    currentRoundNumber: state.currentRoundNumber,
    globalErrorResumeAction: state.globalErrorResumeAction,
    expectedPaneCount: state.expectedPaneIds.length,
    hasResolvedSummarizer: Boolean(getResolvedSummarizerPaneId() || chooseAutoSummarizerPaneId()),
    isPreparing,
    isDispatching,
    isWaiting,
    isSummarizerSelecting,
    isPartialError,
    isAutoPaused,
    isGlobalError,
    isRoundReview,
    isFinished,
    isDraftReady: isDraftReadyState(),
  });

  refs.launcherPrimaryBtn.disabled = actionState.primaryDisabled;
  refs.panelPrimaryBtn.disabled = refs.launcherPrimaryBtn.disabled;
  refs.launcherSyncBtn.disabled = actionState.syncDisabled;
  refs.panelSyncBtn.disabled = refs.launcherSyncBtn.disabled;
  refs.launcherSkipBtn.disabled = actionState.skipDisabled;
  refs.panelSkipBtn.disabled = refs.launcherSkipBtn.disabled;
  refs.launcherPrivateBtn.disabled = actionState.privateDisabled;
  refs.panelPrivateBtn.disabled = refs.launcherPrivateBtn.disabled;
  refs.regenerateDraftBtn.disabled = actionState.regenerateDraftDisabled;
  refs.resetConsoleBtn.disabled = actionState.resetConsoleDisabled;
  refs.launcherRunModeBtn.disabled = actionState.runModeDisabled;
  refs.panelRunModeBtn.disabled = refs.launcherRunModeBtn.disabled;
}

function renderInputs() {
  const inputState = deriveInputState({
    topic: state.topic,
    roundNote: state.roundNote,
    draft: state.draft,
    isDraftReady: isDraftReadyState(),
    isPreparing: isDraftPreparingState(),
    isDispatching: isDispatchingState(),
    isWaiting: isWaitingState(),
    isSummarizerSelecting: isSummarizerSelectingState(),
  });

  syncTextareaValue(refs.topicInput, inputState.topicValue);
  syncTextareaValue(refs.roundNoteInput, inputState.roundNoteValue);
  syncTextareaValue(refs.draftInput, inputState.draftValue);
  syncTextareaValue(refs.dockInput, inputState.dockValue);
  refs.topicInput.disabled = !inputState.inputEditable;
  refs.roundNoteInput.disabled = !inputState.inputEditable;
  refs.draftInput.disabled = !inputState.draftEditable;
  refs.dockInput.disabled = inputState.dockDisabled;
}

function render() {
  renderPanelVisibility();
  refs.floatingPanel.classList.toggle('is-idle', state.consoleState === 'idle');
  refs.floatingPanel.classList.toggle('is-draft-ready', isDraftReadyState());
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
    if (isDraftReadyState()) {
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

function resetConsoleToIdle(options = {}) {
  state.autoRunToken += 1;
  state.consoleState = 'idle';
  state.autoRunActive = false;
  state.autoPauseReason = '';
  state.autoPauseMeta = '';
  state.autoPauseResumeAction = 'resume-waiting';
  state.partialErrorResumeAction = 'resume-waiting';
  state.globalErrorResumeAction = '';
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
  clearDraftContext();
  resetAllProviderTrackStatuses();
  render();
  if (!options.silentFeedback) {
    setFeedback('已回到准备阶段', {
      meta: '可重写主题、模式或本轮补充，再生成首轮 Draft',
    });
  }
}

function restoreLatestCompletedRoundContext() {
  const roundHistory = getSortedRoundHistory();
  const latestRound = roundHistory[roundHistory.length - 1];
  if (!latestRound) {
    return false;
  }

  state.currentRoundNumber = latestRound.roundNumber || 0;
  state.currentRoundType = latestRound.roundType || getRoundTypeLabel(state.currentRoundNumber);
  state.expectedPaneIds = getUniquePaneIds([
    ...(Array.isArray(latestRound.results) ? latestRound.results.map((result) => result?.paneId) : []),
    ...(Array.isArray(latestRound.skippedPaneIds) ? latestRound.skippedPaneIds : []),
  ]);
  state.lastRoundResults = Array.isArray(latestRound.results) ? latestRound.results : [];
  state.draft = '';
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  clearDraftContext();
  return true;
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
    const resumeAction = state.autoPauseResumeAction || 'resume-waiting';
    state.autoRunActive = false;
    clearAutoPauseState();
    clearFlowErrorStates();

    if (resumeAction === 'resume-waiting') {
      state.partialErrorResumeAction = 'resume-waiting';
      state.consoleState = 'round-partial-error';
    } else if (resumeAction === 'submit-current-draft') {
      state.draftSent = false;
      state.draftNeedsRefresh = false;
      state.consoleState = 'draft-ready';
    } else {
      if (!restoreLatestCompletedRoundContext()) {
        resetConsoleToIdle();
        return;
      }
      state.consoleState = 'round-review';
    }
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

function enterRoundPartialError(message, options = {}) {
  state.autoRunToken += 1;
  state.autoRunActive = false;
  state.partialErrorResumeAction = options.resumeAction || 'resume-waiting';
  state.consoleState = 'round-partial-error';
  render();
  setFeedback(message, {
    error: true,
    meta: options.meta || '你可以继续等待、跳过异常 AI，或回到准备阶段。',
  });
}

function enterGlobalErrorState(message, options = {}) {
  state.autoRunToken += 1;
  state.autoRunActive = false;
  state.globalErrorResumeAction = options.resumeAction || '';
  state.consoleState = 'global-error';
  render();
  setFeedback(message, {
    error: true,
    meta: options.meta || '请重试当前步骤，或回到准备阶段。',
  });
}

function clearFlowErrorStates() {
  state.partialErrorResumeAction = 'resume-waiting';
  state.globalErrorResumeAction = '';
}

function setDispatchingTrackStatuses(paneIds = [], silentPaneIds = []) {
  const targetPaneIds = new Set(getUniquePaneIds(paneIds));
  const mutedPaneIds = new Set(getUniquePaneIds(silentPaneIds));

  syncProviderTracks();
  Object.keys(state.providerTracks).forEach((paneId) => {
    if (targetPaneIds.has(paneId)) {
      updateProviderTrack(paneId, {
        status: 'dispatching',
        error: '',
      });
      return;
    }

    if (mutedPaneIds.has(paneId)) {
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
}

async function finishDiscussion(options = {}) {
  const finalResult = options.finalResult || (Array.isArray(state.lastRoundResults) ? state.lastRoundResults[0] : null);
  const finalPane = getPaneEntryById(finalResult?.paneId || state.summarizerPaneId);

  state.autoRunActive = false;
  state.autoPauseReason = '';
  state.autoPauseMeta = '';
  state.autoPauseResumeAction = 'resume-waiting';
  clearFlowErrorStates();
  state.summarizerPaneId = finalResult?.paneId || state.summarizerPaneId || '';
  state.summarizerProviderName = finalPane?.providerName || finalResult?.providerName || state.summarizerProviderName || '总结者';
  if (state.summarizerSelectionSource !== 'manual') {
    state.summarizerSelectionSource = 'auto';
  }
  state.finalResultText = finalResult?.latestReplyText || state.finalResultText;
  state.draft = state.finalResultText || state.draft;
  state.draftSent = true;
  state.draftNeedsRefresh = false;
  setDraftPaneIds(state.summarizerPaneId ? [state.summarizerPaneId] : []);
  state.draftPromptType = 'final-summary';
  state.consoleState = 'finished';
  state.expectedPaneIds = state.summarizerPaneId ? [state.summarizerPaneId] : [];
  render();

  setFeedback(options.automated ? '整场讨论已自动完成。' : '整场讨论已完成。', {
    meta: `${state.summarizerProviderName} 已输出最终方案，你现在可以直接查看结果。`,
  });
}

async function prepareGeneratedRoundDraft(options = {}) {
  const paneIds = getUniquePaneIds(options.paneIds);
  const promptType = String(options.promptType || '').trim();
  const roundSources = getAutoRoundSources(promptType);
  const maxLengthPerSource = options.maxLengthPerSource || getAutoRoundSourceMaxLength(promptType);

  if (paneIds.length === 0) {
    enterGlobalErrorState(`第 ${options.roundNumber} 轮缺少可发言的目标面板。`, {
      meta: '请检查参与 AI 是否仍然存在。',
      resumeAction: options.resumeAction || 'prepare-next-round',
    });
    return;
  }

  if (!Array.isArray(roundSources) || roundSources.length === 0) {
    enterGlobalErrorState(`第 ${options.roundNumber} 轮缺少可用材料。`, {
      meta: '请先确认上一轮结果已经稳定抓取完成。',
      resumeAction: options.resumeAction || 'prepare-next-round',
    });
    return;
  }

  state.currentRoundNumber = options.roundNumber;
  state.currentRoundType = getRoundTypeLabel(options.roundNumber);
  state.consoleState = 'draft-preparing';
  state.draft = '';
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  setDraftPaneIds(paneIds);
  state.draftPromptType = promptType;
  clearFlowErrorStates();
  render();
  setFeedback(`正在生成第 ${options.roundNumber} 轮 Draft`, {
    meta: '系统正在根据上一轮结果装配本轮草稿。',
  });

  let draftResult;
  try {
    draftResult = await ipcRenderer.invoke('build-generated-round-draft', {
      promptType,
      sources: roundSources,
      topic: state.topic,
      summarizerName: state.summarizerProviderName,
      maxLengthPerSource,
    });
  } catch (error) {
    console.error('Failed to build generated round draft:', error);
    enterGlobalErrorState(`第 ${options.roundNumber} 轮 Draft 生成失败。`, {
      meta: error?.message || '请检查当前页面状态后再试。',
      resumeAction: options.resumeAction || 'prepare-next-round',
    });
    return;
  }

  if (!draftResult?.ok || !String(draftResult?.prompt || '').trim()) {
    enterGlobalErrorState(draftResult?.message || `第 ${options.roundNumber} 轮 Draft 生成失败。`, {
      meta: '当前无法生成可发送的 Draft。',
      resumeAction: options.resumeAction || 'prepare-next-round',
    });
    return;
  }

  state.draft = draftResult.prompt;
  state.consoleState = 'draft-ready';
  render();
  mirrorDraftToTargetPanes();
  focusPrimaryField();
  setFeedback(`已生成第 ${options.roundNumber} 轮 Draft，可发送`, {
    meta: `将发送给 ${paneIds.length} 个发言 AI；发送前仍可继续编辑。`,
  });
}

async function openSummarizerSelectionForNextRound() {
  const mode = getModeOption();
  const nextRoundNumber = Math.min(state.currentRoundNumber + 1, mode.totalRounds);
  state.currentRoundNumber = nextRoundNumber;
  state.currentRoundType = getRoundTypeLabel(nextRoundNumber);
  state.consoleState = 'summarizer-selecting';
  state.draft = '';
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  clearDraftContext();
  clearFlowErrorStates();
  render();
  setFeedback('已进入总结者确认阶段。', {
    meta: '确认总结者后，系统会生成最终总结 Draft。',
  });
}

async function prepareNextManualRound() {
  const mode = getModeOption();
  if (state.currentRoundNumber >= mode.totalRounds) {
    await finishDiscussion({ automated: false });
    return;
  }

  const nextRoundNumber = state.currentRoundNumber + 1;
  const promptType = getAutoPromptType(nextRoundNumber, mode.id);
  if (!promptType) {
    enterGlobalErrorState(`当前模式缺少第 ${nextRoundNumber} 轮的 Draft builder。`, {
      meta: '请先补齐该轮的装配逻辑，或改为自动模式。',
      resumeAction: 'prepare-next-round',
    });
    return;
  }

  if (promptType === 'final-summary') {
    await openSummarizerSelectionForNextRound();
    return;
  }

  await prepareGeneratedRoundDraft({
    roundNumber: nextRoundNumber,
    promptType,
    paneIds: getSpeakingPaneIds(),
    resumeAction: 'prepare-next-round',
  });
}

async function confirmSummarizerAndPrepareFinalRound() {
  const summarizerPaneId = resolveAutoSummarizer();
  if (!summarizerPaneId) {
    enterGlobalErrorState('当前无法确定总结者。', {
      meta: '请检查当前参与 AI 是否仍然存在，或先手动指定总结者。',
      resumeAction: 'confirm-summarizer',
    });
    return;
  }

  await prepareGeneratedRoundDraft({
    roundNumber: state.currentRoundNumber,
    promptType: 'final-summary',
    paneIds: [summarizerPaneId],
    resumeAction: 'confirm-summarizer',
  });
}

async function retryGlobalErrorStep() {
  switch (state.globalErrorResumeAction) {
    case 'generate-round-one':
      await generateRoundOneDraft();
      return;
    case 'resume-waiting':
      await continueCurrentRoundAfterError();
      return;
    case 'prepare-next-round':
      restoreLatestCompletedRoundContext();
      await prepareNextManualRound();
      return;
    case 'confirm-summarizer':
      await confirmSummarizerAndPrepareFinalRound();
      return;
    case 'submit-current-draft':
      await submitCurrentDraft({
        automated: state.runMode === 'auto',
      });
      return;
    default:
      return;
  }
}

async function continueCurrentRoundAfterError() {
  const resumeAction = state.partialErrorResumeAction || 'resume-waiting';
  if (resumeAction !== 'resume-waiting') {
    return;
  }

  const paneIds = state.expectedPaneIds.length > 0 ? state.expectedPaneIds : getSpeakingPaneIds();
  if (paneIds.length === 0) {
    return;
  }

  await startWaitingForCurrentRound({
    paneIds,
    automated: false,
    feedbackMessage: `正在继续等待第 ${state.currentRoundNumber} 轮完成。`,
    feedbackMeta: '系统会继续观察当前发言 AI 的回复状态。',
  });
}

async function prepareAndSubmitAutoRound(options = {}) {
  const paneIds = Array.isArray(options.paneIds)
    ? [...new Set(options.paneIds.filter(Boolean))]
    : [];
  const roundSources = getAutoRoundSources(options.promptType);
  const includeSelf = shouldIncludeSelfSourcesForPrompt(options.promptType);
  const maxLengthPerSource = options.maxLengthPerSource || getAutoRoundSourceMaxLength(options.promptType);

  state.currentRoundNumber = options.roundNumber;
  state.currentRoundType = getRoundTypeLabel(options.roundNumber);
  state.consoleState = 'draft-preparing';
  state.draft = '';
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  setDraftPaneIds(paneIds);
  state.draftPromptType = options.promptType;
  render();

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

  state.draft = prepareResult.previewPrompt || '';
  state.draftSent = true;
  state.draftNeedsRefresh = false;
  state.consoleState = 'round-dispatching';
  setDispatchingTrackStatuses(paneIds, getSilentPaneIds(paneIds));
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

async function skipProblemPanes() {
  if (!(isAutoPausedState() || isPartialErrorState())) {
    return;
  }

  const wasAutomated = isAutoPausedState();

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

  const panesById = Object.fromEntries(getPaneEntries().map((pane) => [pane.id, pane]));
  const fallbackResults = buildFallbackRoundResultsFromAutoRun(completedPaneIds, state.providerTracks, panesById);
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

  if (wasAutomated) {
    clearAutoPauseState();
  }
  clearFlowErrorStates();
  state.consoleState = 'round-review';
  render();

  const skippedLabels = skippablePaneIds.map((paneId) => {
    return getPaneEntryById(paneId)?.providerName || getProviderTrack(paneId)?.providerName || 'Unknown AI';
  });
  const skippedLabelText = skippedLabels.join(' / ');
  const mode = getModeOption();

  if (state.currentRoundNumber >= mode.totalRounds) {
    await finishDiscussion({ automated: wasAutomated });
    return;
  }

  if (wasAutomated && usableResults.length === 1) {
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

  if (wasAutomated) {
    setFeedback(`\u5df2\u8df3\u8fc7 ${skippedLabelText}\uff0c\u7cfb\u7edf\u5c06\u7ee7\u7eed\u81ea\u52a8\u63a8\u8fdb\u3002`, {
      meta: `\u672c\u8f6e\u4fdd\u7559 ${usableResults.length} \u6761\u53ef\u7528\u7ed3\u679c\uff0c\u4e0b\u4e00\u8f6e\u4f1a\u7ee7\u7eed\u4f7f\u7528\u8fd9\u4e9b\u6750\u6599\u3002`,
    });
    await maybeAdvanceAutoRunAfterRound();
    return;
  }

  setFeedback(`已跳过 ${skippedLabelText}。`, {
    meta: `本轮保留 ${usableResults.length} 条可用结果，你现在可以继续进入下一阶段。`,
  });
}

async function maybeAdvanceAutoRunAfterRound() {
  const mode = getModeOption();

  if (state.currentRoundNumber >= mode.totalRounds) {
    await finishDiscussion({ automated: true });
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
      if (automated) {
        await pauseAutoRun('无法读取当前轮状态。', {
          meta: error?.message || '请检查当前 Provider 页面是否仍在可交互状态。',
        });
      } else {
        enterGlobalErrorState('无法读取当前轮状态。', {
          meta: error?.message || '请检查当前 Provider 页面是否仍在可交互状态。',
          resumeAction: 'resume-waiting',
        });
      }
      return;
    }

    if (state.autoRunToken !== token) {
      return;
    }

    if (!Array.isArray(inspection?.results) || inspection.results.length === 0) {
      if (automated) {
        await pauseAutoRun('当前轮没有可用的 Provider 状态。', {
          meta: '请检查参与 AI 是否仍然存在。',
        });
      } else {
        enterGlobalErrorState('当前轮没有可用的 Provider 状态。', {
          meta: '请检查参与 AI 是否仍然存在。',
          resumeAction: 'resume-waiting',
        });
      }
      return;
    }

    applyProviderInspectionResults(inspection.results);
    render();

    const failedInspection = inspection.results.find((result) => !result.ok);
    if (failedInspection) {
      if (automated) {
        await pauseAutoRun(`${failedInspection.providerName} 状态检查失败。`, {
          meta: failedInspection.error || '请检查该 AI 页面是否仍可读取。',
        });
      } else {
        enterRoundPartialError(`${failedInspection.providerName} 状态检查失败。`, {
          meta: failedInspection.error || '你可以继续等待、跳过该 AI，或检查网页后重试。',
          resumeAction: 'resume-waiting',
        });
      }
      return;
    }

    const {
      settledResults,
      completedCount,
      stalledResults,
    } = settleInspectionResults(inspection.results, busyStableTracker, Date.now(), BUSY_STALL_PAUSE_MS);
    setFeedback(`正在等待第 ${state.currentRoundNumber} 轮完成`, {
      meta: `已完成 ${completedCount} / ${paneIds.length}。`,
    });

    const stalledPaneLabels = getBusyStallPaneLabels(stalledResults);
    if (stalledPaneLabels.length > 0) {
      if (automated) {
        await pauseAutoRun(`第 ${state.currentRoundNumber} 轮长时间无进展。`, {
          meta: `${stalledPaneLabels.join(' / ')} 仍显示生成中，但回复长时间没有继续增长。`,
        });
      } else {
        enterRoundPartialError(`第 ${state.currentRoundNumber} 轮长时间无进展。`, {
          meta: `${stalledPaneLabels.join(' / ')} 仍显示生成中，但回复长时间没有继续增长。`,
          resumeAction: 'resume-waiting',
        });
      }
      return;
    }

    const allDone = settledResults.every((result) => result.isEffectivelyCompleted);
    if (allDone) {
      let captureResult;

      try {
        captureResult = await ipcRenderer.invoke('capture-provider-round-results', { paneIds });
      } catch (error) {
        console.error('Failed to capture provider round results:', error);
        if (automated) {
          await pauseAutoRun('本轮稳定结果抓取失败。', {
            meta: error?.message || '你可以稍后继续自动运行。',
          });
        } else {
          enterRoundPartialError('本轮稳定结果抓取失败。', {
            meta: error?.message || '你可以稍后继续等待，或先跳过异常 AI。',
            resumeAction: 'resume-waiting',
          });
        }
        return;
      }

      if (state.autoRunToken !== token) {
        return;
      }

      const missingPaneIds = getMissingCapturedPaneIds(paneIds, captureResult?.results || []);

      if (!Array.isArray(captureResult?.results) || captureResult.results.length === 0 || !captureResult?.ok || missingPaneIds.length > 0) {
        const failedCapture = captureResult?.results?.find((result) => !result.ok);
        const failureMessage = failedCapture ? `${failedCapture.providerName} 最终结果抓取失败。` : '本轮稳定结果抓取失败。';
        const failureMeta = failedCapture?.error || (missingPaneIds.length > 0
          ? '仍有 AI 未抓取到完整稳定结果，系统已暂停，避免把半截内容推进到下一轮。'
          : '你可以稍后继续自动运行。');
        if (automated) {
          await pauseAutoRun(failureMessage, {
            meta: failureMeta,
          });
        } else {
          enterRoundPartialError(failureMessage, {
            meta: failureMeta,
            resumeAction: 'resume-waiting',
          });
        }
        return;
      }

      const completedResults = captureResult.results.map((result) => ({
        ...result,
        status: 'completed',
      }));
      applyProviderInspectionResults(completedResults);
      recordCompletedRound(captureResult.results);
      clearFlowErrorStates();

      const mode = getModeOption();
      if (state.currentRoundNumber >= mode.totalRounds) {
        await finishDiscussion({
          automated,
          finalResult: captureResult.results[0] || null,
        });
        return;
      }

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
      if (automated) {
        await pauseAutoRun(`第 ${state.currentRoundNumber} 轮等待超时。`, {
          meta: '你可以继续自动运行、手动检查网页，或改为手动接管。',
        });
      } else {
        enterRoundPartialError(`第 ${state.currentRoundNumber} 轮等待超时。`, {
          meta: '你可以继续等待、检查网页，或跳过异常 AI 后继续推进。',
          resumeAction: 'resume-waiting',
        });
      }
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
  clearFlowErrorStates();
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
    restoreLatestCompletedRoundContext();
    await maybeAdvanceAutoRunAfterRound();
    return;
  }

  if (resumeAction === 'submit-current-draft') {
    await submitCurrentDraft({
      automated: true,
    });
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
  clearDraftContext();
  clearFlowErrorStates();
  if (state.summarizerSelectionSource !== 'manual') {
    state.summarizerPaneId = '';
    state.summarizerProviderName = '';
  }
  state.finalResultText = '';
  state.currentRoundNumber = 1;
  state.currentRoundType = getRoundTypeLabel(1);
  resetAllProviderTrackStatuses();
  await generateRoundOneDraft();
  if (!isDraftReadyState() || !state.draft.trim()) {
    state.autoRunActive = false;
    return;
  }
  await submitCurrentDraft({ automated: true });
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

  state.currentRoundNumber = 1;
  state.currentRoundType = getRoundTypeLabel(1);
  state.consoleState = 'draft-preparing';
  state.draft = '';
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  setDraftPaneIds(getSpeakingPaneIds());
  state.draftPromptType = 'round-one';
  clearFlowErrorStates();
  render();
  setFeedback('正在生成首轮 Draft', {
    meta: '系统正在合并主题、模式和本轮补充',
  });

  state.draft = buildRoundOneDraft();
  state.consoleState = 'draft-ready';
  render();
  mirrorDraftToTargetPanes();
  focusPrimaryField();
  setFeedback('已生成首轮 Draft，可发送', {
    meta: `将发送给 ${Math.max(getDraftPaneIds().length, 0)} 个参与 AI；发送前可继续修改`,
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

  if (state.draftPromptType && state.draftPromptType !== 'round-one') {
    await prepareGeneratedRoundDraft({
      roundNumber: state.currentRoundNumber,
      promptType: state.draftPromptType,
      paneIds: getDraftPaneIds().length > 0 ? getDraftPaneIds() : getSpeakingPaneIds(),
      resumeAction: state.draftPromptType === 'final-summary' ? 'confirm-summarizer' : 'prepare-next-round',
    });
    return;
  }

  await generateRoundOneDraft();
}

async function submitCurrentDraft(options = {}) {
  const automated = Boolean(options.automated);
  const paneIds = getDraftPaneIds();
  const silentPaneIds = getSilentPaneIds(paneIds);

  if (paneIds.length === 0) {
    if (automated) {
      await pauseAutoRun('当前没有可发送的目标 AI。', {
        meta: '请先确认参与 AI 是否仍然存在，再重新生成本轮 Draft。',
        resumeAction: 'submit-current-draft',
      });
    } else {
      enterGlobalErrorState('当前没有可发送的目标 AI。', {
        meta: '请先确认参与 AI 是否仍然存在，再重新生成本轮 Draft。',
        resumeAction: 'submit-current-draft',
      });
    }
    return;
  }

  if (getPaneEntries().length === 0) {
    if (automated) {
      await pauseAutoRun('当前没有可发送的 AI 面板。', {
        meta: '请先在设置里配置至少一个参与面板，再发送本轮 Draft。',
        resumeAction: 'submit-current-draft',
      });
    } else {
      setFeedback('当前没有可发送的 AI 面板。', {
        error: true,
        meta: '请先在设置里配置至少一个参与面板，再发送首轮 Draft。',
      });
    }
    return;
  }

  if (!state.draft.trim()) {
    if (automated) {
      await pauseAutoRun('当前 Draft 为空，无法发送。', {
        meta: '请先生成或补全当前轮 Draft。',
        resumeAction: 'submit-current-draft',
      });
    } else {
      setFeedback('当前 Draft 为空，无法发送。', {
        error: true,
        meta: '请先生成或补全首轮 Draft。',
      });
      focusPrimaryField();
    }
    return;
  }

  state.consoleState = 'round-dispatching';
  state.draftSent = true;
  state.draftNeedsRefresh = false;
  clearFlowErrorStates();
  setDispatchingTrackStatuses(paneIds, silentPaneIds);
  render();

  let submitResult;
  try {
    await mirrorDraftToTargetPanesNow();
    submitResult = await ipcRenderer.invoke('submit-message-to-panes', { paneIds });
  } catch (error) {
    console.error('Failed to submit current draft:', error);
    if (automated) {
      await pauseAutoRun(`第 ${state.currentRoundNumber} 轮发送失败。`, {
        meta: error?.message || '提交消息到目标 AI 面板时发生错误。',
        resumeAction: 'submit-current-draft',
      });
    } else {
      enterGlobalErrorState(`第 ${state.currentRoundNumber} 轮发送失败。`, {
        meta: error?.message || '提交消息到目标 AI 面板时发生错误。',
        resumeAction: 'submit-current-draft',
      });
    }
    return;
  }

  if (!submitResult?.ok) {
    if (automated) {
      await pauseAutoRun(submitResult?.message || `第 ${state.currentRoundNumber} 轮发送失败。`, {
        meta: '请检查各 AI 输入框是否仍可交互。',
        resumeAction: 'submit-current-draft',
      });
    } else {
      enterGlobalErrorState(submitResult?.message || `第 ${state.currentRoundNumber} 轮发送失败。`, {
        meta: '请检查各 AI 输入框是否仍可交互。',
        resumeAction: 'submit-current-draft',
      });
    }
    return;
  }

  const sentLabel = state.currentRoundNumber === 1 ? '首轮' : `第 ${state.currentRoundNumber} 轮`;
  await startWaitingForCurrentRound({
    paneIds,
    silentPaneIds,
    automated,
    feedbackMessage: `${sentLabel}${automated ? '已自动发送。' : '已发送。'}`,
    feedbackMeta: automated
      ? '系统正在等待本轮完成。'
      : '系统正在等待本轮完成；完成后可进入下一阶段。',
  });
}

async function handlePrimaryAction() {
  if (isAutoPausedState()) {
    await resumeAutoRun();
    return;
  }

  if (isFinishedState()) {
    resetConsoleToIdle();
    return;
  }

  if (isGlobalErrorState()) {
    await retryGlobalErrorStep();
    return;
  }

  if (isPartialErrorState()) {
    await continueCurrentRoundAfterError();
    return;
  }

  if (isSummarizerSelectingState()) {
    await confirmSummarizerAndPrepareFinalRound();
    return;
  }

  if (isDraftReadyState()) {
    await submitCurrentDraft({
      automated: state.runMode === 'auto',
    });
    return;
  }

  if (isReviewState()) {
    if (state.runMode === 'auto') {
      await maybeAdvanceAutoRunAfterRound();
      return;
    }

    await prepareNextManualRound();
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
  if (isDraftReadyState()) {
    state.draft = nextValue;
    state.draftSent = false;
    state.draftNeedsRefresh = false;
    render();
    mirrorDraftToTargetPanes();
    return;
  }

  if (isFinishedState()) {
    resetConsoleToIdle({ silentFeedback: true });
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
  if (isDraftReadyState()) {
    markDraftStale('已更新讨论主题');
  }
  render();
  refreshIdleFeedback();
});

refs.roundNoteInput.addEventListener('input', (event) => {
  state.roundNote = event.target.value;
  if (isDraftReadyState()) {
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
  mirrorDraftToTargetPanes();
});

refs.draftInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    submitCurrentDraft({
      automated: state.runMode === 'auto',
    });
  }
});

refs.resetRulesBtn.addEventListener('click', () => {
  state.stickyRuleIds = [...DEFAULT_STICKY_RULE_IDS];
  if (isDraftReadyState()) {
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
