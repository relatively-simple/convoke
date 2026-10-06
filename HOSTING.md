# Host Convoke on your own Cloudflare account

This package is a dynamic React/Vinext application with a Cloudflare Worker API and D1 database. It is not a static HTML upload and cannot run on GitHub Pages or a basic shared static host.

## What you need
- Node.js 22.13+ (Node 24 recommended) and npm.
- A Cloudflare account with Workers, D1 and Zero Trust Access enabled.
- Your Groq API key. Use the Free plan if you want free usage; Groq controls billing and limits.
- An Access policy allowing your email, or the specific people who should use your Groq allowance.

No keys, user conversations, database files, account credentials or node_modules are in the release ZIP. Your existing Sites conversations do not automatically migrate to a new account; export any artifacts you want to keep from the current website.

## 1. Install and create your database
Extract the ZIP, open a terminal inside `convoke`, and run:

```sh
npm ci
npx wrangler login
npx wrangler d1 create convoke-db
```
Keep the returned database ID. Copy `hosting.example.json` to `hosting.json`. Set `name` to your desired Worker name and `database_id` to that ID. Never put your Groq key in this file.

## 2. Protect the website with Cloudflare Access
In Cloudflare Zero Trust, create a self-hosted Access application for the URL you will use, such as `convoke.YOUR-SUBDOMAIN.workers.dev` or your own domain. Add an Allow policy limited to your email (email one-time PIN is sufficient) or your approved users. Do not create a Bypass policy.

Set `access_team_domain` in `hosting.json` to `https://YOUR-TEAM.cloudflareaccess.com` (no trailing slash), and set `access_aud` to the Access application's audience tag. Protect the workers.dev route too if you also use a custom domain.

The application independently verifies the signed Access token, issuer, audience and expiry. Missing/invalid authentication cannot access project data or call Groq. It does not trust a caller-supplied email header. Cloudflare Access must be configured before users can sign in.

## 3. Build and initialize storage
```sh
npm run build:selfhost
npx wrangler d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0000_unknown_rockslide.sql
```
Run the SQL initialization only for a new empty database. Do not repeat it against an existing installation. Subsequent schema changes require reviewed migrations.

## 4. Deploy and add the secret
```sh
npm run deploy:selfhost
npx wrangler secret put GROQ_API_KEY --config dist/server/wrangler.json
```
Paste the key only into Wrangler's hidden prompt. The app stays unable to generate until the secret is configured. Visit your URL, sign in through Access, create a project and try a small prompt. Do not set `AUTH_MODE=sites` on your own Worker: that mode belongs exclusively to the trusted Sites gateway.

Every source update: run `npm ci`, `npm test`, `npm run typecheck`, `npm run build:selfhost`, then `npm run deploy:selfhost`. The build recreates the Worker config; `configure-hosting.mjs` reapplies your local settings. Runtime secrets remain in Cloudflare.

## Local development
Copy `.dev.vars.example` to `.dev.vars`, add `GROQ_API_KEY`, then:
```sh
npm run build
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_unknown_rockslide.sql
npm run dev
```
Open http://localhost:5173 and use local sign-in. Local development has an isolated test identity; never expose the development server publicly. `npm run build:selfhost` selects verified Access authentication for your deployment.

## Verification and operations
- `npm test`: model orchestration, malformed output, limits, fallback, Access-token validation.
- `npm run typecheck`: TypeScript.
- `npm run test:integration`: local running server; creates test projects and verifies persistence, revision conflicts, export and cancellation.
- `node scripts/test-live.mjs`: optional real Groq calls and a local test project; consumes provider allowance.
- Cloudflare dashboard shows Worker logs. Errors intentionally exclude keys and prompt contents.
- Back up D1 before changing schema: `npx wrangler d1 export DB --remote --config dist/server/wrangler.json --output backup.sql`. Store backups privately.
- Groq 429 errors can reflect token-per-minute limits, not just daily requests. Follow the displayed wait; do not repeatedly retry.
- Use Cloudflare Access policies to control who consumes your key. Groq may charge if you upgrade your account; Convoke cannot enforce Groq's billing plan.

## Deployment verification boundary
The supplied source and build were tested locally and published on Sites. The independent Cloudflare configuration and JWT rejection/acceptance logic were checked, but deployment into your Cloudflare account requires your own account, database, Access application and secret. No claim is made that those account-specific steps have already been performed.

References: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/ and https://console.groq.com/docs/rate-limits

## Optional public access (no visitor sign-in or API keys)
Set `"auth_mode": "public"` in your ignored `hosting.json`, then build with `npm run build:selfhost`. Set a random server-only `SESSION_SECRET` of at least 32 characters with `wrangler secret put SESSION_SECRET --config dist/server/wrangler.json`, and retain `GROQ_API_KEY` as a server secret. Deploy normally. Cloudflare Access is not required in this mode; an existing Access policy would still need to be removed for public entry.

Visitors receive a signed, Secure, HttpOnly cookie automatically. Each browser has separate projects; clearing cookies or switching browsers loses access to that browser's saved workspace. Export important artifacts. All visitors use the operator's Groq key, with a shared 30-call daily application allowance including retries and clarification. The key is never sent to browsers. This mode is intended for a small public demonstration, not an authenticated multi-user service.

## Google AI Studio / Gemini
For Gemini, save `GEMINI_API_KEY` as a Worker secret, set `"ai_provider": "gemini"` in `hosting.json`, and rebuild/deploy. For local development, use `AI_PROVIDER=gemini` and `GEMINI_API_KEY` in `.dev.vars`. Groq remains unused when Gemini is selected, even if its old secret remains stored.

The routes use Gemini 3.8 Flash for generation and 3.7 Flash for clarification, with the other as an alternative for transient failures. Google lists free-tier access for these models as of October 6, 2026; project quotas and billing status are controlled by Google. Keep the Google project on the Free tier if you require zero API charges. Listing models does not verify billing status. Free-tier data may be used by Google to improve products: https://ai.google.dev/gemini-api/docs/pricing .

Gemini transient failures retry three times on the selected model, waiting five seconds between attempts (or longer when Google supplies Retry-After). Only then do requests switch to the alternative Gemini model, with three further attempts. Every attempt counts toward the shared daily cap. Invalid credentials, malformed requests, safety blocks, and explicitly exhausted daily quotas fail without futile retries. Stop cancels the browser request; the project cancellation marker prevents further calls and saves even if the hosting runtime does not propagate disconnection immediately. The overall deadline is twenty minutes to accommodate clarification, generation and a repair in the worst case; the project lock expires one minute later.
