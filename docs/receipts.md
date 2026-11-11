# Public receipts

Every wring call returns a receipt signed with Ed25519. You don't need a secret to check it.

- **Public key:** `GET /.well-known/toll-bridge-receipt-key.json` returns `public_key` (raw 32 bytes, base64url), the same key as a JWK, and `kid`, the first 16 hex characters of SHA-256 of the raw public key.
- **What's signed:** the canonical JSON of the `receipt` object. Keys are sorted at every level and there's no whitespace.
- **What's in it:** input URL, page SHA-256, verified spans with offsets, verdict and checks, RSL status, license URL and policy hash, generator and judge model IDs, tool fee, royalty, payee, and the PayPal order, authorization and capture IDs.
- **Snapshot:** the call response carries `snapshot`, the exact page text the verifier saw. It isn't signed, but its SHA-256 has to equal `receipt.page_sha256`, and every span has to appear at its offsets in it. Proof runs also keep a copy at `proof/snapshots/<sha256>.txt`.

## Check one

- **In the browser:** paste or upload the receipt at `/verify`. If the receipt has no snapshot, the page is fetched again, and that only matches if the page hasn't changed since the call.
- **Offline:**

  ```
  npm run verify-receipt receipt.json -- --key <base64url | key.json | key URL>
  ```

  With no `--key`, it uses `proof/receipt-key.json`, then the receipt's `key_url`. The snapshot comes from the receipt, then from `proof/snapshots/`, then from `--snapshot <file>`. It exits 1 if any check fails.

## Key

`RECEIPT_SIGNING_KEY` is a 32-byte Ed25519 seed in base64 (`openssl rand -base64 32`). It's required in live-sandbox mode and on Vercel. Local and fixture runs fall back to a dev key whose seed is in this repo. The key document flags it with `dev_key: true`, so a receipt signed with it proves nothing.

The tab token is still HMAC-signed with `TAB_SECRET`. It's private state, not a receipt.
