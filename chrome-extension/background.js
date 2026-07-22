/**
 * Charlie AI Assistant - Background Activity Collector Service Worker
 */

const EXCLUDED_DOMAINS = [
  'bank', 'paypal', 'account', 'login', 'auth', 'password', 'checkout', 'billing', 'localhost', '127.0.0.1'
];

let activityBuffer = [];

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    processTab(tab);
  }
});

function processTab(tab) {
  const urlStr = tab.url;
  const title = tab.title || '';

  // Filter sensitive URLs
  if (EXCLUDED_DOMAINS.some(domain => urlStr.toLowerCase().includes(domain))) {
    return;
  }

  let topic = '';
  let source = 'General Browsing';

  if (urlStr.includes('youtube.com/watch')) {
    source = 'YouTube';
    // Clean title (remove "- YouTube")
    topic = title.replace(/- YouTube$/i, '').trim();
  } else if (urlStr.includes('google.com/search')) {
    source = 'Search Query';
    try {
      const urlObj = new URL(urlStr);
      topic = urlObj.searchParams.get('q') || title;
    } catch (e) {
      topic = title;
    }
  } else if (title && title.length > 5) {
    topic = title.split('-')[0].trim();
  }

  if (topic) {
    const entry = {
      timestamp: new Date().toISOString(),
      topic: topic,
      source: source,
      url: urlStr
    };
    activityBuffer.push(entry);
    syncActivity(entry);
  }
}

async function syncActivity(entry) {
  const data = await chrome.storage.local.get(['webAppUrl', 'syncCount']);
  const webAppUrl = data.webAppUrl;
  const syncCount = (data.syncCount || 0) + 1;
  await chrome.storage.local.set({ syncCount, lastActivity: entry.topic });

  if (webAppUrl) {
    try {
      await fetch(webAppUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_activity',
          topic: entry.topic,
          source: entry.source,
          url: entry.url
        })
      });
    } catch (err) {
      console.warn('Sync failed to Google Sheets:', err);
    }
  }
}
