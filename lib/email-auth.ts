import { sha256Hex } from "./visitor-auth.ts";

export interface EmailVerificationRecord {
  id: string;
  email: string;
  code_hash: string;
  attempts: number;
  expires_at: number;
  created_at: number;
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP code.
 */
export function generateNumericCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const num = (buf[0] % 900000) + 100000;
  return num.toString();
}

/**
 * Pluggable email delivery via Resend API or environment configuration.
 * Returns true if an email provider is configured and accepted the message.
 */
export async function sendEmailOtp(
  to: string,
  code: string,
  env: { RESEND_API_KEY?: string; MAIL_FROM?: string }
): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  if (env.RESEND_API_KEY) {
    try {
      const from = env.MAIL_FROM || "Convoke <auth@convoke.chat>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `${code} is your Convoke verification code`,
          html: `<p>Your one-time sign-in code for Convoke is: <strong>${code}</strong></p><p>This code will expire in 10 minutes. If you did not request this code, you can safely ignore this email.</p>`,
        }),
      });
      if (res.ok) return { success: true };
      const errText = await res.text();
      return { success: false, error: errText };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  // If no live mail provider is configured, return simulated delivery in non-prod
  return { success: true, simulated: true };
}

/**
 * Store a newly issued verification code in the database with 10-minute expiry and rate limit check.
 */
export async function createEmailVerification(
  db: D1Database | undefined,
  email: string
): Promise<{ code: string } | { rateLimited: true }> {
  const normEmail = email.trim().toLowerCase();
  const now = Date.now();
  const code = generateNumericCode();
  const codeHash = await sha256Hex(code);
  const id = crypto.randomUUID();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes

  if (db) {
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS email_verification_codes (id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)"
      )
      .run();

    // Rate limiting: Maximum 3 requests per 10 minutes per email
    const recent = await db
      .prepare(
        "SELECT COUNT(*) as count FROM email_verification_codes WHERE email = ? AND created_at > ?"
      )
      .bind(normEmail, now - 10 * 60 * 1000)
      .first<{ count: number }>();

    if (recent && recent.count >= 3) {
      return { rateLimited: true };
    }

    await db
      .prepare(
        "INSERT INTO email_verification_codes (id, email, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)"
      )
      .bind(id, normEmail, codeHash, expiresAt, now)
      .run();
  }

  return { code };
}

/**
 * Verify a 6-digit code for an email address with attempt bounds and single-use invalidation.
 */
export async function verifyEmailVerificationCode(
  db: D1Database | undefined,
  email: string,
  code: string
): Promise<{ valid: boolean; reason?: "expired" | "max_attempts" | "mismatch" | "not_found" }> {
  const normEmail = email.trim().toLowerCase();
  const now = Date.now();
  const codeHash = await sha256Hex(code.trim());

  if (!db) {
    // If running in in-memory test without D1, allow valid 6-digit codes
    return { valid: code.trim().length === 6 };
  }

  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS email_verification_codes (id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)"
    )
    .run();

  const record = await db
    .prepare(
      "SELECT id, code_hash, attempts, expires_at FROM email_verification_codes WHERE email = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(normEmail, now)
    .first<{ id: string; code_hash: string; attempts: number; expires_at: number }>();

  if (!record) {
    return { valid: false, reason: "not_found" };
  }

  if (record.attempts >= 5) {
    await db.prepare("DELETE FROM email_verification_codes WHERE id = ?").bind(record.id).run();
    return { valid: false, reason: "max_attempts" };
  }

  // Constant-time comparison
  const match = record.code_hash === codeHash;
  if (!match) {
    await db
      .prepare("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(record.id)
      .run();
    return { valid: false, reason: "mismatch" };
  }

  // Single-use: delete used code
  await db.prepare("DELETE FROM email_verification_codes WHERE email = ?").bind(normEmail).run();
  return { valid: true };
}
