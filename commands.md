# Command Reference: Viral Clip Automation

## 1. Video Downloader (yt-dlp)

### Download Video & Audio (Best Quality)
```bash
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --output "%(id)s.%(ext)s" --no-playlist "VIDEO_URL"
```

### Extract Subtitles (Auto-generated or Manual)
```bash
yt-dlp --write-auto-sub --sub-lang en --skip-download --convert-subs vtt --output "subtitles" "VIDEO_URL"
```
*   `--write-auto-sub`: Gets auto-captions if official ones aren't available.
*   `--convert-subs vtt`: Ensures output is WebVTT format (easier to parse/burn).

## 2. Clip Processing (FFmpeg)

### Cut and Crop to Vertical (9:16)
This command takes a segment, cuts it, and crops the center.
```bash
ffmpeg -i "INPUT_FILE.mp4" -ss START_TIME -to END_TIME -vf "crop=ih*(9/16):ih,scale=1080:1920" -c:v libx264 -crf 23 -c:a aac -b:a 128k "OUTPUT_CLIP.mp4"
```
*   `-ss`: Start time (e.g., `00:01:20`).
*   `-to`: End time (e.g., `00:02:30`).
*   `-vf`: Video filters.
    *   `crop=ih*(9/16):ih`: Crops the width to be 9/16th of the height (center crop).
    *   `scale=1080:1920`: Ensures final output is standard vertical HD.
*   `-c:v libx264`: Universal codec support.

### Burn Subtitles (Optional)
If you have a `.srt` or `.vtt` file and want to burn it in.
```bash
ffmpeg -i "clip.mp4" -vf "subtitles=subtitles.vtt:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3'" -c:a copy "clip_subbed.mp4"
```
*Note: Burning subtitles requires complex escaping in CLI. It's often easier to do this in a separate step or verify syntax carefully.*
