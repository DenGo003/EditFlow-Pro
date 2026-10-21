# EditFlow Pro UXP M2.6.4 — Re-grade Wiring & Skip Diagnostics

- Fix: the **Re-grade existing NON-ANIMATED Lumetri values** checkbox now actually passes `replaceExisting` to the color application engine. Earlier M2.6.3 ignored the checkbox.
- Fix: an already matching parameter is reported separately from a skipped parameter.
- When there are no changes, the status shows the first specific skip reason rather than only `See details`.
- Detailed color result now includes actual Lumetri parameter names and recognized controls, while maintaining the existing safety constraints: never overwrite existing values unless Re-grade is selected; never overwrite animated controls.
- Other modules remain unchanged.

## Test carefully
1. Duplicate project/sequence or back it up. Unload previous UXP and load `uxp/manifest.json` (manifest version 1.2.12).
2. AI Coloring: Read Active Timeline, pick a content track, choose Cinematic Editorial and 100%, click Analyze.
3. Approve the highest Adjustment Layer safety checkbox. Only if editing the existing color values is intended, tick `Re-grade existing NON-ANIMATED Lumetri values`.
4. Click `Auto-setup layer + Apply grade`. Inspect `applied`, `already`, `skipped`, `notes` and `diagnostics.availableLabels` under the button.
5. If still `NO changes`, send the JSON from Color Apply result rather than a cropped status banner. An unknown Lumetri parameter name/readonly or Premiere rejection cannot be safely repaired without that actual diagnostic.
6. Visually compare Program Monitor toggling Lumetri on/off.

This revision has automated tests only, not direct integration testing in Premiere Pro 25.6.2.
