# EditFlow Pro UXP migration — development milestone 1

Target: Windows 10, Premiere 25.6.2, existing Python 3.11 / 0.8.2 installation.
Status: first implementation, not production 1.0. No Premiere integration test has run in this Linux environment.

## Repository investigation

Starting commit: e29cbcb. Main contained documentation, incremental patches and a staged-ZIP release workflow, not the full application source. The v0.8.2 release ZIP was downloaded and matched its published SHA-256 (see BASELINE-0.8.2.json). Its six backend modules are restored byte-for-byte under backend/. CEP source is preserved under legacy/cep/. The sync-after-cut helper retains its expected scripts/ path. No 0.8.3/0.8.4 preview was used.

The archive is an incremental update, not a fresh installer. Its setup script references a missing requirements-win-py311.lock, launchers and other files. Those must be recovered from the complete installed distribution before building a fresh Windows installer. Do not invent dependency pins or replace the working venv.

## Implemented now

- Distinct UXP plugin ID, alongside CEP; fixed authenticated loopback connection to the existing server.
- Health validation, explicit failures, request timeout, no automatic retries of job submissions.
- Real source-file silence analysis, Arabic transcription and audio sync requests using existing APIs. These create analysis/output jobs, not timeline edits.
- Job polling, cancellation request, resume monitoring by ID and honest indeterminate progress when the backend supplies no counts.
- Read-only active project, sequence, video track index/name/clip count and audio track count inspection.
- Pairing secret only in memory; no token changes, saved credentials or source media uploads.

Backend source is unchanged, but reusing code does not prove every feature is regression-free. Existing snapshot shapes still require UXP adapters for timeline functions. visual_ai.py is a coarse frame heuristic; it is not the requested speech-aware zoom system or calibrated skin-aware color engine. Do not enable it as a production AI grader.

## API feasibility (official docs reviewed 2026-10-17)

Current docs include post-25.6 additions. Only members explicitly marked Since 25.6 are candidates; runtime tests on 25.6.2 are still required.

| Capability | Documented candidates | Decision / remaining gate |
|---|---|---|
| Project and track reads | Project.getActiveProject/getActiveSequence; Sequence.getVideoTrackCount/getVideoTrack; VideoTrack.getIndex/getTrackItems | Implemented read-only; host smoke pending |
| Detect nests | ClipProjectItem.isSequence/getSequence | M2: recursive traversal, cycles, shared instances, source in/out and speed validation |
| Undoable edits | Project.executeTransaction; SequenceEditor insert/overwrite/remove actions | M3: duplicate sequence, reviewed plan, post-read verification and undo test |
| Independent sequences | Sequence.createCloneAction | Must verify clone isolation and relinking shared nests; clone alone is not proof |
| Scale/keyframes | ComponentParam.isTimeVarying/getKeyframeListAsTickTimes/createSetValueAction/createAddKeyframeAction | M4: discover Motion/Scale reliably; preserve existing animation; reject unsupported cases |
| Effect insertion | VideoComponentChain.createAppendComponentAction/createInsertComponentAction | Documented since 25.6; installed Lumetri identity/parameter units and behavior still unverified |
| Top track insertion | SequenceEditor.createInsertProjectItemAction documents track creation with out-of-range index | Verify exact index semantics and ripple behavior in disposable project; do not assume a harmless insert |
| Real Adjustment Layer creation | No direct constructor identified in reviewed Project/ClipProjectItem/SequenceEditor pages | Block automatic creation. Test existing user-created genuine layer first, then imported project template. Transparent media is not a substitute |
| Captions | Existing SRT generation; Project.importFiles | File import does not establish caption-track creation. Test actual SRT import result separately |
| Installation | Adobe documents CCX packaging and Creative Cloud Desktop installation | UDT for dev; never copy CEP install logic onto UXP. One-click self-update not established |

Sources:
- https://developer.adobe.com/premiere-pro/uxp/plugins/
- https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/project
- https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/sequence
- https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/videotrack
- https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/clipprojectitem
- https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/sequenceeditor
- https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/componentparam
- https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/videocomponentchain
- https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/package/

## Prioritized next milestones

1. **M1 host acceptance:** load this panel on 25.6.2; connect existing backend; verify read-only track inspection and one source job. No timeline mutation.
2. **M2 timeline snapshot:** map nests using rational/tick arithmetic; test 200+ segments, repeated sources, shared nests and nonzero in-points. Initially reject time remapping, reverse playback and ambiguous media. Reuse timeline_cut and timeline_caption only after adapter contract tests. Cache identity must include source metadata, trim, channel layout, speed and settings.
3. **M3 sync/cuts/captions:** preview a plan bound to sequence ID and snapshot fingerprint; explicit apply confirmation; transaction on a duplicate; read-back verification, undo and zero-change failure. Test offline media and caption track placement. Add transcript review/save support for sequence-caption jobs (existing save endpoint only accepts transcribe jobs).
4. **M4 zoom:** transcript/acoustic candidate selection with reasons and confidence, minimum spacing, most clips untouched; optional reliable face bounds; four requested profiles. Never overwrite existing scale animation. Study and actually view human references before recording citations/timecodes. No footage analysis has been performed yet.
5. **M5 color:** validate genuine adjustment-layer/template path before offering automatic grading. Technical correction precedes creative look; bounded intensity and before/after. Color Everything requires explicit selection; Protect Graphics stays unavailable until isolation and compositing tests pass. Never pretend that an above-all-tracks layer protects overlays.
6. **M6 delivery:** recover full runtime distribution and dependency lock; build from reviewed source; verified manifest/checksums and Windows launcher; preserve config/token/model/output directories; stage backup, wait for Premiere closure, install, post-verify versions, then mark success. Failure restores backup. CCX installation goes through supported Adobe mechanism; do not promise silent self-updating. Only enable production release after host acceptance gates.

CPU Whisper remains the baseline. GTX 1060 GPU use requires actual driver, CUDA/cuDNN/CTranslate2 compatibility measurements; none were made here. Full word-timestamp reliability and transcription performance are unverified.

## Run locally

Existing backend: use the user's current Start Backend launcher and existing model/runtime. Do not run a second service on 8765. No fresh setup script is supplied because the release ZIP lacks its dependency lock.

Tests: `npm test` and `python -m unittest tests.test_baseline -v` (Python needs numpy; FFmpeg/FFprobe for media integration). CI installs its own test-only numpy dependency, not a production runtime.

## Windows / Premiere acceptance checklist (pending)

1. Enable Premiere Settings > Plugins > developer mode, restart once. Use Adobe UXP Developer Tool (2.2.1 or compatible newer version), add uxp/manifest.json, Load & Watch. Open Window > UXP Plugins > EditFlow Pro Preview.
2. Start existing backend, paste current token, Connect. Verify exact version and FFmpeg/model flags. Wrong token must fail. Backend-off must time out. If host networking fails, record the UDT error and actual Origin before changing the server's narrow origin policy.
3. Open a disposable project with multiple video tracks and a nest. Inspect; compare reported counts/indexes against Premiere. Project dirty state must not change. No-project/no-sequence must display a clear result.
4. Analyze a short known local video with silence. Compare ranges to its waveform. Run Arabic transcription only with the model installed; inspect generated SRT. Sync known offset sources. No current timeline should change.
5. Run a long job, request cancellation, wait for cancelled state (acknowledgement alone is not completion). Close/reopen panel, resume by job ID. Restart backend: stale jobs must fail clearly.
6. Resize/scroll panel, verify progress footer stays visible. Verify CEP still opens and works. Record Premiere/UDT versions, screenshots and exact failures.

Host results: NOT RUN. Nested edits, Lumetri, adjustment layer behavior, GPU inference, installer, rollback and real Whisper transcription: NOT VERIFIED. Unit tests with fake Premiere objects are adapter tests, not host integration tests.

## Milestone 1.1: Start & Connect

The original user screenshot confirms the M1 UXP panel loaded in Premiere 25.6.2. Backend authentication and timeline read results from that host are still pending.

Version 1.0.1 adds Start & Connect. Once only, select the existing `%LOCALAPPDATA%\EditFlowPro` folder via Adobe's folder picker (paste that path into the picker address bar). It must contain the existing `cep-launcher.json`. The panel stores a UXP persistent folder-access token, not the backend secret. On each click, it reads `pairing-token.txt` and checks authenticated health. If unavailable, it asks Adobe to open the bundled Windows CMD launcher, then re-reads the token and polls health. Approve Adobe's external-process prompt when shown. No clipboard operations or public token endpoint are used. Change pairing folder forgets the saved access reference.

The launcher reuses backendRoot/backendPython/workRoot from the existing installation config, keeps models and user data in the existing LocalAppData location, and preserves the token. It refuses to start a duplicate backend if TCP 8765 is occupied. An occupied port is not treated as authentication success. Missing config, Python or work drive stops with an error in the launcher window. This requires the existing installed backend; it is not a fresh installer.

Update procedure: replace your development panel folder with this source preview, then UDT Unload and Load (manifest permissions changed; Watch alone is insufficient). Click Start & Connect and select the folder once. Keep the backend window open. Manual pairing remains available.

Additional tests cover existing-backend reuse, token refresh, delayed token creation, denied launch, invalid pairing file and startup without authenticated health. The Windows CMD launcher and actual UXP file/shell permissions are NOT executable in the Linux test environment; their host acceptance remains pending. If Adobe rejects CMD launch, retain manual backend startup while collecting the precise error; do not bypass Adobe permissions.

Official references:
- https://developer.adobe.com/premiere-pro/uxp/resources/recipes/external-process/
- https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-js/modules/uxp/persistent-file-storage/file-system-provider
