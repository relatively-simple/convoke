/**
 * Cryptographic Password Authentication using WebCrypto PBKDF2 with HMAC-SHA-256.
 * Zero external dependencies. Compatible with Node.js 18+, Cloudflare Workers, and Edge runtimes.
 */

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex || Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hash = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  return { hash, salt };
}

export async function verifyPassword(password: string, expectedHash: string, salt: string): Promise<boolean> {
  if (!password || !expectedHash || !salt) return false;
  const { hash } = await hashPassword(password, salt);
  if (hash.length !== expectedHash.length) return false;
  let match = 0;
  for (let i = 0; i < hash.length; i++) {
    match |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return match === 0;
}
