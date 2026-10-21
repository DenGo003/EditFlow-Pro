# M2.6.3 — Consent UX repair

- The AI Coloring checkbox is now directly ABOVE the Setup button and applies to both Setup and Apply.
- The Setup button is disabled until explicit user approval.
- No changes to actual Lumetri color calculation, overlay insertion, Smart Zoom, Auto Cut, or captions.
- No new permissions are added.
- The presence of the controls is not proof that the color grade was visibly applied; check Effect Controls and before/after in Premiere.

## Install
Unload old plugin in Adobe UXP Developer Tools, add `uxp/manifest.json` from extracted package, then Load.
In AI Coloring, Analyze, tick Required approval before Setup or Apply, optionally enable Re-grade for existing nonanimated settings, and select Auto-setup layer + Apply grade.
