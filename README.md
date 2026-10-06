# Convoke 1.0

An AI workspace that turns prompts into explanations and interactive HTML tools, with automatic routing across Gemini, Groq, and optional NVIDIA models and persistent project history.

Start with **HOSTING.md** to deploy on Cloudflare Workers + D1, with public browser sessions or optional Access sign-in. Existing Sites hosting remains supported. This is a server-backed application, not a static website.

## Included
- Dark interface, Auto / Explain / Build task modes, and saved project briefs.
- Task-based routes across connected Gemini, Groq, and NVIDIA providers, with three fallback rounds and live model/error updates. NVIDIA requires its own server key.
- Thorough mode defaults on and remembers your choice. Prompt-aware quiz with up to three missing-detail questions, multiple-choice and custom answers. Explicit answers are retained in project state.
- Canvas hidden until needed; generation and preview loading states prevent blank iframe flashes.
- Generated artifact preview, editable HTML source, version history, restore and HTML export.
- Static HTML and JavaScript validation, with at most one AI repair. These checks do not run arbitrary code on the server.
- Ownership checks, optimistic revisions, expiring generation locks, cancellation, bounded requests and cross-provider fallback.
- Provider failures distinguished from storage errors, including bounded retry, body timeout, malformed JSON and output-limit handling.
- Verified Cloudflare Access tokens for independent hosting; trusted Sites identity for the managed website.

## Limits and scope
Convoke does not impose a daily AI usage cap. Provider account quotas and rate limits still apply. Each project permits 150 messages, 25 versions and 850 KB of stored state. Provider token limits can be reached sooner. Groq requests are bounded to 24 KB of serialized context; other providers to 90 KB.

Images are intentionally disabled. There is no billing/subscription system, web browsing, or isolated server execution harness. The sandboxed browser preview and static repair do not prove that arbitrary generated code works or provide CPU isolation. Review generated results before relying on them. The release is suitable for a private or access-controlled workspace; a public commercial service needs additional abuse controls, billing and operations work.

## Run and test
See HOSTING.md for installation, database initialization and secure deployment. Normal commands:
```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

`npm run test:integration` requires the local server and database. `node scripts/test-live.mjs` makes real provider calls. Local test projects are never included in the release files.

## Release verification
- Type checking and production build.
- Provider routing, timeout/fallback, malformed/truncated results and rate-limit tests.
- Access JWT signature, issuer, audience, expiry and missing-token tests.
- Workspace authentication, origin checks, persistence, conflict handling, restore, export and cancellation tests.
- Live Groq explanation, creation and revision verified; generated counter interactions exercised in the browser.
- Live prompt-specific Thorough questions and centered quiz navigation verified.
- Archive excludes secrets, dependency folders, Git metadata and local databases.

All provider credentials stay in server secrets. `.dev.vars` is for local development only. Hosting instructions describe the setup still required in your own Cloudflare account.
