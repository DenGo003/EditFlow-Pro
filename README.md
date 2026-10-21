# EditFlow Pro 0.9.6 — GitHub Release updates

Target and required acceptance host: **Windows + Premiere Pro 25.6.2**. UXP package version: **1.3.6**. Backend release: **0.9.6**.

This source incorporates the 0.9.5 one-button updater and connects it to the existing `DenGo003/EditFlow-Pro` GitHub Releases. Windows/Premiere acceptance of this update path remains pending; this is not all 19 EditFast functions.

## زر التحديث في 0.9.6

ثبّت **0.9.6 بالطريقة المعتادة مرة واحدة** بعد اختبارها على نسخة من المشروع. بعد كده افتح **Update → Check & install newest release**. الزر يفحص GitHub Releases تلقائيًا، ويقارن الإصدار الحالي، وينزّل حزمة `EditFlow-Pro-X.Y.Z-Unified.zip` المنشورة بــSHA256. لو معاك الحزمة في **Downloads** هيشوفها برضه؛ مفيش حاجة تكتبها في خانة الرابط. بعد التجهيز احفظ المشروع واقفل Premiere، والتثبيت يكمل تلقائيًا. افتحه تاني وراجع **View update status**. لو manifest اتغيّر، اعمل Unload ثم Load من UXP Developer Tools بنفس مسار `current\uxp\manifest.json`.

آخر إصدار منشور حاليًا `v0.8.2` وبنظام الحزم القديم؛ الزر يتجاهله لأنه أقدم من 0.9.6. عشان التنزيل من GitHub يشتغل فعليًا لازم إصدار أحدث موحّد ومراجع يحتوي ZIP باسم مطابق وSHA256 صادر من GitHub. نشر إصدار إنتاجي متوقف لحد قبول Windows وPremiere 25.6.2. الـPR الحالي مسودة للمراجعة فقط.

الرابط الاختياري في الواجهة مخصص لــHTTPS JSON feed آخر تتحكم فيه. سيبه فارغًا لاستخدام GitHub Releases. SHA256 يكشف التلف ومطابقة مصدر metadata، وليس توقيع ناشر مستقل. الزر ما بيقفلش Premiere بالقوة، ولا يبدّل ملفاته وهو مفتوح. الموديل والمخرجات ومفتاح الربط والنسخة السابقة محفوظين. لم يُختبر الإغلاق والتحديث الحقيقيان على Windows في هذه البيئة.

## جديد في 0.9.4

- **Motion Presets:** اختَر كليب فيديو واحد مباشر على التايملاين، ثم Motion Presets → اختَر حركة وقوة → Preview selected clip لمراجعة قيم وتوقيتات الـScale → Apply native Scale keyframes. ست حركات أصلية: Soft Push وPull Back وPunch & Settle وBeat Pop وDouble Tap وQuiet Hold. الحركة تتحط كـkeyframes أصلية قابلة للتعديل في Effect Controls. الأنيميشن الموجود على Scale، الـnest، والسرعة المتغيرة محميين. التطبيق يستخدم عمليتي Undo في Premiere: تفعيل animation ثم إضافة keyframes.
- **Sound Library:** ٨ أصوات WAV أصلية، بدون حساب أو خدمة خارجية. اختَر الصوت واضغط Preview في Source Monitor، أو Add at playhead عشان يستورد الصوت للمشروع ويحطه على تراك صوت جديد عند المؤشر. الملفات في `uxp/assets/sfx/`، وطريقة صنعها موثقة في `docs/SFX-PROVENANCE.md`.
- جرب على نسخة من السيكوانس: كليب واحد لحركة Soft Push، ثم Deep Hit عند المؤشر. افحص Scale في Effect Controls والصوت على تراك A جديد. لو ظهر خطأ، افتح Settings / Jobs → Export diagnostic report. هذه تجربة قبول واحدة للوظيفتين الجديدتين؛ الاختبارات المحلية لا تشغل Premiere نفسه.

## التثبيت على جهازك الحالي

1. احفظ المشروع، اقفل Premiere ونافذة الـbackend، واعمل Unload للبلجن القديم في UXP Developer Tools.
2. فك الحزمة وشغّل **Install-Update.cmd**. يعيد استخدام Python وFFmpeg والموديل الموجودين، ويحافظ على المخرجات ومفتاح الربط. لا تنقل أو تمسح مجلد تثبيت Python القديم؛ البيئة تظل داخله.
3. افتح Premiere 25.6.2. في UXP Developer Tools اختَر Add Plugin بالمسار التالي مرة واحدة، ثم Load:
   `%LOCALAPPDATA%\EditFlowPro\current\uxp\manifest.json`
4. من الواجهة اضغط **Start & Connect**. لو طُلب مجلد الربط، اختَر `%LOCALAPPDATA%\EditFlowPro` مرة واحدة.

المرات التالية تستخدم نفس مسار UXP. المصدر المثبت تحت `releases\0.9.6`؛ `current\uxp` نسخة تحميل مولدة منه، وليست مصدر تطوير ثانٍ. زر التحديث الجديد يتعامل مع الإصدارات اللاحقة بعد تثبيت 0.9.6.

## Search & Markers — new in 0.9.3

- Generate SRT from the active sequence in AI Subtitles. Search & Markers automatically receives the generated transcript with Whisper word timings. Search Arabic or English words and short phrases; **Go** moves the playhead to the matching word. The transcript is bound to the project and sequence IDs recorded before transcription starts.
- Or choose an existing **SRT aligned to the active sequence**. Search and Go then use the start of each caption cue, not exact word timing. The plugin cannot prove an external SRT matches your edit; compare its timing with the timeline first.
- **Mark** adds one native sequence Comment marker. **Add markers for all matches** adds up to 50 in one undoable Premiere transaction, skips existing EditFlow search markers at the same times and reads them back. More than 50 matches require a narrower search. Changing the active project or sequence blocks Go/Mark until the transcript is loaded again.
- The UI and marker transaction have local mocked tests. A real Premiere 25.6.2 host test remains required: on a copy of a sequence, generate subtitles or choose its SRT, search a distinctive word, Go, Mark, verify the playhead/marker, then Undo. Export one diagnostic JSON if a host action fails. No music beat detection or automatic YouTube chapter generation is claimed in this release.

Requires an existing `cep-launcher.json` installation. The two supplied archives omitted the original dependency lock, FFmpeg binaries, Python environment and model weights. These are deliberately reused, not fabricated or bundled. New-machine installation is outside this migration release. `scripts/setup.py` now explains this rather than failing on missing files.

## قبول التلوين بصريًا

على **نسخة من السيكوانس** التي بها Adjustment Layer حقيقي في أعلى تراك:

- AI Coloring → Read Active Timeline → اختَر تراك الفيديو المحتوى → Cinematic Editorial، 100% → Analyze.
- وافق على التعديل. اترك Re-grade مقفولًا لحماية القيم الحالية؛ فعّله فقط لو تختار استبدال قيم التلوين السابقة على نسخة الاختبار.
- اضغط Auto-setup layer + Apply grade. ثبّت المؤشر على كادر من منتصف الفيديو، وشغّل/أوقف **Lumetri FX لنفس Adjustment Layer** من Effect Controls.

المتوقع: `applied` يحتوي قيم `before/after` مقروءة فعلًا ومتوافقة مع القيم المطلوبة، مع فرق بصري في نفس الكادر عند تبديل FX. المطابقة الرقمية وحدها لا تكفي لقبول التلوين. لا يوجد عدد ثابت مضمون للتغييرات؛ القيم المطابقة مسبقًا تظهر `already` والقيم المحمية أو غير المدعومة لها سبب.

لو حصل خطأ أو مفيش فرق: **Settings / Jobs → Export diagnostic report**، احفظ وأرسل ملف JSON فقط. التقرير يعمل حتى عند تعذر الاتصال بالـbackend، ويتضمن إصدار المضيف، نتيجة التطبيق، آخر الرسائل، وفحص Lumetri الحالي. لا يحتاج سكرينات كثيرة. الفحص هنا لا يستطيع إثبات حالة FX البصرية أو دقة الألوان في Program Monitor.

If the project has no genuine Adjustment Layer at all, create one once with File > New > Adjustment Layer and name the project-bin item `EditFlow - AI Color Template`. This is an existing API limitation; the plugin reuses a verified donor, not a fabricated transparent clip.

## 0.9.2 launcher hotfix

The supplied diagnostic confirmed UXP loaded in Premiere 25.6.2 and correctly read Basic Correction, but the backend was unreachable. The launcher then emitted its generic error for a network failure outside two whitelisted errno values. The exact underlying Windows network cause was not captured; this is not proof of a proxy or firewall issue.

This hotfix disables proxies for the Python loopback health request and replaces errno assumptions with an exclusive local port bind probe. If the port can be reserved, start the backend; if it cannot, report the OS error without starting or killing another process. The server still performs its own bind to handle races safely. Startup status and backend stdout/stderr are now included in Export diagnostic report when the saved pairing-folder permission is available.

Install 0.9.6 using the same Install-Update.cmd after closing Premiere/backend. Reload the stable UXP manifest, then Start & Connect. Expected health version: 0.9.6. Later releases can use the Update button. If not connected, send the new diagnostic JSON; no additional color test is needed until connected.

## HDR-style Pop added in 0.9.2

User confirmed 0.9.1 coloring is visible but too subtle. The new **HDR-style Pop · SDR** preset uses eight Basic Correction controls. Choose this look and 100%, Analyze, explicitly tick Re-grade if replacing the previous grade, then Apply. Re-grade remains opt-in.

At full strength: Contrast 34 plus bounded analysis offset; Saturation 118; Highlights -32; Shadows +24; Whites +10; Blacks -14. Exposure and Temperature remain bounded analysis values. This is a creative rule-based SDR look, not genuine HDR output, a trained model, recovered camera detail or guaranteed skin-tone improvement. Lower strength if excessive on the source footage. Every supported control is read back after writing.

Legacy looks remain unchanged and request only their original four controls. Switching back does not silently reset Highlights/Shadows/Whites/Blacks; Undo the HDR changes or reset those four manually if required.

## Changes

- Single versioned application source and stable UXP loading path; checksum validation, previous config/panel backup, rollback on installation failure. Old source/Python environment is retained.
- Shared configured backend/Caption Studio launcher; removed hard-coded `G:` from Caption Studio. Authenticated health avoids starting a second known service. A different backend version is blocked before analysis jobs.
- Legacy CEP online updater disabled **in this package** to prevent it replacing only half of the unified release. Already installed legacy CEP remains untouched; do not use its old updater with this release.
- Diagnostic report button with secret redaction; includes offline failures and actual host version. Local Windows paths in messages are removed; report still contains technical parameter labels and some sequence names—no media bytes or transcript export.
- Color selection refuses unknown filter identifiers, selects Basic Correction before other sections, refuses ambiguous controls and known Creative-qualified alternatives. Existing values require Re-grade; animated values always protected.
- Reacquires component/parameter wrappers before each write and reads back from freshly inspected controls after transactions. Per-control outcomes include requested/before/after, attempted write, state and reason. Silent rejection does not become success.
- Visual acceptance remains explicitly pending; removed old misleading “Verified visible color grade” header.

## Current functionality

| Area | Actual behavior in this UXP release | Remaining/manual or unverified |
|---|---|---|
| Auto Sync | Local waveform correlation; offset preview | UXP does not move clips; source-trim/timeline placement is not resolved in its preview. Legacy CEP contains placement code, not newly verified here |
| Separate-mic Auto Cut | Actual FFmpeg silence detection on selected mic, produces new XML | Manual XML import; one aligned direct camera clip and one mic clip at zero, not arbitrary multitrack edits; other effects/tracks are not cloned |
| Arabic subtitles | faster-whisper small model pipeline on flattened timeline audio, including supported nests | Model inference not rerun here; SRT can import to Project Panel, native timeline placement remains manual |
| Caption Studio | 24 previews, Arabic SRT/ASS conversion, transparent MOV renderer, attempted verified overlay insertion | Select original SRT; word subdivisions are estimated; MOV is not editable native text. Host insertion not tested here |
| Smart Zoom | Rule-based frame statistics and optional SRT emphasis; protected Scale writes inside nests | Simulated host tests only; shared inner nests need independent copies |
| AI Coloring | Rule-based source-frame statistics + preset values; explicit apply/readback | Host and visual result pending; not skin detection, scene-aware AI, HDR/log color management or a learned grade model |
| Search & Markers | Generated word-timed transcript or chosen SRT, search/jump, native sequence Comment markers with one-step Undo and readback | Premiere 25.6.2 host acceptance pending; external SRT alignment must be checked; beat markers and chapters not included |
| Motion Presets | Six original native Motion Scale keyframe recipes, exact numeric preview, selection guard and readback | Premiere 25.6.2 host acceptance pending; no Position motion/easing gallery or existing animated Scale replacement |
| Sound Library | Eight original local WAVs; Source Monitor preview and verified new audio track insertion | Premiere 25.6.2 host acceptance pending; no automatic contextual SFX or generative sound service |
| One-button Update | Checks GitHub Releases by default and a newer ZIP in Downloads, validates files, waits for Premiere to close, migrates with backup | 0.9.6 first install is manual; publishing a newer unified release requires Windows host acceptance |

Read `docs/AUDIT.md`, `docs/TEST-RESULTS.md`, `docs/ROADMAP.md`, and `HANDOFF-SOL.md` for next steps and boundaries. Historical READMEs are retained under `docs/history`; they are provenance, not current installation instructions.

## Rollback

Close Premiere and backend. Run `Rollback.cmd` from this extracted package to restore the latest backed-up config and panel. On the first migration there may be no previous `current\uxp`; load your former M2.6.5 manifest from its old folder. Python, models, token, outputs and the former source folder were never deleted.

## Developer verification

Use Python with numpy; Node.js; FFmpeg/FFprobe for media smoke tests. The panel structure test uses Python's standard library HTML parser.

```
python -m unittest discover -s tests -p "test_*.py" -v
node tests/test_release_090.js
```

Run every `tests/*.js` file individually; these are Node simulations, not Premiere. Run `python scripts/build_release.py` to refresh the package manifest and zip after source changes. Do not include tokens, local config, .venv, model weights, logs, or user media in packages.
