# Next milestones after 0.9.6 host acceptance

The update button now discovers this repository’s GitHub Releases automatically and also accepts a newer ZIP in Downloads. Windows Premiere host validation is still pending. Production publishing is gated on `release.json` host acceptance; a publisher signature should precede broad distribution.

1. **Next — duplicate-sequence workflow first.** Save exact project/sequence identities; duplicate the active sequence with APIs documented for 25.6.2 or a narrowly scoped, verified legacy bridge. Assert a different GUID before mutations. Shared nests require deep copy/remapping, not just outer duplication. First reduce manual XML import with import-and-identify verification; do not call a regenerated XML sequence a complete duplicate. Then implement frame-aligned removal on the duplicate, preserving microphone alignment, links, gaps and unrelated tracks, with undo/rollback and stale-snapshot guards. Reject unsupported retiming/transitions rather than damaging them.
2. **Captions on that same duplicate.** Reuse generated SRT without another file picker; align against the duplicate's kept ranges; use native caption insertion only if confirmed on 25.6.2. Otherwise keep explicit project-import/manual-placement status or offer transparent overlay with clear editable-text limitations. Verify first/middle/last cue times automatically where API permits.
3. **Motion and libraries.** Six original native Scale presets and eight generated WAVs landed in 0.9.4, pending host acceptance. Expand to Position/easing and preview, user-folder search/favorites and optional approved contextual placement. Extend Smart Zoom to independent source copies and real keyframe motion.
   Extend Search & Markers with proposed YouTube chapters and music beat markers only after timing and host verification; current 0.9.4 supports spoken-word search and native Comment markers.
4. **Tracking, Multicam, audio.** Actual tracked subject confidence and loss handling; camera-switch decisions with explicit timeline preview; loudness/ducking and dialogue cleanup with reversible output. Each has media fixtures and host acceptance gates.
5. **Full AI editor.** Structured, reviewable edit plans with shot selection, transcript alignment and undoable application. A successful job is never proof of a successful timeline edit.

## Smarter coloring plan

- Detect scene boundaries and sample multiple frames per scene, account explicitly for Rec.709 vs HDR/log and any unavailable metadata. Reject unsupported transforms instead of guessing.
- Show scene thumbnails, proposed numeric values, confidence/reasons and a before/after preview. FFmpeg previews must be labelled approximate unless they reproduce Premiere's color pipeline; final truth is Lumetri FX in Premiere.
- Retain current rules as an explicitly named baseline. Add a trained model only with model name/version/license, runtime requirements, downloadable weights/hash, benchmark cases and clear disclosure of local vs remote processing. Skin preservation is a measured target, not a current feature.
- Apply per-scene approved corrections on duplicate tracks/layers, with reset/compare and Re-grade consent. Never replace existing animation or manual controls silently.

The exact externally advertised 19 EditFast features were not supplied in these archives. Keep a future evidence-based parity checklist; do not invent a 19-item completion claim. All assets and implementation remain independent.
