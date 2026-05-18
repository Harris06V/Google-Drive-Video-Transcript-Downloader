// Background service worker for capturing timedtext requests

let capturedTimedTextUrl = null;

// Listen for web requests to capture timedtext URL
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.url.includes('timedtext')) {
      console.log('Captured timedtext URL:', details.url);
      capturedTimedTextUrl = details.url;
      
      // Store it so content script can access it
      chrome.storage.local.set({ timedTextUrl: details.url });
    }
  },
  { urls: ["https://drive.google.com/*"] }
);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getTimedTextUrl') {
    sendResponse({ url: capturedTimedTextUrl });
  }
  return true;
});

// Clear captured URL when tab is closed or navigated
chrome.tabs.onRemoved.addListener((tabId) => {
  capturedTimedTextUrl = null;
  chrome.storage.local.remove('timedTextUrl');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    capturedTimedTextUrl = null;
    chrome.storage.local.remove('timedTextUrl');
  }
});
