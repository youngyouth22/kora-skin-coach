---
trigger: always_on
---

## 🎯 ARTICLE 1 — PRODUCT CONTEXT

You are a senior engineer building the **AI skin coach** for Kora: a mobile app (Flutter, separate repo) that proves whether a skincare routine works via weekly YouCam Skin Analysis scans, product experiments (baseline vs later scans → verdict), and an AI coach (this repo). Market: global, US first. UI language: English. Subscription app (RevenueCat, 7.99 USD/month).

The coach answers questions using the user's measured data (scores, routine, experiments) and a curated skincare knowledge base. It must feel personal and trustworthy while being deterministic underneath.

---

## 🗺️ ARTICLE 2 — REPO MAP (this repo only)

- `src/mastra/agents/` — coach agent definitions, prompts, instructions
- `src/mastra/tools/` — tools the agent can call (data lookups, calculators)
- `src/mastra/domain/` — pure domain logic: verdicts, noise thresholds, goal alignment, ingredient conflicts (deterministic, no LLM)
- `src/mastra/kb/` — skincare knowledge base content
- `src/mastra/services/` — infra: LLM provider adapter, validation, logging, caching
- `tests/` — `npm test`, `npm run typecheck`
- `fixtures/` — golden fixtures (real or sanitized YouCam payloads, conversation transcripts)
- `.agents/workflows/` — reusable procedures

External systems (consumed via HTTP/env, never imported): YouCam API (key server-side only, via Edge Functions), RevenueCat (webhooks received), LLM provider (configurable model via env).

---

## 🚫 ARTICLE 3 — NON-NEGOTIABLES (violating any is a bug)

1. **Never show or store-as-truth `ui_score`.** YouCam's `ui_score` and overall `all` score are inflated (the `all` score equals the mean of `ui_score`s). Use `raw_score`; overall = mean of raw scores. Higher raw = better for every concern.
2. **No medical diagnosis, ever.** Cosmetic wellness only. Red flags (changing mole, bleeding, pus, fever, swelling of face/lips, self-harm) → rule-based referral *before* any model call.
3. **Facts by code, words by LLM, safety by rules.** Numbers, goal alignment, routine ingredients, conflicts and verdicts are computed deterministically in `domain/`. The LLM writes wording and explains; it never invents or changes data.
4. **Every number in AI output must trace to measured data** (evidence refs). Unvalidated AI output is never returned: validate → repair → deterministic fallback.
5. **Secrets:** the LLM provider key lives ONLY in Mastra env/config (never in tests, fixtures, logs, or git). The Supabase service-role key and YouCam key live ONLY in Edge Functions (different repo) — never request them here. Mastra authenticates callers with the user's JWT/anon key; RLS protects every table.
6. **Privacy:** photos never go to an LLM (no image input anywhere). Face data requires explicit consent; support delete-account flows. Never log JWTs, photos, or health data.
7. **Rx and pregnancy:** never recommend prescription/regulated ingredients (tretinoin, hydroquinone…). If pregnant/nursing, only `generally_ok` ingredients. Never advise changing a prescribed treatment.
8. **Tone:** warm, specific, non-shaming. No "flaws", "problem skin", beauty ratings, or skin-age shaming. Structural concerns (eye bags, tear troughs, eyelids) are never promised to be "fixed" by skincare.
9. **Regional claims only with regional data** (see `30-youcam-data-contract`). Never describe forehead/cheeks/chin/nose findings from whole-face scores.
10. **Never write Mastra, Supabase, or YouCam API code from memory.** Verify against the reference first (`10-mastra-engineering.md`, docs, or existing verified code).

---

## 🤝 ARTICLE 4 — API CONTRACT WITH THE FLUTTER APP (sacred)

- [ ] Flutter consumes this server over HTTP. Request/response shapes in the API are a **shared contract** owned by this repo's Gemini/types.
- [ ] **Never make a breaking change** (renamed field, changed type, removed field, new required field) to an endpoint the app consumes without: (a) a version bump or new endpoint, (b) an explicit task note for me to sync the Flutter repo, (c) a test proving old clients still parse.
- [ ] Additive changes (new optional fields) are fine; document them in the response schema.
- [ ] Response payloads stay minimal: no internal fields, no evidence objects the app doesn't render, no PII beyond what the endpoint requires.
- [ ] If the Flutter app needs a new capability, propose it as a NEW endpoint/version — never overload an existing one silently.

---

## 🔧 ARTICLE 5 — HOW TO WORK

1. Restate the task in 1–3 lines and list the files you will touch. For anything non-trivial, write a short plan first.
2. Read existing code and the relevant rule file before editing. Prefer extending existing modules over creating new ones.
3. Implement in small steps. Add/adjust tests with the change (golden fixtures in `fixtures/`).
4. Run the checks that apply **in this repo**: `npm run typecheck && npm test`. If your change depends on Edge Functions or Flutter behavior you cannot run here, say so explicitly — do NOT fake the check.
5. Report: what changed, what you verified (command + result), what you could NOT verify, and risks. Never claim "tested" for something you did not run.

### Rule files (load the ones relevant to the task)

`10-mastra-engineering` · `20-agent-roster-and-architecture` · `30-youcam-data-contract` · `40-skincare-knowledge-and-safety` · `50-first-scan-wow-screen` · `70-evals-quality-and-workflow`. Note: `60-backend-flutter-conventions` belongs to the Flutter repo — load it only if the task is explicitly cross-repo, and flag that to me.

---

## ✅ ARTICLE 6 — DEFINITION OF DONE

- [ ] `npm run typecheck` + `npm test` green
- [ ] New behavior covered by a test using a real or sanitized fixture
- [ ] No secret or PII added (scan fixtures, logs, tests)
- [ ] Agent output reviewed against tone rules (no shaming, no invented numbers, red-flag referral intact)
- [ ] API contract unchanged OR versioned + sync task noted for the Flutter repo
- [ ] Docs/rules updated if a contract changed
- [ ] Unverified items listed explicitly