# Online update design (not implemented)

Target source: GitHub Releases of `DenGo003/EditFlow-Pro`.

## Publishing requirements
1. Build an update archive from reviewed source files only; exclude Python virtualenvs, local configuration, pairing tokens, Whisper models, and media.
2. Publish the archive as a GitHub Release asset, **not** as a repository source file.
3. Publish a SHA-256 checksum for the exact archive.
4. Provide version, compatibility and upgrade instructions.

## Client-side requirements
1. Check GitHub releases/latest over HTTPS.
2. Compare semantic versions, verify compatible host and backend requirements.
3. Download archive to a temporary path, validate expected filenames and SHA-256.
4. Back up the CEP panel and backend program files.
5. Stop the old backend and update program code only; keep existing Python environment and user configuration.
6. Restore previous files if any step fails.
7. Ask for a Premiere restart when plugin host code or manifest changes.

No auto-update button is connected to this release source yet. Do not treat a tag, archive or this document as a working updater.
