const chatgpt = require('./extractors/chatgpt');
const gemini = require('./extractors/gemini');
const grok = require('./extractors/grok');

const EXTRACTORS = {
  chatgpt,
  gemini,
  grok,
};

const DISPLAY_NAMES = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  grok: 'Grok',
  claude: 'Claude',
  perplexity: 'Perplexity',
};

function getExtractor(providerKey) {
  return EXTRACTORS[providerKey] || null;
}

function getProviderDisplayName(providerKey) {
  return EXTRACTORS[providerKey]?.displayName || DISPLAY_NAMES[providerKey] || providerKey || 'Unknown Provider';
}

module.exports = {
  getExtractor,
  getProviderDisplayName,
};
