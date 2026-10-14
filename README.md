# EditFlow Pro

EditFlow Pro is an experimental Windows CEP extension for Adobe Premiere Pro, with a local Python backend.

## Current development status
- Timeline audio synchronization: tested by the developer on Premiere Pro 2025.
- Timeline Auto Cut: tested by the developer with microphone audio on A2.
- Timeline captions: experimental; requires testing in Premiere.
- Auto Coloring / Auto Zoom: planned, **not implemented**.
- Online auto-update: **not implemented yet**. This repository is being prepared as its distribution source.

## Safety and compatibility
- Test on a duplicated Premiere project.
- Keep the original media files and project backups.
- The CEP host/version range and Python backend must match the version being installed.
- Never commit tokens, local config, media, virtual environments, Whisper models, or generated output.

## Release plan
Releases will contain a reviewed update package and a SHA-256 checksum. The desktop updater will only be enabled after download verification and rollback have been implemented and tested.

This is an initial repository scaffold, **not a published application release**.
