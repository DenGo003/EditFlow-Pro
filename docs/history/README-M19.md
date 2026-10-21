# EditFlow Pro UXP M1.9 — Nested Timeline Captions

Keeps M1.8.1 Auto Sync, separate-microphone Auto Cut XML, and UXP localhost network connection unchanged.

## Fixed

The Subtitles button now uses `sequence_caption` (existing Python backend v0.8.2) rather than `transcribe` on the media path of a nested project item. It resolves nested Premiere project-item IDs through the project's sequences, expands the selected audio track into original media segments, maps in/out points onto the active timeline, and passes the selected clip snapshot to the existing local FFmpeg + Whisper pipeline. Gaps are preserved as silence.

## Test

Unload older plugin and Add Plugin using `uxp/manifest.json`, then Load. Open your completed AutoCut sequence. Go to Subtitles, press Read Active Timeline, select A1 and Generate SRT. Do not edit the sequence while it is processing. The SRT is produced to Outputs and must still be manually imported into Premiere.

## Safety / limitations

- Read-only Premiere operation; no project/timeline modification.
- Clips may be nested, but retimed/reversed audio and multiple populated audio tracks inside the same nest are explicitly refused instead of guessed.
- Backend sequence_caption supports up to 500 flattened source clips and at most four hours.
- Audio must resolve to accessible local files with supported extensions. Premiere source in/out and track times must be readable.
- Does not create Premiere caption tracks automatically.
- Actual Premiere 25.6.2 integration still needs user testing.
- The project folder's `pairing-token.txt` remains private; never put it in ZIPs or screenshots.
