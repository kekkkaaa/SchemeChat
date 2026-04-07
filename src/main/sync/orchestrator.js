const fs = require('fs');
const path = require('path');
const { createSyncError } = require('./errors');
const { buildAggregatedDiscussionPrompt } = require('./prompt-builder');
const { getExtractor, getProviderDisplayName } = require('./registry');
const { captureStableReply } = require('./stability');

const SELECTORS_PATH = path.join(__dirname, '../../../config/selectors.json');

function loadSelectorsConfig() {
  return JSON.parse(fs.readFileSync(SELECTORS_PATH, 'utf8'));
}

function serializeForPage(payload) {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

function getPaneLabel(paneEntry) {
  const providerName = getProviderDisplayName(paneEntry?.view?.providerKey || paneEntry?.providerKey);
  const paneId = paneEntry?.id || paneEntry?.view?.paneId || paneEntry?.view?.position || 'pane';
  return `${providerName} (${paneId})`;
}

async function inspectInputState(view, selectors) {
  const pageFunction = function readInputState(inputSelectors) {
    function normalizeText(text) {
      return String(text || '')
        .replace(/\u200B/g, '')
        .replace(/\r/g, '')
        .replace(/\n+/g, '\n')
        .trim();
    }

    function isVisible(element) {
      if (!element || !(element instanceof Element)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      if (!style || style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    for (const selector of inputSelectors) {
      try {
        const element = document.querySelector(selector);
        if (!element || !isVisible(element)) {
          continue;
        }

        let text = '';
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
          text = element.value;
        } else {
          text = element.innerText || element.textContent || '';
        }

        text = normalizeText(text);
        return {
          ok: true,
          isEmpty: text.length === 0,
          textLength: text.length,
        };
      } catch (error) {
        // Ignore invalid selectors.
      }
    }

    return {
      ok: false,
      isEmpty: false,
      textLength: 0,
      error: 'Input element not found.',
    };
  };

  try {
    return await view.webContents.executeJavaScript(
      `(${pageFunction.toString()})(${serializeForPage(selectors)})`,
      true
    );
  } catch (error) {
    return {
      ok: false,
      isEmpty: false,
      textLength: 0,
      error: error.message || 'Failed to inspect input state.',
    };
  }
}

async function captureStableLatestReplyForView(view) {
  const providerKey = view?.providerKey;
  const extractor = getExtractor(providerKey);
  if (!extractor) {
    return {
      ok: false,
      busy: false,
      providerKey,
      text: '',
      latestReplyText: '',
      confidence: 0,
      sourceMethod: 'unsupported',
      error: `Provider ${providerKey} is not supported for sync yet.`,
      diagnostics: {},
      fingerprint: null,
    };
  }

  const result = await captureStableReply(
    () => extractor.inspect(view),
    extractor
  );

  return {
    ...result,
    latestReplyText: result.text || '',
  };
}

async function ensureInputsEmpty(paneEntries) {
  const selectorsConfig = loadSelectorsConfig();
  const inputStateResults = await Promise.all(
    paneEntries.map(async (paneEntry) => {
      const providerKey = paneEntry?.view?.providerKey || paneEntry?.providerKey;
      const selectors = selectorsConfig[providerKey]?.input;
      if (!Array.isArray(selectors) || selectors.length === 0) {
        return {
          ok: false,
          paneLabel: getPaneLabel(paneEntry),
          error: 'Input selectors are not configured.',
        };
      }

      const state = await inspectInputState(paneEntry.view, selectors);
      return {
        ...state,
        paneLabel: getPaneLabel(paneEntry),
      };
    })
  );

  const failedState = inputStateResults.find((result) => !result.ok);
  if (failedState) {
    return {
      ok: false,
      message: `Sync failed: ${failedState.paneLabel} input could not be inspected.`,
    };
  }

  const nonEmptyStates = inputStateResults.filter((result) => !result.isEmpty);
  if (nonEmptyStates.length === 0) {
    return {
      ok: true,
      message: '',
    };
  }

  const labels = nonEmptyStates.map((result) => result.paneLabel);
  return {
    ok: false,
    message: `Sync blocked: ${labels.join(' and ')} input ${labels.length > 1 ? 'are' : 'is'} not empty.`,
  };
}

async function captureSnapshotForPane(paneEntry) {
  const result = await captureStableLatestReplyForView(paneEntry.view);
  const paneLabel = getPaneLabel(paneEntry);

  if (!result.ok) {
    return {
      ok: false,
      paneId: paneEntry.id,
      paneLabel,
      errorMessage: `Sync failed: ${paneLabel} ${result.error || 'latest reply could not be captured.'}`,
      diagnostics: result.diagnostics || {},
    };
  }

  if (!result.latestReplyText) {
    return {
      ok: false,
      paneId: paneEntry.id,
      paneLabel,
      errorMessage: `Sync failed: ${paneLabel} latest reply could not be captured.`,
      diagnostics: result.diagnostics || {},
    };
  }

  return {
    ok: true,
    paneId: paneEntry.id,
    paneLabel,
    providerKey: paneEntry.view.providerKey,
    text: result.latestReplyText,
    confidence: result.confidence,
    sourceMethod: result.sourceMethod,
    diagnostics: result.diagnostics || {},
  };
}

async function syncPaneEntries(paneEntries) {
  const activePaneEntries = Array.isArray(paneEntries)
    ? paneEntries.filter((paneEntry) => paneEntry?.view?.webContents)
    : [];

  if (activePaneEntries.length < 2) {
    return {
      ok: false,
      message: 'Sync currently requires at least 2 panes.',
    };
  }

  const unsupportedPane = activePaneEntries.find((paneEntry) => {
    return !getExtractor(paneEntry?.view?.providerKey);
  });

  if (unsupportedPane) {
    return {
      ok: false,
      message: `Sync failed: ${getPaneLabel(unsupportedPane)} is not supported for sync yet.`,
    };
  }

  try {
    const snapshots = await Promise.all(
      activePaneEntries.map((paneEntry) => captureSnapshotForPane(paneEntry))
    );

    const failedSnapshot = snapshots.find((snapshot) => !snapshot.ok);
    if (failedSnapshot) {
      return {
        ok: false,
        message: failedSnapshot.errorMessage,
      };
    }

    const inputGuardResult = await ensureInputsEmpty(activePaneEntries);
    if (!inputGuardResult.ok) {
      return inputGuardResult;
    }

    activePaneEntries.forEach((targetPane) => {
      const prompt = buildAggregatedDiscussionPrompt(
        snapshots
          .filter((snapshot) => snapshot.paneId !== targetPane.id)
          .map((snapshot) => ({
            label: snapshot.paneLabel,
            text: snapshot.text,
          }))
      );

      targetPane.view.webContents.send('inject-sync-text', prompt);
    });

    return {
      ok: true,
      message: `Synced latest stable replies across ${activePaneEntries.length} panes.`,
    };
  } catch (error) {
    const syncError = error instanceof Error
      ? error
      : createSyncError('SYNC_UNKNOWN', 'Sync failed due to an unknown error.');

    return {
      ok: false,
      message: syncError.message || 'Sync failed.',
    };
  }
}

module.exports = {
  captureStableLatestReplyForView,
  syncPaneEntries,
};
