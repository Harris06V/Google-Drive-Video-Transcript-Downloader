// Popup script for Google Drive Video Transcript Downloader

const statusDiv = document.getElementById('status');
const downloadTimestampedBtn = document.getElementById('downloadTimestampedBtn');
const downloadPlainBtn = document.getElementById('downloadPlainBtn');

// Check if we're on a Google Drive page
async function checkPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('drive.google.com')) {
      statusDiv.className = 'status error';
      statusDiv.textContent = '❌ Please open a Google Drive video page';
      downloadTimestampedBtn.disabled = true;
      downloadPlainBtn.disabled = true;
      return;
    }

    // Check for transcript
    chrome.tabs.sendMessage(tab.id, { action: 'checkTranscript' }, (response) => {
      if (chrome.runtime.lastError) {
        statusDiv.className = 'status error';
        statusDiv.textContent = '❌ Please refresh the page and try again';
        downloadTimestampedBtn.disabled = true;
        downloadPlainBtn.disabled = true;
        return;
      }

      if (response && response.hasTranscript) {
        statusDiv.className = 'status success';
        statusDiv.textContent = `✅ Transcript found (${response.lineCount} lines)`;
        downloadTimestampedBtn.disabled = false;
        downloadPlainBtn.disabled = false;
      } else {
        statusDiv.className = 'status error';
        statusDiv.textContent = '❌ No transcript found. Make sure captions are enabled.';
        downloadTimestampedBtn.disabled = true;
        downloadPlainBtn.disabled = true;
      }
    });
  } catch (error) {
    statusDiv.className = 'status error';
    statusDiv.textContent = '❌ Error checking page';
    downloadTimestampedBtn.disabled = true;
    downloadPlainBtn.disabled = true;
  }
}

// Download transcript with format
async function downloadWithFormat(format) {
  downloadTimestampedBtn.disabled = true;
  downloadPlainBtn.disabled = true;
  statusDiv.className = 'status info';
  statusDiv.innerHTML = '<span class="loading"></span>Downloading...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.tabs.sendMessage(tab.id, { action: 'downloadTranscript', format }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        statusDiv.className = 'status error';
        statusDiv.textContent = '❌ Download failed';
        downloadTimestampedBtn.disabled = false;
        downloadPlainBtn.disabled = false;
        return;
      }

      statusDiv.className = 'status success';
      statusDiv.textContent = '✅ Transcript downloaded!';
      
      setTimeout(() => {
        checkPage();
      }, 2000);
    });
  } catch (error) {
    statusDiv.className = 'status error';
    statusDiv.textContent = '❌ Download failed';
    downloadTimestampedBtn.disabled = false;
    downloadPlainBtn.disabled = false;
  }
}

// Download with timestamps
downloadTimestampedBtn.addEventListener('click', () => downloadWithFormat('timestamped'));

// Download plain text
downloadPlainBtn.addEventListener('click', () => downloadWithFormat('plain'));

// Initialize
checkPage();
