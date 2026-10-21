# Verification results — EditFlow Pro 0.9.6

## 0.9.6 GitHub Release updater

GitHub's public latest Release endpoint currently returns `v0.8.2` with its legacy `EditFlow-Pro-Update.zip` asset. The updater must skip it by version before inspecting assets. The new default channel uses the public GitHub API; a future compatible Release must have a matching versioned Unified ZIP and `sha256:` digest. The archive and every package member are checked before installation. Local run: **27 Python tests and 17 Node scripts passed**, all UXP JS parsed, and the 0.9.6 ZIP passed full member-hash validation with eight WAV assets. The older `tests/*.test.js` scripts from the 0.8.2 migration exercise superseded client semantics; `npm test` now runs the 17 current `test_*.js` scripts on Windows or CI. Windows Premiere host acceptance remains pending. No new production release was published.

## Previous 0.9.5 results

# Verification results — EditFlow Pro 0.9.5

## 0.9.5 updater

The full local suite passed: **20 Python cases and 17 Node scripts**; all UXP JS files parsed with Node. Updater tests cover feed URL/version checks, authenticated loopback endpoints, the no-new-release response, Downloads selection, full ZIP hash validation, staging, a simulated detached install preserving panel/config backup, and rejection of corrupt or unsafe archive paths without extracting them. Actual Windows `tasklist`, detached worker, Adobe panel reload and the save/close workflow need host acceptance. No update feed is configured by default; an online channel requires a user-controlled stable HTTPS location.

## Prior 0.9.4 verification

## 0.9.4 original assets and motion

Local Linux validation on 2026-10-21: 16 Python unittest cases and 17 Node scripts passed. The new Node Premiere simulation covers native Scale keyframe actions/readback, stale selection and existing animation protection, two transactions, Source Monitor preview, WAV import, audio-track insertion, duplicate import avoidance and transaction refusal. Every UXP JS file passed `node --check`.

The eight actual bundled WAVs were generated from stdlib Python synthesis at 48 kHz mono signed 16-bit PCM; duration and bounded peaks were measured on the actual files. The versioned ZIP was validated against all 104 package manifest hashes, and an isolated installer run confirmed the stable UXP panel includes all eight sounds. Source provenance is in `docs/SFX-PROVENANCE.md`. Premiere 25.6.2 was unavailable here: these are not host tests of the new tools. The single host acceptance flow is in README.

## Prior 0.9.3 verification

Executed in the development Linux environment on 2026-10-21. Test interpreter Python 3.12; installed Windows environment remains the user's existing Python 3.11. Host target is Premiere 25.6.2. Earlier 0.9.2 output is retained in test-log.txt; the 0.9.3 commands and counts are recorded below.

- **16 Python unittest cases passed**, plus imported HTML structural assertions for the pinned Caption Studio layout.
- **16 Node test scripts passed**. These cover mock UXP operations and DOM behavior, not a live Adobe host.
- All UXP JavaScript files parsed with Node --check; backend/scripts/renderer compiled with Python compileall.
- **Real local HTTP**: authenticated health returned 0.9.3; unauthenticated request returned 401; persistent pairing retained; no token in health response.
- **Real local FFmpeg media**: generated a four-second camera clip and independent microphone WAV with an internal silence. Ran source-frame measurements, detected microphone silence, exported an XML with shortened duration, verified video source SHA256 unchanged. This is not Premiere XML-import verification.
- **Actual isolated filesystem migration**: installed into temporary directories, retained runtime/token, backed up previous panel/config, rejected tampered checksum, and restored original panel/config after an injected config-commit failure. Windows tasklist/PowerShell/cmd wrappers were not executed here.
- **Color simulations**: Basic Correction selection despite repeated Creative labels, effect match-name selection, duplicate-effect avoidance, unknown-variant refusal, disabled-layer refusal, existing value and animation protection, Re-grade, identical-value no-op, refreshed readback, silent failure/rejected transaction and stale sequence. Even small existing values require Re-grade.
- **Diagnostic simulations**: export data can be collected while backend is offline; host version retained; token/Bearer and local Windows path redaction verified. Actual UXP file-save dialog remains host-dependent.
- **Arabic Caption Studio**: SRT parse/group, ASS animation/escaping and validation unit tests passed. No new full overlay render or Whisper model inference was run in this release.

Three older mock component factories returned the display label as matchName; updated fixtures to return an exact supported identifier consistent with strict verification. One old test intentionally accepted a single unknown Lumetri variant; changed expected behavior to refusal. No production fallback was added simply to satisfy mocks.

## Not verified here

Real Windows install/launch, Adobe UXP load and permissions, live Lumetri values, actual frame difference or visual quality, true caption-track insertion, nested Smart Zoom host mutation, XML import in Premiere, full transcription quality, and rollback cmd execution. These remain distinct from passing local tests.

**Release acceptance: PENDING** the single FX on/off comparison described in README. Do not label the project production-ready or all 19 feature-complete.

## 0.9.2 targeted launcher regression tests

Five added tests cover simulated network timeouts with a real free/busy socket, disabled proxy configuration, authenticated matching-version reuse, rejection of HTTP authentication failures without another launch, and persisted startup status. The user-reported generic error path is replaced; Windows host execution remains unverified here.

0.9.2 added eight-control HDR-style Pop tests: correct Basic-only writes/readback, scaling, nondefault/animated protection and Re-grade. Final suite: 16 Python cases and 15 Node scripts. User confirmed 0.9.1 visible color changes; the stronger 0.9.2 look has not been visually tested in Premiere here.

## 0.9.3 transcript search and markers

The new Node script checks Arabic normalization, short-phrase matches at Whisper word times, external SRT cue timing, playhead movement, one undoable marker transaction, duplicate suppression, stale sequence refusal, out-of-range SRT refusal and rejected transaction handling. Premiere APIs used are documented since 25.6, but **real Premiere marker creation and playhead movement remain unverified**. The backend now returns the word index from the already-produced local transcript alongside SRT text; it does not run a second transcription.

The structural HTML test now uses Python's standard library HTMLParser instead of an unavailable optional BeautifulSoup dependency. Existing installer tests use deliberately pinned 0.9.2 fixtures to exercise migration/rollback; the live health test checks 0.9.3. No Windows installation or Premiere host was available in this environment.
