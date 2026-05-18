// Content script for Google Drive Video Transcript Downloader

let transcriptObserver = null;
let downloadButton = null;
let cachedTranscriptUrl = null;
let interceptedTimedTextUrl = null;

// Intercept network requests to capture timedtext URL
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const url = args[0];
  if (typeof url === 'string' && url.includes('timedtext')) {
    console.log('Intercepted timedtext URL:', url);
    interceptedTimedTextUrl = url;
  }
  return originalFetch.apply(this, args);
};

// Also intercept XMLHttpRequest
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url) {
  if (typeof url === 'string' && url.includes('timedtext')) {
    console.log('Intercepted timedtext URL (XHR):', url);
    interceptedTimedTextUrl = url;
  }
  return originalOpen.apply(this, arguments);
};

// Function to extract video ID from URL
function getVideoId() {
  const match = window.location.href.match(/\/file\/d\/([^\/]+)/);
  return match ? match[1] : null;
}

// Function to search for timedtext URL in page source
function findTimedTextUrlInPage() {
  // Check intercepted URL first
  if (interceptedTimedTextUrl) {
    return interceptedTimedTextUrl;
  }

  // Search in all script tags
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const content = script.textContent;
    // Look for timedtext URL patterns
    const patterns = [
      /https?:\/\/[^"'\s]*timedtext[^"'\s]*/g,
      /"(\/timedtext[^"]+)"/g,
      /'(\/timedtext[^']+)'/g
    ];
    
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (let match of matches) {
          match = match.replace(/['"]/g, '');
          if (match.startsWith('/')) {
            match = 'https://drive.google.com' + match;
          }
          console.log('Found timedtext URL in page:', match);
          return match;
        }
      }
    }
  }

  return null;
}

// Function to construct timedtext URLs to try
function constructTimedTextUrls(videoId) {
  const baseUrl = 'https://drive.google.com/timedtext';
  const urls = [];
  
  // Try different parameter combinations
  const langs = ['en', 'en-US'];
  const formats = ['json3', 'vtt', 'srv3'];
  
  for (const lang of langs) {
    for (const fmt of formats) {
      urls.push(`${baseUrl}?id=${videoId}&lang=${lang}&fmt=${fmt}&v=${videoId}`);
      urls.push(`${baseUrl}?id=${videoId}&lang=${lang}&fmt=${fmt}`);
      urls.push(`${baseUrl}?v=${videoId}&lang=${lang}&fmt=${fmt}`);
    }
  }
  
  return urls;
}

// Function to fetch transcript from timedtext API
async function fetchTranscriptFromAPI() {
  const videoId = getVideoId();
  if (!videoId) {
    console.log('No video ID found in URL');
    return null;
  }

  console.log('Video ID:', videoId);

  // Try to get URL from background script
  try {
    const stored = await chrome.storage.local.get('timedTextUrl');
    if (stored.timedTextUrl) {
      console.log('Got timedtext URL from storage:', stored.timedTextUrl);
      try {
        const response = await fetch(stored.timedTextUrl);
        if (response.ok) {
          const data = await response.text();
          const result = parseTranscriptData(data);
          if (result) {
            console.log('Successfully fetched transcript from stored URL');
            return result;
          }
        }
      } catch (error) {
        console.log('Failed to fetch from stored URL:', error);
      }
    }
  } catch (error) {
    console.log('Could not access storage:', error);
  }

  // Try intercepted/found URL
  const foundUrl = findTimedTextUrlInPage();
  if (foundUrl) {
    console.log('Trying found URL:', foundUrl);
    try {
      const response = await fetch(foundUrl);
      if (response.ok) {
        const data = await response.text();
        const result = parseTranscriptData(data);
        if (result) {
          console.log('Successfully fetched transcript from found URL');
          return result;
        }
      }
    } catch (error) {
      console.log('Failed to fetch from found URL:', error);
    }
  }

  // Try constructed URLs
  const urls = constructTimedTextUrls(videoId);
  console.log('Trying', urls.length, 'constructed URLs...');
  
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.text();
        const result = parseTranscriptData(data);
        if (result) {
          console.log('Successfully fetched transcript from:', url);
          cachedTranscriptUrl = url;
          return result;
        }
      }
    } catch (error) {
      // Silently continue to next URL
    }
  }

  console.log('Failed to fetch transcript from any URL');
  return null;
}

// Function to parse transcript data
function parseTranscriptData(data) {
  try {
    // Try JSON format first
    if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
      try {
        const json = JSON.parse(data);
        const result = parseJSON3Format(json);
        if (result) return result;
      } catch (e) {
        console.log('Not valid JSON');
      }
    }
    
    // Try VTT format
    if (data.includes('WEBVTT')) {
      return parseVTTFormat(data);
    }
    
    // Try SRT format
    if (data.match(/^\d+\s*$/m)) {
      return parseSRTFormat(data);
    }
    
    return null;
  } catch (error) {
    console.log('Error parsing transcript:', error);
    return null;
  }
}

// Parse JSON3 format (Google's format with events and segs)
function parseJSON3Format(json) {
  let fullTranscript = '';
  const transcriptData = [];
  let plainText = '';

  if (!json.events || !Array.isArray(json.events)) {
    console.log('No events array found in JSON');
    return null;
  }

  console.log('Found', json.events.length, 'events in transcript');

  json.events.forEach(event => {
    if (event.segs && Array.isArray(event.segs)) {
      const timestamp = formatTimestamp(event.tStartMs || 0);
      
      // Concatenate all utf8 segments
      const text = event.segs
        .map(seg => seg.utf8 || '')
        .join('')
        .trim();
      
      // Skip newline-only segments
      if (text && text !== '\n') {
        transcriptData.push({ timestamp, text });
        fullTranscript += `${timestamp} ${text}\n`;
        plainText += text + ' ';
      }
    }
  });

  // Clean up plain text
  plainText = plainText.replace(/\s+/g, ' ').trim();

  if (transcriptData.length > 0) {
    console.log('Parsed', transcriptData.length, 'transcript segments');
    return { fullTranscript, transcriptData, plainText };
  }

  console.log('No transcript data found in events');
  return null;
}

// Parse VTT format
function parseVTTFormat(data) {
  let fullTranscript = '';
  const transcriptData = [];
  
  const lines = data.split('\n');
  let currentTimestamp = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for timestamp line
    if (line.includes('-->')) {
      currentTimestamp = line.split('-->')[0].trim();
    } else if (line && !line.startsWith('WEBVTT') && !line.match(/^\d+$/)) {
      // This is text content
      const text = line.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
      if (text) {
        transcriptData.push({ timestamp: currentTimestamp, text });
        fullTranscript += `${currentTimestamp} ${text}\n`;
      }
    }
  }

  return transcriptData.length > 0 ? { fullTranscript, transcriptData } : null;
}

// Parse SRT format
function parseSRTFormat(data) {
  let fullTranscript = '';
  const transcriptData = [];
  
  const blocks = data.split(/\n\s*\n/);
  
  blocks.forEach(block => {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timestamp = lines[1].split('-->')[0].trim();
      const text = lines.slice(2).join(' ').trim();
      
      if (text) {
        transcriptData.push({ timestamp, text });
        fullTranscript += `${timestamp} ${text}\n`;
      }
    }
  });

  return transcriptData.length > 0 ? { fullTranscript, transcriptData } : null;
}

// Format milliseconds to timestamp
function formatTimestamp(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  const s = seconds % 60;
  const m = minutes % 60;
  
  if (hours > 0) {
    return `${hours}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Function to extract transcript text (tries API first, then DOM)
async function extractTranscript() {
  console.log('Extracting transcript...');
  
  // Try API first
  const apiResult = await fetchTranscriptFromAPI();
  if (apiResult) {
    console.log('Got transcript from API');
    return apiResult;
  }

  console.log('API failed, trying DOM scraping...');

  // Fallback to DOM scraping
  const transcriptElements = document.querySelectorAll('[data-test-id="transcript-cue"]');
  
  if (transcriptElements.length === 0) {
    console.log('No transcript found via API or DOM');
    return null;
  }

  let fullTranscript = '';
  const transcriptData = [];
  let plainText = '';

  transcriptElements.forEach((element) => {
    const timestampElement = element.querySelector('[data-test-id="transcript-cue-timestamp"]');
    const timestamp = timestampElement ? timestampElement.textContent.trim() : '';

    const textElement = element.querySelector('[data-test-id="transcript-cue-text"]');
    const text = textElement ? textElement.textContent.trim() : '';

    if (text) {
      transcriptData.push({ timestamp, text });
      fullTranscript += `${timestamp ? timestamp + ' ' : ''}${text}\n`;
      plainText += text + ' ';
    }
  });

  plainText = plainText.trim();

  console.log('Got transcript from DOM:', transcriptData.length, 'segments');
  return transcriptData.length > 0 ? { fullTranscript, transcriptData, plainText } : null;
}

// Function to download transcript
async function downloadTranscript(format = 'timestamped') {
  console.log('Starting transcript download...');
  const result = await extractTranscript();
  
  if (!result || !result.fullTranscript) {
    alert('No transcript found. Please make sure the video has captions/transcript enabled.\n\nTip: Open the video, enable captions, and try again.');
    return false;
  }

  // Get video title from page
  const titleElement = document.querySelector('[data-item-id]') || 
                       document.querySelector('h1') ||
                       document.querySelector('[aria-label*="video"]') ||
                       document.querySelector('title');
  let videoTitle = titleElement ? titleElement.textContent.trim() : 'Video';
  
  // Clean up title - remove "- Google Drive" suffix and extra whitespace
  videoTitle = videoTitle
    .replace(/\s*-\s*Google Drive\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Create filename: "Video Title Transcript.txt"
  const fileName = `${videoTitle} Transcript.txt`;

  // Choose content based on format
  const content = format === 'plain' && result.plainText 
    ? result.plainText 
    : result.fullTranscript;

  // Create blob and download
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('Transcript downloaded successfully:', fileName);
  return true;
}

// Function to create download button
function createDownloadButton() {
  if (downloadButton) return;

  // Create container for buttons
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;

  // Create timestamped button
  const timestampedBtn = document.createElement('button');
  timestampedBtn.textContent = '📥 Download with Timestamps';
  timestampedBtn.style.cssText = `
    padding: 12px 20px;
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    transition: background 0.2s;
    white-space: nowrap;
  `;

  timestampedBtn.addEventListener('mouseenter', () => {
    timestampedBtn.style.background = '#1557b0';
  });

  timestampedBtn.addEventListener('mouseleave', () => {
    timestampedBtn.style.background = '#1a73e8';
  });

  timestampedBtn.addEventListener('click', () => downloadTranscript('timestamped'));

  // Create plain text button
  const plainBtn = document.createElement('button');
  plainBtn.textContent = '📄 Download Plain Text';
  plainBtn.style.cssText = `
    padding: 12px 20px;
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    transition: background 0.2s;
    white-space: nowrap;
  `;

  plainBtn.addEventListener('mouseenter', () => {
    plainBtn.style.background = '#1557b0';
  });

  plainBtn.addEventListener('mouseleave', () => {
    plainBtn.style.background = '#1a73e8';
  });

  plainBtn.addEventListener('click', () => downloadTranscript('plain'));

  container.appendChild(timestampedBtn);
  container.appendChild(plainBtn);
  document.body.appendChild(container);
  
  downloadButton = container;
}

// Function to check if we're on a video page with transcript
function checkForTranscript() {
  // Check if we're on a video page
  const isVideoPage = window.location.href.includes('/file/d/') && 
                      (document.querySelector('video') || 
                       document.querySelector('[data-test-id="video-player"]'));

  if (!isVideoPage) {
    if (downloadButton) {
      downloadButton.remove();
      downloadButton = null;
    }
    return;
  }

  // Check if transcript panel exists
  const transcriptPanel = document.querySelector('[data-test-id="transcript-panel"]') ||
                          document.querySelector('[aria-label*="transcript" i]') ||
                          document.querySelectorAll('[data-test-id="transcript-cue"]').length > 0;

  if (transcriptPanel && !downloadButton) {
    createDownloadButton();
  }
}

// Initialize observer
function init() {
  // Check immediately
  checkForTranscript();

  // Watch for URL changes (SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(checkForTranscript, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

  // Watch for transcript panel appearing
  transcriptObserver = new MutationObserver(() => {
    checkForTranscript();
  });

  transcriptObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'downloadTranscript') {
    const format = request.format || 'timestamped';
    downloadTranscript(format).then(success => {
      sendResponse({ success });
    });
  } else if (request.action === 'checkTranscript') {
    extractTranscript().then(result => {
      sendResponse({ 
        hasTranscript: result !== null,
        lineCount: result ? result.transcriptData.length : 0
      });
    });
  }
  return true; // Keep message channel open for async response
});
