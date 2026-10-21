# EditFlow Pro UXP M2.3 — Pinned Caption Preview

The Caption Studio usability fix requested after M2.2.1.

## Changes

- Compact, **always-visible** preview at the top of the Caption Studio section.
- **Replay animation** button directly next to the preview phrase; no need to scroll back up after clicking.
- A separate scrollbar for the preset gallery, font/color controls, and animated-overlay export section. These scroll **under** the pinned preview.
- Preview word reveal has a painted starting pose and eased opacity/position/scale transitions. Duration is slowed slightly for easier comparison.
- All 24 static preset cards, existing SRT picker, alpha MOV rendering/import, Auto Sync, Auto Cut, and AI Subtitles remain unchanged.

## Installation (Premiere 25.6.2)

1. Unload the old EditFlow Pro UXP plugin in Adobe UXP Developer Tools.
2. Extract this ZIP to a new folder and use Add Plugin > `uxp/manifest.json` > Load.
3. Open **Caption Studio**. Choose any preset and click **Replay animation** beside the preview at the top.
4. Scroll down the settings until the Render button is in view. The preview and Replay control should stay visible.

## Verification

- Node.js syntax checks of `uxp/main.js` and `uxp/src/workspace.js`.
- Static validation of all 24 preset cards, the fixed preview area, and the independently scrollable editor.
- Browser layout tests at **410×650** and **900×850** pixels confirm that preview and replay positions do not move while the editor scrolls, and that replay progresses through two words.
- Python caption-renderer regression tests and UXP file-picker tests.

The Chromium tests validate UI behavior, **not** Premiere/UXP rendering. Final confirmation still requires opening the panel in Premiere. Do not modify the existing backend for this update. UXP animated captions remain transparent rendered video, not editable native Premiere text.
