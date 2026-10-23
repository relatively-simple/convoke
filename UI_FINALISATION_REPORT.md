# Convoke — UI Finalisation Report

## Phase 0: Baseline & Plan

### Baseline Verification (October 2026)
- **Node.js**: v24.11.1
- **TypeScript**: `tsc --noEmit` passed with 0 errors
- **Linter**: `eslint .` passed with 0 errors, 0 warnings
- **Unit/Integration Tests**: 14/14 suites passing
- **Self-Host Cloudflare Build**: Built and verified (`npm run build:selfhost`)

### Execution Plan
1. **Phase 1: Trust, Security & Honesty**:
   - Google OAuth ID token verification with JWKS / `jose.jwtVerify` against Google's certificates.
   - Email authentication: secure OTP or cryptographically hashed authentication; enforce strict ownership verification.
   - Honest copy: Eliminate unbacked "Pro Tri-Model (ChatGPT o1 / Claude 3.7)" claims from Settings and README. Accurately report connected providers (`Gemini`, `Groq`, `NVIDIA`).
   - Remove inline hardcoded price strings (`~$0.001`) from buttons; replace emoji icons (`⚡`, `✕`) with Lucide icons.
2. **Phase 2: Consolidated Design System**:
   - Replace stacked 3-layer CSS with single token-driven system (`tokens.css`, `base.css`, `components.css`).
   - Wire `next-themes` (System default, Light, Dark).
   - Clean, WCAG 2.2 AA compliant contrast and Apple-grade typography (Inter variable self-hosted fallback, 400/500/600 weights, no text below 12px).
   - Remove decorative glows, gradients, and heavy glass styling.
3. **Phase 3: Front-End Architecture Refactor**:
   - Split monolithic `app/workspace.tsx` into modular components (`app/workspace/`).
   - Isolate Composer text state so typing doesn't re-render messages.
   - Hydration-safe preferences and de-duplicated workspace loading.
   - Smart bottom stick auto-scroll with jump-to-bottom affordance.
   - Accessible `<button>` + `Collapsible` headers.
4. **Phase 4: Screen-by-Screen Experience**:
   - Shell, sidebar search & date grouping, welcome starters, composer tools popover, stage-based progress rail, clarification quiz with "Let Convoke decide", resizable canvas with device presets & fullscreen, richer source/history tabs, Settings sheet.
   - Command palette (`⌘K`) and keyboard shortcuts.
5. **Phase 5: Motion System**:
   - Restrained Apple-grade physical motion tokens in `tokens.css`.
   - Graceful reduced-motion support.
6. **Phase 6: Accessibility, Responsiveness & Performance**:
   - WCAG 2.2 AA compliance, mobile bottom sheet for canvas (`vaul`), touch optimization.
7. **Phase 7: Metadata, Docs & Cleanup**:
   - PWA metadata, OpenGraph, accurate documentation.
8. **Phase 8: Final Verification & Sign-off**:
   - Full gate verification and final report completion.


---

## Phase 1: Trust, Security & Honesty (Complete)

### Fixes Implemented
- **A1 (Google Auth Verification)**: Replaced insecure unverified `decodeJwt` fallback with strict Google JWKS signature verification (`createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"))`) and `jose.jwtVerify`, enforcing `iss`, `aud`, `exp`, and `email_verified === true`.
- **A2 (Email Ownership & OTP)**: Implemented 6-digit numeric OTP generation (`generateNumericCode`), SHA-256 hashed storage at rest, 10-minute expiry, rate limiting (max 3 per 10m per email), and single-use invalidation in `lib/email-auth.ts`. Retained PBKDF2 password protection for direct accounts.
- **A3 (Clean Google Auth Flow)**: Removed client-side `window.prompt` and technical developer setup UI; standard native Google Identity Services integration.
- **A4 (Honest Provider Capabilities)**: Removed unbacked claims regarding OpenAI ChatGPT o1 and Anthropic Claude 3.7 from Settings and `README.md`. Moved enterprise expansion to a clearly labeled Roadmap section. Exposed active connected providers (`capabilities.providers = ["Google Gemini", "Groq", "NVIDIA NIM"]`).
- **A5 (Accurate Cost Badges & Clean Icons)**: Removed hardcoded `(~$0.001)` from Second Opinion action. Replaced `⚡` emoji with Lucide `<Coins size={12}/>` icon.

### Verification
- `tsc --noEmit`: 0 errors
- `eslint .`: 0 errors
- `scripts/test-visitor.mjs`: Added email OTP verification checks, salt uniqueness, and signature verification. 14/14 test suites pass.
