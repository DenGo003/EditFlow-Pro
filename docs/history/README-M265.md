# EditFlow Pro UXP M2.6.5 — Lumetri Basic Correction Group Fix

## Root cause from actual Premiere 25.6.2 diagnostics
The top color Adjustment Layer on V4 contains Lumetri Color and shows Exposure -0.19. The UXP Lumetri component provides a **flat parameter array** with headings: `Basic Correction`, then `Creative`, and later other sections. `Temperature`, `Contrast` and `Saturation` can appear multiple times across sections. The earlier resolver rejected these three controls as ambiguous; zero color values changed.

## Fix
- Scope Lumetri control selection to values between the `Basic Correction` and `Creative` section markers when `Basic Correction` is present.
- Prefer explicitly qualified `Basic Correction > ControlName` labels when available. If there is no section metadata, require unique matching labels as a safe fallback.
- Never modify values in Creative, Curves or Color Wheels instead of Basic Correction. Never guess if duplicates remain within Basic Correction.
- Include `basicCorrectionFound` and `resolvedBy` in diagnostic output.
- Retain all earlier Auto Sync, Auto Cut, Subtitles, Caption Studio, Smart Zoom and color-layer behaviors, including user consent and Re-grade safety.

## Test instructions (Premiere Pro 25.6.2)
1. Save a backup project; unload the older UXP build, extract this ZIP to a new folder, and load `uxp/manifest.json` using Adobe UXP Developer Tools.
2. Open the original sequence and select the same source track used for analysis. Reuse the existing top Adjustment Layer; do not create another one manually.
3. In **AI Coloring**, run **Read Active Timeline** and **Analyze**. Choose Cinematic Editorial if you want a visibly distinct test grade.
4. Tick the Adjustment Layer safety consent. Tick **Re-grade existing NON-ANIMATED values** only when you deliberately want to replace existing edits to the same Lumetri effect.
5. Click **Auto-setup layer + Apply grade** and inspect the output. Expected with the previous diagnostic's defaults and matching plan: 3 controls changed and 1 (Exposure) already matching. Other combinations are possible.
6. Verify the target Lumetri is on the highest Adjustment Layer, toggle the effect to visually compare. If results are still skipped, copy the `notes`, `recognized`, `basicCorrectionFound` and `resolvedBy` fields. Do not retry blindly.

Local Node tests and Python unit tests passed. This is **not** a claim of Premiere integration testing or guaranteed visual quality. In particular an Adjustment Layer above all video tracks also affects any underlying graphics.
