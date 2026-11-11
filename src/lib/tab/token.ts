import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

// Compact signed envelopes: base64url(deflate(json)) + "." + base64url(hmac).
// Used for the tab token (agent bearer + browser cookie), pending orders and
// quotes. Anything about money is re-checked against PayPal.

const b64 = (buf: Buffer) => buf.toString("base64url");

export function seal(kind: string, payload: unknown, secret: string): string {
  const body = b64(deflateRawSync(Buffer.from(JSON.stringify(payload))));
  const mac = b64(createHmac("sha256", secret).update(`${kind}.${body}`).digest()).slice(0, 32);
  return `${kind}.${body}.${mac}`;
}

export class TokenError extends Error {}

export function unseal<T>(kind: string, token: string, secret: string): T {
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== kind) throw new TokenError(`not a ${kind} token`);
  const [, body, mac] = parts;
  const expected = b64(createHmac("sha256", secret).update(`${kind}.${body}`).digest()).slice(0, 32);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new TokenError(`${kind} token signature is invalid`);
  try {
    return JSON.parse(inflateRawSync(Buffer.from(body, "base64url")).toString()) as T;
  } catch {
    throw new TokenError(`${kind} token is corrupt`);
  }
}
