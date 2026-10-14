# Automated GitHub Release publishing

The workflow [Publish EditFlow Pro Update](../.github/workflows/publish-update.yml) is now installed.

## What is automated
- Validates archive layout and version against `plugin/CSXS/manifest.xml`.
- Refuses obviously suspicious paths and large/unknown packages.
- Calculates `EditFlow-Pro-Update.zip.sha256` automatically.
- Creates GitHub Release tagged `v<version>` with both required assets.

## Still required
The exact reviewed ZIP must first be placed at `staging/EditFlow-Pro-Update.zip` on the default branch. ChatGPT's current GitHub connector supports text files, but **cannot upload binary release assets** in this session; this step is not yet automated. Do not claim end-to-end upload is complete.

To run: GitHub > Actions > Publish EditFlow Pro Update > Run workflow, version `0.7.7`. The workflow will fail safely until the staging ZIP exists.

## Privacy
This repository is PUBLIC. Uploading the ZIP to staging also publishes its source contents. Exclude pairing tokens, configuration, recordings, models, personal file paths, and venvs. A private source repository would require creating or connecting one with the appropriate permissions; it has not been created here.

The panel's online updater is a separate feature. The first real one-click install remains to be tested on the developer's Windows machine after a newer release has been published.
