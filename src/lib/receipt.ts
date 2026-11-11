import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { toValue } from "./money";
import { earnsRoyalty } from "./royalty/ledger";
import type { CallRecord, TabState } from "./tab/types";

export const RECEIPT_KEY_PATH = "/.well-known/toll-bridge-receipt-key.json";

// What a call earned and why, in a form anyone can check against the page
// snapshot: offsets into the fetched text, the hashes, the verdict.
export function receiptPayload(tab: TabState, c: CallRecord) {
  return {
    v: 1,
    kind: "toll-bridge.receipt",
    tab_id: tab.id,
    call_id: c.id,
    quote_id: c.qid,
    tool: c.tool,
    input_url: c.source ?? null,
    page_sha256: c.pageSha256 ?? c.inputHash,
    verified_spans: c.spans ?? [],
    verdict: c.verdict,
    score: c.score,
    checks: Object.fromEntries(c.checks),
    reasons: c.reasons,
    rsl_status: c.rsl?.status ?? null,
    license_url: c.rsl?.licenseUrl ?? null,
    policy_hash: c.rsl?.policyHash ?? null,
    generator_model: c.model ?? null,
    judge_model: c.judgeModel ?? null,
    tool_fee: c.verdict === "pass" ? toValue(c.priceCents) : "0.00",
    royalty: earnsRoyalty(c) ? toValue(c.royalty!.cents) : "0.00",
    payee: earnsRoyalty(c) ? c.royalty!.payee : null,
    settlement: tab.settlement ?? "per-call",
    paypal_mode: tab.mode,
    paypal: { order_id: tab.orderId, authorization_id: tab.authorizationId, capture_id: c.captureId ?? null },
    at: c.at,
  };
}

export type ReceiptPayload = ReturnType<typeof receiptPayload>;

export interface SignedReceipt {
  receipt: ReceiptPayload;
  signature: { alg: "Ed25519"; kid: string; key_url: string; value: string };
  // Not signed. Its SHA-256 has to equal receipt.page_sha256.
  snapshot?: string;
}

// Keys sorted at every level so the signature doesn't depend on key order.
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

export interface ReceiptKey {
  privateKey: KeyObject;
  publicRaw: Buffer;
  kid: string;
  dev: boolean;
}

export function receiptKeyFromSeed(seed: Buffer, dev = false): ReceiptKey {
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
  const publicRaw = Buffer.from(createPublicKey(privateKey).export({ format: "jwk" }).x!, "base64url");
  return { privateKey, publicRaw, kid: kidOf(publicRaw), dev };
}

const kidOf = (raw: Buffer) => createHash("sha256").update(raw).digest("hex").slice(0, 16);

export function publicKeyDoc(k: ReceiptKey, baseUrl: string) {
  return {
    kind: "toll-bridge.receipt-key",
    alg: "Ed25519",
    kid: k.kid,
    public_key: k.publicRaw.toString("base64url"),
    jwk: { kty: "OKP", crv: "Ed25519", x: k.publicRaw.toString("base64url"), kid: k.kid, use: "sig" },
    signs: "canonical JSON of the receipt object: keys sorted at every level, no whitespace",
    dev_key: k.dev,
    ...(k.dev ? { warning: "Development key. Its seed is in the public repo, so it proves nothing." } : {}),
    url: `${baseUrl}${RECEIPT_KEY_PATH}`,
  };
}

export function signReceipt(payload: ReceiptPayload, key: ReceiptKey, baseUrl: string, snapshot?: string): SignedReceipt {
  const value = sign(null, Buffer.from(canonicalJson(payload)), key.privateKey).toString("base64url");
  return { receipt: payload, signature: { alg: "Ed25519", kid: key.kid, key_url: `${baseUrl}${RECEIPT_KEY_PATH}`, value }, ...(snapshot != null ? { snapshot } : {}) };
}

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export interface Check {
  name: "signature" | "page_hash" | "spans";
  pass: boolean | null;
  detail: string;
}

// Signature against a public key, page hash against a snapshot, and each span
// at its offsets. A check with no input to work on comes back null, not pass.
export function verifyReceipt(signed: SignedReceipt, publicKey: string, snapshot?: string | null): { ok: boolean; checks: Check[] } {
  const checks: Check[] = [];
  const raw = Buffer.from(publicKey, "base64url");
  let sigOk = false;
  try {
    if (raw.length !== 32) throw new Error("public key must be 32 bytes");
    const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
    sigOk = signed.signature?.alg === "Ed25519" && verify(null, Buffer.from(canonicalJson(signed.receipt)), pub, Buffer.from(signed.signature.value, "base64url"));
    checks.push({ name: "signature", pass: sigOk, detail: sigOk ? `Ed25519 signature valid for key ${kidOf(raw)}` : "signature does not match this receipt and key" });
  } catch (e) {
    checks.push({ name: "signature", pass: false, detail: `couldn't check the signature: ${(e as Error).message}` });
  }
  const text = snapshot ?? signed.snapshot;
  const r = signed.receipt;
  if (text == null) {
    checks.push({ name: "page_hash", pass: null, detail: "no snapshot to hash" });
    checks.push({ name: "spans", pass: null, detail: "no snapshot to check spans against" });
  } else {
    const h = sha256Hex(text);
    checks.push({ name: "page_hash", pass: h === r.page_sha256, detail: h === r.page_sha256 ? `snapshot SHA-256 matches ${h.slice(0, 16)}` : `snapshot hashes to ${h.slice(0, 16)}, receipt says ${String(r.page_sha256).slice(0, 16)}` });
    const bad = (r.verified_spans ?? []).filter((s) => text.slice(s.start, s.end) !== s.quote);
    checks.push({
      name: "spans",
      pass: bad.length === 0,
      detail: bad.length ? `${bad.length} span(s) don't match the text at their offsets (first at ${bad[0].start}-${bad[0].end})` : `${r.verified_spans?.length ?? 0} span(s) found at their offsets`,
    });
  }
  return { ok: checks.every((c) => c.pass !== false) && sigOk, checks };
}
