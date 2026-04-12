function createDiscussionControlBridge(deps = {}) {
  const state = deps.state;

  function buildDiscussionAvailableActions(uiState = deps.buildDiscussionUiStateModel()) {
    const availableActions = [];

    if (!uiState.actionState.primaryDisabled) {
      availableActions.push('primary');
    }
    if (!uiState.actionState.regenerateDraftDisabled) {
      availableActions.push('regenerate-draft');
    }
    if (!uiState.actionState.resetConsoleDisabled) {
      availableActions.push('reset-console');
    }
    if (state.consoleState === 'idle' && uiState.hasTopic) {
      availableActions.push('generate-round-one');
    }
    if (state.consoleState === 'idle' && state.runMode === 'auto' && uiState.hasTopic && uiState.hasPanes) {
      availableActions.push('start-auto-run');
    }
    if (deps.isDraftReadyState() && uiState.hasDraft && deps.getDraftPaneIds().length > 0) {
      availableActions.push('submit-current-draft');
    }
    if (deps.isReviewState() && state.runMode === 'manual') {
      availableActions.push('prepare-next-manual-round');
    }
    if (deps.isSummarizerSelectingState() && Boolean(uiState.summarizerPaneId)) {
      availableActions.push('confirm-summarizer');
    }
    if (deps.isAutoPausedState()) {
      availableActions.push('resume-auto-run');
    }

    return [...new Set(availableActions)];
  }

  function buildDiscussionControlSnapshot() {
    const uiState = deps.buildDiscussionUiStateModel();
    const draftPaneIdSet = new Set(deps.getDraftPaneIds());
    const expectedPaneIdSet = new Set(state.expectedPaneIds);
    const summarizerPaneId = uiState.summarizerPaneId || '';

    return {
      ok: true,
      discussionConsoleExpanded: state.isPanelExpanded,
      consoleState: state.consoleState,
      runMode: state.runMode,
      taskType: {
        id: state.taskTypeId,
        label: uiState.taskType.label,
        developerLabel: uiState.taskType.developerLabel,
        description: uiState.taskType.description,
        artifactLabel: uiState.taskType.artifactLabel,
        artifactGoal: uiState.taskType.artifactGoal,
      },
      artifact: {
        label: uiState.artifact.label,
        goal: uiState.artifact.goal,
      },
      modeId: state.modeId,
      modeLabel: uiState.mode.label,
      totalRounds: uiState.mode.totalRounds,
      currentRoundNumber: uiState.roundNumber,
      currentRoundType: uiState.roundType,
      topic: state.topic,
      roundNote: state.roundNote,
      draft: state.draft,
      draftPromptType: state.draftPromptType,
      draftSent: state.draftSent,
      draftNeedsRefresh: state.draftNeedsRefresh,
      autoRunActive: state.autoRunActive,
      autoPauseReason: state.autoPauseReason,
      autoPauseMeta: state.autoPauseMeta,
      feedbackMessage: state.feedbackMessage,
      feedbackMeta: state.feedbackMeta,
      draftPaneIds: deps.getDraftPaneIds(),
      expectedPaneIds: [...state.expectedPaneIds],
      roundHistoryCount: state.roundHistory.length,
      summarizer: {
        paneId: summarizerPaneId,
        providerName: summarizerPaneId ? deps.getResolvedSummarizerLabel() : '',
        selectionSource: state.summarizerSelectionSource,
      },
      primaryAction: {
        action: 'primary',
        label: uiState.headerState.launcherPrimaryText,
        disabled: uiState.actionState.primaryDisabled,
      },
      inputs: {
        inputEditable: uiState.inputState.inputEditable,
        draftEditable: uiState.inputState.draftEditable,
        dockDisabled: uiState.inputState.dockDisabled,
      },
      actions: {
        available: buildDiscussionAvailableActions(uiState),
        runModeDisabled: uiState.actionState.runModeDisabled,
        regenerateDraftDisabled: uiState.actionState.regenerateDraftDisabled,
        resetConsoleDisabled: uiState.actionState.resetConsoleDisabled,
        syncDisabled: uiState.actionState.syncDisabled,
        privateDisabled: uiState.actionState.privateDisabled,
        skipDisabled: uiState.actionState.skipDisabled,
      },
      panes: deps.getPaneEntries().map((pane) => {
        const track = deps.getProviderTrack(pane.id) || deps.createProviderTrack(pane);
        return {
          paneId: pane.id,
          providerKey: pane.providerKey,
          providerName: pane.providerName,
          status: track.status,
          error: track.error,
          hasLatestReply: Boolean(track.latestReplyText),
          latestReplyPreview: track.latestReplyText ? deps.summarizeText(track.latestReplyText, 120) : '',
          isDraftTarget: draftPaneIdSet.has(pane.id),
          isExpectedTarget: expectedPaneIdSet.has(pane.id),
          isSummarizer: summarizerPaneId === pane.id,
        };
      }),
    };
  }

  function hasOwnPatchValue(target, key) {
    return Object.prototype.hasOwnProperty.call(target, key);
  }

  async function updateDiscussionControlState(patch = {}) {
    const normalizedPatch = patch && typeof patch === 'object' ? patch : {};
    const hasTopicPatch = hasOwnPatchValue(normalizedPatch, 'topic');
    const hasRoundNotePatch = hasOwnPatchValue(normalizedPatch, 'roundNote');
    const hasDraftPatch = hasOwnPatchValue(normalizedPatch, 'draft');
    const hasRunModePatch = hasOwnPatchValue(normalizedPatch, 'runMode');
    const hasModeIdPatch = hasOwnPatchValue(normalizedPatch, 'modeId');
    const hasTaskTypePatch = hasOwnPatchValue(normalizedPatch, 'taskType') || hasOwnPatchValue(normalizedPatch, 'taskTypeId');

    if (!hasTopicPatch && !hasRoundNotePatch && !hasDraftPatch && !hasRunModePatch && !hasModeIdPatch && !hasTaskTypePatch) {
      return {
        ok: true,
        message: 'No discussion fields were updated.',
        state: buildDiscussionControlSnapshot(),
      };
    }

    const messages = [];

    if (hasRunModePatch) {
      const nextRunMode = String(normalizedPatch.runMode || '').trim();
      if (!['manual', 'auto'].includes(nextRunMode)) {
        return {
          ok: false,
          message: `Unsupported discussion run mode: ${nextRunMode || 'empty'}.`,
          state: buildDiscussionControlSnapshot(),
        };
      }

      const previousRunMode = state.runMode;
      deps.setRunMode(nextRunMode);
      if (state.runMode !== nextRunMode) {
        return {
          ok: false,
          message: 'The current discussion state does not allow switching run mode right now.',
          state: buildDiscussionControlSnapshot(),
        };
      }

      if (previousRunMode !== state.runMode) {
        messages.push(`已切换到${state.runMode === 'auto' ? '自动推进' : '手动推进'}`);
      }
    }

    if (hasModeIdPatch) {
      const nextModeId = String(normalizedPatch.modeId || '').trim();
      const nextModeOption = deps.MODE_OPTIONS.find((option) => option.id === nextModeId);
      if (!nextModeOption) {
        return {
          ok: false,
          message: `Unsupported discussion intensity preset: ${nextModeId || 'empty'}.`,
          state: buildDiscussionControlSnapshot(),
        };
      }

      const selectorLocked = deps.isPresetSelectorLocked();
      if (selectorLocked && nextModeId !== state.modeId) {
        return {
          ok: false,
          message: 'The current discussion state does not allow switching the discussion intensity right now.',
          state: buildDiscussionControlSnapshot(),
        };
      }

      if (nextModeId !== state.modeId) {
        state.modeId = nextModeId;
        if (state.currentRoundNumber > 0) {
          state.currentRoundType = deps.getRoundTypeLabel(state.currentRoundNumber, nextModeId);
        }
        if (deps.isDraftReadyState()) {
          deps.markDraftStale(`已通过 MCP 切换讨论强度：${nextModeOption.label}`);
        }
        messages.push(`已切换到${nextModeOption.label}`);
      }
    }

    if (hasTaskTypePatch) {
      const nextTaskTypeId = String(
        hasOwnPatchValue(normalizedPatch, 'taskType')
          ? normalizedPatch.taskType
          : normalizedPatch.taskTypeId
      ).trim();
      const nextTaskTypeOption = deps.TASK_TYPE_OPTIONS.find((option) => option.id === nextTaskTypeId);
      if (!nextTaskTypeOption) {
        return {
          ok: false,
          message: `Unsupported discussion task type: ${nextTaskTypeId || 'empty'}.`,
          state: buildDiscussionControlSnapshot(),
        };
      }

      const selectorLocked = deps.isPresetSelectorLocked();
      if (selectorLocked && nextTaskTypeId !== state.taskTypeId) {
        return {
          ok: false,
          message: 'The current discussion state does not allow switching the task type right now.',
          state: buildDiscussionControlSnapshot(),
        };
      }

      if (nextTaskTypeId !== state.taskTypeId) {
        state.taskTypeId = nextTaskTypeId;
        if (deps.isDraftReadyState()) {
          deps.markDraftStale(`已通过 MCP 切换任务类型：${nextTaskTypeOption.label}`);
        }
        messages.push(`已切换到${nextTaskTypeOption.label}`);
      }
    }

    const uiState = deps.buildDiscussionUiStateModel();
    if ((hasTopicPatch || hasRoundNotePatch) && !uiState.inputState.inputEditable) {
      return {
        ok: false,
        message: 'The current discussion state does not allow editing the topic or round note.',
        state: buildDiscussionControlSnapshot(),
      };
    }

    if (hasDraftPatch && !uiState.inputState.draftEditable) {
      return {
        ok: false,
        message: 'The current discussion state does not allow editing the current draft.',
        state: buildDiscussionControlSnapshot(),
      };
    }

    if (hasTopicPatch) {
      state.topic = String(normalizedPatch.topic ?? '');
      if (deps.isDraftReadyState()) {
        deps.markDraftStale('已通过 MCP 更新讨论主题');
      }
      messages.push('已更新讨论主题');
    }

    if (hasRoundNotePatch) {
      state.roundNote = String(normalizedPatch.roundNote ?? '');
      if (deps.isDraftReadyState()) {
        deps.markDraftStale('已通过 MCP 更新本轮补充');
      }
      messages.push('已更新本轮补充');
    }

    if (hasDraftPatch) {
      state.draft = String(normalizedPatch.draft ?? '');
      state.draftSent = false;
      state.draftNeedsRefresh = false;
      messages.push('已更新当前 Draft');
    }

    deps.render();

    if (hasTopicPatch || hasRoundNotePatch || hasTaskTypePatch) {
      deps.refreshIdleFeedback();
    }

    if (hasDraftPatch) {
      deps.mirrorDraftToTargetPanes();
    }

    return {
      ok: true,
      message: messages.length > 0 ? `${messages.join('；')}。` : 'Discussion state already matched the requested values.',
      state: buildDiscussionControlSnapshot(),
    };
  }

  function getDiscussionControlActionLabel(action, uiState = deps.buildDiscussionUiStateModel()) {
    switch (action) {
      case 'primary':
        return uiState.headerState.launcherPrimaryText || '主动作';
      case 'generate-round-one':
        return '生成首轮 Draft';
      case 'submit-current-draft':
        return '发送当前 Draft';
      case 'prepare-next-manual-round':
        return '准备下一手动轮';
      case 'start-auto-run':
        return '启动自动推进';
      case 'resume-auto-run':
        return '继续自动推进';
      case 'regenerate-draft':
        return '重生成 Draft';
      case 'confirm-summarizer':
        return '确认总结者';
      case 'reset-console':
        return '重置讨论台';
      default:
        return action || '未知动作';
    }
  }

  function validateDiscussionControlAction(action, uiState = deps.buildDiscussionUiStateModel()) {
    switch (action) {
      case 'primary':
        return uiState.actionState.primaryDisabled
          ? { ok: false, message: `当前状态下不能执行：${getDiscussionControlActionLabel(action, uiState)}。` }
          : { ok: true };
      case 'generate-round-one':
        return state.consoleState !== 'idle' || !uiState.hasTopic
          ? { ok: false, message: '当前状态下不能单独生成首轮 Draft。' }
          : { ok: true };
      case 'submit-current-draft':
        return !deps.isDraftReadyState() || !uiState.hasDraft || deps.getDraftPaneIds().length === 0
          ? { ok: false, message: '当前没有可发送的 Draft。' }
          : { ok: true };
      case 'prepare-next-manual-round':
        return !deps.isReviewState() || state.runMode !== 'manual'
          ? { ok: false, message: '当前状态下不能单独准备下一手动轮。' }
          : { ok: true };
      case 'start-auto-run':
        return state.runMode !== 'auto' || state.consoleState !== 'idle' || !uiState.hasTopic || !uiState.hasPanes
          ? { ok: false, message: '当前状态下不能直接启动自动推进。' }
          : { ok: true };
      case 'resume-auto-run':
        return !deps.isAutoPausedState()
          ? { ok: false, message: '当前不在自动暂停状态，无法继续自动推进。' }
          : { ok: true };
      case 'regenerate-draft':
        return uiState.actionState.regenerateDraftDisabled
          ? { ok: false, message: '当前没有可重生成的 Draft。' }
          : { ok: true };
      case 'confirm-summarizer':
        return !deps.isSummarizerSelectingState() || !uiState.summarizerPaneId
          ? { ok: false, message: '当前状态下不能确认总结者。' }
          : { ok: true };
      case 'reset-console':
        return uiState.actionState.resetConsoleDisabled
          ? { ok: false, message: '当前没有可重置的讨论内容。' }
          : { ok: true };
      default:
        return {
          ok: false,
          message: `Unsupported discussion action: ${action || 'empty'}.`,
        };
    }
  }

  async function executeDiscussionControlAction(action) {
    switch (action) {
      case 'primary':
        await deps.handlePrimaryAction();
        return;
      case 'generate-round-one':
        await deps.generateRoundOneDraft();
        return;
      case 'submit-current-draft':
        await deps.submitCurrentDraft({
          automated: state.runMode === 'auto',
        });
        return;
      case 'prepare-next-manual-round':
        await deps.prepareNextManualRound();
        return;
      case 'start-auto-run':
        await deps.startAutoRun();
        return;
      case 'resume-auto-run':
        await deps.resumeAutoRun();
        return;
      case 'regenerate-draft':
        await deps.regenerateDraft();
        return;
      case 'confirm-summarizer':
        await deps.confirmSummarizerAndPrepareFinalRound();
        return;
      case 'reset-console':
        deps.resetConsoleToIdle();
        return;
      default:
        throw new Error(`Unsupported discussion action: ${action || 'empty'}.`);
    }
  }

  async function runDiscussionControlAction(action, options = {}) {
    const normalizedAction = String(action || '').trim();
    const waitForCompletion = Boolean(options?.waitForCompletion);
    const uiState = deps.buildDiscussionUiStateModel();
    const actionLabel = getDiscussionControlActionLabel(normalizedAction, uiState);
    const validation = validateDiscussionControlAction(normalizedAction, uiState);
    if (!validation.ok) {
      return {
        ok: false,
        message: validation.message,
        state: buildDiscussionControlSnapshot(),
      };
    }

    let actionPromise;
    try {
      actionPromise = executeDiscussionControlAction(normalizedAction);
    } catch (error) {
      return {
        ok: false,
        message: error?.message || `Failed to execute discussion action: ${normalizedAction}.`,
        state: buildDiscussionControlSnapshot(),
      };
    }

    if (!waitForCompletion) {
      Promise.resolve(actionPromise).catch((error) => {
        console.error(`Discussion control action failed: ${normalizedAction}`, error);
        deps.setFeedback('外部讨论动作执行失败。', {
          error: true,
          meta: error?.message || `${actionLabel} 执行失败。`,
        });
        deps.render();
      });

      return {
        ok: true,
        message: `已启动：${actionLabel}。`,
        state: buildDiscussionControlSnapshot(),
      };
    }

    try {
      await actionPromise;
    } catch (error) {
      console.error(`Discussion control action failed: ${normalizedAction}`, error);
      return {
        ok: false,
        message: error?.message || `${actionLabel} 执行失败。`,
        state: buildDiscussionControlSnapshot(),
      };
    }

    return {
      ok: true,
      message: `已完成：${actionLabel}。`,
      state: buildDiscussionControlSnapshot(),
    };
  }

  async function handleDiscussionControlRequest(payload = {}) {
    const requestType = String(payload?.type || '').trim();

    switch (requestType) {
      case 'get-state':
        return {
          ok: true,
          message: 'Captured current discussion flow state.',
          state: buildDiscussionControlSnapshot(),
        };
      case 'patch-state':
        return updateDiscussionControlState(payload?.patch || {});
      case 'run-action':
        return runDiscussionControlAction(payload?.action, {
          waitForCompletion: payload?.waitForCompletion,
        });
      default:
        return {
          ok: false,
          message: `Unsupported discussion control request: ${requestType || 'empty'}.`,
          state: buildDiscussionControlSnapshot(),
        };
    }
  }

  return {
    buildDiscussionControlSnapshot,
    handleDiscussionControlRequest,
  };
}

module.exports = {
  createDiscussionControlBridge,
};
