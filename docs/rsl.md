# RSL 1.0 in Toll Bridge

Toll Bridge reads a source page's [RSL 1.0](https://rslstandard.org/rsl) terms before it uses the page as AI input (`ai-input`, which `ai-all` also covers).

Discovery order (page-level beats site-level):
1. HTTP `Link: <...>; rel="license"; type="application/rsl+xml"`
2. HTML `<link rel="license" type="application/rsl+xml" href="...">`
3. `robots.txt` `License:` lines (a `TollBridge` group, then `*`, then global)

Evaluation:
- The most specific matching `<content url>` wins (RFC 9309 patterns, `*` and `$`).
- `<content server="...">` means OLP. We don't implement OLP, so the status is `olp_required` and we refuse the source.
- A `prohibits` that covers `ai-input` wins over any `permits`. A `permits type="usage"` list that leaves out `ai-input` also counts as prohibited.
- `payment type="use"` with `<amount currency="USD">` and our payout `<accepts>` is `paid_use`. Sub-cent amounts round up to the next cent.

| Status | Meaning | Runs? | Royalty |
| --- | --- | --- | --- |
| `paid_use` | Use price plus a payout payee | yes | amount per verified use |
| `terms_no_payee` | Licensed, but no payee we can pay (free, attribution, or no `<accepts>`) | yes | none |
| `unlicensed` | No valid RSL document found | yes | none |
| `unreadable` | Page or license blocked (challenge, 401/403/429/503, network error) | yes | none |
| `prohibited` | `ai-input` not allowed | no, 0.00 | none |
| `olp_required` | License server required | no, 0.00 | none |

## Our proposed `<accepts>` media type

`application/vnd.tollbridge.paypal-payout+json` is **our proposal**. It isn't registered with RSL. Its body names a PayPal Payouts recipient:

```xml
<payment type="use">
  <amount currency="USD">0.05</amount>
  <accepts type="application/vnd.tollbridge.paypal-payout+json"><![CDATA[
    {"recipient_type":"EMAIL","receiver":"writer@example.com"}
  ]]></accepts>
</payment>
```

`recipient_type` is `EMAIL` or `PAYPAL_ID`, matching the Payouts API item fields.

Try it: `npm run rsl:check https://joeproai.github.io/toll-bridge-writers/a.html`
