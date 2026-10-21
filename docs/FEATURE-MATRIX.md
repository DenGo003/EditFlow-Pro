# Independent EditFast-like feature audit — 2026-10-21

The public EditFast page describes 19 tools: https://editfast.shop/en/ . This table maps **independent functional equivalents** to EditFlow Pro 0.9.5, not their private code, models, media or design assets. Premiere target: Windows 25.6.2. Adobe's versioned API reference: https://developer.adobe.com/premiere-pro/uxp/ppro-reference/ . Status means code exists in this package; mock tests do not imply a completed Premiere host test.

| # | Advertised tool | EditFlow 0.9.5 status | Main work or uncertainty |
|---|---|---|---|
| 1 | EditFast AI | Not built as a full editor | Existing cut, captions and color are separate partial building blocks. Needs an edit planner, sequence copy, preview and safe plan application. |
| 2 | Motion Gallery | Not built | New original motion assets, previews and a generation/render pipeline; EditFast creator library is proprietary. |
| 3 | AI Studio Voice | Not built | Local voice analysis/DSP or a licensed model/service, loudness targets and audible before/after review. |
| 4 | Smart cut | Partial | Silence analysis and new XML exist; import/sequence duplication, gap closing and audio transitions are not automatic yet. |
| 5 | Tracking | Not built | Computer vision tracking with confidence/loss handling, then attachment to native clip/graphic motion; compute can run in the external Python backend on 25.6.2. |
| 6 | Transcription | Partial | Local Whisper generates Arabic/English/auto SRT and word timings. Seventeen languages, seven verified Arabic dialects and spelling correction are not present as advertised equivalents. |
| 7 | Captions | Partial | Generated SRT imports to Project Panel; native caption-track placement/editing still needs a verified 25.6.2 workflow. Caption Studio renders transparent MOV, not editable native caption text. |
| 8 | Motion presets | Partial, six original Scale recipes in 0.9.4 | Native editable Scale keyframes with numeric preview and protected existing animation. No Position presets, easing controls, 28-item gallery or host verification yet. |
| 9 | Animated titles | Not built | Caption Studio overlays are not 25 native editable Essential Graphics titles. Needs independent graphics and insertion. |
| 10 | Search & markers | Partial, added 0.9.3 | Generated transcript word search, cue search from SRT, playhead jump and native Comment markers. YouTube chapter suggestions and music beat markers are absent; host acceptance pending. |
| 11 | B-roll library | Not built | Original/licensed stock source or a user library, previews, media acquisition and timeline insertion. |
| 12 | Automatic SFX | Not built | Manual preview and placement exist; speech context detection and automated selection/timing are not implemented. |
| 13 | Sound effects | Partial, eight original WAVs in 0.9.4 | Local synthesized library, Source Monitor preview and new audio track insertion. No sound generation from a text prompt or service catalog; host verification pending. |
| 14 | Multicam | Not built | Speaker/camera analysis, reviewable switch plan and multicam timeline workflow. |
| 15 | Project cleanup | Not built | Project scan, file-type classification, dry-run and bin moves with Undo. Folder/project APIs are documented for 25.6; behavior still needs host testing. |
| 16 | Curve editor | Not built | Keyframe read/write is documented since 25.6; editor UI, easing and undoable application are absent. |
| 17 | Your Library | Partial seed only | Built-in original SFX catalog is present; user-folder indexing, search, favorites and external assets are absent. |
| 18 | Auto zoom | Partial | Existing rule-based Smart Zoom samples original frames and changes Scale within nests; not sentence-level Transform keyframes or one-click removal. Shared nests need independent copies. |
| 19 | Platform safe zones | Not built | A panel preview is feasible. A non-exporting overlay aligned exactly over Premiere's Program Monitor has **not** been established through the 25.6 UXP API and must be prototyped before claiming the same behavior. |

## Findings

- **No advertised idea was proven impossible in principle.** Premiere 25.6.2 exposes sequence, media, effect, keyframe, marker and transcript APIs. The specific host workflow for each tool still needs testing.
- **Exact product duplication is unavailable from public materials.** EditFast's private implementation, named asset library, cloud models and catalog/license are not included; original equivalents can be created or integrated with appropriately licensed services.
- **25.6.2 version boundary matters.** Its UXP runtime is v8.1; APIs tagged 26.x must not be used without fallback. Native UXP Hybrid Plugin SDK arrived in Premiere 26.2, so compute-heavy features on 25.6.2 should use the existing external backend or an independently verified older extension route. See https://developer.adobe.com/premiere-pro/uxp/resources/fundamentals/apis/ and https://developer.adobe.com/premiere-pro/uxp/changelog/ .

The next most useful integration is duplicate sequence + direct Smart Cut application, followed by native caption placement. The 0.9.4 Motion and Sound host smoke test is described in README.md.
