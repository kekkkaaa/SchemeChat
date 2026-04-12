const DRAFT_STATE_LABELS = {
  'draft-preparing': '生成中',
  'round-dispatching': '发送中',
  'round-waiting': '等待中',
  'round-review': '已完成',
  'summarizer-selecting': '待确认',
  'round-partial-error': '局部异常',
  'auto-paused': '自动暂停',
  'global-error': '流程异常',
  finished: '最终方案',
};

const SEND_BUTTON_LABELS = {
  首轮分析: '发送首轮',
  交叉讨论: '发送交叉讨论',
  交叉质疑: '发送交叉质疑',
  修正方案: '发送修正方案',
  分歧压缩: '发送压缩轮',
  确认总结者: '发送确认轮',
  最终总结: '发送最终总结',
};

const ROUND_REVIEW_PRIMARY_LABELS = {
  交叉讨论: '开始交叉讨论',
  交叉质疑: '开始交叉质疑',
  修正方案: '进入修正轮',
  分歧压缩: '进入压缩轮',
  确认总结者: '进入确认轮',
};

function deriveActionButtonState(config = {}) {
  const controlsBusy = Boolean(config.controlsBusy);
  const hasPanes = Boolean(config.hasPanes);
  const hasTopic = Boolean(config.hasTopic);
  const hasDraft = Boolean(config.hasDraft);
  const canSkipProblemPanes = Boolean(config.canSkipProblemPanes);
  const canReset = Boolean(config.canReset);
  const autoRunActive = Boolean(config.autoRunActive);
  const currentRoundNumber = Number(config.currentRoundNumber || 0);
  const globalErrorResumeAction = String(config.globalErrorResumeAction || '').trim();
  const expectedPaneCount = Number(config.expectedPaneCount || 0);
  const hasResolvedSummarizer = Boolean(config.hasResolvedSummarizer);

  const states = {
    isPreparing: Boolean(config.isPreparing),
    isDispatching: Boolean(config.isDispatching),
    isWaiting: Boolean(config.isWaiting),
    isSummarizerSelecting: Boolean(config.isSummarizerSelecting),
    isPartialError: Boolean(config.isPartialError),
    isAutoPaused: Boolean(config.isAutoPaused),
    isGlobalError: Boolean(config.isGlobalError),
    isRoundReview: Boolean(config.isRoundReview),
    isFinished: Boolean(config.isFinished),
    isDraftReady: Boolean(config.isDraftReady),
  };

  let primaryDisabled = false;
  if (controlsBusy || states.isPreparing || states.isDispatching || states.isWaiting) {
    primaryDisabled = true;
  } else if (states.isSummarizerSelecting) {
    primaryDisabled = !hasPanes || !hasResolvedSummarizer;
  } else if (states.isPartialError) {
    primaryDisabled = expectedPaneCount === 0;
  } else if (states.isAutoPaused) {
    primaryDisabled = !hasPanes;
  } else if (states.isGlobalError) {
    primaryDisabled = !globalErrorResumeAction;
  } else if (states.isFinished) {
    primaryDisabled = false;
  } else if (states.isRoundReview) {
    primaryDisabled = currentRoundNumber <= 0;
  } else if (states.isDraftReady) {
    primaryDisabled = !hasPanes || !hasDraft;
  } else {
    primaryDisabled = !hasTopic;
  }

  return {
    primaryDisabled,
    syncDisabled: controlsBusy || !hasPanes || states.isPreparing || states.isDispatching || states.isWaiting || states.isFinished,
    skipDisabled: !canSkipProblemPanes,
    privateDisabled: controlsBusy || !hasPanes || states.isPreparing || states.isDispatching || states.isWaiting || states.isFinished,
    regenerateDraftDisabled: !states.isDraftReady || !hasTopic,
    resetConsoleDisabled: !canReset,
    runModeDisabled: controlsBusy || (autoRunActive && !states.isAutoPaused && !states.isRoundReview && !states.isFinished),
  };
}

function deriveInputState(config = {}) {
  const isDraftReady = Boolean(config.isDraftReady);
  const isPreparing = Boolean(config.isPreparing);
  const isDispatching = Boolean(config.isDispatching);
  const isWaiting = Boolean(config.isWaiting);
  const isSummarizerSelecting = Boolean(config.isSummarizerSelecting);
  const topic = String(config.topic || '');
  const draft = String(config.draft || '');

  const inputEditable = !(isPreparing || isDispatching || isWaiting || isSummarizerSelecting);
  const draftEditable = isDraftReady;
  const dockDisabled = isPreparing || isDispatching || isWaiting || isSummarizerSelecting;

  return {
    topicValue: topic,
    roundNoteValue: String(config.roundNote || ''),
    draftValue: draft,
    dockValue: isDraftReady ? draft : topic,
    inputEditable,
    draftEditable,
    dockDisabled,
  };
}

function getArtifactStageLabel(roundType, artifactLabel) {
  return roundType === '最终总结' && artifactLabel
    ? artifactLabel
    : roundType;
}

function getArtifactTitleText(fallbackText, topicSummary, roundType, artifactLabel, suffix) {
  if (topicSummary) {
    return topicSummary;
  }

  if (roundType === '最终总结' && artifactLabel) {
    return `${artifactLabel}${suffix}`;
  }

  return fallbackText;
}

function deriveHeaderState(config = {}) {
  const modeLabel = String(config.modeLabel || '');
  const modeDescription = String(config.modeDescription || '');
  const modeSummary = String(config.modeSummary || modeDescription);
  const runModeLabel = String(config.runModeLabel || '');
  const roundNumber = Number(config.roundNumber || 0);
  const totalRounds = Number(config.totalRounds || 0);
  const roundType = String(config.roundType || '准备开始');
  const stateLabel = String(config.stateLabel || '');
  const topicSummary = String(config.topicSummary || '');
  const paneCount = Number(config.paneCount || 0);
  const runMode = String(config.runMode || 'manual');
  const summarizerLabel = String(config.summarizerLabel || '总结者');
  const hasResolvedSummarizer = Boolean(config.hasResolvedSummarizer);
  const taskTypeLabel = String(config.taskTypeLabel || '');
  const artifactLabel = String(config.artifactLabel || '');
  const artifactGoal = String(config.artifactGoal || '');
  const feedbackMessage = String(config.feedbackMessage || '');
  const autoPauseReason = String(config.autoPauseReason || '');
  const roundGoalLabel = String(config.roundGoalLabel || '');
  const roundReviewPrimaryLabel = String(config.roundReviewPrimaryLabel || '');
  const sendButtonLabel = String(config.sendButtonLabel || '');
  const draftSent = Boolean(config.draftSent);
  const draftNeedsRefresh = Boolean(config.draftNeedsRefresh);
  const stageLabel = getArtifactStageLabel(roundType, artifactLabel);
  const artifactTargetText = artifactLabel ? `目标结果物：${artifactLabel}` : '目标结果物待定';
  const idleGoalText = artifactGoal
    ? `目标：先明确讨论主题，再生成首轮 Draft，最终产出 ${artifactLabel}。${artifactGoal}`
    : '目标：先明确讨论主题，再生成首轮 Draft。';

  const states = {
    isPreparing: Boolean(config.isPreparing),
    isDispatching: Boolean(config.isDispatching),
    isWaiting: Boolean(config.isWaiting),
    isReview: Boolean(config.isReview),
    isSummarizerSelecting: Boolean(config.isSummarizerSelecting),
    isPartialError: Boolean(config.isPartialError),
    isAutoPaused: Boolean(config.isAutoPaused),
    isGlobalError: Boolean(config.isGlobalError),
    isFinished: Boolean(config.isFinished),
    isDraftReady: Boolean(config.isDraftReady),
  };

  const base = {
    modeBadgeText: modeLabel,
    dockModeBadgeText: modeLabel,
    modeDescriptionText: modeSummary,
    modeDescriptionTitle: modeDescription,
    modeFlowHintText: modeDescription,
    modeFlowHintTitle: modeDescription,
    workspaceEyebrowText: taskTypeLabel && artifactLabel
      ? `AI War Room · ${taskTypeLabel} · ${artifactLabel}`
      : (artifactLabel ? `AI War Room · ${artifactLabel}` : 'AI War Room'),
    launcherRunModeText: runModeLabel,
    panelRunModeText: runModeLabel,
  };

  if (states.isPreparing) {
    return {
      ...base,
      stageBadgeText: stageLabel,
      dockStageBadgeText: stageLabel,
      roundBadgeText: `第 ${roundNumber || 1} / ${totalRounds} 轮`,
      roundGoalText: `${roundGoalLabel} 当前正在生成本轮 Draft。${artifactLabel ? ` ${artifactTargetText}` : ''}`.trim(),
      workspaceTitleText: getArtifactTitleText(`${roundType}准备中`, topicSummary, roundType, artifactLabel, ' 准备中'),
      workspaceSubtitleText: `第 ${roundNumber || 1} / ${totalRounds} 轮 · ${stageLabel} · 正在生成 Draft`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-running',
      launcherPrimaryText: '生成中',
      panelPrimaryText: '生成中',
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '讨论主题',
      dockInputPlaceholder: '系统正在生成本轮 Draft',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  if (states.isDispatching) {
    return {
      ...base,
      stageBadgeText: stageLabel,
      dockStageBadgeText: stageLabel,
      roundBadgeText: `第 ${roundNumber} / ${totalRounds} 轮`,
      roundGoalText: `${roundGoalLabel} 当前正在发送本轮 Draft。${artifactLabel ? ` ${artifactTargetText}` : ''}`.trim(),
      workspaceTitleText: getArtifactTitleText(`${roundType}发送中`, topicSummary, roundType, artifactLabel, ' 发送中'),
      workspaceSubtitleText: `第 ${roundNumber} / ${totalRounds} 轮 · ${stageLabel} · 正在发送本轮`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-running',
      launcherPrimaryText: '发送中',
      panelPrimaryText: '发送中',
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '讨论主题',
      dockInputPlaceholder: '系统正在发送本轮 Draft',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  if (states.isWaiting) {
    return {
      ...base,
      stageBadgeText: stageLabel,
      dockStageBadgeText: stageLabel,
      roundBadgeText: `第 ${roundNumber} / ${totalRounds} 轮`,
      roundGoalText: `${roundGoalLabel} 当前正在等待本轮回复完成。${artifactLabel ? ` ${artifactTargetText}` : ''}`.trim(),
      workspaceTitleText: getArtifactTitleText(`${roundType}进行中`, topicSummary, roundType, artifactLabel, ' 进行中'),
      workspaceSubtitleText: `第 ${roundNumber} / ${totalRounds} 轮 · ${stageLabel} · ${runMode === 'auto' ? '自动等待中' : '等待本轮完成'}`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-running',
      launcherPrimaryText: '等待本轮完成',
      panelPrimaryText: '等待本轮完成',
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '讨论主题',
      dockInputPlaceholder: '系统正在等待本轮完成',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  if (states.isReview) {
    return {
      ...base,
      stageBadgeText: '本轮完成',
      dockStageBadgeText: '本轮完成',
      roundBadgeText: `第 ${roundNumber} / ${totalRounds} 轮`,
      roundGoalText: `${stageLabel}已完成，可查看结果并决定下一步。${artifactLabel ? ` ${artifactTargetText}` : ''}`.trim(),
      workspaceTitleText: getArtifactTitleText(`${roundType}已完成`, topicSummary, roundType, artifactLabel, ' 已完成'),
      workspaceSubtitleText: `第 ${roundNumber} / ${totalRounds} 轮 · ${stageLabel} · 本轮结果已就绪`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-sent',
      launcherPrimaryText: roundReviewPrimaryLabel,
      panelPrimaryText: roundReviewPrimaryLabel,
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '讨论主题',
      dockInputPlaceholder: '本轮结果已就绪',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  if (states.isSummarizerSelecting) {
    return {
      ...base,
      stageBadgeText: '选择总结者',
      dockStageBadgeText: '选择总结者',
      roundBadgeText: `第 ${roundNumber} / ${totalRounds} 轮`,
      roundGoalText: hasResolvedSummarizer
        ? `当前推荐 ${summarizerLabel} 输出 ${artifactLabel || '最终总结'}，确认后进入最终轮。`
        : '当前未形成明确总结者推荐，请先手动指定后再进入最终轮。',
      workspaceTitleText: topicSummary || '确认总结者',
      workspaceSubtitleText: `第 ${roundNumber} / ${totalRounds} 轮 · ${artifactLabel || '最终总结'} 前确认 · ${summarizerLabel}`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-editable',
      launcherPrimaryText: '确认总结者',
      panelPrimaryText: '确认总结者',
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '讨论主题',
      dockInputPlaceholder: '确认总结者后进入最终总结',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  if (states.isPartialError) {
    return {
      ...base,
      stageBadgeText: '局部异常',
      dockStageBadgeText: '局部异常',
      roundBadgeText: `第 ${roundNumber} / ${totalRounds} 轮`,
      roundGoalText: feedbackMessage || '本轮出现局部异常，确认后可继续等待或跳过异常 AI。',
      workspaceTitleText: topicSummary || '本轮出现局部异常',
      workspaceSubtitleText: `第 ${roundNumber} / ${totalRounds} 轮 · ${roundType} · 等待用户处理`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-paused',
      launcherPrimaryText: '继续当前轮',
      panelPrimaryText: '继续当前轮',
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '讨论主题',
      dockInputPlaceholder: '局部异常待处理',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  if (states.isAutoPaused) {
    return {
      ...base,
      stageBadgeText: '自动暂停',
      dockStageBadgeText: '自动暂停',
      roundBadgeText: `第 ${roundNumber} / ${totalRounds} 轮`,
      roundGoalText: autoPauseReason || '自动运行已暂停，等待你决定是继续还是接管。',
      workspaceTitleText: topicSummary || '自动运行已暂停',
      workspaceSubtitleText: `第 ${roundNumber} / ${totalRounds} 轮 · ${roundType} · 等待用户接管`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-paused',
      launcherPrimaryText: '继续自动运行',
      panelPrimaryText: '继续自动运行',
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '讨论主题',
      dockInputPlaceholder: '自动运行已暂停，可继续或改为手动接管',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  if (states.isGlobalError) {
    return {
      ...base,
      stageBadgeText: '流程异常',
      dockStageBadgeText: '流程异常',
      roundBadgeText: `第 ${roundNumber || 0} / ${totalRounds} 轮`,
      roundGoalText: feedbackMessage || '当前流程无法继续，请重试当前步骤。',
      workspaceTitleText: topicSummary || '流程异常',
      workspaceSubtitleText: `第 ${roundNumber || 0} / ${totalRounds} 轮 · 等待重试`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-paused',
      launcherPrimaryText: '重试当前步骤',
      panelPrimaryText: '重试当前步骤',
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '讨论主题',
      dockInputPlaceholder: '当前流程异常',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  if (states.isFinished) {
    return {
      ...base,
      stageBadgeText: '讨论完成',
      dockStageBadgeText: '讨论完成',
      roundBadgeText: `第 ${roundNumber} / ${totalRounds} 轮`,
      roundGoalText: `整场讨论已完成，${artifactLabel || '最终方案'} 由 ${summarizerLabel} 输出。`,
      workspaceTitleText: topicSummary || `${artifactLabel || '最终方案'} 已生成`,
      workspaceSubtitleText: `第 ${roundNumber} / ${totalRounds} 轮 · ${artifactLabel || '最终总结'} · ${summarizerLabel} 已完成输出`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: 'status-pill is-sent',
      launcherPrimaryText: '开始新讨论',
      panelPrimaryText: '开始新讨论',
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: '新讨论主题',
      dockInputPlaceholder: '最终方案已生成，可直接输入下一题',
      idlePanelHidden: false,
      draftPanelHidden: false,
    };
  }

  if (states.isDraftReady) {
    return {
      ...base,
      stageBadgeText: stageLabel,
      dockStageBadgeText: stageLabel,
      roundBadgeText: `第 ${roundNumber || 1} / ${totalRounds} 轮`,
      roundGoalText: `${roundGoalLabel}${artifactLabel ? ` ${artifactTargetText}` : ''}`.trim(),
      workspaceTitleText: topicSummary || (draftSent
        ? getArtifactTitleText(`${roundType} Draft 已发送`, topicSummary, roundType, artifactLabel, ' Draft 已发送')
        : getArtifactTitleText(`${roundType} Draft 已就绪`, topicSummary, roundType, artifactLabel, ' Draft 已就绪')),
      workspaceSubtitleText: `第 ${roundNumber || 1} / ${totalRounds} 轮 · ${stageLabel} · ${paneCount > 0 ? `${paneCount} 个参与 AI` : '等待参与 AI'}`,
      draftStatusBadgeText: stateLabel,
      draftStatusBadgeClassName: `status-pill${draftNeedsRefresh ? ' is-stale' : (draftSent ? ' is-sent' : ' is-editable')}`,
      launcherPrimaryText: draftSent ? '再次发送' : sendButtonLabel,
      panelPrimaryText: draftSent ? '再次发送' : sendButtonLabel,
      launcherSyncText: '同步',
      panelSyncText: '同步',
      dockStateBadgeText: stateLabel,
      dockInputLabelText: 'Draft 编辑',
      dockInputPlaceholder: '修改本轮 Draft，确认后发送',
      idlePanelHidden: true,
      draftPanelHidden: false,
    };
  }

  return {
    ...base,
    stageBadgeText: '准备开始',
    dockStageBadgeText: '准备开始',
    roundBadgeText: `第 0 / ${totalRounds} 轮`,
    roundGoalText: idleGoalText,
    workspaceTitleText: '准备讨论主题',
    workspaceSubtitleText: `第 0 / ${totalRounds} 轮 · 准备开始 · ${paneCount > 0 ? `${paneCount} 个参与 AI` : '等待参与 AI'}`,
    draftStatusBadgeText: '待生成',
    draftStatusBadgeClassName: 'status-pill',
    launcherPrimaryText: runMode === 'auto' ? '自动完成' : '开始首轮',
    panelPrimaryText: runMode === 'auto' ? '自动完成' : '开始首轮',
    launcherSyncText: '同步',
    panelSyncText: '同步',
    dockStateBadgeText: '待生成',
    dockInputLabelText: '讨论主题',
    dockInputPlaceholder: runMode === 'auto' ? '写清主题后，自动跑完整场讨论' : '写清主题后，开始首轮',
    idlePanelHidden: false,
    draftPanelHidden: true,
  };
}

function getDraftStateLabel(config = {}) {
  const consoleState = String(config.consoleState || 'idle');
  if (consoleState === 'draft-ready') {
    if (Boolean(config.draftNeedsRefresh)) {
      return '需刷新';
    }

    return Boolean(config.draftSent) ? '已发送' : '可发送';
  }

  return DRAFT_STATE_LABELS[consoleState] || '待生成';
}

function getSendButtonLabel(roundType = '') {
  return SEND_BUTTON_LABELS[roundType] || '发送本轮';
}

function getRoundReviewPrimaryLabel(config = {}) {
  const currentRoundNumber = Number(config.currentRoundNumber || 0);
  const totalRounds = Number(config.totalRounds || 0);
  const nextPromptType = String(config.nextPromptType || '');
  const nextRoundType = String(config.nextRoundType || '');

  if (currentRoundNumber >= totalRounds) {
    return '完成讨论';
  }

  if (nextPromptType === 'final-summary') {
    return '进入总结者选择';
  }

  return ROUND_REVIEW_PRIMARY_LABELS[nextRoundType] || `进入${nextRoundType || '下一轮'}`;
}

function buildDiscussionUiStateModel(config = {}) {
  const mode = config.mode || null;
  const taskType = config.taskType || null;
  const roundNumber = Number(config.roundNumber || 0);
  const roundType = String(config.roundType || '准备开始');
  const nextRoundNumber = roundNumber + 1;
  const nextRoundType = String(config.nextRoundType || `第 ${nextRoundNumber} 轮`);
  const nextPromptType = String(config.nextPromptType || '');
  const paneCount = Number(config.paneCount || 0);
  const topic = String(config.topic || '');
  const draft = String(config.draft || '');
  const roundNote = String(config.roundNote || '');
  const consoleState = String(config.consoleState || 'idle');
  const topicSummary = String(config.topicSummary || '');
  const hasPanes = paneCount > 0;
  const hasTopic = Boolean(topic.trim());
  const hasDraft = Boolean(draft.trim());
  const hasResolvedSummarizer = Boolean(config.hasResolvedSummarizer);
  const stateFlags = {
    isPreparing: Boolean(config.isPreparing),
    isDispatching: Boolean(config.isDispatching),
    isWaiting: Boolean(config.isWaiting),
    isReview: Boolean(config.isReview),
    isSummarizerSelecting: Boolean(config.isSummarizerSelecting),
    isPartialError: Boolean(config.isPartialError),
    isAutoPaused: Boolean(config.isAutoPaused),
    isGlobalError: Boolean(config.isGlobalError),
    isFinished: Boolean(config.isFinished),
    isDraftReady: Boolean(config.isDraftReady),
  };
  const stateLabel = getDraftStateLabel({
    consoleState,
    draftSent: config.draftSent,
    draftNeedsRefresh: config.draftNeedsRefresh,
  });
  const sendButtonLabel = getSendButtonLabel(roundType);
  const roundReviewPrimaryLabel = getRoundReviewPrimaryLabel({
    currentRoundNumber: roundNumber,
    totalRounds: mode?.totalRounds || 0,
    nextPromptType,
    nextRoundType,
  });
  const actionState = deriveActionButtonState({
    controlsBusy: Boolean(config.controlsBusy),
    hasPanes,
    hasTopic,
    hasDraft,
    canSkipProblemPanes: Boolean(config.canSkipProblemPanes),
    canReset: Boolean(config.canReset),
    autoRunActive: Boolean(config.autoRunActive),
    currentRoundNumber: roundNumber,
    globalErrorResumeAction: String(config.globalErrorResumeAction || ''),
    expectedPaneCount: Number(config.expectedPaneCount || 0),
    hasResolvedSummarizer,
    ...stateFlags,
    isRoundReview: stateFlags.isReview,
  });
  const inputState = deriveInputState({
    topic,
    roundNote,
    draft,
    isDraftReady: stateFlags.isDraftReady,
    isPreparing: stateFlags.isPreparing,
    isDispatching: stateFlags.isDispatching,
    isWaiting: stateFlags.isWaiting,
    isSummarizerSelecting: stateFlags.isSummarizerSelecting,
  });
  const headerState = deriveHeaderState({
    modeLabel: mode?.label || '',
    modeDescription: mode?.description || '',
    modeSummary: mode?.summary || '',
    runModeLabel: String(config.runModeLabel || ''),
    taskTypeLabel: taskType?.label || '',
    artifactLabel: taskType?.artifactLabel || '',
    artifactGoal: taskType?.artifactGoal || '',
    roundNumber,
    totalRounds: mode?.totalRounds || 0,
    roundType,
    stateLabel,
    topicSummary,
    paneCount,
    runMode: String(config.runMode || 'manual'),
    summarizerLabel: String(config.summarizerLabel || '总结者'),
    hasResolvedSummarizer,
    feedbackMessage: String(config.feedbackMessage || ''),
    autoPauseReason: String(config.autoPauseReason || ''),
    roundGoalLabel: String(config.roundGoalLabel || ''),
    roundReviewPrimaryLabel,
    sendButtonLabel,
    draftSent: Boolean(config.draftSent),
    draftNeedsRefresh: Boolean(config.draftNeedsRefresh),
    ...stateFlags,
  });

  return {
    mode,
    taskType,
    artifact: {
      label: taskType?.artifactLabel || '',
      goal: taskType?.artifactGoal || '',
    },
    roundNumber,
    roundType,
    nextRoundType,
    nextPromptType,
    summarizerPaneId: String(config.summarizerPaneId || ''),
    hasPanes,
    hasTopic,
    hasDraft,
    stateLabel,
    sendButtonLabel,
    roundReviewPrimaryLabel,
    actionState,
    inputState,
    headerState,
  };
}

module.exports = {
  buildDiscussionUiStateModel,
  deriveHeaderState,
  deriveActionButtonState,
  deriveInputState,
  getDraftStateLabel,
  getRoundReviewPrimaryLabel,
  getSendButtonLabel,
};
