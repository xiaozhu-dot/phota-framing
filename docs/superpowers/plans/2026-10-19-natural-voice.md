# Natural speech implementation plan

**Goal:** Replace the pitched-up system voice with switchable clean young female/male cloud speech while retaining a usable system fallback. The user approved network speech and possible service charges.

**Architecture:** A small speech controller owns queueing, cancellation, native fallback and speaking callbacks. A separate cloud module uses only Qianwen AI Platform (`maas.qianwenaiapi.com`). The user excludes Alibaba Model Studio, prefers value for money, and requests one clean young female voice and one clean young male voice. Default: Qwen-Audio-3.0-TTS-Plus, with the documented 25-year-old female `longanlingxin` and male `longanlufeng` (CNY 1.4/10,000 characters, compatible with Token Plan). Both voices were synthesized successfully using the existing local credential. Qwen3-TTS-Flash (0.8) remains optional, with matching Cherry/Ethan voices; its real request returned HTTP 400 for this account, so it is not the default. Flash 3.0 was considered but its primary Chinese system list does not offer a matching young male voice. Existing keys are reused only from a Qianwen preset whose saved URL is on the official Qianwen API host. An explicit separate Qianwen voice key is supported. Cloud playback uses a returned HTTPS audio URL with a bounded, expiring in-memory cache.

**Documentation:** https://platform.qianwenai.com/docs/api-reference/speech-synthesis/qwen-audio-tts/http-api and https://platform.qianwenai.com/docs/developer-guides/speech/voice-list/qwen-audio-tts and https://platform.qianwenai.com/docs/developer-guides/getting-started/model-prices (checked 2026-10-19).

- [x] Add regression tests for stable native voice identity, text preparation, cloud request contract, cancellation during preparation/playback, fallback, queue continuation and cache invalidation.
- [x] Implement `mobile/src/speech-text.js`, `cloud-voice.js` and `speech-controller.js`; keep `voice.js` as the Capacitor adapter. Preserve input semantics and parameter values, remove presentation markup, and bound synthesis chunks at sentence boundaries.
- [x] Add cloud/system selection, matching model/voice selection, rate, optional separate Qianwen key, actual shooting-text preview, stop button and readable playback/fallback/error feedback to settings. Restore saved settings when preview is cancelled or the dialog is dismissed.
- [x] Use conversational photo tips, contextual speaking style, and stop old speech on mode/background changes. Migrate legacy automatic pitch 1.3 to 1.0 without overwriting a custom pitch.
- [x] Run speech tests, build and browser settings checks, preserve the 27 PRO layout checks, then review and build APK v10. Verify packaged web assets match tested sources.

**Validation limit:** Protocol and playback lifecycle can be tested locally with deterministic fixtures. Actual cloud synthesis can use the existing local Qianwen credential without printing it. Do not claim subjective audio quality was heard unless actually auditioned.

**Results:** 17 speech unit tests passed; browser settings tests passed for both genders, playback, stopping during generation, cloud/system errors, save and cancel; 27 PRO layout checks passed. Real Plus female/male synthesis succeeded in about 2–3 seconds, repeated clips hit the in-memory cache, and both returned clips decoded and started in Chrome (5.8/6.1-second recordings). Code review findings about long-text fallback and false-positive system previews were reproduced with regressions and fixed; targeted re-review found no remaining concrete issue. No Android device audition has been performed.

**Checks:** `node --test eval/voice_test.mjs`; `node eval/pro_layout_test.mjs <screenshots> --voice`; optional live test with the existing local credential: `node eval/voice_smoke.mjs`, followed by `node eval/pro_layout_test.mjs --audio-only` within the audio URL validity window.

**Delivery:** `dist/phota-debug-v10.apk` built successfully offline; packaged `assets/public/index.html` and `app.js` SHA-256 digests match the tested web assets.

## Follow-up: companions and settings

The user's next request binds Crabo to the young female voice and Piggo to the young male voice, removes Kitto/小镜, and reorganizes settings. `companions.js` now owns the mapping, with legacy/unknown pets normalized to Crabo. `speechConfig` derives the voice from the companion and does not use old independent gender/voice/pitch preferences. Removed the cat SVG and selectors from mobile and desktop; historical exported files are not rewritten. The static pet API supplies stateless portraits for two settings cards, while the real live pet is held by an explicit DOM reference.

Settings are grouped as companion → voice/guidance → AI connection → memory/usage, with advanced fields folded and persistent close/save/cancel controls. Configuration prompts do not overwrite an open draft, and automatic coaching waits while the dialog is open. Four migration/binding tests and 17 speech tests pass. Browser checks passed for correct companion/voice requests, save/cancel, guidance/read-aloud switches, drafts and three dialog viewport sizes, plus 27 capture layouts. `dist/phota-debug-v11.apk` built successfully offline; its packaged `index.html`, `app.js` and `pet.js` SHA-256 digests match the checked web assets. No Android device test has been performed.
