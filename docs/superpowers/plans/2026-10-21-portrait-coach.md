# Portrait Coaching Implementation Plan

> **For agentic workers:** Use executing-plans to execute this plan task by task. User approved implementation after grilling, removed run/spend caps, prohibited weight training and packaging.

**Goal:** Deliver a grounded, actionable and creative portrait coach in the existing photography window, selected by independent DeepSeek evaluations.

**Architecture:** A pure portrait session/validation layer, a versioned portrait prompt and contextual scene playbook, an AI API wrapper, and a small live-camera UI integration. Research sources and evaluation cases are separate from model outputs; logs are inference evidence only.

**Tech Stack:** Browser JS/Capacitor, Node test runner, existing Chrome CDP harness, DeepSeek Chat Completions.

### 1. Baseline and sources
- [x] Run `node --test eval/coach_logic_test.mjs eval/companion_test.mjs eval/voice_test.mjs` and save baseline prompt before modifications.
- [x] Research original-author social cases and collect an attributed manifest, separating observed facts from unverified production process.
- [x] Freeze dev/holdout cases by connected shoot/person/author-series groups, with original manual assertions and no teacher-generated answer labels. Recurring people and linked sessions cannot cross the boundary.
- [ ] Before real requests freeze rubric and promotion rule: report each hallucination, wrong/ambiguous direction, unsupported completion claim and non-executable action as a hard failure. Candidate must have no hard failures in the selected independent set and outperform baseline in actor/action clarity and grounded scene use. Creativity remains a separate descriptive measure; automated checks cannot prove aesthetic preference. Target at least 4 scene classes plus partial visibility/no-person/multiple-person/continuity cases. If external material cannot be inspected, report that gap rather than fabricate labels.

### 2. Portrait protocol and session
Files: `mobile/src/portrait-coach.js`, `mobile/src/portrait-prompt.js`, `eval/portrait_coach_test.mjs`.
- [x] Write failing tests for actors, referents, evidence, hidden limbs, no-person/multi-person, ready versus composition, missing previous frame, repeated action, alternate variation, shot state and stale response cancellation.
- [x] Implement typed output normalization and deterministic camera directions; generate user-facing action text from supported action codes and visible references.
- [x] Implement session state and continuity with bounded previous frame, evidence-aware verification, explicit new-idea and shot boundaries.
- [x] Run tests and retain normal-coach regression coverage.

### 3. Inference and photography UI
Files: `mobile/src/ai.js`, `mobile/src/live.js`, `mobile/www/index.html`, evaluation browser harness.
- [x] Add DeepSeek reasoning control and portrait request wrapper using production prompt; tests capture outgoing image order/options and errors without secrets.
- [x] Add in-window ordinary/portrait selector and concise plan/action panel outside preview. New idea is user-triggered. Both modes reuse camera and PRO.
- [x] Test draft/model configuration, requests in flight, mode changes, shots, page visibility and visual fit. Do not hardcode credentials or package Android assets.

### 4. Evaluation and iteration
Files: `eval/portrait_eval.mjs`, `eval/portrait-cases.json`, `eval/portrait-sources.json`, result reports and blind comparison artifact.
- [x] Build resumable inference runner with redacted failures, raw response, final interpreted result, prompt hash, usage including retries, estimated CNY and timing. Use current local DeepSeek key privately.
- [x] Run baseline and candidate on development cases, inspect concrete failures, write regressions and revise prompt or guard only for justified defects.
- [x] Freeze candidate then run independent cases; report failures honestly. Any further change requires a fresh withheld check, not a falsely independent reused set.
- [x] Produce 10 paired anonymous outputs for user preference review; leave subjectivity pending until reviewed.

### 5. Verification and review
- [x] Build web assets only with `npm run build --prefix mobile`.
- [x] Run all relevant Node tests, browser portrait scenarios and existing 27 capture layouts with fake camera/no paid network.
- [x] Request independent code/spec review, fix concrete issues, rerun affected checks.
- [x] Deliver local code, source manifest, readable findings, real model usage and blind comparison. No APK and no assertions of universal best or real-world outcome without evidence.

## Execution result — 2026-10-23

Engineering implementation and review completed. See `docs/evaluations/2026-10-23-portrait-coach.md` for 69 Node tests, 81 capture layouts, voice regression, browser capture-race regression, v1–v10 evaluation evidence and limitations. Web build only; no APK or weight training.

The strict photographic promotion gate remains **not passed**: visual audit still found incorrect evidence, ambiguous referents and action/check mismatch. Do not convert protocol counts into accuracy. v7 was the first grouped holdout run; v8/v9 reused those images as regressions. A new Pye Jirsa group was first used after v9 freeze. Human preference and real model shooting outcomes remain pending; the 10-pair local blind artifact is ready. Some negative and continuous scenarios are covered only by deterministic tests, not real-image evaluation.

Final prompt v10 also constrains each action check to its own causal effect and avoids unsupported defects or diffuse referents. Added Jhesus male portraits (same Pye author) as new-person checks, with 2 collage negatives and 3 single-panel crops. Still no claim of photographic promotion: remaining model errors are listed in the report.

## Novice feedback continuation — portrait-v16

Imported the user's five novice comparisons unchanged: candidate 2, baseline 2, neither 1. These are now exposed feedback regressions, including the previously held-out photos. Retained the original v11 review page and mapping.

Implemented typed framing intent with observer-based coordinates, monotone gaze room, distinct pan/height/orbit actions, locked unfinished framing goals, and stage advancement after observed completion. Added red/green regressions including a real v15 focus/action contradiction. Final v16 verification: 82 Node tests, Web build, independent code review, and 27 standard plus 54 portrait browser layouts passed; no APK.

Real v16 feedback regression gives the correct left camera turn for the left-looking wife portrait and retains direct capture for the flower-field portrait. A new novice author night portrait first evaluated at v15 failed the intent-preservation review despite valid geometry. Bouquet interaction remains unresolved. Photography promotion is still **not passed**. Evidence, usage and limitations: `docs/evaluations/2026-10-23-reframe-consistency.md`.

## Intent and creative alternatives experiment

- [x] Preserve production v16 and evaluate candidate prompt pairs through an explicit evaluator-only argument; red/green API test confirms defaults remain unchanged.
- [x] Freeze a decision-comparison candidate without copying photographer critiques or generated answers into training material.
- [x] Verify new author statements and inspect original photos before inference; record audit questions separately from prompts.
- [x] Evaluate first and alternate guidance against production on the same new-author images and intent.
- [x] Prepare a separate anonymous comparison artifact, preserving all existing feedback pages and keys. User-facing page includes only three first-guidance pairs, excluding known alternate-workflow failures from aesthetic preference review.
- [x] Review concrete failures, retain or reject candidate, verify changed code, and report usage/limits without claiming actual shooting success. v17/v18 not promoted; production prompt stays v16. See `docs/evaluations/2026-10-23-intent-and-props.md` for 44 calls, 87 tests, prop constraints, bounded alternate repair, and unresolved creativity/input-size gaps.
