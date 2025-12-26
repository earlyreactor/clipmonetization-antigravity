// =====================================================
// VIDEO EDIT PLANNER - n8n JavaScript Node (FINAL v5)
// =====================================================
// This node parses Gemini's analysis and creates a 
// sequential FFmpeg task pipeline
// =====================================================

// =====================================================
// 1. GET INPUT VIDEO PATH SAFELY
// =====================================================
let inputVideoPath = null;
try {
    // Option A: Try getting from current item first (Best for loops)
    if ($('Loop Over Items1') && $('Loop Over Items1').item) {
        inputVideoPath = $('Loop Over Items1').item.json.outputFile;
    }
    // Option B: Fallback to the specific node you referenced in your prompt
    else if ($('Read clips from disk').first().json.fileName) {
        inputVideoPath = $('Read clips from disk').first().json.fileName;
    }
    // Option C: Generic fallback to previous node output
    else if ($input.first().json.outputFile) {
        inputVideoPath = $input.first().json.outputFile;
    }
} catch (e) {
    // Ignore initial lookup errors, we check validity below
}

// Fallback if path is totally missing (prevents crash, helps debug)
if (!inputVideoPath) {
    inputVideoPath = "/data/clips/placeholder_debug.mp4";
}

// *** CRITICAL FIX: HANDLE COLONS IN FILENAMES ***
// If path doesn't start with '/' or '.', FFmpeg treats "00:10..." as a protocol.
// We force it to be an absolute path if it looks like just a filename.
if (!inputVideoPath.startsWith('/') && !inputVideoPath.startsWith('.')) {
    // Assuming your files are in /data/clips/ based on standard n8n docker setups
    inputVideoPath = `/data/clips/${inputVideoPath}`;
}

// =====================================================
// 2. PARSE GEMINI RESPONSE (ROBUST)
// =====================================================
const geminiRawText = $input.first().json.content?.parts?.[0]?.text;
let editorInstructions;

function cleanJSON(str) {
    if (!str) return "{}";

    // 1. Remove markdown code blocks (improved regex)
    // Handles: ```json, ```, ```js etc
    str = str.replace(/```[a-zA-Z]*\n?([\s\S]*?)\n?```/g, "$1");
    // Some models just output ``` without lang
    str = str.replace(/```/g, "");

    // 2. Remove text outside the outermost braces {}
    const firstOpen = str.indexOf('{');
    const lastClose = str.lastIndexOf('}');
    if (firstOpen !== -1 && lastClose !== -1) {
        str = str.substring(firstOpen, lastClose + 1);
    }

    // 3. Fix common JSON issues
    // Replace trailing commas before closing braces/brackets
    str = str.replace(/,(\s*[}\]])/g, '$1');

    // FIX: Missing commas between objects in array "}{" -> "},{"
    str = str.replace(/}(\s*){/g, '},$1{');

    // FIX: Missing comma after array closing bracket ] before next key "
    // Example: "key": [ ... ] "next": ...
    str = str.replace(/](\s*)"/g, '],$1"');

    // FIX: Missing comma after object closing brace } before next key "
    // Example: "key": { ... } "next": ...
    // Be careful not to match nested closing inside string? No, strings have quotes.
    // This is a heuristic.
    str = str.replace(/}(\s*)"/g, '},$1"');

    return str.trim();
}

// FALLBACK PARSER using Function constructor (safe-ish eval for object literals)
// Handles single quotes, unquoted keys, trailing commas that regex missed.
function looseJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        try {
            // Treat as JS object literal
            // Wrap in parens to ensure expression
            const fn = new Function("return (" + text + ")");
            return fn();
        } catch (e2) {
            throw e; // Rethrow original or new error
        }
    }
}

try {
    if (!geminiRawText) {
        throw new Error("Gemini response is empty or structure has changed");
    }

    const tempCleaned = cleanJSON(geminiRawText);

    try {
        const parsedData = looseJsonParse(tempCleaned);
        editorInstructions = parsedData.editor_instructions;
    } catch (e) {
        // If standard parse fails, try a very basic "loose" parser/repair if possible
        // For now, we just throw with context
        throw new Error(`JSON Parse Error: ${e.message}. Cleaned Text: ${tempCleaned.substring(0, 300)}...`);
    }

} catch (error) {
    throw new Error(`Failed to parse Gemini response: ${error.message}`);
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

// *** CRITICAL FIX: ROBUST TIME PARSING ***
// Handles HH:MM:SS (3 parts) AND MM:SS (2 parts) AND SS (1 part)
function timeToSeconds(timeStr) {
    if (!timeStr) return 0;

    // Clean string: replace commas with dots, remove whitespace
    const cleanStr = timeStr.toString().replace(',', '.').trim();
    const parts = cleanStr.split(':').map(parseFloat);

    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
        return parts[0];
    }
    return 0;
}

// Generate unique filename for each step
function generateStepFilename(clipId, step, extension = 'mp4') {
    return `/data/clips/${clipId}_${step}.${extension}`;
}

// Create SRT subtitle file content
function generateSRTContent(transcript) {
    let srtContent = '';
    if (Array.isArray(transcript)) {
        transcript.forEach((line, index) => {
            // Ensure comma format for SRT timestamp
            const startTime = (line.start || "00:00:00,000").replace('.', ',');
            const endTime = (line.end || "00:00:00,000").replace('.', ',');

            srtContent += `${index + 1}\n`;
            srtContent += `${startTime} --> ${endTime}\n`;
            srtContent += `${line.text}\n\n`;
        });
    }
    return srtContent;
}

// =====================================================
// BUILD TASK PIPELINE
// =====================================================

const clipId = $runIndex.toString().padStart(4, "0");
const tasks = [];

let currentInput = inputVideoPath;
let stepCounter = 1;

// =====================================================
// STEP 1: TRIM + CROP COMBINED (ROBUST SCALE-TO-FILL)
// =====================================================
const hasTrim = editorInstructions && editorInstructions.trimming && editorInstructions.trimming.required;
const hasCrop = editorInstructions && editorInstructions.cropping && editorInstructions.cropping.required;

// Helper to build robust filter for 9:16 conversion
// Strategy: Scale height to 1920 (HD Vertical), then Crop width to 1080 (Center)
// This guarantees valid output for any Input Aspect Ratio > 9:16
const verticalFilter = "scale=-1: 1920,crop=1080: 1920:(iw-ow)/2: 0,setsar=1";

if (editorInstructions) {

    // Add null checks for editorInstructions.trimming/cropping to prevent crashes if missing

    if (hasTrim && hasCrop) {
        // COMBINE trim and vertical crop
        const trim = editorInstructions.trimming;
        const outputFile = generateStepFilename(clipId, `${stepCounter}_trim_crop`);

        const startSeconds = timeToSeconds(trim.start_time);
        const endSeconds = timeToSeconds(trim.end_time);

        // Validation
        if (isNaN(startSeconds) || isNaN(endSeconds)) throw new Error(`Invalid time format in Gemini response`);

        const duration = endSeconds - startSeconds;

        // Note: -ss placed BEFORE -i for fast seek
        tasks.push({
            step: 'trim_crop',
            stepNumber: stepCounter,
            enabled: true,
            inputFile: currentInput,
            outputFile: outputFile,
            command: `ffmpeg -ss ${startSeconds} -i "${currentInput}" -t ${duration} -vf "${verticalFilter}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputFile}"`,
            description: 'Trim and convert to Vertical 9:16 (Zoom-to-Fill)',
            params: {
                start_time: trim.start_time,
                end_time: trim.end_time,
                duration: duration
            }
        });

        currentInput = outputFile;
        stepCounter++;

    } else if (hasTrim) {
        // Only trim (Keep original aspect ratio)
        const trim = editorInstructions.trimming;
        const outputFile = generateStepFilename(clipId, `${stepCounter}_trimmed`);

        const startSeconds = timeToSeconds(trim.start_time);
        const endSeconds = timeToSeconds(trim.end_time);

        if (isNaN(startSeconds) || isNaN(endSeconds)) throw new Error(`Invalid time format in Gemini response`);

        const duration = endSeconds - startSeconds;

        tasks.push({
            step: 'trim',
            stepNumber: stepCounter,
            enabled: true,
            inputFile: currentInput,
            outputFile: outputFile,
            command: `ffmpeg -ss ${startSeconds} -i "${currentInput}" -t ${duration} -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputFile}"`,
            description: trim.description || 'Trim video to specified time range',
            params: {
                start_time: trim.start_time,
                end_time: trim.end_time,
                duration: duration
            }
        });

        currentInput = outputFile;
        stepCounter++;

    } else if (hasCrop) {
        // Only crop (Convert whole video to Vertical)
        const outputFile = generateStepFilename(clipId, `${stepCounter}_cropped`);

        tasks.push({
            step: 'crop',
            stepNumber: stepCounter,
            enabled: true,
            inputFile: currentInput,
            outputFile: outputFile,
            command: `ffmpeg -i "${currentInput}" -vf "${verticalFilter}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${outputFile}"`,
            description: 'Convert to Vertical 9:16 (Zoom-to-Fill)',
            params: {
                filter: verticalFilter
            }
        });

        currentInput = outputFile;
        stepCounter++;

    } else {
        // Neither trim nor crop
        tasks.push({
            step: 'trim_crop',
            stepNumber: stepCounter,
            enabled: false,
            inputFile: null,
            outputFile: null,
            command: null,
            description: 'No trimming or cropping required'
        });
        stepCounter++;
    }

    // =====================================================
    // STEP 3: CREATE SRT FILE (separate task)
    // =====================================================
    if (editorInstructions.subtitles && editorInstructions.subtitles.required) {
        const subs = editorInstructions.subtitles;
        const srtFile = generateStepFilename(clipId, 'subtitles', 'srt');

        // Generate SRT content
        const srtContent = generateSRTContent(subs.transcript);

        tasks.push({
            step: 'create_srt',
            stepNumber: stepCounter,
            enabled: true,
            inputFile: null,
            outputFile: srtFile,
            srtContent: srtContent,
            // Using cat with heredoc to write file safely
            command: `cat > "${srtFile}" << 'EOF'\n${srtContent}EOF`,
            description: 'Create SRT subtitle file',
            params: {
                srt_file: srtFile,
                lines_count: subs.transcript ? subs.transcript.length : 0
            }
        });

        stepCounter++;

        // =====================================================
        // STEP 4: BURN SUBTITLES INTO VIDEO
        // =====================================================
        const outputFile = generateStepFilename(clipId, `${stepCounter}_subtitled`);

        // YouTube Shorts style: smaller, cleaner captions
        const fontSize = 42;
        const primaryColor = '&H00FFFF&';  // Yellow (BGR)
        const borderColor = '&H000000&';   // Black outline
        const fontName = 'Arial';
        const finalOutlineWidth = 3;

        // MarginV controls distance from bottom
        const subtitlesFilter = `subtitles=${srtFile}:force_style='FontName=${fontName},FontSize=${fontSize},PrimaryColour=${primaryColor},OutlineColour=${borderColor},Outline=${finalOutlineWidth},Bold=1,Alignment=2,MarginV=120'`;

        tasks.push({
            step: 'subtitles',
            stepNumber: stepCounter,
            enabled: true,
            inputFile: currentInput,
            outputFile: outputFile,
            srtFile: srtFile,
            command: `ffmpeg -i "${currentInput}" -vf "${subtitlesFilter}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputFile}"`,
            description: 'Burn styled subtitles into video',
            params: {
                placement: subs.placement,
                font_style: subs.font_style,
                font_size: fontSize,
                font_color: subs.font_color,
                transcript_lines: subs.transcript ? subs.transcript.length : 0
            }
        });

        currentInput = outputFile;
        stepCounter++;
    } else {
        // Push disabled tasks to keep pipeline structure
        tasks.push({
            step: 'create_srt',
            stepNumber: stepCounter,
            enabled: false,
            description: 'Subtitles not required'
        });
        stepCounter++;

        tasks.push({
            step: 'subtitles',
            stepNumber: stepCounter,
            enabled: false,
            description: 'Subtitles not required'
        });
        stepCounter++;
    }

    // =====================================================
    // STEP 5: AUDIO NORMALIZATION (Optional)
    // =====================================================
    const normalizeOutputFile = generateStepFilename(clipId, `${stepCounter}_normalized`);
    tasks.push({
        step: 'audio_normalize',
        stepNumber: stepCounter,
        enabled: false, // Set to true if you want audio normalization
        inputFile: currentInput,
        outputFile: normalizeOutputFile,
        command: `ffmpeg -i "${currentInput}" -af loudnorm -c:v copy "${normalizeOutputFile}"`,
        description: 'Audio normalization (disabled by default)'
    });

    // If audio normalization is enabled, update currentInput
    if (tasks[tasks.length - 1].enabled) {
        currentInput = normalizeOutputFile;
    }
    stepCounter++;

    // =====================================================
    // STEP 6: FINAL OUTPUT
    // =====================================================
    const finalOutputFile = generateStepFilename(clipId, 'final');
    tasks.push({
        step: 'finalize',
        stepNumber: stepCounter,
        enabled: true,
        inputFile: currentInput,
        outputFile: finalOutputFile,
        command: `cp "${currentInput}" "${finalOutputFile}"`,
        description: 'Copy final processed video',
        params: {
            finalOutput: finalOutputFile
        }
    });
}

// =====================================================
// OUTPUT RESULTS
// =====================================================

return tasks.map(task => ({
    json: {
        ...task,
        clipId: clipId,
        originalInput: inputVideoPath,
        timestamp: new Date().toISOString()
    }
}));
