"""TollGate: the pay-per-call gate in front of wring.

Flow (PayPal Orders v2 shapes):
  quote()                     -> price + instructions, no charge
  call(input, mode)           -> 402 PaymentRequired carrying the quote
  call(..., payment=Receipt)  -> runs the wring job in the sandbox runner
  pay(quote_id)               -> authorize + capture -> Receipt

If the wring job fails after capture, the capture is refunded and the
ledger records the refund — callers are never charged for a failed wring.
"""

from __future__ import annotations

import uuid

from .ledger import Ledger, MemoryLedger, new_call_id
from .payments import CURRENCY, PRICE_USD, MockPayPalClient, PayPalClient
from .runner import LocalRunner, Runner


class PaymentRequired(Exception):
    """Unpaid call. Carries the quote an agent needs to pay the toll."""

    def __init__(self, quote: dict):
        self.quote = quote
        amount = quote.get("amount", {})
        if amount:
            msg = (f"payment required: {amount['value']} "
                   f"{amount['currency_code']} per call")
        else:
            msg = f"payment required: {quote.get('error', 'pay first')}"
        super().__init__(msg)


class Receipt:
    """Proof a toll was paid. Passed back to `call` to unlock the wring."""

    def __init__(self, quote_id: str, order_id: str, capture_id: str):
        self.quote_id = quote_id
        self.order_id = order_id
        self.capture_id = capture_id

    def to_dict(self) -> dict:
        return {
            "quote_id": self.quote_id,
            "order_id": self.order_id,
            "capture_id": self.capture_id,
        }


class TollGate:
    def __init__(
        self,
        payments: PayPalClient | None = None,
        runner: Runner | None = None,
        ledger: Ledger | None = None,
        price: str = PRICE_USD,
        currency: str = CURRENCY,
    ):
        self.payments = payments or MockPayPalClient()
        self.runner = runner or LocalRunner()
        self.ledger = ledger or MemoryLedger()
        self.price = price
        self.currency = currency
        self._quotes: dict[str, dict] = {}
        self._receipts: dict[str, Receipt] = {}

    def quote(self, mode: str = "brief") -> dict:
        """Price a call. Free; creates a quote_id for `pay`."""
        quote_id = f"quote-{uuid.uuid4().hex[:12]}"
        quote = {
            "quote_id": quote_id,
            "tool": "wring",
            "mode": mode,
            "amount": {"currency_code": self.currency, "value": self.price},
            "payment_provider": "paypal",
            "flow": "create_order -> authorize -> capture",
        }
        self._quotes[quote_id] = quote
        self.ledger.record(
            {"call_id": new_call_id(), "event": "quote", "quote_id": quote_id,
             "amount": quote["amount"], "payment_id": None, "cost": "0.00",
             "result_hash": None}
        )
        return quote

    def pay(self, quote_id: str) -> Receipt:
        """Run the PayPal handshake: create order -> authorize -> capture."""
        quote = self._quotes.get(quote_id)
        if not quote:
            raise PaymentRequired({"error": f"unknown quote {quote_id}"})
        amount = quote["amount"]
        order = self.payments.create_order(
            amount["value"], amount["currency_code"], reference_id=quote_id
        )
        auth = self.payments.authorize_order(order["id"])
        capture = self.payments.capture_authorization(auth["authorization_id"])
        receipt = Receipt(quote_id, order["id"], capture["id"])
        self._receipts[capture["id"]] = receipt
        self.ledger.record(
            {"call_id": new_call_id(), "event": "payment", "quote_id": quote_id,
             "amount": amount, "payment_id": capture["id"], "cost": amount["value"],
             "result_hash": None}
        )
        return receipt

    def call(
        self,
        input_text: str,
        mode: str = "brief",
        payment: Receipt | dict | None = None,
    ) -> dict:
        """Pay-per-call entry. Raises PaymentRequired (402) when unpaid."""
        if payment is None:
            raise PaymentRequired(self.quote(mode))
        if isinstance(payment, dict):
            payment = Receipt(
                payment["quote_id"], payment["order_id"], payment["capture_id"]
            )
        receipt = self._receipts.get(payment.capture_id)
        if receipt is None:
            raise PaymentRequired({"error": "unrecognized payment"})
        quote = self._quotes[receipt.quote_id]
        call_id = new_call_id()
        try:
            result = self.runner.run_wring(input_text, mode)
        except Exception:
            # Refund on error: the agent paid but got no result.
            refund = self.payments.refund_capture(
                receipt.capture_id, quote["amount"]["value"],
                quote["amount"]["currency_code"],
            )
            self.ledger.record(
                {"call_id": call_id, "event": "refund", "quote_id": receipt.quote_id,
                 "amount": quote["amount"], "payment_id": receipt.capture_id,
                 "cost": "0.00", "result_hash": None, "refund_id": refund["id"]}
            )
            raise
        self.ledger.record(
            {"call_id": call_id, "event": "wring", "quote_id": receipt.quote_id,
             "amount": quote["amount"], "payment_id": receipt.capture_id,
             "cost": quote["amount"]["value"], "result_hash": result["result_hash"]}
        )
        return {"result": result, "receipt": receipt.to_dict(), "call_id": call_id}
