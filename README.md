# Convoke 2.1

An AI workspace that turns prompts into explanations and interactive HTML tools, with automatic routing across Gemini, Groq, and optional NVIDIA models and persistent project history.

Start with **HOSTING.md** to deploy on Cloudflare Workers + D1, with public browser sessions or optional Access sign-in. Existing Sites hosting remains supported. This is a server-backed application, not a static website.

## Included
- Black and charcoal interface with subtle green edge gradients, translucent glass panels, Auto / Explain / Build modes, and saved project briefs.
- Task-based routes across connected Gemini, Groq, and NVIDIA providers, with quiet retries for temporary failures until success, cancellation, or the 20-minute request deadline. NVIDIA requires its own server key.
- Thorough mode defaults on and remembers your choice. The first request in each project can receive one quiz with up to twelve missing-detail questions, multiple-choice and custom answers. Quiz answers and follow-up messages go directly to generation; there are no repeated quiz rounds. Explicit answers are retained in project state.
- Text answers render Markdown and LaTeX math with KaTeX. Text-only replies leave the canvas closed.
- Canvas opens for completed artifacts. Estimated progress rises toward 90% during generation and completes when the result arrives.
- Shared canvas with compact AI-maintained project memory, recent-message context, version-bound exact-match patches, manual source editing, restore and export.
- Dedicated tables, bar/line charts with accessible data, Mermaid diagrams, sanitized SVGs, and an Explain in words action.
- Parallel answers from configured providers with side-by-side previews and an explicit choice of which result to adopt.
- HTML/JavaScript and Three.js previews, plus standard-library Python executed in a terminable Pyodide worker. Runtime libraries are served locally and prepared during dev/build.
- Static HTML/JavaScript validation plus hidden browser smoke checks and declarative interaction tests. Up to three runtime repairs; failures and earlier source remain visible in history. Drafts stay closed until checked. Generated code never executes in the application server.
- Ownership checks, optimistic revisions, expiring generation locks, cancellation, bounded requests and cross-provider fallback.
- Provider failures distinguished from storage errors, including bounded retry, body timeout, malformed JSON and output-limit handling.
- Verified Cloudflare Access tokens for independent hosting; trusted Sites identity for the managed website.

## Limits and scope
Convoke does not impose a daily AI usage cap. Provider account quotas and rate limits still apply. Each project permits 150 messages, 25 versions and 850 KB of stored state. Provider token limits can be reached sooner. Groq requests are bounded to 24 KB of serialized context; other providers to 90 KB.

Images are intentionally disabled. There is no billing/subscription system, web browsing, or server execution harness. Browser smoke checks are observational diagnostics, not correctness proofs. HTML runs in a network-restricted iframe with an opaque origin and loop/recursion guards; this is not a separate operating-system process or a memory quota. Python runs in a worker inside that frame and is terminated on timeout. Python package installation and external network access are not supported. Review generated results before relying on them. The release is suitable for a private or access-controlled workspace; a public commercial service needs additional abuse controls, billing and operations work.

## Run and test
See HOSTING.md for installation, database initialization and secure deployment. Normal commands:
```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
```

`npm run test:integration` requires the local server and database. `node scripts/test-live.mjs` makes real provider calls. Local test projects are never included in the release files.

## Verification
- Type checking and production build.
- Provider routing, timeout/fallback, malformed/truncated results and rate-limit tests.
- Access JWT signature, issuer, audience, expiry and missing-token tests.
- Workspace authentication, origin checks, persistence, conflict handling, restore, export and cancellation tests.
- Regression checks cover initial clarification, quiz-answer handoff, follow-ups, provider recovery, math rendering, and canvas visibility.
- Isolated Chromium browser tests cover math in chat/canvas, diagrams, charts, frame isolation, interaction failures, loop guards, Three.js, Python assertions/timeouts, the repair limit, and comparison adoption. Provider responses in workspace regression tests are simulated.
- Archive excludes secrets, dependency folders, Git metadata and local databases.

All provider credentials stay in server secrets. `.dev.vars` is for local development only. Hosting instructions describe the setup still required in your own Cloudflare account.

## Upload to GitHub
Upload the contents of this folder to the repository root so `package.json`, `README.md`, and `app/` are at the top level. Include the hidden `.gitignore` and example configuration files. Never upload real `.dev.vars`, `.env`, `hosting.json`, or `node_modules`. See `GITHUB_UPLOAD.md` for Git commands.
