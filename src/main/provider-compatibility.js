const CHROME_LIKE_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '146.0.0.0'} Safari/537.36`;

const PROVIDER_COMPATIBILITY = {
  chatgpt: {
    partition: 'persist:chatgpt',
    userAgent: null,
  },
  gemini: {
    partition: 'persist:shared',
    userAgent: null,
  },
  perplexity: {
    partition: 'persist:shared',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  },
  claude: {
    partition: 'persist:shared',
    userAgent: null,
  },
  grok: {
    partition: 'persist:grok',
    userAgent: null,
  },
};

function getProviderCompatibility(providerKey) {
  return PROVIDER_COMPATIBILITY[providerKey] || {
    partition: 'persist:shared',
    userAgent: null,
  };
}

module.exports = {
  getProviderCompatibility,
};
