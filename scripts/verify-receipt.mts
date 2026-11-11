// npm run verify-receipt <receipt.json> [--key <base64url | key.json | url>] [--snapshot <file>]
// Checks the Ed25519 signature, the page SHA-256 and every span. No secret needed.
import { existsSync, readFileSync } from "node:fs";
import { verifyReceipt, type SignedReceipt } from "../src/lib/receipt";

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!file) {
  console.error("usage: npm run verify-receipt <receipt.json> [--key <base64url|key.json|url>] [--snapshot <file>]");
  process.exit(2);
}
const raw = JSON.parse(readFileSync(file, "utf8"));
const signed: SignedReceipt = raw.receipt?.receipt ? raw.receipt : raw;

async function keyFrom(k: string | undefined): Promise<{ key: string; from: string }> {
  const doc = (j: { public_key?: string; jwk?: { x?: string } }) => j.public_key ?? j.jwk?.x ?? "";
  if (k && /^https?:/.test(k)) return { key: doc(await (await fetch(k)).json()), from: k };
  if (k && existsSync(k)) return { key: doc(JSON.parse(readFileSync(k, "utf8"))), from: k };
  if (k) return { key: k, from: "--key" };
  if (existsSync("proof/receipt-key.json")) return { key: doc(JSON.parse(readFileSync("proof/receipt-key.json", "utf8"))), from: "proof/receipt-key.json" };
  if (signed.signature?.key_url) return { key: doc(await (await fetch(signed.signature.key_url)).json()), from: signed.signature.key_url };
  throw new Error("no public key: pass --key");
}

const { key, from } = await keyFrom(flag("--key"));
const snapFile = flag("--snapshot") ?? `proof/snapshots/${signed.receipt.page_sha256}.txt`;
const snapshot = signed.snapshot ?? (existsSync(snapFile) ? readFileSync(snapFile, "utf8") : null);
const r = verifyReceipt(signed, key, snapshot);
console.log(`receipt ${signed.receipt.call_id} (${signed.receipt.verdict}), key from ${from}`);
for (const c of r.checks) console.log(`  ${c.pass === null ? "skip" : c.pass ? "ok  " : "FAIL"}  ${c.name}: ${c.detail}`);
console.log(r.ok ? "VALID" : "INVALID");
process.exit(r.ok ? 0 : 1);
