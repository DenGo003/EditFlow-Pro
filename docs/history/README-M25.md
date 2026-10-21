# EditFlow Pro UXP M2.5 — Smart Zoom + AI Coloring (test build)

Built on M2.4.1 with the validated connection fallback (manifest still allows `domains: "all"`), caption studio, Auto Sync, microphone AutoCut and Arabic subtitles preserved.

## Smart Zoom

Open your **separate backup copy of the Premiere project** and a copy of the **underlying AutoCut nest** (copying only the outer sequence does NOT isolate an inner nest). Open the working sequence containing the nest on V1. From Smart Zoom, click **Read Active Timeline**, select the V track containing the nest, choose `Minimal 1%` or `Natural 2%` and 18 seconds spacing. Press **Analyze real video frames**. Preview the proposal before consenting to changes. Apply inside the nest only after verifying the nest is safe to edit.

Optional: select **SRT emphasis**, then **Choose SRT from timeline** and pick the ORIGINAL `.srt` file matching the active sequence. The plugin looks for a few explicit emphasis words in the sentence and for ?/! punctuation. This is text-heuristic timing, not audio-emotion analysis, voice stress recognition, face tracking or word alignment; an unmatched sentence produces no zoom. Without matching subtitle cues select `Visual only`. Zoom never applies directly on the outer nest (only supported inner clips), avoids existing animated Scale and values above 110%, and verifies that the video source did not change. A shared nest can still affect its other uses.

## AI Coloring

Create a **genuine Premiere Adjustment Layer** manually on the **highest video track**, ensuring there is only this one clip on that track. This build can **add Lumetri Color to this existing layer using UXP VideoFilterFactory** if the host exposes exactly one identifiable Lumetri match name. Check the consent box and press **Add / Verify Lumetri**. If the layer, factory or effect is unavailable, the button reports a reason; add Lumetri manually if needed.

Choose the **video CONTENT track to analyze** (e.g. V1 containing AutoCut nest, NOT the Adjustment Layer track). Click **Analyze real video frames**, select a modest grade, inspect the suggested exposure, contrast, and temperature, and then Apply to the upper Adjustment Layer. Existing nonzero/animated controls are protected. All changes are made via UXP Project.lockedAccess + Project.executeTransaction and verified by a subsequent parameter read. If no supported values can be set, the UI says no changes applied. This analysis is FFmpeg per-source luma/statistics with explainable rules, **not a trained AI color grading model**. It cannot recognize skin tones or perform scene-specific grading automatically.

**WARNING:** An adjustment layer placed higher than everything also recolors TITLES and GRAPHICS underneath. Use a duplicate sequence for the first tests.

## Technical status

- Actual 25.6.2 Premiere host integration has NOT been tested here. JS/API mocks, program structure and package static checks passed.
- Neither creating a brand new Adjustment Layer nor tracking a human face is implemented. Do not claim these features are present.
- If Lumetri's Basic Correction controls cannot be identified safely in the localized interface, controls are skipped and no success is reported.
- If the user has multiple identical instances of a nested sequence, an inner clip is not zoomed twice per run.
- Old CEP plugin stays installed as a working fallback. This M2.5 is a UXP dev build, not an auto-update release.

Installation: Unload existing UXP dev build, unpack into a new folder, Add Plugin with `uxp/manifest.json` using Adobe UXP Developer Tools, Load. Connect backend to the existing Python 0.8.2 engine before analysis.
