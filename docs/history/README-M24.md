# EditFlow Pro UXP — M2.4 visual tools (test build)

## Preserved

This package is based on the working M2.3 panel. Existing Auto Sync, Auto Cut, AI Subtitles, animated Caption Studio and pinned replay panel are unchanged except for the tiny `visual_ai` registration in the backend client and exporting two existing caption utilities.

## Smart Zoom — UXP/Python

1. Open an active sequence containing your AutoCut nested sequence on V1.
2. Choose **Smart Zoom > Read Active Timeline > V1 > Analyze real video frames**. This uses the existing local Python v0.8.2 `visual_ai` job and FFmpeg.
3. Review suggested changes. Default +2%, 12-second separation, maximum 24 recommended changes per batch.
4. **BACK UP THE PROJECT AND COPY THE UNDERLYING NEST ITSELF** before trying Apply. Merely duplicating the outer sequence does not isolate an inner shared nest.
5. Check the explicit confirmation and click Apply. The UXP integration attempts to modify Motion Scale of each verified internal clip. It protects existing animated Scale, skips unidentified parameters, verifies each action, and reports applied/skipped/failed counts. Results depend on actual Motion component naming and value format in Premiere 25.6.2; no successful timeline application has yet been tested on a real host.

This is intentionally *not* a speech-aware or face-tracked zoom system; it uses sampled video frames to avoid obvious motion and spacing to avoid excessive punch-ins. Do not use on valuable source sequences without a separate nest copy.

## AI Color — existing highest Adjustment Layer

1. On a duplicate sequence, manually create an Adjustment Layer in Premiere and put it on the **highest** video track above all other visual tracks. Apply Lumetri Color to that layer. Leave only that layer on the highest track.
2. In **AI Coloring** choose the video-content track, a look/strength, and click **Analyze real video frames**. This calls the existing Python `visual_ai` job and presents small suggested corrections.
3. Click **Inspect highest Adjustment Layer** if the proposed layer isn't found.
4. Check consent and Apply. Only supported **exposure, contrast and temperature** controls whose values are near zero and not animated are eligible; UXP transaction and value checks are performed. Unsupported/localized controls are reported as skipped, not success.

**Automatic Adjustment Layer creation is still not implemented.** Adobe's native APIs expose a track-item `isAdjustmentLayer()` check, but complete new Adjustment Layer creation was not proven against this specific Premiere version. Because the requested highest-layer workflow also colorizes titles/graphics, the panel explicitly warns about that.

## Testing completed / not completed

- Local JS parsing and Premiere API mock tests: passed.
- Existing M2.3 Caption Studio tests: passed.
- Connection to your running Premiere host and real UXP Motion/Lumetri application: **not possible in this test environment; needs validation on Premiere Pro 25.6.2.**

Installation: UXP Developer Tools → Unload old panel → unpack this ZIP to a new folder → Add Plugin using `uxp/manifest.json` → Load. Keep the CEP version installed for backup. Python v0.8.2 backend and paired connection are required. Test with a duplicate project and independently duplicated nested sequence.
