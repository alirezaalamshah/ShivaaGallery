"""
Pluggable online payment. Pick one with PAYMENT_GATEWAY:

- "none": no online payment; the store arranges payment with the customer.
- "fake": a local page with "paid" and "cancelled" buttons. For development only.
- "zarinpal": Zarinpal REST API v4. Needs ZARINPAL_MERCHANT_ID; ZARINPAL_SANDBOX=true for testing
  (any UUID works as the merchant id in the sandbox). The callback URL must be on the
  domain registered for the merchant, or Zarinpal answers -14.

A gateway has two steps: start() returns the URL to send the customer to, and
verify() confirms the payment when the customer comes back to the callback.
"""

import json
import logging
import secrets
import urllib.error
import urllib.request

from django.conf import settings

log = logging.getLogger("payments")


class GatewayError(Exception):
    pass


class FakeGateway:
    def start(self, payment, callback_url):
        payment.authority = secrets.token_hex(8)
        return f"{settings.SITE_URL}/api/payments/fake/{payment.authority}"

    def verify(self, payment, params):
        if params.get("Status") != "OK":
            return False
        payment.ref_id = str(secrets.randbelow(10**9))
        payment.card = "6037-99**-****-1234"
        return True


class ZarinpalGateway:
    def __init__(self):
        if not settings.ZARINPAL_MERCHANT_ID:
            raise GatewayError("ZARINPAL_MERCHANT_ID is not set.")
        self.base = "https://sandbox.zarinpal.com" if settings.ZARINPAL_SANDBOX else "https://payment.zarinpal.com"

    def _post(self, path, body):
        req = urllib.request.Request(
            f"{self.base}/pg/v4/payment/{path}.json",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                return json.loads(res.read())
        except urllib.error.HTTPError as e:  # Zarinpal answers errors with 4xx and a JSON body
            try:
                return json.loads(e.read())
            except ValueError:
                raise GatewayError(f"Zarinpal HTTP {e.code}") from e
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            raise GatewayError(str(e)) from e

    def start(self, payment, callback_url):
        res = self._post("request", {
            "merchant_id": settings.ZARINPAL_MERCHANT_ID,
            "amount": payment.amount,
            "callback_url": callback_url,
            "description": f"سفارش {payment.order.number}",
            # The site verifies every payment itself. A payment it never verifies (for an
            # order that expired meanwhile) is returned to the customer by the bank.
            "metadata": {"mobile": payment.order.phone, "order_id": payment.order.number, "auto_verify": False},
        })
        data = res.get("data") or {}
        if data.get("code") != 100:
            log.error("Zarinpal request failed: %s", res)
            raise GatewayError(str(res.get("errors") or res))
        payment.authority = data["authority"]
        return f"{self.base}/pg/StartPay/{payment.authority}"

    def verify(self, payment, params):
        if params.get("Status") != "OK" or params.get("Authority") != payment.authority:
            return False
        res = self._post("verify", {
            "merchant_id": settings.ZARINPAL_MERCHANT_ID,
            "amount": payment.amount,
            "authority": payment.authority,
        })
        data = res.get("data") or {}
        if data.get("code") in (100, 101):  # 101: already verified
            payment.ref_id = str(data.get("ref_id", ""))
            payment.card = data.get("card_pan", "")
            return True
        log.warning("Zarinpal verify failed: %s", res)
        return False


GATEWAYS = {"fake": FakeGateway, "zarinpal": ZarinpalGateway}


def get_gateway():
    cls = GATEWAYS.get(settings.PAYMENT_GATEWAY)
    if cls is None:
        raise GatewayError("Online payment is off.")
    return cls()
