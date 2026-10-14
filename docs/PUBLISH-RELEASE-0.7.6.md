# Publishing EditFlow Pro 0.7.6

The user-facing updater in EditFlow Pro checks:
`https://api.github.com/repos/DenGo003/EditFlow-Pro/releases/latest`

The **stable release** must be tagged `v0.7.6` and contain exactly these assets:

- `EditFlow-Pro-Update.zip` — reviewed program update (root contains `plugin/`, `backend/`, `scripts/`)
- `EditFlow-Pro-Update.zip.sha256` — lowercase SHA-256 for the exact ZIP

For the build prepared 2026-10-14, the ZIP SHA-256 is:

`2a2ab1c902056f773be000ff67c7dd20ea224ae3f903488a63804d2e6eb91dbc`

Use [New release](https://github.com/DenGo003/EditFlow-Pro/releases/new), choose tag `v0.7.6`, attach both generated files, and publish as a normal release (not a prerelease).

**IMPORTANT:** this README is not a release, and does not activate auto-update. Use only archives from trusted reviewed builds; don't add local tokens/configs/media/venvs. The current updater verifies the checksum from the same GitHub release; it does not cryptographically authenticate the publisher beyond GitHub HTTPS and repository ownership. Review source and assets before publishing.

Initial bootstrap: install the `EditFlow-Pro-CEP-0.7.6-Online-Updater.zip` package once using `Update-EditFlow.ps1`. Subsequent releases with correct names can be installed via the panel's Connection > Online Updates > Download & Install Update button; it waits until Premiere is closed.
