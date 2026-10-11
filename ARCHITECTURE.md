# Convoke architecture

Current implementation, October 6, 2026. Convoke runs as a React/Vinext application on Cloudflare Workers, with Cloudflare D1 storage and server-held provider keys.

```mermaid
flowchart TB
  subgraph browser["User browser"]
    UI["React workspace<br/>Chat · Auto / Explain / Build · Thorough quiz"]
    Canvas["Canvas<br/>Preview · HTML editor · Version history · Export"]
    UI -->|"Completed artifact"| Canvas
  end

  subgraph cloudflare["Cloudflare Workers"]
    API["Application APIs<br/>Session · Workspace · Generate · Export"]
    Auth["Session verification<br/>Signed browser cookie + project ownership"]
    Engine["Task orchestration<br/>Prompt + brief + confirmed answers + current artifact + recent messages"]
    Planner["Thorough planner<br/>Ask only for missing details"]
    Router["Provider router<br/>Task routes · Failure cooldowns · Cross-provider fallback"]
    Checks["Validate response and HTML / JavaScript<br/>Up to one AI repair"]
    Progress["Live NDJSON stream<br/>Provider · Model · Errors · Retry delay · Final result"]
    Secrets["Worker secrets<br/>Provider API keys + session signing key"]

    API --> Auth --> Engine
    Engine -->|"Thorough enabled; answers not yet confirmed"| Planner
    Planner -->|"Clarification request"| Router
    Engine -->|"Generation or revision"| Router
    Router -->|"Generated result"| Checks
    Checks -->|"Repair request if needed"| Router
    Router -.->|"Attempt and failure events"| Progress
    Engine -.->|"Questions or final saved result"| Progress
    Secrets -.-> Auth
    Secrets -.-> Router
  end

  DB[("Cloudflare D1<br/>Projects · Briefs · Conversations · Artifacts · Versions · Run locks")]
  Gemini["Google Gemini API"]
  Groq["Groq API"]
  NVIDIA["NVIDIA hosted NIM API"]

  UI -->|"HTTPS requests + browser cookie"| API
  API <-->|"Load, save, restore, cancel"| DB
  Engine <-->|"Read project state; commit result"| DB
  Checks -->|"Validated artifact saved before display"| DB
  Progress --> UI
  Router <-->|"Server-side inference"| Gemini
  Router <-->|"Server-side inference"| Groq
  Router <-->|"Server-side inference"| NVIDIA
```

## Request flow

```mermaid
flowchart TD
  Start["User submits a prompt"] --> Session["Verify session, ownership and project revision"]
  Session --> Context["Load saved state and acquire generation lock"]
  Context --> Thorough{"Thorough enabled<br/>and no quiz answers submitted?"}
  Thorough -->|Yes| Plan["Route a clarification request through connected providers"]
  Plan --> Missing{"Missing details?"}
  Missing -->|Yes| Quiz["Save questions and display the centered quiz"]
  Quiz --> Answers["User confirms answers"]
  Answers --> Generate["Generate using confirmed details and project context"]
  Missing -->|No| Generate
  Thorough -->|No| Generate
  Generate --> Validate["Validate response; check generated HTML and JavaScript"]
  Validate --> Issues{"Static-check issues?"}
  Issues -->|Yes| Repair["One AI repair, using the same provider router"]
  Repair --> Recheck{"Checks pass?"}
  Recheck -->|No| Error["Display error; preserve previous saved version"]
  Recheck -->|Yes| Save["Commit conversation and artifact version to D1"]
  Issues -->|No| Save
  Save --> Display["Show answer and open the completed canvas"]
```

## Provider fallback

- Only providers with server-held keys participate. The available pool is Gemini, Groq and NVIDIA; there is no single-provider selector.
- Each task chooses from explicit model routes. A temporary failure moves the request to another provider after a five-second pause. The router continues transient retries across connected providers until success, cancellation, or the 20-minute deadline, and considers recent model failures. Permanent connection failures disable the affected provider or model for that request.
- Provider-required retry delays are respected before reusing an affected model. Invalid credentials or exhausted provider quota remove that provider from the current request; unavailable models are skipped.
- Live events identify the actual provider and model, task stage, sanitized failure category and retry delay. Provider secrets and raw error payloads are not sent to the browser.
- Cancellation, project ownership, revision checks and expiring locks prevent stopped or conflicting requests from overwriting saved work. Retry count and request deadlines are bounded.

## Important implementation boundaries

- The browser canvas is a saved HTML artifact, not a shared filesystem or full code repository. AI requests include the latest artifact, project brief, confirmed task and recent conversation context.
- HTML and JavaScript receive static validation and at most one repair. Generated code is previewed in a sandboxed iframe with a restrictive content-security policy; there is no server execution sandbox.
- Public access uses a signed, Secure, HttpOnly browser cookie. Browser workspaces are separate, while provider credentials belong to the site owner. Optional Cloudflare Access or managed Sites identity is also supported.
- Convoke imposes no daily AI-call cap. Provider quotas, rate limits and billing still apply. Storage and request-size bounds remain.
- Model selection uses task routes and recent failures, not a statistical benchmark ranking. The failure cache is local to a Worker instance and does not guarantee global availability.

Thorough mode asks a single set of up to twelve questions for the first request in a project, with an internal gap audit before presenting that set. Submitted answers and later prompts bypass planning and go directly to generation. Answers render as Markdown with local KaTeX math support. The canvas opens automatically only when the latest answer produced an artifact. Loading progress is an estimate capped at 90% until the saved result arrives.
