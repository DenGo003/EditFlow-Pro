# EditFlow Pro UXP M2.6 — Stronger Smart Zoom + One-Click AI Color Layer

This is a **Premiere Pro 25.6.2 development build** based on M2.5. Core Auto Sync, separate-microphone Auto Cut, Arabic subtitles, Caption Studio and backend launcher were left unchanged.

## Smart Zoom
- Changed visible strengths from 1 / 2 / 3% to **3% Subtle, 5% Natural Punch (default), 7% Strong**.
- The **suggestion timing and selection rules are unchanged**: 12/18/25-second options, motion threshold, optional SRT emphasis, existing animated Scale protection, cap of 24 suggestions, inner-nest only.
- Suggested Scale increment now scales the backend's confidence with user intensity, preserving small increments for less-confident shots. A 5% chosen intensity never exceeds a 5% additional scale increase.
- Edits may propagate to all uses of a shared nest. Duplicate the **underlying nest** independently first.

## AI Color: auto placement / grade
Click **Read Active Timeline → Analyze real video frames → confirm safety → Auto-setup layer + Apply grade**.

The workflow:
1. If the highest video track contains **exactly one actual Adjustment Layer**, use it.
2. Otherwise, find a **genuine Adjustment Layer already used anywhere in the project sequences** or a project-bin element **explicitly named `EditFlow - AI Color Template`**.
3. Insert this genuine project item onto a **new highest video track** using UXP `SequenceEditor.createInsertProjectItemAction`. Verify the new item is really an Adjustment Layer.
4. Set the start to 0, end to current sequence end, verify both values.
5. Add Lumetri via `VideoFilterFactory` if necessary, verify insertion, and apply analyzed Exposure / Contrast / Temperature offsets to previously untouched values, verifying each change.

**First-project setup:** Premiere 25.6 has no documented native `createAdjustmentLayer()` method. If the project contains no suitable source item, use Premiere **File > New > Adjustment Layer**, set matching video properties, and **rename that Project Panel item `EditFlow - AI Color Template`**. You do this only once per project, not on each sequence. You do not need to drag the template into the active sequence. The plugin does the track placement, length and color effect automatically.

Safeguards: no attempt to fabricate a transparent video; checks for a single genuine layer and sequence identity; refuses unverified placement or duration mismatch; preserves existing animated/nonzero Lumetri parameters; no false Applied when nothing changed. If Premiere rejects the new track or layer, inspect the timeline and undo the last insert before retrying.

An Adjustment Layer **above ALL video tracks** also grades titles and overlays. Use a duplicate Premiere project/sequence to test.

## Status
JavaScript static checks, Python tests and simulated UXP transaction tests pass. This is **not verified inside the actual Premiere host** yet. A new track, actual adjustment-layer placement and effect editing must be confirmed in the user's Premiere Pro 25.6.2 installation. Keep CEP and prior UXP plugin available for rollback.

Unpack to a fresh folder, unload previous plugin in UXP Developer Tools, Add Plugin using `uxp/manifest.json`, then Load.
