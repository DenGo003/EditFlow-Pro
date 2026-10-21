# EditFlow Pro UXP M2.6.1 — Lumetri candidate selection fix

Fixes M2.6 error: `Cannot identify one supported Lumetri filter matchName. Add Lumetri manually. Matches: 2`.

Premiere Pro 25.6 may report more than one effect identifier containing the word `Lumetri`.
The M2.6 code rejected all such cases. M2.6.1 now **prefers the established Lumetri Color identifier `AE.ADBE Lumetri` (and uses an exact Premiere alternate only if that ID is unavailable)** over other Lumetri-related effects, inserts that specific effect onto the single real Adjustment Layer on the highest video track, verifies that the component count increased by one and the new effect is Lumetri, and reuses it on later runs. It never adds a duplicate effect if one is already detected.

If Premiere reports multiple Lumetri identifiers but *not* `PR.ADBE Lumetri`, the plugin still refuses to guess and prints the actual candidate identifiers. Send those identifiers for a targeted compatibility fix rather than silently applying the wrong effect.

The M2.6 Auto Color workflow otherwise remains unchanged (including the one-time genuine Adjustment Layer template if needed), as do M2.6's Smart Zoom strengths/timing, Auto Sync, Auto Cut, Arabic Subtitles, Caption Studio, and backend connection.

## Install

1. Save your Premiere project. Do not run this on an irreplaceable sequence.
2. Unload the older UXP developer plugin from Adobe UXP Developer Tools.
3. Extract this ZIP into a **new folder**. Add `uxp/manifest.json` and Load.
4. Open AI Coloring, check if the highest-track Adjustment Layer exists (it might have been added by M2.6 already), then Analyze and Apply.
5. Verify the actual Lumetri effect and image in Premiere. The tests are local mocks, **not** a successful live Premiere integration test.

## Automated checks

JavaScript test suite and Python caption-render unit tests passed locally, including tests for two Lumetri candidates, exact-id selection, duplicate protection, failed-ambiguity handling, Auto Color application, and unchanged Smart Zoom timing.
