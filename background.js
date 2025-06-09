// background.js

// Re‑inject content.js when icon clicked
chrome.action.onClicked.addListener(tab => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});

// Log extension ID on startup
const extensionId = chrome.runtime.id;
console.log("Extension ID (background):", extensionId);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('intro/hello.html')
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CLASSIFY_VIDEO_IDS' && Array.isArray(msg.videoIds)) {
    // 1) dedupe incoming IDs
    const uniqueIds = [...new Set(msg.videoIds)];

    fetch('https://backend.viralhits.io/classify-video-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '4720259999', videoIds: uniqueIds })
    })
      .then(r => r.json())
      .then(json => {
        // 2) dedupe any duplicates in the response
        const seen = new Set();
        const uniqueVideos = (json.videos || []).filter(v => {
          if (seen.has(v.videoId)) return false;
          seen.add(v.videoId);
          return true;
        });
        sendResponse({ videos: uniqueVideos });
      })
      .catch(err => sendResponse({ error: err.message }));

    return true; // keep channel open for async sendResponse
  }
});