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

---

## Phase 2: Consolidated Design System (Complete)

### Architecture Implemented
- **`app/styles/tokens.css`**: Defined single source of truth for design tokens. Semantic light (`#fbfbfd`) and dark (`#070809`) themes, single mint accent (`#228458` in light / `#34d399` in dark), soft Apple-grade shadows (`--shadow-1`, `--shadow-2`, `--shadow-3`), and physical motion tokens. Zero hardcoded hex colors outside `tokens.css`.
- **`app/styles/base.css`**: Typography scale (12px to 32px; no text < 12px), tabular numbers (`font-variant-numeric: tabular-nums`), accessible focus-visible rings (`2px solid var(--accent)`), and complete reduced-motion fallback.
- **`app/styles/components.css`**: Migrated all monolithic styles from `globals.css` into modular, token-driven CSS rules covering Shell, Topbar, Conversation, Composer, Canvas, Fact-Check, AI Boardroom, Second Opinion, Privacy Proxy, and Modals.
- **`next-themes` Integration**: Integrated `ThemeProvider` in `app/layout.tsx` (`defaultTheme="system"`, `enableSystem`). Set `<Toaster theme="system" />`.

---

## Phase 3: Front-End Architecture Refactor (Complete)

### Modular Decomposition of `app/workspace.tsx`
- **`app/workspace/hooks/use-workspace-data.ts`**: Manages project lifecycle, active thread selection, Google OAuth / email authentication, and multi-device sync.
- **`app/workspace/hooks/use-generation.ts`**: Manages NDJSON generation stream, automated browser smoke tests, auto-repair loop (3 passes), fact-check requests, second-opinion requests, and boardroom/comparison adoption.
- **`app/workspace/hooks/use-preferences.ts`**: Persists preferences (`mode`, `thorough`, `smartRouting`, `privateMode`) safely via `useSyncExternalStore` with zero SSR hydration mismatch.
- **`app/workspace/conversation/Composer.tsx`**: Isolated text input state. Typing never triggers re-rendering of message lists or canvas panels. Features Enter-to-send, Shift+Enter newline, 4000 character budget, intent tabs, and collapsible settings drawer.
- **`app/workspace/conversation/MessageList.tsx`**: Renders message history with smart stick-to-bottom auto-scroll (detects user scroll-up > 80px and presents a floating "Jump to latest ↓" pill).
- **`app/workspace/conversation/StatusRail.tsx`**: Apple-grade stage rail replacing fake typewriter percentages with honest phase statuses and provider tags.

---

## Phase 4: Screen-by-Screen Experience (Complete)

### Key Enhancements
- **Welcome Starters Grid (`app/workspace/conversation/WelcomeView.tsx`)**: 4 curated generative starter cards (Interactive Heat Conduction, Pathfinding Algorithm Visualizer, Market Depth Order Book, Double Pendulum Chaos) for one-click onboarding.
- **Clarification Quiz (`app/workspace/dialogs/ClarificationDialog.tsx`)**: Added "Let Convoke decide" action button to instantly resolve architectural ambiguity with Convoke's recommended defaults.
- **Resizable Canvas & Device Presets (`app/workspace/canvas/CanvasPanel.tsx`)**: Device preset selector (Responsive, Tablet 768px, Mobile 375px) and Fullscreen toggle (`Maximize2` / `Minimize2`).
- **Command Palette (`app/workspace/dialogs/CommandPalette.tsx`)**: `⌘K` / `Ctrl+K` keyboard shortcut powered by `cmdk` to search projects, switch modes, toggle themes, and trigger canvas exports.
- **Polished Settings Sheet (`app/workspace/dialogs/SettingsSheet.tsx`)**: Accessible appearance switcher (System, Light, Dark radio buttons), connected provider status, and privacy options.

---

## Phase 5: Motion System (Complete)

- **Apple-Grade Physical Curves**: Standard (`cubic-bezier(0.25, 0.1, 0.25, 1)`), Emphasized (`cubic-bezier(0.32, 0.72, 0, 1)`), and Pop (`cubic-bezier(0.34, 1.4, 0.64, 1)`).
- **Duration Scale**: Instant (100ms), Fast (160ms), Base (240ms), Slow (400ms).
- **Strict Reduced Motion**: `@media (prefers-reduced-motion: reduce)` resets all animation and transition durations to `0.01ms` with auto scroll behavior.

---

## Phase 6: Accessibility & Responsiveness (Complete)

- **WCAG 2.2 AA Contrast**: Primary mint text and UI accents maintain ≥ 4.5:1 contrast against light and dark surfaces. UI boundaries and separators maintain ≥ 3:1 contrast.
- **Keyboard Navigation**: All interactive headers (Fact-Check, Second Opinion, Boardroom, Accordions) use semantic `<button>` elements with `aria-expanded` and visible focus outlines.
- **Touch & Mobile Optimizations**: Viewport meta tag with `viewportFit: "cover"`, input font sizes set to `16px` on mobile screens to prevent unwanted iOS auto-zoom.

---

## Phase 7: Metadata, OpenGraph & PWA (Complete)

- **PWA Manifest (`public/manifest.json`)**: Configured standalone display, theme color, background color, and icons.
- **OpenGraph & Metadata (`app/layout.tsx`)**: Configured metadata title, description, viewport theme color matching dark/light mode, and OpenGraph tags.

---

## Phase 8: Verification Gate & Sign-Off (Complete)

| Check | Baseline | Final Result | Status |
| :--- | :--- | :--- | :--- |
| **`tsc --noEmit`** | 0 errors | 0 errors | PASS |
| **`eslint .`** | 0 errors | 0 errors, 0 warnings | PASS |
| **Unit & Integration Tests** | 14/14 suites | 14/14 suites passing | PASS |
| **Production Build (`build:selfhost`)** | Successful | Successful (0 errors) | PASS |
| **Git Remote (`origin/main`)** | Clean | Pushed (`c36ea9e`) | PASS |
