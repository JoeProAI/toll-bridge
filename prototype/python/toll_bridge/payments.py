"""Toll: per-call pricing via PayPal Orders v2 (sandbox shapes only).

Handshake shape mirrors PayPal's checkout flow:
  1. quote    — merchant tells the agent the price (custom, our 402 response)
  2. create   — POST /v2/checkout/orders            -> order id, status CREATED
  3. authorize— POST /v2/checkout/orders/{id}/authorize -> authorization id
  4. capture  — POST /v2/payments/authorizations/{id}/capture -> capture id
  5. refund   — POST /v2/payments/captures/{id}/refund

`PayPalClient` is the seam. `MockPayPalClient` implements the exact same
shapes in memory for tests and the no-keys local demo. `PayPalHttpClient`
is a thin real client (env: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET /
PAYPAL_ENV=sandbox) — never exercised in tests.
"""

from __future__ import annotations

import base64
import itertools
import json
import os
import urllib.request
from typing import Protocol

PRICE_USD = "0.05"
CURRENCY = "USD"


class PaymentError(Exception):
    """Payment handshake failed (decline, expired order, upstream error)."""


class PayPalClient(Protocol):
    def create_order(self, amount: str, currency: str, reference_id: str) -> dict: ...
    def authorize_order(self, order_id: str) -> dict: ...
    def capture_authorization(self, authorization_id: str) -> dict: ...
    def refund_capture(self, capture_id: str, amount: str, currency: str) -> dict: ...


class MockPayPalClient:
    """In-memory PayPal Orders v2 stand-in with identical response shapes."""

    def __init__(self, fail_capture: bool = False):
        self.fail_capture = fail_capture
        self._seq = itertools.count(1)
        self.orders: dict[str, dict] = {}
        self.authorizations: dict[str, dict] = {}
        self.captures: dict[str, dict] = {}
        self.refunds: list[dict] = []

    def create_order(self, amount: str, currency: str, reference_id: str) -> dict:
        order_id = f"MOCK-ORDER-{next(self._seq):04d}"
        order = {
            "id": order_id,
            "status": "CREATED",
            "intent": "AUTHORIZE",
            "purchase_units": [
                {
                    "reference_id": reference_id,
                    "amount": {"currency_code": currency, "value": amount},
                }
            ],
        }
        self.orders[order_id] = order
        return order

    def authorize_order(self, order_id: str) -> dict:
        order = self.orders.get(order_id)
        if not order or order["status"] != "CREATED":
            raise PaymentError(f"order {order_id} not in CREATED state")
        auth_id = f"MOCK-AUTH-{next(self._seq):04d}"
        order["status"] = "COMPLETED"
        auth = {
            "id": auth_id,
            "status": "CREATED",
            "amount": order["purchase_units"][0]["amount"],
        }
        self.authorizations[auth_id] = auth
        return {"id": order_id, "status": "COMPLETED", "authorization_id": auth_id}

    def capture_authorization(self, authorization_id: str) -> dict:
        auth = self.authorizations.get(authorization_id)
        if not auth or auth["status"] != "CREATED":
            raise PaymentError(f"authorization {authorization_id} not capturable")
        if self.fail_capture:
            raise PaymentError("mock decline: insufficient funds")
        auth["status"] = "CAPTURED"
        cap_id = f"MOCK-CAPTURE-{next(self._seq):04d}"
        capture = {
            "id": cap_id,
            "status": "COMPLETED",
            "amount": auth["amount"],
        }
        self.captures[cap_id] = capture
        return capture

    def refund_capture(self, capture_id: str, amount: str, currency: str) -> dict:
        capture = self.captures.get(capture_id)
        if not capture or capture["status"] != "COMPLETED":
            raise PaymentError(f"capture {capture_id} not refundable")
        capture["status"] = "REFUNDED"
        refund = {
            "id": f"MOCK-REFUND-{next(self._seq):04d}",
            "status": "COMPLETED",
            "amount": {"currency_code": currency, "value": amount},
        }
        self.refunds.append(refund)
        return refund


class PayPalHttpClient:
    """Real PayPal Orders v2 client. Sandbox only; requires env keys.

    Not used in tests. Exists so a real run needs only keys, not code.
    """

    def __init__(self, client_id: str, client_secret: str, env: str = "sandbox"):
        if env != "sandbox":
            raise ValueError("Wringer Lite only supports PAYPAL_ENV=sandbox")
        self.base = "https://api-m.sandbox.paypal.com"
        self._auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    @classmethod
    def from_env(cls) -> "PayPalHttpClient":
        return cls(
            os.environ["PAYPAL_CLIENT_ID"],
            os.environ["PAYPAL_CLIENT_SECRET"],
            os.environ.get("PAYPAL_ENV", "sandbox"),
        )

    def _post(self, path: str, body: dict, auth: str | None = None) -> dict:
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(body).encode() if body else b"",
            headers={
                "Content-Type": "application/json",
                "Authorization": auth or f"Basic {self._auth}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read())
        except Exception as exc:  # noqa: BLE001 — normalize to PaymentError
            raise PaymentError(str(exc)) from exc

    def create_order(self, amount: str, currency: str, reference_id: str) -> dict:
        return self._post(
            "/v2/checkout/orders",
            {
                "intent": "AUTHORIZE",
                "purchase_units": [
                    {
                        "reference_id": reference_id,
                        "amount": {"currency_code": currency, "value": amount},
                    }
                ],
            },
        )

    def authorize_order(self, order_id: str) -> dict:
        resp = self._post(f"/v2/checkout/orders/{order_id}/authorize", {})
        auth_id = resp["purchase_units"][0]["payments"]["authorizations"][0]["id"]
        return {"id": order_id, "status": resp["status"], "authorization_id": auth_id}

    def capture_authorization(self, authorization_id: str) -> dict:
        return self._post(f"/v2/payments/authorizations/{authorization_id}/capture", {})

    def refund_capture(self, capture_id: str, amount: str, currency: str) -> dict:
        return self._post(
            f"/v2/payments/captures/{capture_id}/refund",
            {"amount": {"currency_code": currency, "value": amount}},
        )
