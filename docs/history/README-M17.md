# EditFlow Pro UXP M1.7 — Timeline Selectors for All Three Tools

Target: Premiere Pro 25.6.2. Python backend: existing local 0.8.2.

## Installation
1. Keep existing CEP and Python backend installed.
2. Unload prior UXP preview in UXP Developer Tools.
3. Extract ZIP to a fresh folder; add `uxp/manifest.json`; click Load.
4. Start & Connect as before.

## Timeline workflow
- Auto Sync: Read Active Timeline, choose Video / Camera Audio / Microphone and analyze. Read-only sync offset preview, not applied to timeline.
- Auto Cut: Read Active Timeline, choose Video and Camera Audio. Currently only works when each selected track contains exactly one direct-source clip and both resolve to the same media file. Analyze silences, then Generate AutoCut XML; manually import XML into Premiere. Does NOT cut current timeline. Separate-mic, trimmed offsets and nests not yet supported here; use working CEP version for these.
- Arabic Subtitles: Read Active Timeline, choose microphone audio track. Exactly one direct-source clip is supported. Generate SRT and manually import. The SRT timestamps reference ORIGINAL MEDIA, and won't account for timeline trims, offsets, nested or multi-clip sequences.

## Safety
Every operation verifies that the timeline track/source snapshot has not changed since reading. No timeline edits are applied. Network permission remains `all` as a development-only compatibility setting. Maintain CEP for established timeline workflows.
