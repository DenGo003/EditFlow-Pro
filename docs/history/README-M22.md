# EditFlow Pro UXP M2.2 — Animated Caption Studio (test build)

**Premiere target:** 25.6.2. **Backend:** unchanged (0.8.2). **Keeps:** Auto Sync, separate microphone Auto Cut, nested Arabic AI subtitles and SRT import as in M2.1.

## Changes actually implemented

- The 24 style presets are selectable through a **permanent dropdown**, and also shown as clickable style cards in the gallery.
- Replay now uses JavaScript-timed word reveals (not only CSS keyframes). It runs again on every click. Selecting 1 or 2 words adjusts both the preview and render workflow.
- `Inspect caption tracks` checks the active Premiere sequence for existing native caption tracks.
- `Choose existing SRT file` selects the **same original SRT** used for the captions on your timeline. **The UXP 25.6.2 API does not expose their complete caption text** for reliable retrieval. No re-transcription is required.
- `Render + import animated overlay on top video track` builds a **transparent ProRes 4444 MOV** via a local Python+FFmpeg companion worker (bundled under `uxp/renderer`). It groups SRT words into 1–4-word overlays with estimated intra-cue time splits, adds fade/pop/slide/bounce effects, validates alpha transparency, imports the output into the Premiere Project Panel, then attempts an undoable insert into a **new topmost video track** using the documented Premiere UXP SequenceEditor API. It verifies a new track AND a matching imported clip before reporting applied.
- **Optional:** mute an existing native caption track **after verified insert** (only if there is exactly one caption track); otherwise original captions and source media are untouched.
- Output remains available at `%LOCALAPPDATA%\EditFlowPro\outputs\caption-studio\<task-id>\` even if insertion fails.

## How to install and test

1. Back up your Premiere project or create a duplicate sequence. **Do not remove the working CEP plugin.**
2. In Adobe UXP Developer Tools **Unload** the older test panel. Unzip this package and **Add Plugin** via `uxp/manifest.json`, then **Load**.
3. Open the sequence that already has SRT captions. Use **Caption Studio** in the sidebar.
4. Choose a style in the `Choose a style` dropdown (all 24 should appear). Pick `1 word` or `2 words`, change the color, press **Replay animation**.
5. Under **Apply to SRT already on timeline**, press **Inspect caption tracks**, then **Choose existing SRT file**. Select the SRT whose timecodes match the currently open sequence. This is necessary because native UXP does not expose the SRT's full text from caption tracks.
6. Confirm adding a new transparent overlay. **Optional:** explicitly tick mute original caption track. Click **Render + import animated overlay on top video track**.
7. Leave the renderer window running until the panel reports a result. The local FFmpeg process may take time on long footage. If the MOV renders but the Premiere insert fails, the MOV is still saved and may be placed manually at 00:00 on a new video track above the other tracks.

## Dependencies and logs

- Python 3.11 already installed in `G:\EditFlowPro\App\.venv\Scripts\python.exe` (default in the bundled launcher); otherwise Python on PATH.
- Full FFmpeg on PATH or `%USERPROFILE%\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe`; requires `libass`, `prores_ks` and alpha channel encoding.
- Logs: `%LOCALAPPDATA%\EditFlowPro\caption-render.log` and `caption-studio-result.json`.
- Movie: `%LOCALAPPDATA%\EditFlowPro\outputs\caption-studio\<id>\EditFlow-Animated-Captions.mov`.
- The renderer runs locally; does **not** upload media, SRT or token. The authentication secret is not used by the render worker.

## Important limitations

- Caption-track text is **not read back directly** from the Premiere timeline; user selects its original `.srt`. If captions were shifted/trimmed after import, overlay times may not align. Verify the first, middle and final captions.
- SRT has only cue times, not individual word times. One- and two-word cue sub-timings are **estimated** from character lengths. This is not genuine forced-aligned word recognition; exact karaoke/word emphasis requires a proper word-level alignment stage.
- The overlay is **one rendered MOV**, not per-word editable Premiere graphics; to change styles, re-render. The native SRT track remains editable as before.
- ProRes 4444 renders can create very large files and require significant CPU for long sequences.
- The alpha encoder and Python transformations were tested locally; the final `openPath(.cmd)` and automatic Premiere import/insert APIs have **not** been exercised inside the user's actual Premiere 25.6.2. A failed action must not be reported as verified success.
- UXP network permissions still use `domains: all` due to prior Premiere localhost allowlist limitation; this should be restricted when the compatible specific host configuration is established.

## Automated tests executed

- Python unit tests for Arabic SRT parsing, words-per-caption grouping, animation/ASS escaping and invalid colors.
- FFmpeg end-to-end rendering of a short Arabic SRT into transparent ProRes 4444. Alpha channel verified by decoding a corner pixel.
- Node simulated-DOM test checking 24 preset options and sequential Replay update.
- JavaScript syntax checks for the plugin files; ZIP path/manifest integrity checks.

**This is a testing milestone, not a production release or claim that direct caption-track style mutation is supported.**
