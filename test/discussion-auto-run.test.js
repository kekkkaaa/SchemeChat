const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildSettledReplyFallbackResults,
  mergeRoundResults,
  shouldDegradeStableWeakReplies,
} = require('../src/renderer/discussion-auto-run');

test('does not degrade weak replies before the wait window has elapsed', () => {
  const settledResults = [
    { paneId: 'pane-1', ok: true, isEffectivelyCompleted: true, completionState: 'completed' },
    { paneId: 'pane-2', ok: true, isEffectivelyCompleted: true, completionState: 'completed' },
    {
      paneId: 'pane-3',
      ok: true,
      isEffectivelyCompleted: false,
      completionState: 'weak_reply',
      hasReply: true,
      busy: false,
      stablePasses: 10,
      latestReplyText: 'OK, short reply.',
    },
  ];

  assert.equal(shouldDegradeStableWeakReplies(settledResults, {
    elapsedMs: 5000,
    minElapsedMs: 30000,
    requiredStablePasses: 3,
  }), false);
});

test('degrades stable weak replies when the round has otherwise settled', () => {
  const settledResults = [
    { paneId: 'pane-1', ok: true, isEffectivelyCompleted: true, completionState: 'completed' },
    { paneId: 'pane-2', ok: true, isEffectivelyCompleted: true, completionState: 'completed' },
    {
      paneId: 'pane-3',
      providerName: 'ChatGPT',
      ok: true,
      isEffectivelyCompleted: false,
      completionState: 'weak_reply',
      completionReason: 'weak-reply:short-low-structure',
      statusReason: 'weak-reply:short-low-structure',
      hasReply: true,
      busy: false,
      stablePasses: 4,
      latestReplyText: 'OK - OpenAI.',
    },
  ];

  assert.equal(shouldDegradeStableWeakReplies(settledResults, {
    elapsedMs: 45000,
    minElapsedMs: 30000,
    requiredStablePasses: 3,
  }), true);

  const fallbackResults = buildSettledReplyFallbackResults(settledResults, [
    'pane-1',
    'pane-2',
    'pane-3',
  ]);

  assert.equal(fallbackResults.length, 1);
  assert.equal(fallbackResults[0].completionState, 'completed');
  assert.equal(fallbackResults[0].hasUsableReply, true);
  assert.equal(fallbackResults[0].degradedFromWeakReply, true);
  assert.equal(fallbackResults[0].latestReplyText, 'OK - OpenAI.');
});

test('merged degraded fallback keeps captured usable results first', () => {
  const capturedResults = [
    {
      paneId: 'pane-2',
      ok: true,
      hasUsableReply: true,
      completionState: 'completed',
      latestReplyText: 'Gemini completed.',
    },
  ];
  const fallbackResults = [
    {
      paneId: 'pane-1',
      ok: true,
      hasUsableReply: true,
      completionState: 'completed',
      latestReplyText: 'OK - OpenAI.',
      degradedFromWeakReply: true,
    },
  ];

  const merged = mergeRoundResults(capturedResults, fallbackResults, ['pane-1', 'pane-2']);

  assert.deepEqual(merged.map((result) => result.paneId), ['pane-1', 'pane-2']);
  assert.equal(merged[0].degradedFromWeakReply, true);
  assert.equal(merged[1].latestReplyText, 'Gemini completed.');
});
