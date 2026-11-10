# Live sandbox proof

This run hit the real PayPal sandbox (`api-m.sandbox.paypal.com`). Every ID below was read back from PayPal after the run.

- Run: 2026-11-10T02:27:50.809Z to 2026-11-10T02:28:21.942Z
- Git SHA: `ec9c6cbc7c07a039cc1d0154492173a2084c082c`
- Hold approved by: sandbox test card as the order's payment source (no browser)
- Tests in the same proof run: 32/32 passed across 5 files
- Expectation (2 pass, 1 fail): met

## PayPal objects

| What | ID | Status |
| --- | --- | --- |
| Order (intent AUTHORIZE) | `0RH691928W451150U` | COMPLETED |
| Authorization (the hold) | `6JK006711K307744G` | VOIDED |
| Capture for seawall | `4F719161T7582324G` | COMPLETED |
| Capture for outage | `7X403588VG748002D` | COMPLETED |

## Math

| Held | Captured | Voided | Not charged (failed calls) |
| --- | --- | --- | --- |
| 2.00 | 1.00 | 1.00 | 0.50 |

## Calls

| Input | Expected | Verdict | Score | Charged | Capture ID | Capture status | Reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
| seawall | pass | PASS | 9.3 | 0.50 | 4F719161T7582324G | COMPLETED | - |
| outage | pass | PASS | 9.7 | 0.50 | 7X403588VG748002D | COMPLETED | - |
| gummies | fail | FAIL | 0 | 0.00 | none | - | claim 1: says things its quote doesn't |

## Timeline

- 2026-11-10T02:27:51.553Z `order.created` {"order_id":"0RH691928W451150U","status":"CREATED","approval":"sandbox-card"}
- 2026-11-10T02:27:54.468Z `order.authorized` {"authorization_id":"6JK006711K307744G","held":"2.00"}
- 2026-11-10T02:27:55.154Z `quote` {"input":"seawall","quote_id":"q_5oVoUkH1CVwl","price":"0.50","remaining":"2.00","http_status":402}
- 2026-11-10T02:28:03.211Z `call.pass.captured` {"input":"seawall","expected":"pass","score":9.3,"capture_id":"4F719161T7582324G","reasons":[]}
- 2026-11-10T02:28:03.981Z `quote` {"input":"outage","quote_id":"q_1SuzQmNhdAsJ","price":"0.50","remaining":"1.50","http_status":402}
- 2026-11-10T02:28:09.689Z `call.pass.captured` {"input":"outage","expected":"pass","score":9.7,"capture_id":"7X403588VG748002D","reasons":[]}
- 2026-11-10T02:28:10.555Z `quote` {"input":"gummies","quote_id":"q_9NwghLuyiT_o","price":"0.50","remaining":"1.00","http_status":402}
- 2026-11-10T02:28:16.899Z `call.fail.not_charged` {"input":"gummies","expected":"fail","score":0,"capture_id":null,"reasons":["claim 1: says things its quote doesn't"]}
- 2026-11-10T02:28:17.817Z `before.close` {"authorization_status":"PARTIALLY_CAPTURED","captured":"1.00","remaining":"1.00"}
- 2026-11-10T02:28:21.930Z `tab.closed` {"voided":"1.00","authorization_status":"VOIDED"}
