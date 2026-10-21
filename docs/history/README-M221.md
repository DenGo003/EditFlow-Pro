# EditFlow Pro UXP M2.2.1 – Caption Studio Reliability Fix

**Confirmed code fixes:**
- Replaced nonexistent `localFileSystem.getFile()` with documented `getFileForOpening({types:["srt"], allowMultiple:false})`. Cancelling selection is handled normally; SRT remains on disk.
- Embedded all 24 preset options and buttons as **static HTML**. They are visible without JavaScript dynamic DOM injection. Category filters and preset selection still work when the UXP DOM supports events.
- Embedded persistent preview word elements as **static HTML** so sample text is visible even when dynamic creation isn't supported.
- Replay uses timer-driven updates to visible word elements, with an explicit playback status counter to make each stage observable.
- Kept M2.2 backend jobs, rendering, import logic, Auto Sync/Cut/Subtitles unchanged.

**How to test:**
1. Unload M2.2 from UXP Developer Tools. Extract this ZIP to a new folder; Add Plugin selecting `uxp/manifest.json`, Load.
2. Open **Caption Studio**. All 24 preset buttons should be visible; the static sample `مانشستر يونايتد` should be visible even before pressing anything. Choose another preset and hit **Replay animation**; playback text status changes through 1/2 then 2/2.
3. Click **Choose existing SRT file**. A native file picker should open and allow choosing a `.srt` file.
4. Test rendering only on a **duplicate sequence**; automatic Premiere overlay insertion still needs real on-device verification.

**Known limits:** SRT cannot encode animation. The overlay renderer produces a transparent MOV, with estimated intra-cue word timing, not editable native graphics. A real Premiere insertion action isn't confirmed until tested in Premiere 25.6.2. No changes to the current backend or pairing token.
