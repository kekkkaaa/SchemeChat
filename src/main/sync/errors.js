class SyncError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    Object.assign(this, details);
  }
}

function createSyncError(code, message, details = {}) {
  return new SyncError(code, message, details);
}

module.exports = {
  SyncError,
  createSyncError,
};
