declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GROQ_API_KEY?: string;
    GEMINI_API_KEY?: string;
    AI_PROVIDER?: "groq" | "gemini";
    AUTH_MODE?: "sites" | "access" | "public";
    SESSION_SECRET?: string;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
  }
}
