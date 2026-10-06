# Host Convoke on Cloudflare

Convoke is a dynamic React/Vinext application with a Cloudflare Worker API and D1 storage. Use Node.js 22.13 or later (Node 24 recommended). It cannot run on static hosting alone.

## Install and prepare a new account

```sh
npm ci
npx wrangler login
npx wrangler d1 create convoke-db
```

Copy `hosting.example.json` to ignored `hosting.json`, choose your Worker name and enter the returned database ID. Do not put API keys in that file. Existing databases must not be recreated or initialized again.

## Choose public access or account sign-in

For a demonstration without visitor sign-in, add `"auth_mode": "public"` to `hosting.json`. Each browser receives a signed, Secure, HttpOnly cookie and owns separate projects. Clearing cookies, changing browsers, or expiration after 30 days removes access to that browser's workspace; export important artifacts. Anyone with the site URL can consume the configured provider accounts' allowance.

For account sign-in, use `"auth_mode": "access"`. Create a Cloudflare Access application protecting the complete Worker hostname and allow only approved emails. Set `access_team_domain` to `https://YOUR-TEAM.cloudflareaccess.com` and `access_aud` to the application's audience. Convoke verifies signed tokens, issuer, audience and expiry. Never use `AUTH_MODE=sites` on a standalone Worker.

## Build and initialize a new database

```sh
npm run build:selfhost
npx wrangler d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0000_unknown_rockslide.sql
```

Run the SQL initialization only once, against an empty database. Before future schema changes, back up the existing database and use reviewed migrations.

## Deploy and connect providers

```sh
npm run deploy:selfhost
npx wrangler secret put GEMINI_API_KEY --config dist/server/wrangler.json
npx wrangler secret put GROQ_API_KEY --config dist/server/wrangler.json
npx wrangler secret put NVIDIA_API_KEY --config dist/server/wrangler.json
```

Configure only providers you have an account for. Enter keys into the hidden Wrangler prompts; never put them into chat, browser storage, public code, or GitHub. Gemini keys come from Google AI Studio; NVIDIA requires a separate NVIDIA developer API key. NVIDIA remains inactive until its key is configured. Visitors never need their own keys. All configured providers can be used automatically; no `AI_PROVIDER` setting is needed.

For public access, also configure a randomly generated secret of at least 32 characters:

```sh
npx wrangler secret put SESSION_SECRET --config dist/server/wrangler.json
```

Preserve this secret across deployments so existing visitor cookies keep working. Rotating it signs out all browser workspaces. Open your Worker URL after the provider key and session/auth configuration are ready.

## Availability, progress and usage

Convoke tries the task-appropriate models across connected providers. When one is busy or fails, it tries another provider after five seconds, for up to three rounds. Recent failures influence model selection; account rate-limit waits are respected before reusing a model. Invalid keys or exhausted provider quotas disable that provider for the request. Safety refusals, cancellation and ownership checks are not bypassed by fallback.

The loading view displays the actual provider/model, task stage, safe error category and retry delay through a streamed response. Raw provider error payloads and secrets are not displayed. Thorough mode defaults on, remembers your browser preference, checks for missing details, and supplies your confirmed answers to generation without repeating the quiz.

**Convoke has no daily AI-call cap.** Provider quotas, rate limits, credits and billing still apply. Keep provider accounts on their free plans if zero API charges are required; Convoke cannot verify or enforce provider billing plans. Adding NVIDIA does not guarantee perpetual free or unlimited service. Bounded retries, request size, project storage and execution deadlines remain for reliable operation. The generation deadline is twenty minutes and the recovery lock expires one minute later.

## Local development

Copy `.dev.vars.example` to ignored `.dev.vars` and fill the provider keys you use. Local development uses an isolated test identity; never expose the development server publicly.

```sh
npm run build
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_unknown_rockslide.sql
npm run dev
```

Initialize local storage only if it is empty. Open http://localhost:5173.

## Updates and checks

```sh
npm ci
npm test
npm run typecheck
npm run build:selfhost
npm run deploy:selfhost
```

The build recreates the Worker config. `configure-hosting.mjs` reapplies your ignored settings. Provider/session secrets stay in Cloudflare and are not bundled. Do not re-run the initial database SQL when updating.

`npm run test:integration` requires the local server. `scripts/test-live-thorough.mjs` takes `TEST_BASE_URL` and performs real provider calls to check streamed status, the quiz, confirmed answers and persistence. It creates a disposable project and prints its ID for targeted cleanup. `scripts/test-public.mjs` similarly verifies public sessions and generation. Such tests consume provider allowance.

Back up D1 before schema changes:

```sh
npx wrangler d1 export DB --remote --config dist/server/wrangler.json --output backup.sql
```

Store backups privately. Exported source ZIPs exclude keys, local databases, Git metadata and dependencies. Existing Sites conversations do not automatically migrate to a different Cloudflare account.

References: https://ai.google.dev/gemini-api/docs/pricing , https://console.groq.com/docs/rate-limits , https://docs.api.nvidia.com/nim/reference/llm-apis , https://developers.cloudflare.com/workers/configuration/cloudflare-access/
