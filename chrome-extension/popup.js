document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('webAppUrl');
  const saveBtn = document.getElementById('saveBtn');
  const lastTopicEl = document.getElementById('lastTopic');
  const syncCountEl = document.getElementById('syncCount');

  const data = await chrome.storage.local.get(['webAppUrl', 'lastActivity', 'syncCount']);
  if (data.webAppUrl) urlInput.value = data.webAppUrl;
  if (data.lastActivity) lastTopicEl.textContent = data.lastActivity;
  if (data.syncCount) syncCountEl.textContent = data.syncCount;

  saveBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    await chrome.storage.local.set({ webAppUrl: url });
    saveBtn.textContent = 'Saved!';
    setTimeout(() => { saveBtn.textContent = 'Save Settings'; }, 2000);
  });
});
