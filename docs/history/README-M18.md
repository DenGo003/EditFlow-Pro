# EditFlow Pro UXP M1.8 — Separate Microphone AutoCut

Fixes M1.7 incorrectly requiring the camera video and the silence-reference microphone to be the SAME file. M1.8 calls the existing Python backend `timeline_cut` operation that explicitly uses a DIFFERENT microphone source, unlike the older `analyze` operation.

## Workflow
1. In Premiere open a working sequence with one original video clip V1 and one separate microphone clip A2, already synced from 00:00 (not a nested AutoCut result).
2. Read Active Timeline under Auto Cut; pick video V1 and microphone A2.
3. Click **Analyze microphone & create AutoCut XML**. The backend analyzes A2 and generates XML with V1 video + microphone sound synced and silence-trimmed.
4. Read XML path from results; File > Import in Premiere, then review generated sequence before use.

## Safety and limitations
- Existing Python Backend v0.8.2 required; it supports `timeline_cut`.
- This is **not** direct timeline editing and **not** automatic import. It generates a new XML non-destructively.
- One direct-source clip on each selected track, both starting at 00:00, same source/timeline playback duration, unretimed/unreversed, with microphone covering video.
- The system respects source in-points and won't proceed if clip timing isn't verifiable. Existing nested/multi-clip timelines still require CEP or a later milestone.
- XML generation success must not be confused with a successfully imported Premiere sequence.
- Network permission remains `domains: all` for local development and needs narrowing when compatible with Premiere 25.6.2.

M1.8.1 hotfix: UXP BackendClient job allowlist now includes timeline_cut. Earlier M1.8 rejected this kind on the client before contacting Python. Existing backend 0.8.2 supports timeline_cut.
