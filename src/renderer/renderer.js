const { ipcRenderer } = require('electron');
const throttle = require('../utils/throttle');

const MODE_OPTIONS = [
  {
    id: 'fast-3',
    label: '3 轮快收束',
    totalRounds: 3,
    description: '独立分析 -> 交叉讨论 -> 最终总结',
  },
  {
    id: 'standard-4',
    label: '4 轮标准',
    totalRounds: 4,
    description: '独立分析 -> 交叉讨论 -> 分歧压缩 -> 最终总结',
  },
  {
    id: 'deep-5',
    label: '5 轮深推演',
    totalRounds: 5,
    description: '独立分析 -> 交叉质疑 -> 修正方案 -> 确认总结者 -> 最终总结',
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
    label: '偏成本视角',
    tag: '只看成本',
    prompt: '这轮请优先从成本、复杂度和落地代价角度判断。',
  },
  {
    id: 'risk',
    label: '强调风险边界',
    tag: '强调风险',
    prompt: '这轮请明确指出风险边界、不成立条件和潜在副作用。',
  },
  {
    id: 'stance',
    label: '必须明确表态',
    tag: '明确表态',
    prompt: '这轮请直接表态，不要只给模糊分析。',
  },
];

const DEFAULT_STICKY_RULE_IDS = STICKY_RULE_OPTIONS.map((option) => option.id);

const state = {
  isPanelExpanded: false,
  consoleState: 'idle',
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
  feedbackMessage: '准备开始首轮讨论。',
  feedbackIsError: false,
  feedbackMeta: '先输入讨论主题，再生成首轮 Draft。',
};

let syncInFlight = false;
let privateNewChatInFlight = false;
let dragState = null;

const refs = {
  launcherCard: document.getElementById('launcherCard'),
  floatingPanel: document.getElementById('floatingPanel'),
  panelDragHandle: document.getElementById('panelDragHandle'),
  toggleConsoleBtn: document.getElementById('toggleConsoleBtn'),
  collapseConsoleBtn: document.getElementById('collapseConsoleBtn'),
  dockStageBadge: document.getElementById('dockStageBadge'),
  dockModeBadge: document.getElementById('dockModeBadge'),
  dockStateBadge: document.getElementById('dockStateBadge'),
  dockInputLabel: document.getElementById('dockInputLabel'),
  dockInput: document.getElementById('dockInput'),
  launcherPrivateBtn: document.getElementById('launcherPrivateBtn'),
  launcherSyncBtn: document.getElementById('launcherSyncBtn'),
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
  stickyRuleTags: document.getElementById('stickyRuleTags'),
  temporaryTagRow: document.getElementById('temporaryTagRow'),
  participantCountBadge: document.getElementById('participantCountBadge'),
  participantTags: document.getElementById('participantTags'),
  modeDescription: document.getElementById('modeDescription'),
  modeSelector: document.getElementById('modeSelector'),
  idlePanel: document.getElementById('idlePanel'),
  topicInput: document.getElementById('topicInput'),
  roundNoteInput: document.getElementById('roundNoteInput'),
  quickPromptRow: document.getElementById('quickPromptRow'),
  draftPanel: document.getElementById('draftPanel'),
  draftInput: document.getElementById('draftInput'),
  charCount: document.getElementById('charCount'),
  charCountLine: document.getElementById('charCountLine'),
  panelStatusLine: document.getElementById('panelStatusLine'),
  draftMetaLine: document.getElementById('draftMetaLine'),
  newChatBtn: document.getElementById('newChatBtn'),
  panelPrivateBtn: document.getElementById('panelPrivateBtn'),
  panelSyncBtn: document.getElementById('panelSyncBtn'),
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

function getModeOption() {
  return MODE_OPTIONS.find((option) => option.id === state.modeId) || MODE_OPTIONS[1];
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
  const stickyRules = getStickyRuleOptions();
  const quickPrompts = getQuickPromptOptions();
  const temporaryLines = [];

  quickPrompts.forEach((option) => {
    temporaryLines.push(option.prompt);
  });

  if (state.roundNote.trim()) {
    temporaryLines.push(state.roundNote.trim());
  }

  const lines = [
    '请围绕下面的问题进行第 1 轮独立分析。',
    '这是一场多 AI 讨论的首轮，你现在不需要回应其他 AI，只需要先给出你自己的判断。',
    '请高压缩输出，只保留真正影响判断的信息，避免铺垫、套话和重复。',
    '',
    '问题：',
    state.topic.trim(),
    '',
    '本轮目标：',
    '1. 先直接给出你的核心结论。',
    '2. 再列出最关键的依据、方案或判断路径。',
    '3. 明确主要风险、限制条件，或你最不确定的一点。',
    '',
    '输出要求：',
  ];

  stickyRules.forEach((rule, index) => {
    lines.push(`${index + 1}. ${rule.prompt}`);
  });

  if (temporaryLines.length > 0) {
    lines.push('', '本轮临时补充：');
    temporaryLines.forEach((line, index) => {
      lines.push(`${index + 1}. ${line}`);
    });
  }

  lines.push('', '请直接开始，不要寒暄，不要重复题面。');
  return lines.join('\n');
}

function renderParticipants() {
  const panes = getPaneEntries();
  refs.participantTags.innerHTML = '';

  if (panes.length === 0) {
    refs.participantTags.appendChild(createStaticChip('未检测到参与面板', 'is-empty'));
    refs.participantCountBadge.textContent = '0 个参与 AI';
    refs.speakerScopeText.textContent = '当前没有可发送的 AI 面板';
    return;
  }

  const statusLabel = state.consoleState === 'draft-ready'
    ? (state.draftSent ? '已接收首轮' : '待接收首轮')
    : '等待首轮';

  panes.forEach((pane) => {
    refs.participantTags.appendChild(
      createStaticChip(`${pane.providerName} · ${statusLabel}`, 'is-participant')
    );
  });

  refs.participantCountBadge.textContent = `${panes.length} 个参与 AI`;
  refs.speakerScopeText.textContent = `本轮将发送给 ${panes.length} 个参与 AI`;
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

  MODE_OPTIONS.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `segment-btn${option.id === state.modeId ? ' is-selected' : ''}`;
    button.textContent = option.label;
    button.addEventListener('click', () => {
      state.modeId = option.id;
      markDraftStale(`已切换轮次模式：${option.label}`);
      render();
    });
    refs.modeSelector.appendChild(button);
  });
}

function renderDraftSourcesPanel() {
  refs.draftSourcesPanel.classList.toggle('hidden', !state.sourcesExpanded);
  refs.draftSourcesBtn.textContent = state.sourcesExpanded ? '收起 Draft 来源' : '查看 Draft 来源';
}

function updateDraftSources() {
  refs.sourceQuestionValue.textContent = state.topic.trim()
    ? summarizeText(state.topic, 80)
    : '尚未填写';

  const stickyLabels = getStickyRuleOptions().map((option) => option.label);
  refs.sourceRulesValue.textContent = stickyLabels.length > 0 ? stickyLabels.join(' / ') : '0 条';
  refs.sourceTemplateValue.textContent = '首轮独立分析模板';

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
  refs.charCount.textContent = String(count);
  refs.charCountLine.textContent = `${count} 字`;
}

function renderPanelVisibility() {
  refs.launcherCard.classList.toggle('hidden', state.isPanelExpanded);
  refs.floatingPanel.classList.toggle('hidden', !state.isPanelExpanded);
}

function renderHeader() {
  const mode = getModeOption();
  const stateLabel = getDraftStateLabel();

  refs.modeBadge.textContent = mode.label;
  refs.dockModeBadge.textContent = mode.label;
  refs.modeDescription.textContent = mode.description;

  if (state.consoleState === 'draft-ready') {
    refs.stageBadge.textContent = '首轮独立分析';
    refs.dockStageBadge.textContent = '首轮独立分析';
    refs.roundBadge.textContent = `第 1 / ${mode.totalRounds} 轮`;
    refs.roundGoalText.textContent = '让每个 AI 先独立给出高压缩、可转述的首轮判断。';
    refs.workspaceEyebrow.textContent = 'Round 1 Workspace';
    refs.workspaceTitle.textContent = state.draftSent ? '首轮 Draft 已发送' : '首轮 Draft 已就绪';
    refs.workspaceSubtitle.textContent = state.draftSent
      ? '你仍然可以继续微调这份 Draft，需要的话再次发送。'
      : '现在可以在工作台里完整编辑，也可以在右下角启动条里快速补一句。';

    refs.draftStatusBadge.textContent = stateLabel;
    refs.draftStatusBadge.className = `status-pill${state.draftNeedsRefresh ? ' is-stale' : (state.draftSent ? ' is-sent' : ' is-editable')}`;
    refs.launcherPrimaryBtn.textContent = state.draftSent ? '再次发送' : '发送首轮';
    refs.panelPrimaryBtn.textContent = state.draftSent ? '再次发送' : '发送首轮';
    refs.dockStateBadge.textContent = stateLabel;
    refs.dockInputLabel.textContent = 'Draft 快速编辑';
    refs.dockInput.placeholder = '这里可以在结尾补一句，或快速改动本轮 Draft。';
    refs.regenerateDraftBtn.disabled = false;
    refs.resetConsoleBtn.disabled = false;
    refs.idlePanel.classList.add('hidden');
    refs.draftPanel.classList.remove('hidden');
  } else {
    refs.stageBadge.textContent = '准备开始';
    refs.dockStageBadge.textContent = '准备开始';
    refs.roundBadge.textContent = `第 0 / ${mode.totalRounds} 轮`;
    refs.roundGoalText.textContent = '先明确讨论主题，再生成首轮 Draft。';
    refs.workspaceEyebrow.textContent = 'Discussion Console';
    refs.workspaceTitle.textContent = '准备讨论主题';
    refs.workspaceSubtitle.textContent = '这里是可拖动的讨论工作台。只有展开时才会覆盖在页面之上，不再挤压聊天布局。';

    refs.draftStatusBadge.textContent = '待生成';
    refs.draftStatusBadge.className = 'status-pill';
    refs.launcherPrimaryBtn.textContent = '开始首轮';
    refs.panelPrimaryBtn.textContent = '开始首轮';
    refs.dockStateBadge.textContent = '待生成';
    refs.dockInputLabel.textContent = '讨论主题';
    refs.dockInput.placeholder = '先写讨论主题，再开始首轮。';
    refs.regenerateDraftBtn.disabled = true;
    refs.resetConsoleBtn.disabled = !state.topic.trim() && !state.roundNote.trim() && state.quickPromptIds.length === 0;
    refs.idlePanel.classList.remove('hidden');
    refs.draftPanel.classList.add('hidden');
  }
}

function renderInputs() {
  syncTextareaValue(refs.topicInput, state.topic);
  syncTextareaValue(refs.roundNoteInput, state.roundNote);
  syncTextareaValue(refs.draftInput, state.draft);
  syncTextareaValue(refs.dockInput, state.consoleState === 'draft-ready' ? state.draft : state.topic);
}

function render() {
  renderPanelVisibility();
  renderHeader();
  renderModeSelector();
  renderStickyRuleTags();
  renderQuickPromptRow();
  renderTemporaryTags();
  renderParticipants();
  renderDraftSourcesPanel();
  updateDraftSources();
  renderInputs();
  updateCharacterCount();
  renderFeedback();
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
  state.consoleState = 'idle';
  state.draft = '';
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  render();
  setFeedback('已返回准备态。', {
    meta: '你可以继续修改讨论主题、轮次模式或本轮补充，再重新生成首轮 Draft。',
  });
}

async function generateRoundOneDraft() {
  if (!state.topic.trim()) {
    setFeedback('请先输入讨论主题。', {
      error: true,
      meta: '至少需要一个明确的问题或任务目标，才能生成首轮 Draft。',
    });
    focusPrimaryField();
    return;
  }

  setFeedback('正在生成首轮 Draft...', {
    meta: '系统正在合并核心问题、阶段模板、常驻规则和本轮补充。',
  });

  state.draft = buildRoundOneDraft();
  state.draftSent = false;
  state.draftNeedsRefresh = false;
  state.consoleState = 'draft-ready';
  render();
  sendTextUpdate(state.draft);
  focusPrimaryField();
  setFeedback('首轮 Draft 已生成。', {
    meta: `当前 Draft 将发送给 ${Math.max(getPaneEntries().length, 0)} 个参与 AI。发送前可以继续修改。`,
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

async function submitRoundOneDraft() {
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
    render();
    setFeedback('首轮已发送。', {
      meta: '如果还想继续补充，可以修改后再次发送。后续多轮控制我们继续往这里接。',
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
  if (state.consoleState === 'draft-ready') {
    await submitRoundOneDraft();
    return;
  }

  await generateRoundOneDraft();
}

async function syncLatestRound() {
  if (syncInFlight) {
    return;
  }

  syncInFlight = true;
  refs.launcherSyncBtn.disabled = true;
  refs.panelSyncBtn.disabled = true;
  setFeedback('正在同步最新回复...', {
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
    refs.launcherSyncBtn.disabled = false;
    refs.panelSyncBtn.disabled = false;
  }
}

async function triggerPrivateNewChat() {
  if (privateNewChatInFlight) {
    return;
  }

  privateNewChatInFlight = true;
  refs.launcherPrivateBtn.disabled = true;
  refs.panelPrivateBtn.disabled = true;
  setFeedback('正在打开临时对话...', {
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
    refs.launcherPrivateBtn.disabled = false;
    refs.panelPrivateBtn.disabled = false;
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

function stopDrag() {
  dragState = null;
  window.removeEventListener('mousemove', handleDragMove);
  window.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('blur', stopDrag);
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

refs.toggleConsoleBtn.addEventListener('click', () => {
  setPanelExpanded(true);
});

refs.collapseConsoleBtn.addEventListener('click', () => {
  setPanelExpanded(false);
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
  render();
});

refs.roundNoteInput.addEventListener('input', (event) => {
  state.roundNote = event.target.value;
  markDraftStale('已更新本轮备注。');
  render();
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
  markDraftStale('已恢复默认常驻规则。');
  render();
});

refs.draftSourcesBtn.addEventListener('click', () => {
  state.sourcesExpanded = !state.sourcesExpanded;
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

refs.refreshBtn.addEventListener('click', () => {
  ipcRenderer.invoke('refresh-pages').then(() => {
    setFeedback('已刷新所有网页。', {
      meta: '工作台内容保持不变，但网页面板会重新加载。',
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

window.addEventListener('focus', () => {
  loadSettingsState();
});

render();
loadExpandedState();
loadSettingsState();
focusPrimaryField();
