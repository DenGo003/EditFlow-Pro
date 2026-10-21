# EditFlow Pro UXP M2.1 — Modular Workspace

- Separate navigable sections for Dashboard, Auto Sync, Auto Cut, AI Subtitles, Caption Studio, Smart Zoom, AI Coloring, and Settings / Jobs.
- Keeps existing M2.0 backend integration and analysis operations unchanged.
- Caption Studio: 24 preset gallery, editable sample, words per caption (1, 2, 3, 4, auto), animation preview (pop, fade, slide, bounce), colors, position, outline, per-word background, and locally saved settings.
- Gallery preview is not an actual animation export to Premiere. Animated graphics insertion, direct caption-track import and other planned video effects remain unimplemented.
- UXP 25.6.2: Unload the previous panel; Add Plugin via `uxp/manifest.json`; Load. Test on a duplicate project sequence.
- The network diagnostic permissions remain broad (`domains: all`) from M1.4; restrict after confirming exact UXP allowed domain syntax.
