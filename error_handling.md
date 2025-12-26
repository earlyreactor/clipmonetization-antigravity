# Best Practices & Failure Handling

## Error Handling Strategies

### 1. Download Failures
*   **Retry Logic**: `yt-dlp` can fail due to IP blocks or temporary network issues.
    *   **Implementation**: Configure the "Execute Command" node to "Retry on Fail" (n8n settings) up to 3 times with a 5000ms delay.
*   **Fallback**: If `yt-dlp` fails to download video, the workflow should route to an error notification node (Discord/Email) containing the video ID that failed.

### 2. LLM Hallucinations (JSON Structure)
*   **Validation**: The output from the LLM is expected to be strict JSON, but sometimes LLMs add chatty text (`Here is your JSON...`).
*   **Repair**: Use a "Code" node immediately after the LLM to parse the output.
    *   *JavaScript*: `const jsonStart = text.indexOf('['); const jsonEnd = text.lastIndexOf(']') + 1; return JSON.parse(text.slice(jsonStart, jsonEnd));`
*   **Schema Check**: Ensure `start` and `end` keys exist. If not, trigger a re-run or default to a safe 60s generic clip.

### 3. FFmpeg Processing Errors
*   **Timeout**: Video processing is heavy. Increase the `Execute Command` timeout limit to 300s or 600s.
*   **Corrupt Output**: Check file size of generated clips. If < 1KB, something went wrong.

---

## Scalability & Cost Optimization

### 1. Self-Hosted n8n + Workers
*   **Architecture**: Run n8n in "Queue Mode" with Redis.
*   **Workers**: Separate the main n8n instance from the "Worker" instances that run the `Execute Command` nodes. 
    *   Assign `ffmpeg` and `yt-dlp` tasks to high-CPU worker nodes.
    *   Keep lightweight HTTP/Logic tasks on the main instance (or cheaper workers).

### 2. Storage Management
*   **Ephemeral Storage**: Do NOT store videos permanently on the n8n server.
    *   Download -> Process -> Upload -> **DELETE**.
*   **Mounts**: Use a mounted volume (e.g., `/tmp/n8n_media`) aimed at fast SSDs for the temp processing.

### 3. API Quotas
*   **YouTube**: 6 uploads per day limit on standard verified accounts via API usually.
    *   **Strategy**: Schedule uploads. If quota hit, queue the rest for T+24h.
*   **TikTok**: Use a buffer service (like Buffer.com or specialized TikTok scheduler tools with API) if direct API access is restricted.

### 4. LLM Saving
*   **Model Choice**: Use `gpt-4o-mini` or `claude-3-haiku` for the highlight detection. They are significantly cheaper and sufficient for this task compared to full GPT-4.
*   **Prompt Caching**: If the transcript is huge, check if the LLM provider supports prompt caching (Anthropic does).
