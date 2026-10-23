declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ASSETS?: Fetcher;
    BUCKET?: R2Bucket;
    GROQ_API_KEY?: string;
    GEMINI_API_KEY?: string;
    NVIDIA_API_KEY?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    AUTH_MODE?: "sites" | "access" | "public";
    SESSION_SECRET?: string;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
  }
}
