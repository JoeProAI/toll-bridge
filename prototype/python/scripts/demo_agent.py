#!/usr/bin/env python3
"""Demo: a simulated agent discovers the tool, pays the toll, gets wrung.

No keys needed — runs against the in-process mocked PayPal + local runner.
Also works over HTTP if a server is running:  python scripts/demo_agent.py --http

    python scripts/demo_agent.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from toll_bridge.toll import PaymentRequired, TollGate

ARTICLE = """\
The Old Salvage Bridge was built in 1911 and carries 4,000 vehicles a day.
Inspectors found corrosion on 12 of 276 suspender ropes last spring.
The city council claims the toll revenue covers maintenance.
What happens to freight traffic if the bridge closes for a year?
"""


def main() -> None:
    gate = TollGate()
    print("AGENT: calling wring without paying...")
    try:
        gate.call(ARTICLE, "brief")
    except PaymentRequired as exc:
        quote = exc.quote
        print(f"TOLLBOOTH: 402 — pay {quote['amount']['value']} "
              f"{quote['amount']['currency_code']} (quote {quote['quote_id']})")
    print("AGENT: paying toll via PayPal (sandbox shapes, mocked)...")
    receipt = gate.pay(quote["quote_id"])
    print(f"TOLLBOOTH: captured {receipt.capture_id} on {receipt.order_id}")
    print("AGENT: retrying wring with receipt...")
    out = gate.call(ARTICLE, "brief", payment=receipt)
    result = out["result"]
    print("\n=== WRUNG RESULT ===")
    print(json.dumps(result, indent=2))
    print("\n=== LEDGER ===")
    for entry in gate.ledger.entries():
        print(json.dumps({k: v for k, v in entry.items() if k != "ts"}))


if __name__ == "__main__":
    main()
