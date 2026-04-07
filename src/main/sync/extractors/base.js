function serializeForPage(payload) {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

async function executeInspection(view, providerKey, pageFunction, payload) {
  try {
    const result = await view.webContents.executeJavaScript(
      `(${pageFunction.toString()})(${serializeForPage(payload)})`,
      true
    );

    return {
      ok: Boolean(result?.ok),
      busy: Boolean(result?.busy),
      providerKey,
      text: String(result?.text || ''),
      confidence: Number.isFinite(result?.confidence) ? result.confidence : 0,
      sourceMethod: result?.sourceMethod || 'dom',
      error: result?.error || null,
      diagnostics: result?.diagnostics || {},
      fingerprint: result?.fingerprint || null,
    };
  } catch (error) {
    return {
      ok: false,
      busy: false,
      providerKey,
      text: '',
      confidence: 0,
      sourceMethod: 'dom',
      error: error.message || `Failed to inspect ${providerKey}.`,
      diagnostics: {},
      fingerprint: null,
    };
  }
}

function runStructuredMessageInspection(spec) {
  const rootSelectors = Array.isArray(spec.rootSelectors) ? spec.rootSelectors : [];
  const contentSelectors = Array.isArray(spec.contentSelectors) ? spec.contentSelectors : [];
  const busySelectors = Array.isArray(spec.busySelectors) ? spec.busySelectors : [];
  const busyTextPatterns = Array.isArray(spec.busyTextPatterns)
    ? spec.busyTextPatterns.map((pattern) => String(pattern).toLowerCase())
    : [];
  const excludeSelectors = Array.isArray(spec.excludeSelectors) ? spec.excludeSelectors : [];
  const anchorSelectors = Array.isArray(spec.anchorSelectors) ? spec.anchorSelectors : [];
  const anchorTextPatterns = Array.isArray(spec.anchorTextPatterns)
    ? spec.anchorTextPatterns.map((pattern) => String(pattern).toLowerCase())
    : [];
  const noisePatterns = Array.isArray(spec.noisePatterns)
    ? spec.noisePatterns.map((pattern) => String(pattern).toLowerCase())
    : [];
  const hostPatterns = Array.isArray(spec.hostPatterns) ? spec.hostPatterns : [];
  const minRootTextLength = Number.isFinite(spec.minRootTextLength) ? spec.minRootTextLength : 40;
  const anchorAncestorDepth = Number.isFinite(spec.anchorAncestorDepth) ? spec.anchorAncestorDepth : 6;
  const blockSelector = spec.blockSelector
    || 'p, li, pre, blockquote, h1, h2, h3, h4, h5, h6, td, th, code';

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u200B/g, '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
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

  function queryVisible(selectors, scope = document) {
    const results = [];
    const seen = new Set();

    selectors.forEach((selector) => {
      try {
        scope.querySelectorAll(selector).forEach((element) => {
          if (!seen.has(element) && isVisible(element)) {
            seen.add(element);
            results.push(element);
          }
        });
      } catch (error) {
        // Ignore invalid selectors.
      }
    });

    return results;
  }

  function matchesAnySelector(element, selectors) {
    return selectors.some((selector) => {
      try {
        return element.matches(selector);
      } catch (error) {
        return false;
      }
    });
  }

  function hostMatches() {
    if (hostPatterns.length === 0) {
      return true;
    }

    return hostPatterns.some((pattern) => {
      return window.location.hostname === pattern || window.location.hostname.endsWith(`.${pattern}`);
    });
  }

  function readElementLabel(element) {
    return normalizeText(
      [
        element.getAttribute('aria-label') || '',
        element.getAttribute('title') || '',
        element.innerText || '',
        element.textContent || '',
      ].join(' ')
    ).toLowerCase();
  }

  function containsExcludedInput(root) {
    if (!root || excludeSelectors.length === 0) {
      return false;
    }

    if (matchesAnySelector(root, excludeSelectors)) {
      return true;
    }

    return excludeSelectors.some((selector) => {
      try {
        return Boolean(root.querySelector(selector));
      } catch (error) {
        return false;
      }
    });
  }

  function collectContainers(root) {
    if (!root) {
      return [];
    }

    const containers = queryVisible(contentSelectors, root);
    return containers.length > 0 ? containers : [root];
  }

  function shouldSkipNoiseText(text) {
    if (!text) {
      return true;
    }

    const lowered = text.toLowerCase();
    if (text.length > 48) {
      return false;
    }

    return noisePatterns.some((pattern) => lowered === pattern || lowered.includes(pattern));
  }

  function extractOrderedText(root) {
    const containers = collectContainers(root);
    const orderedTexts = [];
    const seenTexts = new Set();
    const seenElements = new Set();

    containers.forEach((container) => {
      let blockNodes = [];
      try {
        blockNodes = Array.from(container.querySelectorAll(blockSelector));
      } catch (error) {
        blockNodes = [];
      }

      const candidates = blockNodes.length > 0 ? blockNodes : [container];
      candidates.forEach((candidate) => {
        if (!(candidate instanceof Element) || !isVisible(candidate)) {
          return;
        }

        if (candidate.tagName === 'CODE' && candidate.closest('pre')) {
          return;
        }

        if (seenElements.has(candidate)) {
          return;
        }
        seenElements.add(candidate);

        const text = normalizeText(candidate.innerText || candidate.textContent || '');
        if (!text || shouldSkipNoiseText(text)) {
          return;
        }

        if (!seenTexts.has(text)) {
          seenTexts.add(text);
          orderedTexts.push(text);
        }
      });
    });

    const rootText = normalizeText(root.innerText || root.textContent || '');
    const aggregatedText = orderedTexts.join('\n\n');
    const usedRootFallback = !aggregatedText || (rootText && aggregatedText.length < rootText.length * 0.55);
    const finalText = usedRootFallback ? rootText : aggregatedText;

    return {
      text: finalText,
      blockCount: orderedTexts.length,
      rootTextLength: rootText.length,
      usedRootFallback,
    };
  }

  function isUsableRoot(root) {
    if (!root || !(root instanceof Element) || !isVisible(root)) {
      return false;
    }

    if (containsExcludedInput(root)) {
      return false;
    }

    const summary = extractOrderedText(root);
    return summary.text.length >= minRootTextLength;
  }

  function collectAnchorRoots() {
    if (anchorTextPatterns.length === 0) {
      return [];
    }

    const anchorCandidates = queryVisible(anchorSelectors.length > 0 ? anchorSelectors : ['button', '[role="button"]']);
    const roots = [];
    const seen = new Set();

    anchorCandidates.forEach((anchor) => {
      const label = readElementLabel(anchor);
      const isRelevantAnchor = anchorTextPatterns.some((pattern) => label.includes(pattern));
      if (!isRelevantAnchor) {
        return;
      }

      let current = anchor;
      for (let depth = 0; current && depth <= anchorAncestorDepth; depth += 1) {
        if (isUsableRoot(current) && !seen.has(current)) {
          seen.add(current);
          roots.push(current);
        }
        current = current.parentElement;
      }
    });

    return roots;
  }

  function collectRootCandidates() {
    const directRoots = queryVisible(rootSelectors).filter(isUsableRoot);
    const anchorRoots = collectAnchorRoots();
    const combined = [];
    const seen = new Set();

    [...directRoots, ...anchorRoots].forEach((root) => {
      if (!seen.has(root)) {
        seen.add(root);
        combined.push(root);
      }
    });

    return combined.map((root) => {
      const summary = extractOrderedText(root);
      const rect = root.getBoundingClientRect();
      const rootMatchesKnownSelector = rootSelectors.some((selector) => {
        try {
          return root.matches(selector);
        } catch (error) {
          return false;
        }
      });
      const hasAnchorDescendant = queryVisible(anchorSelectors.length > 0 ? anchorSelectors : ['button', '[role="button"]'], root)
        .some((element) => {
          const text = readElementLabel(element);
          return anchorTextPatterns.some((pattern) => text.includes(pattern));
        });

      const lowerOnPageScore = Math.max(rect.top, 0) / Math.max(window.innerHeight, 1);
      let score = 0;
      if (rootMatchesKnownSelector) {
        score += 0.35;
      }

      if (hasAnchorDescendant) {
        score += 0.35;
      }

      if (summary.blockCount > 1) {
        score += 0.15;
      }

      if (!summary.usedRootFallback) {
        score += 0.1;
      }

      score += Math.min(summary.text.length / 2500, 0.1);
      score += Math.min(lowerOnPageScore, 1) * 0.1;

      return {
        root,
        rect,
        score,
        ...summary,
      };
    });
  }

  function pickLatestCandidate(candidates) {
    if (candidates.length === 0) {
      return null;
    }

    return candidates.sort((left, right) => {
      if (right.rect.top !== left.rect.top) {
        return right.rect.top - left.rect.top;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.rect.left - left.rect.left;
    })[0];
  }

  function isBusy() {
    const busyBySelector = queryVisible(busySelectors).length > 0;
    const busyByText = queryVisible(['button', '[role="button"]']).some((element) => {
      const label = readElementLabel(element);
      return busyTextPatterns.some((pattern) => label.includes(pattern));
    });

    return busyBySelector || busyByText;
  }

  if (!hostMatches()) {
    return {
      ok: false,
      busy: false,
      text: '',
      confidence: 0,
      sourceMethod: 'dom',
      error: `Host mismatch: ${window.location.hostname}`,
      diagnostics: {
        url: window.location.href,
        title: document.title,
      },
    };
  }

  const candidates = collectRootCandidates();
  const selected = pickLatestCandidate(candidates);
  if (!selected || !selected.text) {
    return {
      ok: false,
      busy: isBusy(),
      text: '',
      confidence: 0,
      sourceMethod: 'dom',
      error: 'No latest assistant reply could be identified.',
      diagnostics: {
        candidateCount: candidates.length,
        url: window.location.href,
        title: document.title,
      },
    };
  }

  let confidence = Math.max(0, Math.min(selected.score, 1));
  if (selected.blockCount <= 1) {
    confidence = Math.max(0.35, confidence - 0.15);
  }

  return {
    ok: true,
    busy: isBusy(),
    text: selected.text,
    confidence,
    sourceMethod: 'dom',
    diagnostics: {
      candidateCount: candidates.length,
      blockCount: selected.blockCount,
      usedRootFallback: selected.usedRootFallback,
      rootTextLength: selected.rootTextLength,
      url: window.location.href,
      title: document.title,
    },
    fingerprint: selected.text,
  };
}

function createDomExtractor(spec) {
  return {
    providerKey: spec.providerKey,
    displayName: spec.displayName,
    busyWait: spec.busyWait || {},
    stability: spec.stability || {},
    async inspect(view) {
      return executeInspection(view, spec.providerKey, runStructuredMessageInspection, spec);
    },
  };
}

module.exports = {
  createDomExtractor,
  executeInspection,
};
