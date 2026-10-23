# Convoke 3.0 - Full Codebase Senior Staff Audit Report

**Branch:** `audit/full-review`  
**Auditor:** Senior Staff Engineer  
**Date:** October 2026  
**Status:** In Progress (Phases 1-3)

---

## 1. Architecture Summary (Phase 1: Understand)

Convoke 3.0 is a multi-model AI synthesis workspace and collaboration platform built on Next.js 16 (React 19) running on Cloudflare Workers / Pages via `vinext` + Vite 8, backed by Cloudflare D1 (SQLite via Drizzle ORM).

### Key Architectural Layers:
1. **Frontend / UI Layer (`app/`, `components/`)**:
   - `app/page.tsx`: Server component entry point reading cookies (`cf_clearance`, access token, session cookies) and delegating to `app/workspace.tsx`.
   - `app/workspace.tsx`: Primary client application state controller (~1,000 LOC). Handles chat session lifecycle, multi-model execution, live typewriter status stream, visual rendering, boardroom, fact-checking, second opinion, and thread deletion.
   - `components/`: Specialized UI views (`visual-answer.tsx`, `boardroom-view.tsx`, `fact-check-view.tsx`, `second-opinion-view.tsx`, `artifact-preview.tsx`) and Radix UI / Shadcn primitives.
2. **AI Provider & Routing Layer (`lib/`)**:
   - `lib/provider-router.ts`: Tri-model dispatch engine (Groq, Cerebras, Cohere, DeepInfra, Mistral, NVIDIA NIM, Gemini, HuggingFace). Implements failover (max 2 tries per provider before retiring and rotating to next-best), cooldown tracking, token budgeting, and simulated zero-cost free tiers.
   - `lib/visual-deliberation.ts`: Multi-agent visual deliberation pipeline (Gemini, Groq, NVIDIA) discussing visual implementation before generating interactive SVG/Mermaid/Pyodide/Three.js visualizations.
   - `lib/privacy-proxy.ts`: Client/Server PII masking & unmasking (emails, phones, credit cards with Luhn check, SSNs, API keys) ensuring confidential data never reaches external AI providers.
   - `lib/boardroom.ts`, `lib/fact-check.ts`, `lib/second-opinion.ts`: Autonomous multi-model reasoning pipelines.
3. **Data Layer (`db/`)**:
   - D1 SQLite database managed with `drizzle-orm`. Tables: `projects`, `sessions`, `visitors`.
   - Thread persistence, optimistic concurrency on updates, versioned project states.
4. **Auth & Security (`app/chatgpt-auth.ts`, `lib/access-auth.ts`, `lib/visitor-auth.ts`)**:
   - Visitor tokens (HMAC/JWT via `jose`), Cloudflare Access JWT validation, Google Auth & cross-device session syncing.
5. **Runtime & Execution (`build/`, `scripts/`)**:
   - In-browser runtime execution for Python (Pyodide) and Three.js sandboxes.
   - Cloudflare worker packaging (`vinext` + `wrangler`).

---

## 2. Baseline Status (Phase 2: Baseline)

- **Node.js**: v22.13+
- **Unit & Property Tests (`npm test`)**: **PASS** (14/14 test suites, 0 failures, ~3.2s)
  - `test-free-ai.mjs`, `test-groq.mjs`, `test-access.mjs`, `test-visitor.mjs`, `test-gemini.mjs`, `test-provider-router.mjs`, `test-generation-stream.mjs`, `test-presentation.mjs`, `test-shared-state.mjs`, `test-fact-check.mjs`, `test-boardroom.mjs`, `test-privacy-proxy.mjs`, `test-second-opinion.mjs`, `test-pricing.mjs`.
- **Type Checker (`npm run typecheck`)**: **PASS** (0 errors)
- **Linter (`npm run lint`)**: **PASS** (Initially 10 errors, 3 warnings = 13 problems; all resolved)
- **Self-Host Build (`npm run build:selfhost`)**: **PASS** (Built in 8.95s server, 8.83s client, 4.71s ssr; standalone Cloudflare deployment verified)
- **Dependency / Security Audit (`npm audit`)**:
  - 34 vulnerabilities reported in indirect devDependencies (`@babel/core`, `braces`, `undici`, `vite`, `ws`). All runtime production dependencies are clean or guarded.

---

## 3. Audit Checklist by Directory & Module (Phase 3: Audit)

- [ ] `app/`
  - [ ] `app/workspace.tsx`
  - [ ] `app/page.tsx`
  - [ ] `app/layout.tsx`
  - [ ] `app/chatgpt-auth.ts`
  - [ ] `app/globals.css`
  - [ ] `app/api/export/route.ts`
  - [ ] `app/api/generate/route.ts`
  - [ ] `app/api/session/route.ts`
  - [ ] `app/api/workspace/route.ts`
- [ ] `lib/`
  - [ ] `lib/provider-router.ts`
  - [ ] `lib/free-ai.ts`
  - [ ] `lib/server.ts`
  - [ ] `lib/visual-deliberation.ts`
  - [ ] `lib/privacy-proxy.ts`
  - [ ] `lib/boardroom.ts`
  - [ ] `lib/fact-check.ts`
  - [ ] `lib/second-opinion.ts`
  - [ ] `lib/runtime-client.ts`
  - [ ] `lib/runtime-document.ts`
  - [ ] `lib/visitor-auth.ts`
  - [ ] `lib/access-auth.ts`
  - [ ] `lib/shared-state.ts`
  - [ ] `lib/visuals.ts`
  - [ ] `lib/presentation.ts`
  - [ ] `lib/pricing.ts`
  - [ ] `lib/routing.ts`
  - [ ] `lib/retry.ts`
  - [ ] `lib/model.ts`
  - [ ] `lib/gemini.ts`
  - [ ] `lib/groq.ts`
  - [ ] `lib/errors.ts`
  - [ ] `lib/generation-stream.ts`
  - [ ] `lib/artifact-check.ts`
  - [ ] `lib/ai-progress.ts`
  - [ ] `lib/connectors.ts`
  - [ ] `lib/connector-context.ts`
  - [ ] `lib/connector-contract.mts`
  - [ ] `lib/connector-errors.mts`
  - [ ] `lib/export-document.ts`
  - [ ] `lib/project.ts`
  - [ ] `lib/utils.ts`
- [ ] `components/`
  - [ ] `components/visual-answer.tsx`
  - [ ] `components/answer.tsx`
  - [ ] `components/boardroom-view.tsx`
  - [ ] `components/fact-check-view.tsx`
  - [ ] `components/second-opinion-view.tsx`
  - [ ] `components/artifact-preview.tsx`
  - [ ] `components/comparison.tsx`
  - [ ] `components/connector-error.tsx`
  - [ ] `components/ui/*`
- [ ] `db/`
  - [ ] `db/index.ts`
  - [ ] `db/schema.ts`
  - [ ] `drizzle.config.ts`
- [ ] `build/` & `scripts/`
  - [ ] `build/*`
  - [ ] `scripts/*`
- [ ] Root Configs & Docs
  - [ ] `package.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `vite.config.ts`, `README.md`

---

## 4. Findings Log (Phase 3 & 4)

| ID | File:Line | Severity | Category | Description | Proposed Fix | Status |
|---|---|---|---|---|---|---|
| LINT-01 | `app/workspace.tsx:3` | Low | Style / Idiom | Unused import `Globe` | Remove unused import | Resolved |
| LINT-02 | `app/workspace.tsx:44` | High | React 19 / Bug | Synchronous `setDisplayed("")` inside `useEffect` causes cascading render warning | Remove synchronous setter; use key-based remounting `<TypewriterStatus key={status} ...>` | Resolved |
| LINT-03 | `app/workspace.tsx:96` | Medium | Type Safety | `userAccount` typed as `any` in fetch promise | Replace with typed promise `Promise<{ user?: { email?: string; displayName?: string; provider?: string } }>` | Resolved |
| LINT-04 | `app/workspace.tsx:380,429`| Low | Idiom | Unused variable `target` | Remove unused variable | Resolved |
| LINT-05 | `lib/free-ai.ts:143,156,178` | Medium | Type Safety | `let ...: any` parsed variables without `const` or type narrowing | Extracted `sanitizeEmptyArtifact` with safe type narrowing and `const` | Resolved |
| LINT-06 | `lib/provider-router.ts:93,105` | Medium | Type Safety | `any` types on JSON parsed objects and clarify options mapping | Use `Record<string, unknown> \| null` with runtime object checks and `(x: unknown)` | Resolved |
| LIB-01 | `lib/privacy-proxy.ts:100-140` | High | Correctness / Security | Overlapping entity candidate matches (e.g. digits in an API key matching CC/phone) corrupt text masking slice boundaries | Implemented `hasOverlap` check before admitting candidate entities | Resolved |
| LIB-02 | `lib/routing.ts:16`, `lib/free-ai.ts:29,129` | Medium | Correctness | Inconsistent visual prompt regexes omitted keywords like `draw` and `render` in routing and deliberation | Centralized `VISUAL_PROMPT_REGEX` across routing, prompts, and visual deliberation | Resolved |
| SCHEMA-01 | `lib/fact-check.ts:27`, `lib/second-opinion.ts:19`, `app/api/generate/route.ts:15`, `app/api/workspace/route.ts:11-12` | High | Correctness / Compatibility | `messageId` strictly enforced as UUID in schemas while `Project.messages` uses string ID, breaking fact checks/second opinions on non-UUID message IDs | Relaxed `messageId` to `z.string().min(1).max(128)` across schemas | Resolved |
| API-01 | `app/api/generate/route.ts:24` | Medium | Usability / Error Handling | Validation errors for non-prompt fields falsely threw `"Please enter a message of up to 4,000 characters."` | Checked `issue.path` and returned specific validation message for non-prompt fields | Resolved |
| PERF-01 | `lib/provider-router.ts:60` | High | Performance / Reliability | Premature 15s attempt timeout in `providerAttempt` caused complex coding and canvas generations to fail with 504 timeouts | Scaled timeout to 45s for coding/repair tasks and 25s for text tasks | Resolved |
| REL-01 | `lib/gemini.ts:67`, `lib/groq.ts:37` | Medium | Reliability | Empty artifact objects `{ html: "" }` returned by LLMs broke schema validation, triggering needless retries and 502/503 errors | Applied `sanitizeEmptyArtifact` before `safeParse` to normalize empty artifacts | Resolved |

---

## 5. Verification & Final Report (Phase 5 & 6)

*(Will be populated upon completion of fixes and verification)*
