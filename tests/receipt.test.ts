import { describe, expect, it } from "vitest";
import { DEV_RECEIPT_SEED } from "@/lib/config";
import { canonicalJson, publicKeyDoc, receiptKeyFromSeed, receiptPayload, sha256Hex, signReceipt, verifyReceipt } from "@/lib/receipt";
import { callTool, quote } from "@/lib/tab/engine";
import { makeDeps, openedTab, PASS_TEXT } from "./helpers";

const key = receiptKeyFromSeed(Buffer.from(DEV_RECEIPT_SEED, "base64"), true);
const pub = key.publicRaw.toString("base64url");

async function signedPass() {
  const d = makeDeps();
  const tab = await openedTab(d, 500);
  const q = await quote(d, tab, "wring", PASS_TEXT);
  const r = await callTool(d, tab, q.quoteToken, PASS_TEXT);
  return { signed: signReceipt(receiptPayload(r.tab, r.record), key, "https://x.test", r.sourceText), text: r.sourceText };
}

describe("Ed25519 receipts", () => {
  it("verifies signature, page hash and spans with only the public key", async () => {
    const { signed, text } = await signedPass();
    expect(signed.receipt.page_sha256).toBe(sha256Hex(text));
    expect(signed.receipt.verified_spans.length).toBeGreaterThan(0);
    const r = verifyReceipt(JSON.parse(JSON.stringify(signed)), pub);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.pass)).toEqual([true, true, true]);
  });

  it("flipping one byte of the signed receipt fails the signature", async () => {
    const { signed } = await signedPass();
    const bytes = Buffer.from(canonicalJson(signed.receipt));
    const i = bytes.indexOf(Buffer.from('"tool_fee":"0.50"')) + 15;
    bytes[i] ^= 0x01; // 0.50 -> 0.51
    const tampered = { ...signed, receipt: JSON.parse(bytes.toString()) };
    expect(tampered.receipt.tool_fee).toBe("0.51");
    const r = verifyReceipt(tampered, pub);
    expect(r.ok).toBe(false);
    expect(r.checks[0]).toMatchObject({ name: "signature", pass: false });
  });

  it("flipping one byte of the signature fails", async () => {
    const { signed } = await signedPass();
    const sig = Buffer.from(signed.signature.value, "base64url");
    sig[0] ^= 0x80;
    expect(verifyReceipt({ ...signed, signature: { ...signed.signature, value: sig.toString("base64url") } }, pub).ok).toBe(false);
  });

  it("flipping one byte of the snapshot fails the page hash", async () => {
    const { signed, text } = await signedPass();
    const s = signed.receipt.verified_spans[0];
    const flipped = text.slice(0, s.start) + (text[s.start] === "A" ? "B" : "A") + text.slice(s.start + 1);
    const r = verifyReceipt(signed, pub, flipped);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === "page_hash")!.pass).toBe(false);
    expect(r.checks.find((c) => c.name === "spans")!.pass).toBe(false);
  });

  it("rejects another key, and skips (not passes) checks with no snapshot", async () => {
    const { signed } = await signedPass();
    const other = receiptKeyFromSeed(Buffer.alloc(32, 7)).publicRaw.toString("base64url");
    expect(verifyReceipt(signed, other).ok).toBe(false);
    const { snapshot: _s, ...bare } = signed;
    const r = verifyReceipt(bare, pub);
    expect(r.ok).toBe(true);
    expect(r.checks.filter((c) => c.pass === null)).toHaveLength(2);
  });

  it("publishes the public key and flags the dev key", () => {
    const doc = publicKeyDoc(key, "https://x.test");
    expect(doc).toMatchObject({ alg: "Ed25519", kid: key.kid, public_key: pub, dev_key: true, url: "https://x.test/.well-known/toll-bridge-receipt-key.json" });
  });
});
