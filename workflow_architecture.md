# n8n Workflow Architecture: Viral Clip Automation

## Overview
This workflow automates the pipeline from a YouTube URL to published short-form videos on TikTok, YouTube Shorts, and Instagram Reels. It relies on standard n8n nodes and the "Execute Command" node for heavy lifting (yt-dlp, ffmpeg).

## 1. Trigger & Input Validation
**Nodes:** `Webhook`, `Form Trigger`, `IF`, `Code`

*   **Trigger**:
    *   **Webhook (POST)**: Receives JSON payload `{"url": "https://..."}`.
    *   **Form**: Simple input field for manual testing.
*   **Validation**:
    *   **Code Node**: Regex check to ensure URL is a valid YouTube link. 
    *   **IF Node**: Stops execution if URL is invalid.

## 2. Video Acquisition (The "Downloader" Sequence)
**Nodes:** `Execute Command`

*   **Download Video**:
    *   Command: `yt-dlp`
    *   Args: Download video + audio, best quality compatible with editing (e.g., mp4/mkv).
    *   Output: Stores file path in a variable.
*   **Get/Extract Subtitles**:
    *   Command: `yt-dlp` (extract subs) OR `Execute Command` (Whisper/other CLI if no subs).
    *   Output: VTT/SRT file content or path.

## 3. Intelligence Layer (The "Editor" Brain)
**Nodes:** `Read Binary File`, `Basic LLM Chain` (or `HTTP Request` to OpenAI/Anthropic)

*   **Input Preparation**:
    *   Read the subtitle/transcript file.
*   **Highlight Detection (LLM)**:
    *   **Prompt**: Analyze transcript. Identifies 5-7 viral moments.
    *   **Constraint**: Must return JSON array: `[{ "start": "00:01:20", "end": "00:02:30", "reason": "Emotional peak...", "score": 9 }]`.
    *   **Filter**: Discard clips < 70 seconds or > 180 seconds.

## 4. Processing Layer (The "Studio")
**Nodes:** `Split In Batches`, `Execute Command` (FFmpeg)

*   **Iterator**: `Split In Batches` loops through the JSON array of highlights.
*   **Clip Generation (FFmpeg)**:
    *   **Cut**: Trim video based on start/end timestamps.
    *   **Crop**: Convert 16:9 to 9:16 (Vertical). uses `crop=ih*(9/16):ih` to center crop.
    *   **Subtitles (Optional)**: Burn in subtitles if style requires.
*   **Output**: Saves `clip_1.mp4`, `clip_2.mp4` to a temp directory.

## 5. Metadata Generation Layer
**Nodes:** `LLM Chain` (or `HTTP Request`)

*   **Caption Generator**:
    *   **Input**: Clip transcript segment + Original Video Title.
    *   **Prompt**: Generate viral caption, hashtags (tailored for TikTok vs Shorts), and a "clickbait" title.
*   **Output**: JSON with `title`, `tiktok_caption`, `shorts_description`.

## 6. Distribution Layer (The "Publisher")
**Nodes:** `HTTP Request` (YouTube API, TikTok API, Instagram Graph API)

*   **YouTube Shorts**:
    *   **Auth**: OAuth2 (Google).
    *   **Action**: Upload Video. Set `keywords` and `privacyStatus`.
*   **TikTok**:
    *   **Auth**: OAuth2 / Custom API solution (TikTok's api is strict, might need a buffer service or mobile automation fallback, but we will plan for API).
*   **Instagram Reels**:
    *   **Auth**: Facebook Graph API.
    *   **Action**: `POST /media` container, then `POST /media_publish`.

## 7. Cleanup & Notification
**Nodes:** `Execute Command`, `Discord/Slack/Email`

*   **Cleanup**: Delete downloaded source file and generated clips to save space.
*   **Notify**: Send summary of published links.
