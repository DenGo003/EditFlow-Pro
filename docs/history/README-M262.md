# EditFlow Pro UXP — M2.6.2 Color Visibility + Verified Values

This build addresses reports that automatic top-layer setup succeeded but no visible color differences followed.

## What changed
- Creative looks now supply a *nonzero visible base grade* at the current selected intensity, with restrained contrast/saturation/temperature values. This is a deterministic preset plus existing pixel statistics, **not AI-trained skin-tone matching**.
- Includes Lumetri Basic Correction **Saturation** (default 100) as well as Exposure, Contrast and Temperature.
- Better parameter-name discovery, including certain decorated Lumetri labels, and a compact inspect result listing editable values and available labels.
- After Apply, reports each changed parameter's **before -> verified after** numeric values. Does **not** claim an image visibly improved without inspection in Premiere.
- Does not silently overwrite nondefault or animated parameter values. Enable the separately labelled **Re-grade existing non-animated Lumetri values** checkbox only when you intentionally want to replace previous colour settings on the top Adjustment Layer.
- Detects a disabled Adjustment Layer and blocks application with a specific error.
- Keeps M2.6.1 effect selection, reusable Adjustment Layer placement, Smart Zoom timing and strength, caption studio, Sync/Cut/Subtitles and network connection code intact.

## Install & test on a duplicated sequence
1. In Adobe UXP Developer Tools, Unload the previous build. Extract this ZIP to a fresh folder, Add Plugin using `uxp/manifest.json` and Load. This build uses manifest version `1.2.10`.
2. Open **AI Coloring**. Read Active Timeline, select the video track containing the content, choose `Cinematic Editorial` with `100%` for an easy first comparison, then Analyze.
3. On the active sequence, inspect the genuine Adjustment Layer on the highest video track. Ensure the layer clip is enabled, and you have deliberately accepted colour adjustments to titles and graphics beneath it.
4. If M2.6.1 previously wrote Lumetri values on that layer and you *want to overwrite them*, tick **Re-grade existing NON-ANIMATED Lumetri values**. This explicitly replaces only the supported controls, not the whole effect or animated values.
5. Tick the normal safety consent checkbox, then click **Auto-setup layer + Apply grade**.
6. Review the detailed JSON under the Apply button. `applied` must contain a nonempty list of changed controls with `before` and `after` values. If it is empty, read `notes` and click **Inspect highest Adjustment Layer** for available control labels.
7. Compare Program Monitor with Lumetri Color FX toggled on/off in Effect Controls, and confirm Adjustment Layer is at the very top and spans the content.

**Limitations:** Rendered image output and UXP host cannot be integration-tested outside the user's actual Premiere Pro 25.6.2 environment. Grading on highest track impacts titles and graphics. Natural skin preservation is a design goal, not tested skin detection. No automatic skin analysis or calibrated colour matching is claimed. Store backup project before testing.
