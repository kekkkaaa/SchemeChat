const { ipcRenderer } = require('electron');
const throttle = require('../utils/throttle');

const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const refreshBtn = document.getElementById('refreshBtn');
const newChatBtn = document.getElementById('newChatBtn');
const sendBtn = document.getElementById('sendBtn');
const syncBtn = document.getElementById('syncBtn');
const syncStatus = document.getElementById('syncStatus');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');

let currentText = '';
let syncInFlight = false;

function setSyncStatus(message, isError = false) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle('error', isError);
}

function updateCharCount() {
  charCount.textContent = textInput.value.length;
}

const sendTextUpdate = throttle(async (text) => {
  currentText = text;
  await ipcRenderer.invoke('send-text-update', text);
}, 50);

textInput.addEventListener('input', (event) => {
  updateCharCount();
  sendTextUpdate(event.target.value);
});

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitMessage();
  }
});

function submitMessage() {
  if (currentText.trim() === '') {
    return false;
  }

  ipcRenderer.invoke('submit-message').catch((error) => {
    console.error('Failed to submit:', error);
  });

  textInput.value = '';
  currentText = '';
  updateCharCount();
  setSyncStatus('Message sent. Wait for both sides to finish, then sync.', false);
  return true;
}

async function syncLatestRound() {
  if (syncInFlight) {
    return;
  }

  syncInFlight = true;
  syncBtn.disabled = true;
  setSyncStatus('Syncing latest replies...', false);

  try {
    const result = await ipcRenderer.invoke('sync-latest-round');
    if (!result || !result.ok) {
      setSyncStatus(result?.message || 'Sync failed.', true);
      return;
    }

    setSyncStatus(result.message || 'Sync complete.', false);
  } catch (error) {
    setSyncStatus('Sync failed.', true);
    console.error('Failed to sync latest round:', error);
  } finally {
    syncInFlight = false;
    syncBtn.disabled = false;
  }
}

refreshBtn.addEventListener('click', () => {
  ipcRenderer.invoke('refresh-pages').catch((error) => {
    console.error('Failed to refresh:', error);
  });
});

newChatBtn.addEventListener('click', () => {
  ipcRenderer.invoke('new-chat').catch((error) => {
    console.error('Failed to start new chat:', error);
  });

  textInput.value = '';
  currentText = '';
  updateCharCount();
  setSyncStatus('Ready to sync latest replies', false);
});

syncBtn.addEventListener('click', () => {
  syncLatestRound();
});

sendBtn.addEventListener('click', () => {
  submitMessage();
});

zoomInBtn.addEventListener('click', () => {
  ipcRenderer.invoke('zoom-in').catch((error) => {
    console.error('Failed to zoom in:', error);
  });
});

zoomOutBtn.addEventListener('click', () => {
  ipcRenderer.invoke('zoom-out').catch((error) => {
    console.error('Failed to zoom out:', error);
  });
});

textInput.focus();

updateCharCount();
setSyncStatus('Ready to sync latest replies', false);
