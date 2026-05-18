# Google Drive Video Transcript Downloader

Chrome extension that downloads full transcripts from Google Drive videos.

## Installation

1. Go to chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this folder

## Usage

Open a Google Drive video with captions enabled. You have two download options:

**Floating Buttons (on page):**
- Download with Timestamps
- Download Plain Text

**Extension Popup:**
- Click the extension icon in your toolbar
- Choose "Download with Timestamps" or "Download Plain Text"

## How It Works

Intercepts Google Drive's timedtext API request, parses the JSON3 format transcript data (events array with segs containing utf8 text), and downloads it as a formatted text file with timestamps.

## Troubleshooting

No transcript found: Enable captions on the video and refresh the page.
Button doesn't appear: Refresh the page or check chrome://extensions/ to ensure the extension is enabled.
Download fails: Check browser download permissions.

## Output Format

**With Timestamps:**
```
0:06 In 1955, Bill Haley and the Comets
0:08 became the first rock and roll band to
0:10 go to the top of the Hot 100
```

**Plain Text:**
```
In 1955, Bill Haley and the Comets became the first rock and roll band to go to the top of the Hot 100
```

## Permissions

- activeTab: Access current Google Drive tab
- downloads: Save transcript file
- storage: Cache timedtext URL
- webRequest: Intercept API calls
- host_permissions: Run on drive.google.com
