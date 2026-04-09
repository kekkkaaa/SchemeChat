const {
  buildAggregatedDiscussionPrompt,
  buildCompressionPrompt,
  buildConfirmationPrompt,
  buildDiscussionPrompt,
  buildFinalSummaryPrompt,
  buildQuestioningPrompt,
  buildRevisionPrompt,
  buildRoundPrompt,
} = require('./prompt-builder');
const { getExtractor } = require('./registry');
const { captureStableLatestReplyForView, syncPaneEntries } = require('./orchestrator');

async function inspectProviderView(view) {
  const providerKey = view?.providerKey;
  const extractor = getExtractor(providerKey);
  if (!extractor) {
    return {
      ok: false,
      busy: false,
      providerKey,
      latestReplyText: '',
      text: '',
      confidence: 0,
      sourceMethod: 'unsupported',
      error: `Provider ${providerKey} is not supported for sync yet.`,
      diagnostics: {},
      fingerprint: null,
    };
  }

  const result = await extractor.inspect(view);
  return {
    ...result,
    latestReplyText: result.text || '',
  };
}

async function captureStableLatestReply(view) {
  return captureStableLatestReplyForView(view);
}

module.exports = {
  buildAggregatedDiscussionPrompt,
  buildCompressionPrompt,
  buildConfirmationPrompt,
  buildDiscussionPrompt,
  buildFinalSummaryPrompt,
  buildQuestioningPrompt,
  buildRevisionPrompt,
  buildRoundPrompt,
  captureStableLatestReply,
  inspectProviderView,
  syncPaneEntries,
};
