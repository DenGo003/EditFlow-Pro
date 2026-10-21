# EditFlow original sound pack

Eight WAV files under `uxp/assets/sfx/` are synthesized entirely by `scripts/generate_sfx.py`. They use elementary oscillators, pseudorandom noise with a fixed seed, envelopes and a fade. No third-party sound recording, EditFast catalog item or downloaded model is included. Regenerate them with `python scripts/generate_sfx.py` and rebuild the release manifest afterward.

| File | Design | Duration |
|---|---|---:|
| air-sweep.wav | Air transition | 0.56 s |
| deep-hit.wav | Low sports impact | 0.72 s |
| bright-pop.wav | Short social accent | 0.25 s |
| soft-click.wav | Light interface click | 0.15 s |
| rise.wav | Rising transition | 1.25 s |
| bass-pulse.wav | Bass accent | 0.45 s |
| signal-tone.wav | Two-part cue | 0.52 s |
| shutter.wav | Synthetic camera shutter | 0.32 s |

All files are mono, 48 kHz, signed 16-bit PCM with a bounded peak. The user may use these generated sounds in their own edits. They are intentionally a small starter library and are not contextual AI generation or automatic sound placement.
